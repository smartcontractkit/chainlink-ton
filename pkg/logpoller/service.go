package logpoller

import (
	"context"
	"fmt"
	"slices"
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
// applies filtering logic to detect messages.

// ReplayInfo tracks the state of a replay operation
type ReplayInfo struct {
	mut          sync.RWMutex
	requestBlock uint32 // TON uses uint32 seqno
	status       models.ReplayStatus
}

func (r *ReplayInfo) hasRequest() bool {
	return r.status == models.ReplayStatusRequested || r.status == models.ReplayStatusPending
}

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

	// configuration for service operation
	pollPeriod         time.Duration // How often to poll for new blocks
	lastProcessedBlock uint32        // Last processed masterchain sequence number
	startingLookback   time.Duration // How far back to look when starting up
	blockTime          time.Duration // Expected block time for calculations(approximately 2.5 seconds)

	// configuration for transaction loading and log storage
	pageSize        uint32 // Number of transactions to fetch per API call
	batchInsertSize uint32 // PostgreSQL batch insert size
	minBatchSize    uint32 // Minimum batch size for timeout retry
	saveThreshold   uint32 // Number of logs to buffer in memory before saving

	// replay management
	replay ReplayInfo // Tracks replay requests and status
}

type ServiceOptions struct {
	Config      Config
	FilterStore FilterStore
	TxLoader    TxLoader
	LogStore    LogStore
}

// NewService creates a new TON log polling service instance
func NewService(lggr logger.Logger, chainID string, clientProvider func(context.Context) (ton.APIClientWrapped, error), opts *ServiceOptions) Service {
	lp := &service{
		lggr:             logger.Sugared(lggr),
		chainID:          chainID,
		clientProvider:   clientProvider,
		filterStore:      opts.FilterStore,
		loader:           opts.TxLoader,
		logStore:         opts.LogStore,
		pollPeriod:       opts.Config.PollPeriod.Duration(),
		startingLookback: opts.Config.LogPollerStartingLookback.Duration(),
		blockTime:        opts.Config.BlockTime.Duration(),
		pageSize:         opts.Config.PageSize,
		batchInsertSize:  opts.Config.BatchInsertSize,
		minBatchSize:     opts.Config.MinBatchSize,
		saveThreshold:    opts.Config.SaveThreshold,
	}
	lp.replay.status = models.ReplayStatusNoRequest
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
		lp.lggr.Debug("no new blocks to process")
		return nil
	}

	// Apply replay override if replay was requested
	err = lp.applyReplayOverride(ctx, blockRange)
	if err != nil {
		return fmt.Errorf("failed to apply replay override: %w", err)
	}

	lp.lggr.Tracew("processing block range", "fromSeq", blockRange.FromSeqNo(), "toSeq", blockRange.ToSeqNo())

	addresses, err := lp.filterStore.GetDistinctAddresses(ctx)
	if err != nil {
		return fmt.Errorf("failed to read distinct addresses from filter store: %w", err)
	}
	if len(addresses) == 0 {
		return nil
	}

	err = lp.processBlockRange(ctx, blockRange, addresses)
	if err != nil {
		return fmt.Errorf("failed to process block range: %w", err)
	}

	// Mark replay as complete if it was active
	if lp.replay.status == models.ReplayStatusPending {
		lp.replayComplete(blockRange.FromSeqNo(), blockRange.ToSeqNo())
	}

	lp.lastProcessedBlock = blockRange.ToSeqNo()
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
	logsCh, parseErrsCh := lp.parseTransactions(ctx, filterIndex, lp.chainID, txsCh)

	// TODO: deal with error metrics here
	go func() {
		for err := range loaderErrsCh {
			lp.lggr.Errorw("loader error", "err", err)
		}
	}()
	go func() {
		for err := range parseErrsCh {
			lp.lggr.Errorw("parse error", "err", err)
		}
	}()

	totalSaved, err := lp.saveLogs(ctx, logsCh)
	if err != nil {
		return fmt.Errorf("failed to save logs: %w", err)
	}

	// Only log when we actually saved logs to reduce noise
	if totalSaved > 0 {
		lp.lggr.Debugf("processed range (%d, %d], saved %d logs from %d addresses", blockRange.FromSeqNo(), blockRange.ToSeqNo(), totalSaved, len(addresses))
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
		wg.Go(func() {
			if err := lp.loader.LoadTxsForAddress(ctx, blockRange, addr, lp.pageSize, txsOut, errsOut); err != nil {
				lp.lggr.Warnf("Loader setup failed for address: %s, err: %v", addr.String(), err)
				errsOut <- err
			}
		})
	}

	// close channels when all goroutines are done
	go func() {
		wg.Wait()
		close(txsOut)
		close(errsOut)
	}()

	return txsOut, errsOut
}

