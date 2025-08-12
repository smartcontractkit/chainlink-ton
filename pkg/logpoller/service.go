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

// TON LogPoller Service
//
// This package implements a log polling service for TON blockchain.
// It monitors external message outputs from specified addresses and
// applies filtering logic to support cross-chain message detection.

// service is the main TON log polling service implementation.
// It continuously polls the TON masterchain, discovers new blocks, and processes
// external messages from registered filter addresses.
type service struct {
	services.Service
	eng *services.Engine // Service engine for lifecycle management

	lggr    logger.SugaredLogger // Logger instance
	client  ton.APIClientWrapped // TON blockchain client
	filters FilterStore          // Registry of active filters
	loader  MessageLoader        // Message loader (MVP: account-based, to be replaced with block-scan)
	store   LogStore             // Log storage (MVP: in-memory, to be replaced with ORM)

	pollPeriod         time.Duration // How often to poll for new blocks
	lastProcessedBlock uint32        // Last processed masterchain sequence number
}

// NewService creates a new TON log polling service instance
func NewService(lggr logger.Logger, opts *ServiceOptions) Service {
	lp := &service{
		lggr:       logger.Sugared(lggr),
		client:     opts.Client,
		filters:    opts.Filters,
		loader:     opts.MessageLoader,
		store:      opts.Store,
		pollPeriod: opts.Config.PollPeriod,
	}
	lp.Service, lp.eng = services.Config{
		Name:  "TONLogPoller",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp
}

// start initializes the log polling service and begins the polling loop
func (lp *service) start(_ context.Context) error {
	lp.lggr.Infof("starting logpoller")
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
		}
	})
	return nil
}

// run executes a single polling iteration:
// 1. Gets the current masterchain head
// 2. Processes new blocks since the last processed sequence number
// 3. Updates the last processed sequence number
func (lp *service) run(ctx context.Context) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic recovered: %v", rec)
		}
	}()

	blockRange, err := lp.getMasterchainBlockRange(ctx)
	if err != nil {
		return fmt.Errorf("failed to get masterchain block range: %w", err)
	}
	if blockRange == nil {
		// no new blocks to process
		return nil
	}

	// TODO: load filter from persistent store
	// TODO: implement backfill logic(if there is filters marked for backfill)
	addresses, err := lp.filters.GetDistinctAddresses()
	if err != nil {
		return fmt.Errorf("failed to get distinct addresses: %w", err)
	}
	if len(addresses) == 0 {
		return nil
	}

	if err := lp.processBlockRange(ctx, addresses, blockRange.Prev, blockRange.To); err != nil {
		return fmt.Errorf("failed to process block range: %w", err)
	}

	lp.lastProcessedBlock = blockRange.To.SeqNo
	return nil
}

// getMasterchainBlockRange calculates the range of blocks that need to be processed.
// Returns nil if there are no new blocks to process.
func (lp *service) getMasterchainBlockRange(ctx context.Context) (*types.BlockRange, error) {
	lastProcessedBlock, err := lp.getLastProcessedBlock()
	if err != nil {
		return nil, fmt.Errorf("failed to get last processed block: %w", err)
	}

	toBlock, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	// if we've already processed this block, wait for the next one
	if toBlock.SeqNo <= lastProcessedBlock {
		return nil, nil
	}

	lp.lggr.Debugf("new block found, processing range (%d, %d]", lastProcessedBlock, toBlock.SeqNo)

	prevBlock, err := lp.resolvePreviousBlock(ctx, lastProcessedBlock, toBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve previous block: %w", err)
	}

	return &types.BlockRange{Prev: prevBlock, To: toBlock}, nil
}

