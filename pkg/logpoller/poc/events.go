package poc

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Event struct {
	Data    interface{}
	Source  *address.Address
	RawBody *cell.Cell
}

func (e *Event) AsCounterReset() (CounterResetEvent, bool) {
	evt, ok := e.Data.(CounterResetEvent)
	return evt, ok
}

func (e *Event) AsCounterIncrement() (CounterIncrementEvent, bool) {
	evt, ok := e.Data.(CounterIncrementEvent)
	return evt, ok
}

type CounterResetEvent struct {
	Timestamp uint32           `tlb:"## 32"`
	ResetBy   *address.Address `tlb:"addr"`
}

// TODO: or this can be a const

type TopicEvent interface {
	Topic() uint64
}

func (e *CounterResetEvent) Topic() uint64 {
	return 1001
}

type CounterIncrementEvent struct {
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

func (e *CounterIncrementEvent) Topic() uint64 {
	return 1002
}

func CreateExtOutLogBucketAddress(topic uint64) *address.Address {
	// ExtOutLogBucket structure: '01' (addr_extern) + 256 (len) + 0x00 (prefix) + 248 bits (topic)

	// Create the data: 0x00 prefix + topic (248 bits = 31 bytes)
	data := make([]byte, 32) // 1 byte prefix + 31 bytes topic
	data[0] = 0x00           // prefix

	// Pack topic into remaining 31 bytes (big endian)
	for i := 7; i >= 0; i-- {
		data[24+i] = byte(topic >> (8 * (7 - i)))
	}

	// Create external address with flags=0x11, bitsLen=256
	return address.NewAddressExt(0x11, 256, data)
}
