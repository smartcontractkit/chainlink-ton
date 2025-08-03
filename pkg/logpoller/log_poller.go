package logpoller

import (
	"context"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
)

// TON LogPoller Service - CCIP MVP Implementation
//
// This package implements a log polling service for TON blockchain as part of the
// TON CCIP MVP. It monitors external message outputs from specified addresses and
// applies filtering logic to support CCIP cross-chain message detection.
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
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	// TODO: expose more interface methods if needed

	// FilteredLogs queries logs using direct byte-offset filtering on the raw cell data.
	// This method is highly efficient as it can push filtering down to the database layer
	// (e.g., using SQL SUBSTRING) before returning data to the application
	//
	// It is best suited for high-performance queries where the event's data layout is fixed
	// However, this mechanism works best with fixed-size data layouts.
	// It cannot reliably query data that appears after variable-sized fields (like snake
	// data or other dynamic content), as the field's offset would be unpredictable.
	FilteredLogs(ctx context.Context, address *address.Address, topic uint32, queries []CellQuery, options QueryOptions) (QueryResult, error)
	// FilteredLogsWithParser queries logs using a flexible 'parse-then-filter' pattern.
	// It streams all logs matching a given address and topic, applies the provided `LogParser`
	// function to decode each log's data into a Go struct, and then applies the `LogFilter`
	// function to the resulting struct.
	//
	// This approach is more robust and adaptable to changes in contract data layouts, as the
	// filtering logic operates on strongly-typed fields rather than fixed byte offsets.
	FilteredLogsWithParser(ctx context.Context, address *address.Address, topic uint32, parser types.LogParser, filter types.LogFilter) ([]any, error)
}

// Service is the main TON log polling service implementation.
// It continuously polls the TON masterchain, discovers new blocks, and processes
// external messages from registered filter addresses.
type Service struct {
	services.Service
	eng *services.Engine // Service engine for lifecycle management

	lggr               logger.SugaredLogger // Logger instance
	client             ton.APIClientWrapped // TON blockchain client
	filters            Filters              // Registry of active filters
	loader             EventLoader          // Block scanner implementation
	store              LogStore             // Log storage (MVP: in-memory)
	pollPeriod         time.Duration        // How often to poll for new blocks
	lastProcessedSeqNo uint32               // Last processed masterchain sequence number
	blockConfirmations uint32               // Number of confirmations to wait before processing
}

// NewLogPoller creates a new TON log polling service instance
func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	cfg Config, // TODO: use global relayer config
) *Service {
	store := NewInMemoryStore(lggr)
	filters := NewFilters()
	lp := &Service{
		lggr:       logger.Sugared(lggr),
		client:     client,
		filters:    filters,
		store:      store,
		pollPeriod: cfg.PollPeriod,
	}
	lp.loader = NewLogCollector(lp.client, lp.lggr, cfg.PageSize)
	lp.Service, lp.eng = services.Config{
		Name:  "TONLogPoller",
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

	var prevBlock *ton.BlockIDExt
	if lastProcessedSeq == 0 {
		// for the first run, we don't have a previous block to reference
		prevBlock = nil
		lp.lggr.Debugw("First run detected, processing from genesis", "toSeq", toBlock.SeqNo)
	} else {
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
func (lp *Service) processMessages(msgs []types.MsgWithCtx) error {
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
func (lp *Service) Process(msg types.MsgWithCtx) error {
	bucket := event.NewExtOutLogBucket(msg.Msg.DstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		return fmt.Errorf("failed to decode event topic: %w", err)
	}
	lp.lggr.Tracef("Processing message", "src", msg.Msg.SrcAddr, "dst", msg.Msg.DstAddr, "topic", topic)

	fIDs := lp.filters.MatchingFilters(*msg.Msg.SrcAddr, topic)
	if len(fIDs) == 0 {
		return nil // no filters matched, nothing to do
	}

	for _, fid := range fIDs {
		lp.store.SaveLog(types.Log{
			FilterID: fid,
			// TODO: we need custom type for to storing block, tx metadata
			// SeqNo:      master.SeqNo,
			TxHash:  msg.TxHash,
			TxLT:    msg.LT,
			Address: *msg.Msg.SrcAddr,
			Topic:   topic,
			Data:    msg.Msg.Body.ToBOC(),
		})
	}
	return nil
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
func (lp *Service) RegisterFilter(ctx context.Context, flt types.Filter) error {
	return lp.filters.RegisterFilter(ctx, flt)
}

// UnregisterFilter removes a filter by name
func (lp *Service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filters.UnregisterFilter(ctx, name)
}

// GetLogs retrieves all logs for a specific event source address
func (lp *Service) GetLogs(evtSrcAddress *address.Address) []types.Log {
	return lp.store.GetLogs(evtSrcAddress.String())
}

// FilteredLogs retrieves logs filtered by address, topic, and additional cell-level queries.
// This allows for precise filtering based on the internal structure of TON cell data.
func (lp *Service) FilteredLogs(
	_ context.Context,
	evtSrcAddress *address.Address,
	topic uint32,
	queries []CellQuery,
	options QueryOptions,
) (QueryResult, error) {
	return lp.store.FilteredLogs(
		evtSrcAddress.String(),
		topic,
		queries,
		options,
	)
}

func (lp *Service) FilteredLogsWithParser(
	_ context.Context,
	evtSrcAddress *address.Address,
	topic uint32,
	parser types.LogParser,
	filter types.LogFilter,
) ([]any, error) {
	return lp.store.FilteredLogsWithParser(
		evtSrcAddress.String(),
		topic,
		parser,
		filter,
	)
}
