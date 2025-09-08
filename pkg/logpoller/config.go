package logpoller

import (
	"time"
)

type Config struct {
	PollPeriod                time.Duration
	PageSize                  uint32
	LogPollerStartingLookback time.Duration
	BlockTime                 time.Duration
}

var DefaultConfigSet = Config{
	PollPeriod:                5 * time.Second,
	PageSize:                  100,
	LogPollerStartingLookback: 24 * time.Hour,          // Look back 24 hours on startup
	BlockTime:                 2500 * time.Millisecond, // TON block time is approximately 2.5 seconds
}
