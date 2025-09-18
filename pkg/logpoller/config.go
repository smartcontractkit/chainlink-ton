package logpoller

import (
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
)

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
