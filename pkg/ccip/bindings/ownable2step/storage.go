package ownable2step

import (
	"github.com/xssnick/tonutils-go/address"
)

// Ownable2Step represents a two-step ownership structure, where an owner can set a pending owner.
type Storage struct {
	Owner        *address.Address `tlb:"addr"`
	PendingOwner *address.Address `tlb:"addr"` // PendingOwner is optional
}
