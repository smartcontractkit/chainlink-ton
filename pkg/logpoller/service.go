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
	loader  TxLoader             // Transaction loader returning loaded txs
	parser  TxParser             // Transaction parser returning logs
	store   LogStore             // Log storage (MVP: in-memory, to be replaced with ORM)

	pollPeriod         time.Duration // How often to poll for new blocks
	lastProcessedBlock uint32        // Last processed masterchain sequence number
}

type ServiceOptions struct {
	Config   Config
	Client   ton.APIClientWrapped
	Filters  FilterStore
	TxLoader TxLoader
	TxParser TxParser
	Store    LogStore
}

// NewService creates a new TON log polling service instance
func NewService(lggr logger.Logger, opts *ServiceOptions) Service {
	lp := &service{
		lggr:       logger.Sugared(lggr),
		client:     opts.Client,
		filters:    opts.Filters,
		loader:     opts.TxLoader,
		parser:     opts.TxParser,
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
	lp.lggr.Infof("starting TON logpoller")
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
	addresses, err := lp.filters.GetDistinctAddresses(ctx)
	if err != nil {
		return fmt.Errorf("failed to get distinct addresses: %w", err)
	}
	if len(addresses) == 0 {
		return nil
	}

	if err := lp.processBlockRange(ctx, blockRange, addresses); err != nil {
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

// getLastProcessedBlock retrieves the last processed masterchain sequence number.
// Currently uses in-memory storage; will be replaced with database persistence.
func (lp *service) getLastProcessedBlock() (uint32, error) {
	lastProcessed := lp.lastProcessedBlock
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table
	// TODO: implement lookbackwindow configuration and fallback
	return lastProcessed, nil
}

// resolvePreviousBlock determines the previous block reference based on the last processed sequence number
func (lp *service) resolvePreviousBlock(ctx context.Context, lastProcessedBlockSeqNo uint32, toBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	if lastProcessedBlockSeqNo == 0 {
		// TODO: we shouldn't process from genesis, but rather have a pointer for starting point
		lp.lggr.Debugw("First run detected, processing from genesis", "toSeq", toBlock.SeqNo)
		return nil, nil
	}

	// get the prevBlock based on the last processed sequence number
	prevBlock, err := lp.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, lastProcessedBlockSeqNo)
	if err != nil {
		return nil, fmt.Errorf("LookupBlock for previous seqno %d: %w", lastProcessedBlockSeqNo, err)
	}
	return prevBlock, nil
}

// processBlockRange handles scanning a range of blocks for transactions
func (lp *service) processBlockRange(ctx context.Context, blockRange *types.BlockRange, addresses []*address.Address) error {
	// 1. Load raw transactions with blocks from the blockchain
	txs, err := lp.loader.LoadTxsForAddresses(ctx, blockRange, addresses)
	if err != nil {
		return fmt.Errorf("failed to load transactions: %w", err)
	}
	if len(txs) == 0 {
		return nil
	}
	lp.lggr.Debugw("loaded transactions from chain", "count", len(txs))

	// 2. Index the raw transactions into structured logs(covers ExtMsgOut and InternalMsg)
	logs, err := lp.parser.ParseTransactions(ctx, txs)
	if err != nil {
		return fmt.Errorf("failed to index transactions: %w", err)
	}
	if len(logs) == 0 {
		return nil
	}
	lp.lggr.Debugw("indexed transactions into logs", "count", len(logs))

	// 3. Save the logs to the store
	for _, log := range logs {
		if log.Error != nil {
			// TODO: how do we deal with failed logs? store with error field or discard?
			lp.lggr.Errorw("failed to save log", "log", log, "error", log.Error)
			continue
		}
		lp.store.SaveLog(log)
		// lp.lggr.Debugw("saved log", "log", log.String())
	}
	return nil
}

// RegisterFilter adds a new filter to monitor specific address/event signature combinations
func (lp *service) RegisterFilter(ctx context.Context, flt types.Filter) error {
	// Register the filter first
	if err := lp.filters.RegisterFilter(ctx, flt); err != nil {
		return err
	}

	// TODO(2025-08-28@jadepark-dev): clean up, forcing replay for e2e now
	lp.lggr.Infow("replaying logs for new filter", "filter", flt.Name, "fromBlock", flt.StartingSeqNo)
	if err := lp.Replay(ctx, flt.StartingSeqNo); err != nil {
		lp.lggr.Errorw("failed to replay logs for new filter", "filter", flt.Name, "error", err)
	}

	return nil
}

// UnregisterFilter removes a filter by name
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filters.UnregisterFilter(ctx, name)
}

// HasFilter checks if a filter with the given name exists
func (lp *service) HasFilter(ctx context.Context, name string) (bool, error) {
	return lp.filters.HasFilter(ctx, name)
}

// GetStore exposes the underlying log store for direct access
func (lp *service) GetStore() LogStore {
	return lp.store
}

func (lp *service) Replay(ctx context.Context, fromBlock uint32) error {
	// TODO(2025-08-28@jadepark-dev): clean up, forcing replay for e2e now

	toBlock, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain info: %w", err)
	}
	blockRange := &types.BlockRange{Prev: nil, To: toBlock}
	var prevBlock *ton.BlockIDExt
	if fromBlock != 0 {
		prevBlock, err = lp.client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, fromBlock)
		if err != nil {
			return fmt.Errorf("LookupBlock for previous seqno %d: %w", fromBlock, err)
		}

		blockRange.Prev = prevBlock
	}
	lp.lggr.Debugw("replaying logs", "fromBlock", fromBlock, "toBlock", toBlock)

	// get addresses
	addresses, err := lp.filters.GetDistinctAddresses(ctx)
	if err != nil {
		return fmt.Errorf("failed to get distinct addresses: %w", err)
	}
	if len(addresses) == 0 {
		return nil
	}

	// process block range
	if err := lp.processBlockRange(ctx, blockRange, addresses); err != nil {
		return fmt.Errorf("failed to process block range: %w", err)
	}

	return nil
}
