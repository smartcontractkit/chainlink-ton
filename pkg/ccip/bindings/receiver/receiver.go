package receiver

import (
	"github.com/xssnick/tonutils-go/address"
)

// Storage represents the storage structure for the CCIP receiver contract.
type Storage struct {
	ID      uint32           `tlb:"## 32"`
	OffRamp *address.Address `tlb:"addr"`
}
