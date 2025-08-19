package logpoller

import (
	"time"
)

type Config struct {
	PollPeriod time.Duration
	PageSize   uint32
}

var DefaultConfigSet = Config{
	PollPeriod: 5 * time.Second,
	PageSize:   100,
}
