package eventemitter

import "github.com/xssnick/tonutils-go/address"

type CounterIncrementEvent struct {
	Timestamp   uint32           `tlb:"## 32"`
	NewValue    uint32           `tlb:"## 32"`
	TriggeredBy *address.Address `tlb:"addr"`
}

type CounterResetEvent struct {
	Timestamp uint32           `tlb:"## 32"`
	ResetBy   *address.Address `tlb:"addr"`
}
