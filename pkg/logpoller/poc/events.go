package poc

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type TopicEvent interface {
	Topic() uint64
}

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
