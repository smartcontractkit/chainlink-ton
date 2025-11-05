package logpoller

import (
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
}

var DefaultConfigSet = Config{
	PollPeriod:                config.MustNewDuration(5 * time.Second),
	PageSize:                  100,
	LogPollerStartingLookback: config.MustNewDuration(24 * time.Hour),          // Look back 24 hours on startup
	BlockTime:                 config.MustNewDuration(2500 * time.Millisecond), // TON block time is approximately 2.5 seconds (2500ms)
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
}

func (c *Config) ValidateConfig() (err error) {
	return nil
}
