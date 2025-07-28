package feequoter

import (
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

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
