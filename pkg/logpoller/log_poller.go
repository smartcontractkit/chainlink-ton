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
	// TODO(NONEVM-1460): add remaining functions
}

type logCollector interface {
	BackfillForAddresses(ctx context.Context, addresses []*address.Address, fromSeqNo uint32, currentMaster *ton.BlockIDExt) (msgs []*tlb.ExternalMessageOut, err error)
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
	pageSize           uint32
	lastProcessedSeqNo uint32 // last processed masterchain seqno
}

func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	// TODO: replace with global TON relayer config
	pollPeriod time.Duration,
	pageSize uint32,
) *Service {
	store := NewInMemoryStore()
	filters := newFilters()
	lp := &Service{
		lggr:       logger.Sugared(lggr),
		client:     client,
		filters:    filters,
		store:      store,
		pollPeriod: pollPeriod,
		pageSize:   pageSize,
	}
	lp.loader = NewLoader(lp.client, lp.lggr)
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

	// get the current masterchain seqno
	master, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return err
	}
	// compare with last processed seqno, if last seqno is higher, there is a problem
	if master.SeqNo < lastProcessedSeq {
		return fmt.Errorf("last seqno (%d) > chain seqno (%d)", lastProcessedSeq, master.SeqNo)
	}
	// if we already processed this seqno, skip
	if master.SeqNo == lastProcessedSeq {
		lp.lggr.Debugw("skipping already processed masterchain seq", "seq", master.SeqNo)
	}

	// load the addresses from filters that we're interested in
	addresses := lp.filters.GetDistinctAddresses()
	if len(addresses) == 0 {
		return nil
	}

	err = lp.processBlocksRange(ctx, addresses, lastProcessedSeq+1, master)
	if err != nil {
		return fmt.Errorf("processBlocksRange: %w", err)
	}

	// save the last processed seqno
	lp.lastProcessedSeqNo = master.SeqNo
	return nil
}

func (lp *Service) processBlocksRange(ctx context.Context, addresses []*address.Address, fromSeqNo uint32, currentMaster *ton.BlockIDExt) error {
	lp.lggr.Debugw("Got new seq range to process", "from", fromSeqNo, "to", currentMaster.SeqNo)

	msgs, err := lp.loader.BackfillForAddresses(ctx, addresses, fromSeqNo, currentMaster)
	if err != nil {
		return fmt.Errorf("BackfillForAddresses: %w", err)
	}
	err = lp.processMessages(msgs)
	if err != nil {
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
	fIDs := lp.filters.MatchingFilters(*msg.SrcAddr, topic)
	if len(fIDs) == 0 {
		return nil // no filters matched, nothing to do
	}

	for _, fid := range fIDs {
		lp.store.SaveLog(types.Log{
			FilterID:   fid,
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

func (lp *Service) GetLogs() []types.Log {
	return lp.store.GetLogs()
}
