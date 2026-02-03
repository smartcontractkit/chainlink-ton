package logpoller

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"

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
// applies filtering logic to detect messages.

// service is the main TON log poller service.
// It continuously polls the TON masterchain, discovers new blocks, and processes
// external messages from registered filter addresses.
type service struct {
	services.Service
	eng            *services.Engine                                    // Service engine for lifecycle management
	lggr           logger.SugaredLogger                                // Logger instance
	clientProvider func(context.Context) (ton.APIClientWrapped, error) // TON blockchain client lazy getter
	chainID        string                                              // Target chain ID

	loader      TxLoader    // Transaction loader returning loaded txs
	filterStore FilterStore // Filter store for managing filters
	logStore    LogStore    // Log store for storing logs

	metrics *logPollerMetrics // metrics for observability

	// configuration for service operation
	pollPeriod              time.Duration // How often to poll for new blocks
	lastProcessedBlockSeqNo uint32        // Last processed masterchain sequence number
	startingLookback        time.Duration // How far back to look when starting up
	blockTime               time.Duration // Expected block time for calculations(approximately 2.5 seconds)

	// configuration for transaction loading and log storage
	pageSize        uint32 // Number of transactions to fetch per API call
	batchInsertSize uint32 // PostgreSQL batch insert size
	minBatchSize    uint32 // Minimum batch size for timeout retry
	saveThreshold   uint32 // Number of logs to buffer in memory before saving

	// masterchain block resolution configuration
	mcBlockCache             *lru.Cache[string, uint32] // shard block -> masterchain seqno
	mcBlockResolveMaxRetries uint32                     // Max retry attempts for MC block resolution
	mcBlockResolveBaseDelay  time.Duration              // Base delay for exponential backoff

	// pruning configuration
	pruningInterval   time.Duration // How often to run pruning
	pruningBatchSize  int64         // Max rows to delete per batch
	pruningStartDelay time.Duration // Delay before first pruning cycle

	// replay management
	replay replayInfo // Tracks replay requests and status
}

type ServiceOptions struct {
	Config      Config
	FilterStore FilterStore
	TxLoader    TxLoader
	LogStore    LogStore
}

// NewService creates a new TON log polling service instance
func NewService(lggr logger.Logger, chainID string, clientProvider func(context.Context) (ton.APIClientWrapped, error), opts *ServiceOptions) (Service, error) {
	// init metrics
	metrics, err := newMetrics(chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize metrics: %w", err)
	}

	// wrap stores with observed versions for metrics instrumentation
	observedFilterStore := NewObservedFilterStore(opts.FilterStore, metrics, lggr)
	observedLogStore := NewObservedLogStore(opts.LogStore, metrics, lggr)

	// init masterchain block cache
	mcBlockCache, err := lru.New[string, uint32](opts.Config.MCBlockCacheSize)
	if err != nil {
		return nil, fmt.Errorf("failed to create masterchain block cache: %w", err)
	}

	lp := &service{
		lggr:                     logger.Sugared(lggr),
		chainID:                  chainID,
		clientProvider:           clientProvider,
		filterStore:              observedFilterStore,
		loader:                   opts.TxLoader,
		logStore:                 observedLogStore,
		metrics:                  metrics,
		pollPeriod:               opts.Config.PollPeriod.Duration(),
		startingLookback:         opts.Config.LogPollerStartingLookback.Duration(),
		blockTime:                opts.Config.BlockTime.Duration(),
		pageSize:                 opts.Config.PageSize,
		batchInsertSize:          opts.Config.BatchInsertSize,
		minBatchSize:             opts.Config.MinBatchSize,
		saveThreshold:            opts.Config.SaveThreshold,
		mcBlockCache:             mcBlockCache,
		mcBlockResolveMaxRetries: opts.Config.MCBlockResolveMaxRetries,
		mcBlockResolveBaseDelay:  opts.Config.MCBlockResolveBaseDelay.Duration(),
		pruningInterval:          opts.Config.PruningInterval.Duration(),
		pruningBatchSize:         opts.Config.PruningBatchSize,
		pruningStartDelay:        opts.Config.PruningStartDelay.Duration(),
	}
	lp.replay.status = models.ReplayStatusNoRequest
	lp.Service, lp.eng = services.Config{
		Name:  "TONLogPoller",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp, nil
}

// NewServiceWith creates a new TON log polling service and registers the provided filters.
// This is a convenience constructor for cases where filters are known upfront.
// The caller is responsible for starting the service with Start().
func NewServiceWith(
	ctx context.Context,
	lggr logger.Logger,
	chainID string,
	clientProvider func(context.Context) (ton.APIClientWrapped, error),
	opts *ServiceOptions,
	filters []models.Filter,
) (Service, error) {
	svc, err := NewService(lggr, chainID, clientProvider, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create service: %w", err)
	}

	for _, f := range filters {
		if _, err := svc.RegisterFilter(ctx, f); err != nil {
			return nil, fmt.Errorf("failed to register filter %s: %w", f.Name, err)
		}
	}

	return svc, nil
}

// start initializes the log polling service and begins the polling loop
func (lp *service) start(_ context.Context) error {
	lp.lggr.Infof("starting TON logpoller")

	// Main polling loop
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		start := time.Now()
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
			lp.metrics.IncrementPollErrors(ctx)
		}
		duration := time.Since(start)
		lp.metrics.SetPollDuration(ctx, duration)

		// GoTick is blocking - next tick only starts after this one completes.
		// warn if processing took longer than poll period, as this causes cumulative delay.
		if duration > lp.pollPeriod {
			lp.lggr.Warnw("tick processing exceeded poll period, falling behind chain head",
				"duration", duration,
				"pollPeriod", lp.pollPeriod,
				"overage", duration-lp.pollPeriod,
			)
		}
	})

	// Background pruning worker with staggered startup
	pruningTicker := services.TickerConfig{
		Initial:   lp.pruningStartDelay,
		JitterPct: services.DefaultJitter,
	}.NewTicker(lp.pruningInterval)

	lp.eng.GoTick(pruningTicker, lp.backgroundPruningRun)

	lp.lggr.Infow("background pruning worker started",
		"interval", lp.pruningInterval,
		"startDelay", lp.pruningStartDelay,
		"batchSize", lp.pruningBatchSize,
	)

	return nil
}

