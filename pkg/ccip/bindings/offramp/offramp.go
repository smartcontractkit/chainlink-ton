package offramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

type CommitReportAccepted struct {
	MerkleRoot   *ocr.MerkleRoot   `tlb:"maybe ."`
	PriceUpdates *ocr.PriceUpdates `tlb:"maybe ^"`
}

type ExecutionStateChanged struct {
	SourceChainSelector uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	MessageID           []byte `tlb:"bits 256"`
	State               uint8  `tlb:"## 8"`
}

type Storage struct {
	ID                                      uint32              `tlb:"## 32"`
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
	OnRamp                    common.CrossChainAddress `tlb:"."`
}

// func (c *SourceChainConfig) FromResult(result *ton.ExecutionResult) error {
// 	routerAddressSlice, err := result.Slice(0)
// 	if err != nil {
// 		return err
// 	}
// 	routerAddress, err := routerAddressSlice.LoadAddr()
// 	if err != nil {
// 		return err
// 	}
// 	*c = SourceChainConfig{
// 		Router:                    routerAddress,
// 		IsEnabled:                 isEnabled,
// 		MinSeqNr:                  minSeqNr,
// 		IsRMNVerificationDisabled: isRMNVerificationDisabled,
// 		OnRamp: onRamp,
// 	}
// 	return nil
// }

type OCR3Config struct {
	ConfigInfo   ConfigInfo       `tlb:"."`
	Signers      *cell.Dictionary `tlb:"dict 256"`
	KeyLen       uint16           `tlb:"## 16"`
	Transmitters *cell.Dictionary `tlb:"dict 267"`
}

type ConfigInfo struct {
	ConfigDigest                   []byte `tlb:"bits 256"`
	F                              uint8  `tlb:"## 8"`
	N                              uint8  `tlb:"## 8"`
	IsSignatureVerificationEnabled bool   `tlb:"bool"`
}

// Methods

type UpdateSourceChainConfig struct {
	_                   tlb.Magic         `tlb:"#b98c95e3"` //nolint:revive // Ignore opcode tag
	QueryID             uint64            `tlb:"## 64"`
	SourceChainSelector uint64            `tlb:"## 64"`
	Config              SourceChainConfig `tlb:"."`
}

type Signer struct {
	Pubkey []byte `tlb:"bits 256"`
}

type Transmitter struct { // NOTE: using common.SnakeData[(*)address.Address] directly doesn't work
	Address *address.Address `tlb:"addr"`
}

type SetOCR3Config struct {
	_                              tlb.Magic                     `tlb:"#2b78359f"` //nolint:revive // Ignore opcode tag
	QueryID                        uint64                        `tlb:"## 64"`
	ConfigDigest                   []byte                        `tlb:"bits 256"`
	PluginType                     uint16                        `tlb:"## 16"`
	F                              uint8                         `tlb:"## 8"`
	IsSignatureVerificationEnabled bool                          `tlb:"bool"`
	Signers                        common.SnakeData[Signer]      `tlb:"^"`
	Transmitters                   common.SnakeData[Transmitter] `tlb:"^"`
}

type Commit struct {
	_                tlb.Magic                              `tlb:"#9d431905"` //nolint:revive // Ignore opcode tag
	QueryID          uint64                                 `tlb:"## 64"`
	ConfigDigest     []byte                                 `tlb:"bits 512"`
	CommitReport     ocr.CommitReport                       `tlb:"."`
	SignatureEd25519 common.SnakeData[ocr.SignatureEd25519] `tlb:"^"`
}

type Execute struct {
	_             tlb.Magic         `tlb:"#27bdac33"` //nolint:revive // Ignore opcode tag
	QueryID       uint64            `tlb:"## 64"`
	ConfigDigest  []byte            `tlb:"bits 512"`
	ExecuteReport ocr.ExecuteReport `tlb:"."`
}
