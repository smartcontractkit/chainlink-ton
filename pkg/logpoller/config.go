package logpoller

import (
	"errors"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Reasonable operational bounds: between 100ms and 10 minutes
const (
	minPollPeriod = 100 * time.Millisecond
	maxPollPeriod = 10 * time.Minute
)

// Pruning operational bounds
const (
	minPruningInterval     = 1 * time.Minute
	maxPruningInterval     = 1 * time.Hour
	defaultPruningInterval = 10 * time.Minute

	minPruningBatchSize     = 100
	maxPruningBatchSize     = 10000
	defaultPruningBatchSize = 1000

	defaultPruningStartDelay = 5 * time.Minute
)

// Config holds the configuration for the log poller.
// NOTE: when adding new fields, please update ApplyDefaults, DefaultConfigSet, and ValidateConfig accordingly.
// Also check toml_test.go TestNewDecodedTOMLConfig() to ensure new fields are tested there.
//
// Performance Note: The service loop is synchronous - each tick blocks until processing completes,
// so concurrent ticks cannot occur. However, if processing takes longer than PollPeriod, the poller
// falls behind chain head (a warning is logged when this happens). Processing time is primarily
// driven by PageSize and transaction volume. If processing consistently exceeds PollPeriod,
// reduce PageSize or increase PollPeriod. Monitor ton_logpoller_poll_duration_seconds metric.
type Config struct {
	// PollPeriod is the target interval between tick starts.
	PollPeriod *config.Duration
	// PageSize is the number of transactions fetched per API call. Larger values increase
	// throughput but also increase per-tick processing time. Tune based on expected volume.
	PageSize                  uint32
	LogPollerStartingLookback *config.Duration
	BlockTime                 *config.Duration
	MCBlockCacheSize          int // LRU cache maps shard block keys to masterchain seqno

	// Database configuration - simple values with defaults
	BatchInsertSize uint32
	MinBatchSize    uint32
	SaveThreshold   uint32 // Number of logs to buffer in memory before saving

	// MC block resolution retry configuration
	MCBlockResolveMaxRetries uint32           // Max retry attempts for masterchain block resolution
	MCBlockResolveBaseDelay  *config.Duration // Base delay for exponential backoff

	// Pruning configuration
	PruningInterval   *config.Duration // How often to run pruning (default 10 minutes)
	PruningBatchSize  int64            // Max rows to delete per batch (default 1000)
	PruningStartDelay *config.Duration // Delay before first pruning cycle (default 5 minutes)
}

var DefaultConfigSet = Config{
	PollPeriod:                config.MustNewDuration(5 * time.Second),
	PageSize:                  100,
	LogPollerStartingLookback: config.MustNewDuration(24 * time.Hour),          // Look back 24 hours on startup
	BlockTime:                 config.MustNewDuration(2500 * time.Millisecond), // TON block time is approximately 2.5 seconds

	// memory estimation per log:
	// - in-memory models.Log: ~342 bytes + Data field (BOC cell) ≈ 1842 bytes
	// - postgres models.Log:  ~474 bytes + Data field (BOC cell) ≈ 1974 bytes
	// SaveThreshold 7000 ≈ 12.9MB, BatchInsertSize 3500 ≈ 6.9MB
	BatchInsertSize: 3500, // postgresql batch insert size
	MinBatchSize:    500,  // Minimum batch size for timeout retry
	SaveThreshold:   7000, // Memory buffer size before batch saving

	MCBlockCacheSize: 1000, // ~100 bytes per entry, 1000 entries ≈ 100KB

	MCBlockResolveMaxRetries: 3,
	MCBlockResolveBaseDelay:  config.MustNewDuration(100 * time.Millisecond),

	// Pruning defaults
	PruningInterval:   config.MustNewDuration(defaultPruningInterval),
	PruningBatchSize:  defaultPruningBatchSize,
	PruningStartDelay: config.MustNewDuration(defaultPruningStartDelay),
}

func (c *Config) ApplyDefaults() {
	if c.PollPeriod == nil {
		c.PollPeriod = DefaultConfigSet.PollPeriod
	}
	if c.PageSize == 0 {
		c.PageSize = DefaultConfigSet.PageSize
	}
	if c.LogPollerStartingLookback == nil {
		c.LogPollerStartingLookback = DefaultConfigSet.LogPollerStartingLookback
	}
	if c.BlockTime == nil {
		c.BlockTime = DefaultConfigSet.BlockTime
	}
	if c.BatchInsertSize == 0 {
		c.BatchInsertSize = DefaultConfigSet.BatchInsertSize
	}
	if c.MinBatchSize == 0 {
		c.MinBatchSize = DefaultConfigSet.MinBatchSize
	}
	if c.SaveThreshold == 0 {
		c.SaveThreshold = DefaultConfigSet.SaveThreshold
	}
	if c.MCBlockCacheSize <= 0 {
		c.MCBlockCacheSize = DefaultConfigSet.MCBlockCacheSize
	}
	if c.MCBlockResolveMaxRetries == 0 {
		c.MCBlockResolveMaxRetries = DefaultConfigSet.MCBlockResolveMaxRetries
	}
	if c.MCBlockResolveBaseDelay == nil {
		c.MCBlockResolveBaseDelay = DefaultConfigSet.MCBlockResolveBaseDelay
	}
	if c.PruningInterval == nil {
		c.PruningInterval = DefaultConfigSet.PruningInterval
	}
	if c.PruningBatchSize == 0 {
		c.PruningBatchSize = DefaultConfigSet.PruningBatchSize
	}
	if c.PruningStartDelay == nil {
		c.PruningStartDelay = DefaultConfigSet.PruningStartDelay
	}
}

func (c *Config) ValidateConfig() (err error) {
	if c.PageSize == 0 {
		return errors.New("page_size must be greater than 0")
	}
	if c.BatchInsertSize == 0 {
		return errors.New("batch_insert_size must be greater than 0")
	}
	// postgresql wire protocol limit: 65,535 params / 17 params per row ≈ 3,855 max rows
	if c.BatchInsertSize > 3800 {
		return fmt.Errorf("batch_insert_size (%d) exceeds postgresql parameter limit (max 3800 rows)", c.BatchInsertSize)
	}
	if c.MinBatchSize == 0 {
		return errors.New("min_batch_size must be greater than 0")
	}
	if c.MinBatchSize > c.BatchInsertSize {
		return fmt.Errorf("min_batch_size (%d) cannot be greater than batch_insert_size (%d)",
			c.MinBatchSize, c.BatchInsertSize)
	}
	if c.SaveThreshold == 0 {
		return errors.New("save_threshold must be greater than 0")
	}

	// Validate PollPeriod to prevent startup panics and operational issues
	if c.PollPeriod == nil {
		return errors.New("poll_period must be set")
	}
	pollDuration := c.PollPeriod.Duration()
	if pollDuration <= 0 {
		return fmt.Errorf("poll_period must be positive, got %v", pollDuration)
	}
	if pollDuration < minPollPeriod {
		return fmt.Errorf("poll_period %v is too small (minimum: %v)", pollDuration, minPollPeriod)
	}
	if pollDuration > maxPollPeriod {
		return fmt.Errorf("poll_period %v is too large (maximum: %v)", pollDuration, maxPollPeriod)
	}

	// Validate pruning configuration
	if c.PruningInterval == nil {
		return errors.New("pruning_interval must be set")
	}
	pruningDuration := c.PruningInterval.Duration()
	if pruningDuration < minPruningInterval {
		return fmt.Errorf("pruning_interval %v is too small (minimum: %v)", pruningDuration, minPruningInterval)
	}
	if pruningDuration > maxPruningInterval {
		return fmt.Errorf("pruning_interval %v is too large (maximum: %v)", pruningDuration, maxPruningInterval)
	}

	if c.PruningBatchSize < minPruningBatchSize {
		return fmt.Errorf("pruning_batch_size %d is too small (minimum: %d)", c.PruningBatchSize, minPruningBatchSize)
	}
	if c.PruningBatchSize > maxPruningBatchSize {
		return fmt.Errorf("pruning_batch_size %d is too large (maximum: %d)", c.PruningBatchSize, maxPruningBatchSize)
	}

	// Note: PruningStartDelay allows 0 for testing. Negative values are rejected by config.Duration.
	return nil
}
