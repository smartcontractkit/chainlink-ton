package ownable2step

import (
	"github.com/xssnick/tonutils-go/address"
)

// Ownable2Step represents a two-step ownership structure, where an owner can set a pending owner.
//
// Note: PendingOwner uses `tlb:"addr"` (not `tlb:"maybe addr"`) because Tolk's `address?`
// compiles to LDOPTSTDADDR, which reads raw MsgAddress directly. The 2-bit discriminator
// (addr_none$00 = null, addr_std$10 = address) already encodes nullability.
// Using `tlb:"maybe addr"` would add a 1-bit Maybe prefix, causing Tolk to misparse the cell.
type Storage struct {
	Owner        *address.Address `tlb:"addr"`
	PendingOwner *address.Address `tlb:"addr"`
}
