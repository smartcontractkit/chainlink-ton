package logpoller

import (
	"errors"
	"fmt"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

// Config holds the main log poller configuration
type Config struct {
	PollPeriod                *config.Duration
	PageSize                  uint32
	LogPollerStartingLookback *config.Duration
	BlockTime                 *config.Duration

	// Database configuration - simple values with defaults
	BatchInsertSize uint32
	MinBatchSize    uint32
}

var DefaultConfigSet = Config{
	PollPeriod:                config.MustNewDuration(5 * time.Second),
	PageSize:                  100,
	LogPollerStartingLookback: config.MustNewDuration(24 * time.Hour),          // Look back 24 hours on startup
	BlockTime:                 config.MustNewDuration(2500 * time.Millisecond), // TON block time is approximately 2.5 seconds

	// TODO: copied from Solana logpoller, need load testing
	// database configuration
	BatchInsertSize: 4000, // PostgreSQL batch insert size
	MinBatchSize:    500,  // Minimum batch size for timeout retry
}

// Validate validates the configuration
func (c *Config) Validate() error {
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
	return nil
}
