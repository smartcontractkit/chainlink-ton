package proxy

import "github.com/xssnick/tonutils-go/address"

// CallProxy contract storage, auto-serialized to/from cell.
type Data struct {
	// ID allows multiple independent instances, since contract address depends on initial state.
	ID uint32 `tlb:"## 32"`

	// Target address to which the contract forwards all messages.
	Target address.Address `tlb:"addr"`
}
