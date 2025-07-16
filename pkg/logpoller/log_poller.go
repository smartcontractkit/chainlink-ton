package logpoller

import (
	"context"
	"encoding/binary"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type LogPoller interface {
	services.Service
	Healthy() error
	Start(context.Context) error
	Ready() error
	Close() error
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error

	// TODO: TON CCIP E2E M2 - Only implement the methods that are needed for TON as source chain
	MsgLogsBetweenSeqNums(ctx context.Context, destChainSelector string, start, end uint64) ([]types.Log, error)
	LatestMsgLogSeqNum(ctx context.Context, destChainSelector string) (uint64, error)
}

type logCollector interface {
	// TODO: solidify replay strategy
	BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (msgs []*tlb.ExternalMessageOut, err error)
}

type Service struct {
	services.Service
	eng                *services.Engine
	lggr               logger.SugaredLogger
	client             ton.APIClientWrapped
	filters            *Filters
	loader             logCollector
	store              *InMemoryStore
	pollPeriod         time.Duration
	lastProcessedSeqNo uint32 // last processed masterchain seqno
	blockConfirmations uint32 // number of confirmations to wait before processing a block
}

func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	// TODO: replace with global TON relayer config
	pollPeriod time.Duration,
	pageSize uint32,
	blockConfirmations uint32,
) *Service {
	store := NewInMemoryStore()
	filters := newFilters()
	lp := &Service{
		lggr:               logger.Sugared(lggr),
		client:             client,
		filters:            filters,
		store:              store,
		pollPeriod:         pollPeriod,
		blockConfirmations: blockConfirmations,
	}
	lp.loader = NewLoader(lp.client, lp.lggr, pageSize, blockConfirmations)
	lp.Service, lp.eng = services.Config{
		Name:  "Service",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp
}

func (lp *Service) start(ctx context.Context) error {
	lp.lggr.Infof("starting logpoller")
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
		}
	})
	return nil
}

func (lp *Service) run(ctx context.Context) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic recovered: %v", rec)
		}
	}()

	lastProcessedSeq, err := lp.getLastProcessedSeqNo()
	if err != nil {
		return fmt.Errorf("LoadLastSeq: %w", err)
	}
	// TODO: load filter from persistent store
	// TODO: implement backfill logic(if there is filters marked for backfill)

	// get the current masterchain head
	currentMaster, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return err
	}

	// calculate the latest block we can safely process with confirmations
	safeToProcessSeq := currentMaster.SeqNo - lp.blockConfirmations

	// if safe to process is behind last processed, we need to wait for more blocks
	if safeToProcessSeq < lastProcessedSeq {
		blocksLeft := lastProcessedSeq - safeToProcessSeq
		lp.lggr.Debugw("waiting for more blocks to process",
			"lastProcessed", lastProcessedSeq,
			"safeToProcess", safeToProcessSeq,
			"blocksLeft", blocksLeft)
		return nil
	}

	// if we already processed everything we can safely process, skip
	if safeToProcessSeq == lastProcessedSeq {
		lp.lggr.Debugw("skipping already processed safe seq", "seq", safeToProcessSeq)
		return nil
	}

	// get the actual block to process (the safe one)
	toBlock, err := lp.client.LookupBlock(ctx, currentMaster.Workchain, currentMaster.Shard, safeToProcessSeq)
	if err != nil {
		return fmt.Errorf("LookupBlock for safe seq %d: %w", safeToProcessSeq, err)
	}

	// load the addresses from filters that we're interested in
	addresses := lp.filters.GetDistinctAddresses()
	if len(addresses) == 0 {
		return nil
	}
	lp.lggr.Debugw("Processing messages for addresses", "addresses", addresses)

	var prevBlock *ton.BlockIDExt

	switch lastProcessedSeq {
	case 0:
		// for the first run, we don't have a previous block to reference
		prevBlock = nil
		lp.lggr.Debugw("First run detected, processing from genesis", "toSeq", toBlock.SeqNo)
	default:
		// get the prevBlock based on the last processed seqno
		prevBlock, err = lp.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, lastProcessedSeq)
		if err != nil {
			return fmt.Errorf("LookupBlock: %w", err)
		}
	}

	err = lp.processBlocksRange(ctx, addresses, prevBlock, toBlock)
	if err != nil {
		return fmt.Errorf("processBlocksRange: %w", err)
	}

	// save the last processed seqno
	lp.lastProcessedSeqNo = toBlock.SeqNo
	return nil
}

func (lp *Service) processBlocksRange(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) error {
	switch {
	case prevBlock == nil:
		lp.lggr.Debugw("Got new seq range to process (from genesis)", "from", 0, "to", toBlock.SeqNo)
	default:
		lp.lggr.Debugw("Got new seq range to process", "from", prevBlock.SeqNo, "to", toBlock.SeqNo)
	}

	msgs, err := lp.loader.BackfillForAddresses(ctx, addresses, prevBlock, toBlock)
	if err != nil {
		return fmt.Errorf("BackfillForAddresses: %w", err)
	}

	if err := lp.processMessages(msgs); err != nil {
		return fmt.Errorf("processMessages: %w", err)
	}

	return nil
}

func (lp *Service) processMessages(msgs []*tlb.ExternalMessageOut) error {
	for _, msg := range msgs {
		if err := lp.Process(msg); err != nil {
			return err
		}
	}
	return nil
}

func (lp *Service) Process(msg *tlb.ExternalMessageOut) error {
	topic := extractEventTopicFromAddress(msg.DstAddr)
	lp.lggr.Debugw("Processing message", "src", msg.SrcAddr, "dst", msg.DstAddr, "topic", topic)
	fIDs := lp.filters.MatchingFilters(*msg.SrcAddr, topic)
	if len(fIDs) == 0 {
		return nil // no filters matched, nothing to do
	}

	for _, fid := range fIDs {
		lp.store.SaveLog(types.Log{
			FilterID: fid,
			// TODO: we need custom type for processing
			// SeqNo:      master.SeqNo,
			Address:    *msg.SrcAddr,
			EventTopic: topic,
			Data:       msg.Body.ToBOC(),
		})
	}
	return nil
}

// ExtOutLogBucket dst-address format is: [prefix..][topic:8 bytes]
// We grab the last 8 bytes.
// TODO: add link for ExtOutLogBucket format and specification
func extractEventTopicFromAddress(addr *address.Address) uint64 {
	data := addr.Data() // 32 bytes
	return binary.BigEndian.Uint64(data[24:])
}

func (lp *Service) getLastProcessedSeqNo() (uint32, error) {
	lastProcessed := lp.lastProcessedSeqNo
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table

	// TODO: implement lookbackwindow configuration and fallback logic if needed
	return lastProcessed, nil
}

func (lp *Service) RegisterFilter(ctx context.Context, flt types.Filter) {
	lp.filters.RegisterFilter(ctx, flt)
}

func (lp *Service) UnregisterFilter(ctx context.Context, name string) {
	lp.filters.UnregisterFilter(ctx, name)
}

// TODO: add query per CCIP event type
func (lp *Service) FilteredCCIPLogs(ctx context.Context, evtSrcAddress string, topic uint64, limit int) ([]types.Log, error) {
	return lp.store.GetLogsByTopic(evtSrcAddress, topic, limit)
}

// TODO: temp log query function, we'll need to define what's the proper query we need from CAL
func (lp *Service) GetLogs() []types.Log {
	return lp.store.GetLogs()
}
