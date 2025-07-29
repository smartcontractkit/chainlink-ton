package feequoter

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type Storage struct {
	Ownable                      common.Ownable2Step `tlb:"^"`
	MaxFeeJuelsPerMsg            *big.Int            `tlb:"## 96"`
	LinkToken                    *address.Address    `tlb:"addr"`
	TokenPriceStalenessThreshold uint64              `tlb:"## 64"`
	UsdPerToken                  *cell.Dictionary    `tlb:"dict 267"`
	PremiumMultiplierWeiPerEth   *cell.Dictionary    `tlb:"dict 267"`
	DestChainConfigs             *cell.Dictionary    `tlb:"dict 64"`
}

// Methods

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64                   `tlb:"## 64"`
	Router                   common.CrossChainAddress `tlb:"."`
	AllowListEnabled         bool                     `tlb:"bool"`
}

type UpdateDestChainConfigs struct {
	_       tlb.Magic                               `tlb:"#10000004"`
	Updates common.SnakeData[UpdateDestChainConfig] `tlb:"^"`
}