func (lp *service) saveLogs(ctx context.Context, logsCh <-chan models.Log) (int, error) {
	saveThreshold := int(lp.saveThreshold)
	chunk := slices.Grow([]models.Log{}, saveThreshold)
	totalSaved := 0

	for log := range logsCh {
		if log.Error != nil {
			lp.lggr.Errorw("discarding invalid log", "log", log, "error", log.Error)
			continue
		}
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

// Replay initiates a new replay request.
// If a replay request has already been made since the previous replay was completed,
// the request will be updated to use the lower of the two fromBlock values.
// On the next LogPoller loop tick, all filters will be backfilled starting from fromBlock.
func (lp *service) Replay(ctx context.Context, fromBlock uint32) error {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	// Use safe lookback window if fromBlock is 0 (avoid replaying entire chain)
	if fromBlock == 0 {
		client, err := lp.clientProvider(ctx)
		if err != nil {
			return fmt.Errorf("failed to get client: %w", err)
		}
		toBlock, err := client.CurrentMasterchainInfo(ctx)
		if err != nil {
			return fmt.Errorf("failed to get current masterchain info: %w", err)
		}
		fromBlock = computeLookbackWindow(toBlock.SeqNo, lp.startingLookback, lp.blockTime)
		lp.lggr.Infow("Replay with no starting block specified, using lookback window",
			"lookbackSeqNo", fromBlock, "lookbackDuration", lp.startingLookback)
	}

	if lp.replay.hasRequest() && lp.replay.requestBlock <= fromBlock {
		lp.lggr.Warnf("Ignoring redundant replay request from %d, already requested from %d",
			fromBlock, lp.replay.requestBlock)
		return nil
	}

	lp.replay.requestBlock = fromBlock
	if lp.replay.status != models.ReplayStatusPending {
		lp.replay.status = models.ReplayStatusRequested
	}
	return nil
}

// ReplayStatus returns the current replay status of LogPoller:
// - NoRequest: there have not been any replay requests yet since service startup
// - Requested: a replay has been requested, but has not started yet
// - Pending: a replay is currently in progress
// - Complete: there was at least one replay executed since startup, but all have since completed
func (lp *service) ReplayStatus() models.ReplayStatus {
	lp.replay.mut.RLock()
	defer lp.replay.mut.RUnlock()
	return lp.replay.status
}

// checkForReplayRequest checks whether there have been any new replay requests since it was last called,
// and if so sets the pending flag to true and returns the block number
func (lp *service) checkForReplayRequest() (bool, uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	if !lp.replay.hasRequest() {
		return false, 0
	}

	requestBlock := lp.replay.requestBlock
	lp.lggr.Infow("Starting replay", "fromBlock", requestBlock)
	lp.replay.status = models.ReplayStatusPending
	return true, requestBlock
}

// replayComplete marks the replay as complete
func (lp *service) replayComplete(fromBlock, toBlock uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.lggr.Infow("Replay complete", "from", fromBlock, "to", toBlock)
	lp.replay.status = models.ReplayStatusComplete
	lp.replay.requestBlock = 0
}

// NewQuery creates a new query builder for constructing log queries.
func (lp *service) NewQuery() query.Builder {
	return query.NewQueryBuilder(lp.logStore)
}
