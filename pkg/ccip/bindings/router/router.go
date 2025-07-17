package router

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/address"
)

type Storage struct {
	Ownable common.Ownable2Step `tlb:"^"`
	OnRamp  *address.Address    `tlb:"addr"`
}
