package logpoller

import (
	"time"
)

type Config struct {
	PollPeriod time.Duration
	PageSize   uint32
}

var DefaultConfigSet = Config{
	PollPeriod: 3 * time.Second,
	PageSize:   100,
}