// run executes a single polling iteration:
// 1. Gets the current masterchain head
// 2. Checks for pending replay requests and applies replay override if needed
// 3. Processes new blocks since the last processed sequence number
// 4. Updates the last processed sequence number
func (lp *service) run(ctx context.Context) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic recovered: %v", rec)
		}
	}()

	// Get current masterchain block first (needed for both normal and replay paths)
	currentMasterchainBlock, err := lp.getMasterchainCurrentBlock(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain block: %w", err)
	}

	blockRange, err := lp.getBlockRange(ctx, currentMasterchainBlock)
	if err != nil {
		return fmt.Errorf("failed to get masterchain block range: %w", err)
	}

	// apply replay override, must be called before checking blockRange == nil to support replay on idle state
	blockRange = lp.applyReplayOverride(ctx, blockRange, currentMasterchainBlock)

	if blockRange == nil {
		// no new blocks to process and no replay pending
		lp.lggr.Debug("no new blocks to process")
		return nil
	}

	// Record blocks behind before processing (shows catch-up work needed)
	// Note: during replay this will show larger values, which is expected
	lp.metrics.SetBlocksBehind(ctx, blockRange.ToSeqNo(), blockRange.FromSeqNo())

	addresses, err := lp.filterStore.GetDistinctAddresses(ctx)
	if err != nil {
		return fmt.Errorf("failed to read distinct addresses from filter store: %w", err)
	}
	if len(addresses) == 0 {
		return nil
	}

	lp.lggr.Tracew("processing block range", "fromSeq", blockRange.FromSeqNo(), "toSeq", blockRange.ToSeqNo())

	err = lp.processBlockRange(ctx, blockRange, addresses)
	if err != nil {
		return fmt.Errorf("failed to process block range: %w", err)
	}

	// Mark replay as complete if it was active
	if lp.replay.status == models.ReplayStatusPending {
		lp.replayComplete(blockRange.FromSeqNo(), blockRange.ToSeqNo())
	}

	lp.lastProcessedBlockSeqNo = blockRange.ToSeqNo()
	lp.metrics.SetLastProcessedBlock(ctx, lp.lastProcessedBlockSeqNo)
	lp.metrics.AddBlocksProcessed(ctx, int64(blockRange.ToSeqNo()-blockRange.FromSeqNo()))

	return nil
}

// processBlockRange handles scanning a range of blocks for transactions
func (lp *service) processBlockRange(ctx context.Context, blockRange *models.BlockRange, addresses []*address.Address) error {
	filterIndex, err := lp.buildFilterIndex(ctx, addresses)
	if err != nil {
		return fmt.Errorf("failed to build filter index: %w", err)
	}

	txsCh, loadErrsCh := lp.loadTxsForAddresses(ctx, blockRange, addresses)
	logsCh, parseErrsCh := lp.parseTransactions(ctx, filterIndex, lp.chainID, txsCh)

	go func() {
		for err := range loadErrsCh {
			lp.metrics.IncrementLoaderErrors(ctx)
			lp.lggr.Errorw("loading transactions error", "err", err)
		}
	}()
	go func() {
		for err := range parseErrsCh {
			lp.metrics.IncrementParseErrors(ctx)
			lp.lggr.Errorw("parsing transactions error", "err", err)
		}
	}()

	totalSaved, err := lp.saveLogs(ctx, logsCh)
	if err != nil {
		return fmt.Errorf("failed to save logs: %w", err)
	}

	// Note: logs inserted metric is recorded by ObservedLogStore.SaveLogs
	if totalSaved > 0 {
		lp.lggr.Debugf("processed range (%d, %d], saved %d logs from %d addresses", blockRange.FromSeqNo(), blockRange.ToSeqNo(), totalSaved, len(addresses))
	}

	return nil
}

