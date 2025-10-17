package logpoller

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
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
	eng            *services.Engine                                    // Service engine for lifecycle management
	lggr           logger.SugaredLogger                                // Logger instance
	clientProvider func(context.Context) (ton.APIClientWrapped, error) // TON blockchain client lazy getter

	filters   FilterStore // Registry of active filters
	loader    TxLoader    // Transaction loader returning loaded txs
	processor Processor   // Transaction processor returning populated logs
	store     LogStore    // Log storage (MVP: in-memory, to be replaced with ORM)

	pollPeriod         time.Duration // How often to poll for new blocks
	lastProcessedBlock uint32        // Last processed masterchain sequence number
	startingLookback   time.Duration // How far back to look when starting up
	blockTime          time.Duration // Expected block time for calculations(approximately 2.5 seconds)

	// Configuration for transaction loading and log storage
	pageSize        uint32 // Number of transactions to fetch per API call
	batchInsertSize uint32 // PostgreSQL batch insert size
	minBatchSize    uint32 // Minimum batch size for timeout retry
	saveThreshold   uint32 // Number of logs to buffer in memory before saving
}

type ServiceOptions struct {
	Config    Config
	Filters   FilterStore
	TxLoader  TxLoader
	Processor Processor
	Store     LogStore
}

// NewService creates a new TON log polling service instance
func NewService(lggr logger.Logger, clientProvider func(context.Context) (ton.APIClientWrapped, error), opts *ServiceOptions) Service {
	lp := &service{
		lggr:             logger.Sugared(lggr),
		clientProvider:   clientProvider,
		filters:          opts.Filters,
		loader:           opts.TxLoader,
		processor:        opts.Processor,
		store:            opts.Store,
		pollPeriod:       opts.Config.PollPeriod.Duration(),
		startingLookback: opts.Config.LogPollerStartingLookback.Duration(),
		blockTime:        opts.Config.BlockTime.Duration(),
		pageSize:         opts.Config.PageSize,
		batchInsertSize:  opts.Config.BatchInsertSize,
		minBatchSize:     opts.Config.MinBatchSize,
		saveThreshold:    opts.Config.SaveThreshold,
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

// processBlockRange handles scanning a range of blocks for transactions
func (lp *service) processBlockRange(ctx context.Context, blockRange *models.BlockRange, addresses []*address.Address) error {
	// build filter index for efficient lookup
	filterIndex, err := lp.buildFilterIndex(ctx, addresses)
	if err != nil {
		return fmt.Errorf("failed to build filter index: %w", err)
	}

	txsCh, loaderErrsCh := lp.loadTxsForAddresses(ctx, blockRange, addresses)
	logsCh, processorErrsCh := lp.processTransactions(ctx, filterIndex, txsCh)

	// TODO: error metrics
	go func() {
		for err := range loaderErrsCh {
			lp.lggr.Errorw("loader error", "err", err)
		}
	}()
	go func() {
		for err := range processorErrsCh {
			lp.lggr.Errorw("processor error", "err", err)
		}
	}()

	totalSaved, err := lp.saveLogs(ctx, logsCh)
	if err != nil {
		return fmt.Errorf("failed to save logs: %w", err)
	}

	if blockRange.Prev == nil {
		lp.lggr.Debugf("processed range (unspecified, %d], saved %d logs from %d addresses",
			blockRange.To.SeqNo, totalSaved, len(addresses))
	} else {
		lp.lggr.Debugf("processed range (%d, %d], saved %d logs from %d addresses",
			blockRange.Prev.SeqNo, blockRange.To.SeqNo, totalSaved, len(addresses))
	}

	return nil
}

// loadTxsForAddresses scans TON blockchain for transactions from specified addresses
// between prevBlock(exclusive) and toBlock(inclusive)
// Returns parallel slices of transactions and their corresponding blocks.
func (lp *service) loadTxsForAddresses(ctx context.Context, blockRange *models.BlockRange, srcAddrs []*address.Address) (<-chan models.Tx, <-chan error) {
	txsOut := make(chan models.Tx, lp.pageSize) // expected burst size
	errsOut := make(chan error, len(srcAddrs))

	var wg sync.WaitGroup
	for _, addr := range srcAddrs {
		wg.Add(1)
		go func(a *address.Address) {
			defer wg.Done()

			if err := lp.loader.LoadTxsForAddress(ctx, blockRange, a, lp.pageSize, txsOut, errsOut); err != nil {
				lp.lggr.Warnf("Loader setup failed for address: %s, err: %v", a.String(), err)
				errsOut <- err
			}
		}(addr)
	}

	// close channels when all goroutines are done
	go func() {
		wg.Wait()
		close(txsOut)
		close(errsOut)
	}()

	return txsOut, errsOut
}

// processTransactions spawns goroutines to process transactions in parallel.
// TODO: consider worker pool if transaction volume becomes high (>1000/block)
func (lp *service) processTransactions(
	ctx context.Context,
	filterIndex models.FilterIndex,
	txsIn <-chan models.Tx,
) (<-chan models.Log, <-chan error) {
	logsOut := make(chan models.Log, lp.saveThreshold)
	errsOut := make(chan error)

	var wg sync.WaitGroup

	go func() {
		for tx := range txsIn {
			wg.Add(1)
			go func(t models.Tx) {
				defer wg.Done()

				logs, err := lp.processor.ProcessTx(ctx, t.Transaction, t.Block, filterIndex)
				if err != nil {
					errsOut <- fmt.Errorf("failed to process tx %x: %w", t.Transaction.Hash, err)
					return
				}

				for _, log := range logs {
					select {
					case logsOut <- log:
					case <-ctx.Done():
						return
					}
				}
			}(tx)
		}

		wg.Wait()
		close(logsOut)
		close(errsOut)
	}()

	return logsOut, errsOut
}

func (lp *service) saveLogs(ctx context.Context, logsCh <-chan models.Log) (int, error) {
	saveThreshold := int(lp.saveThreshold)
	chunk := make([]models.Log, 0, saveThreshold)
	totalSaved := 0

	for log := range logsCh {
		if log.Error != nil {
			lp.lggr.Errorw("discarding invalid log", "log", log, "error", log.Error)
			continue
		}
		chunk = append(chunk, log)

		// save chunk if it's full
		if len(chunk) >= saveThreshold {
			savedCount, err := lp.store.SaveLogs(ctx, chunk, lp.batchInsertSize, lp.minBatchSize)
			if err != nil {
				return totalSaved, fmt.Errorf("failed to save chunk: %w", err)
			}
			totalSaved += int(savedCount)
			chunk = chunk[:0] //reset chunk
		}
	}

	// save remaining logs in the last chunk
	if len(chunk) > 0 {
		savedCount, err := lp.store.SaveLogs(ctx, chunk, lp.batchInsertSize, lp.minBatchSize)
		if err != nil {
			return totalSaved, fmt.Errorf("failed to save final chunk: %w", err)
		}
		totalSaved += int(savedCount)
	}

	return totalSaved, nil
}

func (lp *service) Replay(ctx context.Context, fromBlock uint32) error {
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return fmt.Errorf("failed to get client: %w", err)
	}
	// TODO(2025-08-28@jadepark-dev): clean up, forcing replay for e2e now
	// TODO: Replace with proper asynchronous backfill mechanism

	toBlock, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	// Use safe lookback window if fromBlock is 0 (avoid replaying entire chain)
	if fromBlock == 0 {
		fromBlock = computeLookbackWindow(toBlock.SeqNo, lp.startingLookback, lp.blockTime)
		lp.lggr.Infow("Replay with no starting block specified, using lookback window",
			"lookbackSeqNo", fromBlock, "lookbackDuration", lp.startingLookback)
	}

	blockRange := &models.BlockRange{Prev: nil, To: toBlock}
	var prevBlock *ton.BlockIDExt
	if fromBlock != 0 {
		prevBlock, err = client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, fromBlock)
		if err != nil {
			return fmt.Errorf("LookupBlock for previous seqno %d: %w", fromBlock, err)
		}
		blockRange.Prev = prevBlock
	}

	lp.lggr.Debugw("replaying logs", "fromBlock", fromBlock, "toBlock", toBlock.SeqNo,
		"blocksToProcess", toBlock.SeqNo-fromBlock)

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

// NewQuery creates a new query builder for constructing log queries.
func (lp *service) NewQuery() query.Builder {
	return query.NewQueryBuilder(lp.store)
}
