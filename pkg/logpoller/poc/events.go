package poc

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Event struct {
	Data    interface{}
	Source  *address.Address
	RawBody *cell.Cell
}

// TODO: can this scale?
type EventContainer struct {
	Event any `tlb:"[CounterResetEvent,CounterIncrementEvent]"`
}

type CounterResetEvent struct {
	_         tlb.Magic        `tlb:"#1001"` // 16-bit hex: 0x1001 from contract
	Timestamp uint32           `tlb:"## 32"`
	ResetBy   *address.Address `tlb:"addr"`
}

func (e *Event) AsCounterReset() (CounterResetEvent, bool) {
	evt, ok := e.Data.(CounterResetEvent)
	return evt, ok
}

type CounterIncrementEvent struct {
	_           tlb.Magic        `tlb:"#1002"` // 16-bit hex: 0x1002 from contract
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

func (e *Event) AsCounterIncrement() (CounterIncrementEvent, bool) {
	evt, ok := e.Data.(CounterIncrementEvent)
	return evt, ok
}
