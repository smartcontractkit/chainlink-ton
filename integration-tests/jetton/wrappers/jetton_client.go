package wrappers

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type JettonClient struct {
	MasterAddress    *address.Address `tlb:"addr"`
	JettonWalletCode *cell.Cell       `tlb:"^"`
}
