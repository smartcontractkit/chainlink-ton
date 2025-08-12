package logpoller

import (
	"time"

	"github.com/xssnick/tonutils-go/ton"
)

type Config struct {
	PollPeriod time.Duration
	PageSize   uint32
}

var DefaultConfigSet = Config{
	PollPeriod: 3 * time.Second,
	PageSize:   100,
}

type ServiceOptions struct {
	Config        Config // TODO: use global relayer config
	Client        ton.APIClientWrapped
	Filters       FilterStore
	MessageLoader MessageLoader
	Store         LogStore
}
