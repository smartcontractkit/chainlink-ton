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

// TON LogPoller Service - CCIP MVP Implementation
//
// This package implements a log polling service for TON blockchain as part of the
// TON CCIP MVP. It monitors external message outputs from specified addresses and
// applies filtering logic to support CCIP cross-chain message detection.
//
// MVP Implementation Features:
// - Service: Main orchestrator that polls blocks and processes messages
// - LogCollector: Handles block scanning and message extraction using account-based approach
// - InMemoryStore: Temporary storage for filtered logs (MVP - will be replaced with DB)
// - CellQueryEngine: Applies byte-level filters to TON cell data for precise CCIP message filtering
//
// The service monitors masterchain blocks, extracts ExternalMessageOut entries that match
// registered filters. Each filter specifies an address and event topic, with optional
// cell-level byte queries for precise filtering.
//
// This MVP provides the foundation for TON CCIP functionality and will be enhanced
// with database persistence, advanced querying, and production-grade scalability features.

// LogPoller defines the interface for TON log polling service
type LogPoller interface {
	services.Service
	Healthy() error
	Start(context.Context) error
	Ready() error
	Close() error
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	FilteredLogsByTopic(evtSrcAddress string, topic uint64, filters []CellQuery) ([]types.Log, error)
}

type logCollector interface {
	// BackfillForAddresses scans TON blocks between prevBlock and toBlock,
	// extracting ExternalMessageOut entries from monitored addresses.
	// TODO: solidify replay strategy for production use
	BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (msgs []*tlb.ExternalMessageOut, err error)
}

// Service is the main TON log polling service implementation.
// It continuously polls the TON masterchain, discovers new blocks, and processes
// external messages from registered filter addresses.
type Service struct {
	services.Service
	eng                *services.Engine     // Service engine for lifecycle management
	lggr               logger.SugaredLogger // Logger instance
	client             ton.APIClientWrapped // TON blockchain client
	filters            *Filters             // Registry of active filters
	loader             logCollector         // Block scanner implementation
	store              *InMemoryStore       // Log storage (MVP: in-memory)
	pollPeriod         time.Duration        // How often to poll for new blocks
	lastProcessedSeqNo uint32               // Last processed masterchain sequence number
	blockConfirmations uint32               // Number of confirmations to wait before processing
}

// NewLogPoller creates a new TON log polling service instance
func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	// TODO: replace with global TON relayer config
	pollPeriod time.Duration,
	pageSize uint32,
	blockConfirmations uint32,
) *Service {
	store := NewInMemoryStore(lggr)
	filters := newFilters()
	lp := &Service{
		lggr:               logger.Sugared(lggr),
		client:             client,
		filters:            filters,
		store:              store,
		pollPeriod:         pollPeriod,
		blockConfirmations: blockConfirmations,
	}
	lp.loader = NewLogCollector(lp.client, lp.lggr, pageSize, blockConfirmations)
	lp.Service, lp.eng = services.Config{
		Name:  "Service",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp
}

// start initializes the log polling service and begins the polling loop
func (lp *Service) start(ctx context.Context) error {
	lp.lggr.Infof("starting logpoller")
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
		}
	})
	return nil
}

// run executes a single polling iteration:
// 1. Gets current masterchain head
// 2. Calculates safe-to-process block (with confirmations)
// 3. Processes new blocks since last processed sequence number
// 4. Updates last processed sequence number
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

// processBlocksRange handles scanning a range of blocks for external messages
// from the specified addresses. It delegates to the LogCollector for the actual
// block scanning and then processes the returned messages.
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

// processMessages iterates through external messages and processes each one
func (lp *Service) processMessages(msgs []*tlb.ExternalMessageOut) error {
	for _, msg := range msgs {
		if err := lp.Process(msg); err != nil {
			return err
		}
	}
	return nil
}

// Process handles a single external message:
// 1. Extracts event topic from destination address
// 2. Finds matching filters for the source address and topic
// 3. Saves logs for each matching filter
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
			// TODO: we need custom type for to storing block metadata
			// SeqNo:      master.SeqNo,
			Address:    *msg.SrcAddr,
			EventTopic: topic,
			Data:       msg.Body.ToBOC(),
		})
	}
	return nil
}

// extractEventTopicFromAddress extracts the event topic from a TON address.
// ExtOutLogBucket dst-address format is: [prefix..][topic:8 bytes]
// We grab the last 8 bytes as the topic identifier.
// TODO: add link for ExtOutLogBucket format and specification
func extractEventTopicFromAddress(addr *address.Address) uint64 {
	data := addr.Data() // 32 bytes
	return binary.BigEndian.Uint64(data[24:])
}

// getLastProcessedSeqNo retrieves the last processed masterchain sequence number.
// Currently uses in-memory storage; will be replaced with database persistence.
func (lp *Service) getLastProcessedSeqNo() (uint32, error) {
	lastProcessed := lp.lastProcessedSeqNo
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table
	// TODO: implement lookbackwindow configuration and fallback logic if needed
	return lastProcessed, nil
}

// RegisterFilter adds a new filter to monitor specific address/topic combinations
func (lp *Service) RegisterFilter(ctx context.Context, flt types.Filter) {
	lp.filters.RegisterFilter(ctx, flt)
}

// UnregisterFilter removes a filter by name
func (lp *Service) UnregisterFilter(ctx context.Context, name string) {
	lp.filters.UnregisterFilter(ctx, name)
}

// GetLogs retrieves all logs for a specific event source address
func (lp *Service) GetLogs(evtSrcAddress *address.Address) []types.Log {
	return lp.store.GetLogs(evtSrcAddress.String())
}

// FilteredLogsByTopic retrieves logs filtered by address, topic, and additional cell-level queries.
// This allows for precise filtering based on the internal structure of TON cell data.
func (lp *Service) FilteredLogsByTopic(evtSrcAddress *address.Address, topic uint64, filters []CellQuery) ([]types.Log, error) {
	return lp.store.GetLogsByTopicWithFilter(evtSrcAddress.String(), topic, filters)
}
