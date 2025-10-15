package receiver

import (
	"github.com/xssnick/tonutils-go/address"
)

// Storage represents the storage structure for the CCIP receiver contract.
type Storage struct {
	OffRamp *address.Address `tlb:"addr"`
}