// loadTxsForAddresses scans TON blockchain for transactions from specified addresses
// between prevBlock(exclusive) and toBlock(inclusive).
// Returns parallel slices of transactions and their corresponding blocks.
// It resolves masterchain block seqno for each transaction inline before outputting(lru cached).
func (lp *service) loadTxsForAddresses(ctx context.Context, blockRange *models.BlockRange, srcAddrs []*address.Address) (<-chan models.Tx, <-chan error) {
	rawTxsCh := make(chan models.Tx, lp.pageSize)
	txsOut := make(chan models.Tx, lp.pageSize)
	errsOut := make(chan error, len(srcAddrs))

	var wg sync.WaitGroup
	for _, addr := range srcAddrs {
		wg.Go(func() {
			if err := lp.loader.LoadTxsForAddress(ctx, blockRange, addr, lp.pageSize, rawTxsCh, errsOut); err != nil {
				lp.lggr.Warnf("Loader setup failed for address: %s, err: %v", addr.String(), err)
				errsOut <- err
			}
		})
	}

	// resolve masterchain seqno and forward to output channel
	go lp.resolveTxsMCBlock(ctx, rawTxsCh, txsOut, errsOut)

	// close rawTxsCh and errsOut when all loaders are done
	go func() {
		wg.Wait()
		close(rawTxsCh)
		close(errsOut)
	}()

	return txsOut, errsOut
}

// resolveTxsMCBlock resolves masterchain block seqno for each transaction and forwards to output channel.
// On resolution failure after retries, tx proceeds with MCBlockSeqno=0 to avoid data loss.
func (lp *service) resolveTxsMCBlock(ctx context.Context, rawTxsCh <-chan models.Tx, txsOut chan<- models.Tx, errsOut chan<- error) {
	defer close(txsOut)

	for tx := range rawTxsCh {
		mcSeqno, err := lp.resolveMCBlockSeqNoWithRetry(ctx, tx.Block)
		if err != nil {
			lp.lggr.Warnw("failed to resolve masterchain block seqno after retries, using 0 as fallback",
				"block", shardBlockKey(tx.Block),
				"err", err)
			errsOut <- fmt.Errorf("failed to resolve masterchain block seqno: %w", err)
		}
		tx.MCBlockSeqno = mcSeqno

		select {
		case txsOut <- tx:
		case <-ctx.Done():
			return
		}
	}
}

// resolveMCBlockSeqNoWithRetry wraps resolveMCBlockSeqNo with exponential backoff retry.
func (lp *service) resolveMCBlockSeqNoWithRetry(ctx context.Context, block *ton.BlockIDExt) (uint32, error) {
	var lastErr error
	delay := lp.mcBlockResolveBaseDelay

	for attempt := range lp.mcBlockResolveMaxRetries {
		mcSeqno, err := lp.resolveMCBlockSeqNo(ctx, block)
		if err == nil {
			return mcSeqno, nil
		}
		lastErr = err

		// don't retry on context cancellation
		if ctx.Err() != nil {
			return 0, ctx.Err()
		}

		if attempt < lp.mcBlockResolveMaxRetries-1 {
			lp.lggr.Debugw("retrying masterchain block resolution",
				"block", shardBlockKey(block),
				"attempt", attempt+1,
				"delay", delay,
				"err", err)

			select {
			case <-time.After(delay):
				delay *= 2 // exponential backoff
			case <-ctx.Done():
				return 0, ctx.Err()
			}
		}
	}

	return 0, fmt.Errorf("failed after %d attempts: %w", lp.mcBlockResolveMaxRetries, lastErr)
}

func (lp *service) saveLogs(ctx context.Context, logsCh <-chan models.Log) (int, error) {
	saveThreshold := int(lp.saveThreshold)
	chunk := slices.Grow([]models.Log{}, saveThreshold)
	totalSaved := 0

	for log := range logsCh {
		chunk = append(chunk, log)

		// save chunk if it's full
		if len(chunk) >= saveThreshold {
			savedCount, err := lp.logStore.SaveLogs(ctx, chunk, lp.batchInsertSize, lp.minBatchSize)
			if err != nil {
				return totalSaved, fmt.Errorf("failed to save chunk: %w", err)
			}
			totalSaved += int(savedCount)
			chunk = chunk[:0] // reset chunk
		}
	}

	// save remaining logs in the last chunk
	if len(chunk) > 0 {
		savedCount, err := lp.logStore.SaveLogs(ctx, chunk, lp.batchInsertSize, lp.minBatchSize)
		if err != nil {
			return totalSaved, fmt.Errorf("failed to save final chunk: %w", err)
		}
		totalSaved += int(savedCount)
	}

	return totalSaved, nil
}

// NewQuery creates a new query builder for constructing log queries.
func (lp *service) NewQuery() query.Builder {
	return query.NewQueryBuilder(lp.logStore)
}
