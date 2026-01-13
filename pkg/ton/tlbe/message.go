package tlbe // tlb extras

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

// InternalMessageHeader is a helper struct to read internal message header (subset of fields).
type InternalMessageHeader struct {
	_           tlb.Magic        `tlb:"$0"` //nolint:revive // vendored from tonutils-go
	IHRDisabled bool             `tlb:"bool"`
	Bounce      bool             `tlb:"bool"`
	Bounced     bool             `tlb:"bool"`
	SrcAddr     *address.Address `tlb:"addr"`
	DstAddr     *address.Address `tlb:"addr"`
	Amount      tlb.Coins        `tlb:"."`
}
