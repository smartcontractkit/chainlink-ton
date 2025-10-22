package offramp

import (
	"context"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

const ocr3ConfigGetter = "ocr3Config"

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
	LatestPriceSequenceNumber               uint64              `tlb:"## 64"`
}

type SourceChainConfig struct {
	Router                    *address.Address         `tlb:"addr"`
	IsEnabled                 bool                     `tlb:"bool"`
	MinSeqNr                  uint64                   `tlb:"## 64"`
	IsRMNVerificationDisabled bool                     `tlb:"bool"`
	OnRamp                    common.CrossChainAddress `tlb:"."`
}

func (c *SourceChainConfig) FromResult(result *ton.ExecutionResult) error {
	routerAddressSlice, err := result.Slice(0)
	if err != nil {
		return fmt.Errorf("failed to get router address slice: %w", err)
	}
	routerAddress, err := routerAddressSlice.LoadAddr()
	if err != nil {
		return fmt.Errorf("failed to load router address: %w", err)
	}

	isEnabledInt, err := result.Int(1)
	if err != nil {
		return fmt.Errorf("failed to get isEnabled: %w", err)
	}
	isEnabled := isEnabledInt.Cmp(big.NewInt(0)) != 0

	minSeqNrInt, err := result.Int(2)
	if err != nil {
		return fmt.Errorf("failed to get minSeqNr: %w", err)
	}
	minSeqNr := minSeqNrInt.Uint64()

	isRMNDisabledInt, err := result.Int(3)
	if err != nil {
		return fmt.Errorf("failed to get isRMNVerificationDisabled: %w", err)
	}
	isRMNVerificationDisabled := isRMNDisabledInt.Cmp(big.NewInt(0)) != 0

	onRampSlice, err := result.Slice(4)
	if err != nil {
		return fmt.Errorf("failed to get onRamp slice: %w", err)
	}
	onRamp, err := common.LoadCrossChainAddressWithoutPrefix(onRampSlice)
	if err != nil {
		return fmt.Errorf("failed to parse onRamp: %w", err)
	}

	*c = SourceChainConfig{
		Router:                    routerAddress,
		IsEnabled:                 isEnabled,
		MinSeqNr:                  minSeqNr,
		IsRMNVerificationDisabled: isRMNVerificationDisabled,
		OnRamp:                    onRamp,
	}
	return nil
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

const CCIPReceiveOpCode = 0xb3126df1

// CCIPReceive represents the CCIP message received on TON
type CCIPReceive struct {
	_       tlb.Magic      `tlb:"#b3126df1"` //nolint:revive // Ignore opcode tag // crc32('Receiver_CCIPReceive')
	RootID  []byte         `tlb:"bits 224"`
	Message Any2TVMMessage `tlb:"."`
}

// Any2TVMMessage represents a cross-chain message to TON
type Any2TVMMessage struct {
	MessageID           [32]byte                 `tlb:"bits 256"`
	SourceChainSelector uint64                   `tlb:"## 64"`
	Sender              common.CrossChainAddress `tlb:"."` // CrossChainAddress (inline: length prefix + bytes)
	Data                *cell.Cell               `tlb:"^"`
}

// binding types that supports FetchResult interface with rpc client

type OCR3Config struct {
	ConfigInfo   ConfigInfo       `tlb:"."`
	Signers      *cell.Dictionary `tlb:"dict 256"`
	Transmitters *cell.Dictionary `tlb:"dict 267"`
}

func (c *OCR3Config) FromResult(result *ton.ExecutionResult) error {
	// commit (index 1)
	isNil, err := result.IsNil(1)
	if err != nil {
		return fmt.Errorf("failed to get isNil for commit: %w", err)
	}

	if !isNil {
		configCell, err1 := result.Cell(1)
		if err1 != nil {
			return fmt.Errorf("failed to get configCell: %w", err1)
		}
		if err := tlb.LoadFromCell(c, configCell.BeginParse()); err != nil {
			return fmt.Errorf("load OCR3Config from cell: %w", err)
		}
		return nil
	}

	// exec (index 2)
	isNil, err = result.IsNil(2)
	if err != nil {
		return fmt.Errorf("failed to get isNil for execute: %w", err)
	}
	if !isNil {
		configCell, err2 := result.Cell(2)
		if err2 != nil {
			return fmt.Errorf("failed to get configCell: %w", err2)
		}

		if err := tlb.LoadFromCell(c, configCell.BeginParse()); err != nil {
			return fmt.Errorf("load OCR3Config from cell: %w", err)
		}
		return nil
	}

	return fmt.Errorf("both commit and execute are nil in OCR3Config")
}

func (c *OCR3Config) FetchResult(ctx context.Context, client ton.APIClientWrapped, contractAddr *address.Address, _ common.FetchOptions) error {
	block, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	result, err := client.RunGetMethod(ctx, block, contractAddr, ocr3ConfigGetter)
	if err != nil {
		return fmt.Errorf("failed to get ocr3Config: %w", err)
	}

	err = c.FromResult(result)
	return err
}
