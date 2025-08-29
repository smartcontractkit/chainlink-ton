package offramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type Storage struct {
	Ownable                                 common.Ownable2Step `tlb:"."`
	Deployer                                *cell.Cell          `tlb:"^"`
	MerkleRootCode                          *cell.Cell          `tlb:"^"`
	FeeQuoter                               *address.Address    `tlb:"addr"`
	OCR3Base                                *cell.Cell          `tlb:"^"` // TODO:
	ChainSelector                           uint64              `tlb:"## 64"`
	PermissionlessExecutionThresholdSeconds uint32              `tlb:"## 32"`
	SourceChainConfigs                      *cell.Dictionary    `tlb:"dict 64"`
	KeyLen                                  uint16              `tlb:"## 16"`
	LatestPriceSequenceNumber               uint64              `tlb:"## 64"`
}

type SourceChainConfig struct {
	Router                    *address.Address         `tlb:"addr"`
	IsEnabled                 bool                     `tlb:"bool"`
	MinSeqNr                  uint64                   `tlb:"## 64"`
	IsRMNVerificationDisabled bool                     `tlb:"bool"`
	OnRamp                    common.CrossChainAddress `tlb:"^"`
}

// Methods

type UpdateSourceChainConfig struct {
	_                   tlb.Magic         `tlb:"#b98c95e3"` //nolint:revive // Ignore opcode tag
	SourceChainSelector uint64            `tlb:"## 64"`
	Config              SourceChainConfig `tlb:"."`
}
