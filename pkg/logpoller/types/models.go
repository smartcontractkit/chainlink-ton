package types

import (
	"time"

	"github.com/xssnick/tonutils-go/address"
)

type Filter struct {
	ID          int64
	Name        string
	Address     address.Address
	EventName   string
	EventTopic  uint64
	StartingSeq uint32
	Retention   time.Duration
	// TODO: add more fields
}

type Log struct {
	ID         int64
	FilterID   int64
	SeqNo      uint32
	Address    address.Address
	EventTopic uint64
	Data       []byte // raw BOC of the body cell
	ReceivedAt time.Time
	ExpiresAt  *time.Time
	Error      *string
}

// TODO: define block, for easier debug and replay
