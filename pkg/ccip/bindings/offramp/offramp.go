package offramp

import (
	"context"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

const (
	configGetter         = "config"
	srcChainConfigGetter = "sourceChainConfig"
)

// Types

// OCR3Config represents the OCR3 configuration stored on-chain
type OCR3Config struct {
	ConfigInfo   ConfigInfo       `tlb:"."`
	Signers      *cell.Dictionary `tlb:"dict 256"`
	Transmitters *cell.Dictionary `tlb:"dict 267"`
}

// CommitReportAccepted represents the CommitReportAccepted event data
type CommitReportAccepted struct {
	MerkleRoot   *ocr.MerkleRoot   `tlb:"maybe ."`
	PriceUpdates *ocr.PriceUpdates `tlb:"maybe ^"`
}

// ExecutionStateChanged represents the ExecutionStateChanged event data
type ExecutionStateChanged struct {
	SourceChainSelector uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	MessageID           []byte `tlb:"bits 256"`
	State               uint8  `tlb:"## 8"`
}

// SourceChainConfigUpdated represents the SourceChainConfigUpdated event data
type SourceChainConfigUpdated struct {
	SourceChainSelector uint64            `tlb:"## 64"`
	SourceChainConfig   SourceChainConfig `tlb:"."`
}

// SourceChainSelectorAdded represents the SourceChainSelectorAdded event data
type SourceChainSelectorAdded struct {
	SourceChainSelector uint64 `tlb:"## 64"`
}

// Storage represents the offRamp contract storage state
type Storage struct {
	ID                                      uint32                  `tlb:"## 32"`
	Ownable                                 ccipcommon.Ownable2Step `tlb:"."`
	Deployables                             Deployables             `tlb:"^"`
	FeeQuoter                               *address.Address        `tlb:"addr"`
	OCR3Base                                *cell.Cell              `tlb:"^"` // TODO:
	ChainSelector                           uint64                  `tlb:"## 64"`
	PermissionlessExecutionThresholdSeconds uint32                  `tlb:"## 32"`
	SourceChainConfigs                      *cell.Dictionary        `tlb:"dict 64"`
	LatestPriceSequenceNumber               uint64                  `tlb:"## 64"`
}

// Deployables holds the deployable code cells for the offRamp contract
type Deployables struct {
	Deployer            *cell.Cell `tlb:"^"`
	MerkleRootCode      *cell.Cell `tlb:"^"`
	ReceiveExecutorCode *cell.Cell `tlb:"^"`
}

// ConfigInfo represents the configuration information for OCR3
type ConfigInfo struct {
	ConfigDigest                   []byte `tlb:"bits 256"`
	F                              uint8  `tlb:"## 8"`
	N                              uint8  `tlb:"## 8"`
	IsSignatureVerificationEnabled bool   `tlb:"bool"`
}

// Methods

const CCIPReceiveOpCode = 0xb3126df1

// CCIPReceive represents the CCIP message received on TON
type CCIPReceive struct {
	_       tlb.Magic      `tlb:"#b3126df1"` //nolint:revive // Ignore opcode tag // crc32('Receiver_CCIPReceive')
	RootID  []byte         `tlb:"bits 192"`
	Message Any2TVMMessage `tlb:"."`
}

// Any2TVMMessage represents a cross-chain message to TON
type Any2TVMMessage struct {
	MessageID           [32]byte                     `tlb:"bits 256"`
	SourceChainSelector uint64                       `tlb:"## 64"`
	Sender              ccipcommon.CrossChainAddress `tlb:"."` // CrossChainAddress (inline: length prefix + bytes)
	Data                *cell.Cell                   `tlb:"^"`
}

// Signer represents a signer entry in the OCR3 config
type Signer struct {
	Pubkey []byte `tlb:"bits 256"`
}

// Transmitter represents a transmitter entry in the OCR3 config
type Transmitter struct { // NOTE: using common.SnakeData[(*)address.Address] directly doesn't work
	Address *address.Address `tlb:"addr"`
}

// SetOCR3Config represents the setOCR3Config method call on the offRamp contract
type SetOCR3Config struct {
	_                              tlb.Magic                         `tlb:"#2b78359f"` //nolint:revive // Ignore opcode tag
	QueryID                        uint64                            `tlb:"## 64"`
	ConfigDigest                   []byte                            `tlb:"bits 256"`
	PluginType                     uint16                            `tlb:"## 16"`
	F                              uint8                             `tlb:"## 8"`
	IsSignatureVerificationEnabled bool                              `tlb:"bool"`
	Signers                        ccipcommon.SnakeData[Signer]      `tlb:"^"`
	Transmitters                   ccipcommon.SnakeData[Transmitter] `tlb:"^"`
}

// UpdateSourceChainConfig represents the updateSourceChainConfig method call on the offRamp contract
type UpdateSourceChainConfig struct {
	_                   tlb.Magic         `tlb:"#b98c95e3"` //nolint:revive // Ignore opcode tag
	QueryID             uint64            `tlb:"## 64"`
	SourceChainSelector uint64            `tlb:"## 64"`
	Config              SourceChainConfig `tlb:"."`
}

// Commit represents the commit method call on the offRamp contract
type Commit struct {
	_                tlb.Magic                                  `tlb:"#9d431905"` //nolint:revive // Ignore opcode tag
	QueryID          uint64                                     `tlb:"## 64"`
	ConfigDigest     []byte                                     `tlb:"bits 512"`
	CommitReport     ocr.CommitReport                           `tlb:"."`
	SignatureEd25519 ccipcommon.SnakeData[ocr.SignatureEd25519] `tlb:"^"`
}

// Execute represents the execute method call on the offRamp contract
type Execute struct {
	_             tlb.Magic         `tlb:"#27bdac33"` //nolint:revive // Ignore opcode tag
	QueryID       uint64            `tlb:"## 64"`
	ConfigDigest  []byte            `tlb:"bits 512"`
	ExecuteReport ocr.ExecuteReport `tlb:"."`
}

// Config types that implements getter fetching interface with rpc client

// Config represents the offRamp contract configuration
type Config struct {
	ChainSelector                           uint64           `tlb:"## 64"`
	FeeQuoterAddress                        *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

func (c *Config) FromResult(result *ton.ExecutionResult) error {
	cs, err := result.Int(0)
	if err != nil {
		return fmt.Errorf("failed to get ChainSelector: %w", err)
	}

	chainSelector := cs.Uint64()

	feeQuoterAddressSlice, err := result.Slice(1)
	if err != nil {
		return fmt.Errorf("failed to get feeQuoter address slice: %w", err)
	}

	feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
	if err != nil {
		return fmt.Errorf("failed to load feeQuoter address: %w", err)
	}

	thresholdInt, err := result.Int(2)
	if err != nil {
		return fmt.Errorf("failed to get permissionlessExecutionThresholdSeconds: %w", err)
	}

	*c = Config{
		ChainSelector:                           chainSelector,
		FeeQuoterAddress:                        feeQuoterAddress,
		PermissionlessExecutionThresholdSeconds: uint32(thresholdInt.Uint64()), //nolint:gosec // this type is uint32 onchain
	}
	return nil
}

func (c *Config) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, _ []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, configGetter, nil, c.FromResult)
}

// SourceChainConfig represents the configuration for a specific source chain
type SourceChainConfig struct {
	Router                    *address.Address             `tlb:"addr"`
	IsEnabled                 bool                         `tlb:"bool"`
	MinSeqNr                  uint64                       `tlb:"## 64"`
	IsRMNVerificationDisabled bool                         `tlb:"bool"`
	OnRamp                    ccipcommon.CrossChainAddress `tlb:"."`
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
	onRamp, err := ccipcommon.LoadCrossChainAddressWithoutPrefix(onRampSlice)
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

func (c *SourceChainConfig) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, opts []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, ccipcommon.SrcChainConfigGetter, opts, c.FromResult)
}
