package logpoller

import (
	"errors"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Config holds the configuration for the log poller.
// NOTE: when adding new fields, please update ApplyDefaults, DefaultConfigSet, and ValidateConfig accordingly.
// Also check toml_test.go TestNewDecodedTOMLConfig() to ensure new fields are tested there.
type Config struct {
	PollPeriod                *config.Duration
	PageSize                  uint32
	LogPollerStartingLookback *config.Duration
	BlockTime                 *config.Duration

	// Database configuration - simple values with defaults
	BatchInsertSize uint32
	MinBatchSize    uint32
	SaveThreshold   uint32 // Number of logs to buffer in memory before saving
}

var DefaultConfigSet = Config{
	PollPeriod:                config.MustNewDuration(5 * time.Second),
	PageSize:                  100,
	LogPollerStartingLookback: config.MustNewDuration(24 * time.Hour),          // Look back 24 hours on startup
	BlockTime:                 config.MustNewDuration(2500 * time.Millisecond), // TON block time is approximately 2.5 seconds

	// fixed-sized fields in models.Log: ~342 bytes + Data field(BOC cell)
	// ccip message conservative e.g. 1500 bytes -> ~1842 bytes per log
	// SaveThreshold:   8000, // ~14.7MB

	// fixed-sized fields in postgres models.Log: ~474 bytes + Data field(BOC cell)
	// ccip message conservative e.g. 1500 bytes -> ~1974 bytes per log
	// BatchInsertSize: 4000, // ~7.9MB

	// database configuration,
	BatchInsertSize: 4000, // PostgreSQL batch insert size
	MinBatchSize:    500,  // Minimum batch size for timeout retry
	SaveThreshold:   8000, // Memory buffer size before batch saving
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
}

func (c *Config) ValidateConfig() (err error) {
	if c.PageSize == 0 {
		return errors.New("page_size must be greater than 0")
	}
	if c.BatchInsertSize == 0 {
		return errors.New("batch_insert_size must be greater than 0")
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
	return nil
}