// resolvePreviousBlock determines the previous block reference based on the last processed sequence number
func (lp *service) resolvePreviousBlock(ctx context.Context, lastProcessedBlock uint32, toBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	if lastProcessedBlock == 0 {
		// TODO: we shouldn't process from genesis, but rather have a pointer for starting point
		lp.lggr.Debugw("First run detected, processing from genesis", "toSeq", toBlock.SeqNo)
		return nil, nil
	}

	// get the prevBlock based on the last processed sequence number
	prevBlock, err := lp.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, lastProcessedBlock)
	if err != nil {
		return nil, fmt.Errorf("LookupBlock for previous seqno %d: %w", lastProcessedBlock, err)
	}
	return prevBlock, nil
}

// processBlockRange handles scanning a range of blocks for external messages
// from the specified addresses. It delegates to the LogCollector for the actual
// block scanning and then processes the returned messages
func (lp *service) processBlockRange(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) error {
	msgs, err := lp.loader.LoadMsgsFromSrcAddrs(ctx, addresses, prevBlock, toBlock)
	if err != nil {
		return fmt.Errorf("failed to backfill messages: %w", err)
	}

	if err := lp.processMessages(msgs); err != nil {
		return fmt.Errorf("failed to process messages: %w", err)
	}

	return nil
}

// processMessages iterates through external messages and processes each one
func (lp *service) processMessages(msgs []types.IndexedMsg) error {
	for _, msg := range msgs {
		if err := lp.Process(msg); err != nil {
			return fmt.Errorf("failed to process message: %w", err)
		}
	}
	return nil
}

// Process handles a single external message:
// 1. Extracts event topic from destination address
// 2. Finds matching filters for the source address and topic
// 3. Saves logs for each matching filter
func (lp *service) Process(msg types.IndexedMsg) error {
	bucket := event.NewExtOutLogBucket(msg.Msg.DstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		return fmt.Errorf("failed to decode event topic: %w", err)
	}
	lp.lggr.Trace("Processing message", "src", msg.Msg.SrcAddr, "dst", msg.Msg.DstAddr, "topic", topic)

	fIDs := lp.filters.MatchingFilters(*msg.Msg.SrcAddr, topic)
	if len(fIDs) == 0 {
		return nil // no filters matched, nothing to do
	}

	for _, fid := range fIDs {
		lp.store.SaveLog(types.Log{
			FilterID: fid,
			EventSig: topic,

			Address: msg.Msg.SrcAddr,
			Data:    msg.Msg.Body,

			TxHash:      types.TxHash(msg.Tx.Hash),
			TxLT:        msg.Tx.LT,
			TxTimestamp: time.Unix(int64(msg.Tx.Now), 0).UTC(),

			// TODO(NONEVM-2194): store block metadata
			// ShardBlockSeqno:     msg.ShardBlock.SeqNo,
			// ShardBlockWorkchain: msg.ShardBlock.Workchain,
			// ShardBlockShard:     msg.ShardBlock.Shard,

			// MasterBlockSeqno: msg.MasterBlock.SeqNo,

			// TODO: ChainID:        lp.orm.ChainID(),
		})
	}
	return nil
}

// getLastProcessedBlock retrieves the last processed masterchain sequence number.
// Currently uses in-memory storage; will be replaced with database persistence.
func (lp *service) getLastProcessedBlock() (uint32, error) {
	lastProcessed := lp.lastProcessedBlock
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table
	// TODO: implement lookbackwindow configuration and fallback logic if needed
	return lastProcessed, nil
}

// RegisterFilter adds a new filter to monitor specific address/topic combinations
func (lp *service) RegisterFilter(ctx context.Context, flt types.Filter) error {
	return lp.filters.RegisterFilter(ctx, flt)
}

// UnregisterFilter removes a filter by name
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filters.UnregisterFilter(ctx, name)
}

// HasFilter checks if a filter with the given name exists
func (lp *service) HasFilter(ctx context.Context, name string) bool {
	return lp.filters.HasFilter(ctx, name)
}

// GetStore exposes the underlying log store for direct access
func (lp *service) GetStore() LogStore {
	return lp.store
}
