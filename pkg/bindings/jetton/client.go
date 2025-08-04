package jetton

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// This is for the encoding of the JettonClient on-chain struct
type Client struct {
	MasterAddress *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
}
