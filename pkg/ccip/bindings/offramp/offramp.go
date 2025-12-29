package offramp

import (
	"context"
	"fmt"
	"math/big"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

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

// DynamicConfigSet represents the DynamicConfigSet event data
type DynamicConfigSet struct {
	FeeQuoter                               *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

// Storage represents the offRamp contract storage state
type Storage struct {
	ID                                      uint32               `tlb:"## 32"`
	Ownable                                 ownable2step.Storage `tlb:"."`
	Deployables                             Deployables          `tlb:"^"`
	FeeQuoter                               *address.Address     `tlb:"addr"`
	OCR3Base                                OCR3Base             `tlb:"^"`
	CursedSubjects                          *cell.Dictionary     `tlb:"dict 128"`
	ChainSelector                           uint64               `tlb:"## 64"`
	PermissionlessExecutionThresholdSeconds uint32               `tlb:"## 32"`
	SourceChainConfigs                      *cell.Dictionary     `tlb:"dict 64"`
	LatestPriceSequenceNumber               uint64               `tlb:"## 64"`
}

// Deployables holds the deployable code cells for the offRamp contract
type Deployables struct {
	RMNRouter           *address.Address `tlb:"addr"`
	Deployer            *cell.Cell       `tlb:"^"`
	MerkleRootCode      *cell.Cell       `tlb:"^"`
	ReceiveExecutorCode *cell.Cell       `tlb:"^"`
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
	_       tlb.Magic      `tlb:"#b3126df1"` //nolint:revive // Ignore opcode tag
	RootID  []byte         `tlb:"bits 192"`
	Message Any2TVMMessage `tlb:"."`
}

// Any2TVMMessage represents a cross-chain message to TON
type Any2TVMMessage struct {
	MessageID           [32]byte                     `tlb:"bits 256"`
	SourceChainSelector uint64                       `tlb:"## 64"`
	Sender              ccipcommon.CrossChainAddress `tlb:"."` // CrossChainAddress (inline: length prefix + bytes)
	Data                *cell.Cell                   `tlb:"^"`
	TokenAmounts        *cell.Cell                   `tlb:"maybe ^"`
}

// Signer represents a signer entry in the OCR3 config
type Signer struct {
	Pubkey []byte `tlb:"bits 256"`
}

// SetOCR3Config represents the setOCR3Config method call on the offRamp contract
type SetOCR3Config struct {
	_                              tlb.Magic                                    `tlb:"#2b78359f"` //nolint:revive // Ignore opcode tag
	QueryID                        uint64                                       `tlb:"## 64"`
	ConfigDigest                   []byte                                       `tlb:"bits 256"`
	PluginType                     uint16                                       `tlb:"## 16"`
	F                              uint8                                        `tlb:"## 8"`
	IsSignatureVerificationEnabled bool                                         `tlb:"bool"`
	Signers                        ccipcommon.SnakeData[Signer]                 `tlb:"^"`
	Transmitters                   ccipcommon.SnakeData[ccipcommon.AddressWrap] `tlb:"^"`
}

// UpdateSourceChainConfig represents the updateSourceChainConfig structure
type UpdateSourceChainConfig struct {
	SourceChainSelector uint64            `tlb:"## 64"`
	Config              SourceChainConfig `tlb:"."`
}

// UpdateSourceChainConfigs represents the updateSourceChainConfigs method call on the offRamp contract
type UpdateSourceChainConfigs struct {
	_       tlb.Magic                                     `tlb:"#22b4f05c"` //nolint:revive // Ignore opcode tag
	QueryID uint64                                        `tlb:"## 64"`
	Configs ccipcommon.SnakeData[UpdateSourceChainConfig] `tlb:"^"`
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

type SetDynamicConfig struct {
	_                                       tlb.Magic        `tlb:"#95bc5a5c"` //nolint:revive // Ignore opcode tag
	QueryID                                 uint64           `tlb:"## 64"`
	FeeQuoter                               *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

type UpdateDeployables struct {
	_                   tlb.Magic  `tlb:"#a015e0e2"` //nolint:revive // Ignore opcode tag
	QueryID             uint64     `tlb:"## 64"`
	ReceiveExecutorCode *cell.Cell `tlb:"maybe ^"`
	MerkleRootCode      *cell.Cell `tlb:"maybe ^"`
}

var TLBs = lib.MustNewTLBMap([]any{
	CCIPReceive{},
	SetOCR3Config{},
	UpdateSourceChainConfigs{},
	Commit{},
	Execute{},
	SetDynamicConfig{},
	UpdateDeployables{},
})

// Config types that implements getter fetching interface with rpc client

// OCR3Base represents the OCR3 base configuration stored on-chain
type OCR3Base struct {
	ChainID uint8       `tlb:"## 8"`
	Commit  *OCR3Config `tlb:"maybe ^"`
	Execute *OCR3Config `tlb:"maybe ^"`
}

func (c *OCR3Base) UnmarshalResult(result *ton.ExecutionResult) error {
	// chainID (index 0)
	chainIDInt, err := result.Int(0)
	if err != nil {
		return fmt.Errorf("failed to get ChainID: %w", err)
	}
	c.ChainID = uint8(chainIDInt.Uint64()) //nolint:gosec // this type is uint8 onchain

	// commit (index 1)
	isNil, err := result.IsNil(1)
	if err != nil {
		return err
	}
	if !isNil {
		configCell, err1 := result.Cell(1)
		if err1 != nil {
			return err1
		}

		var config OCR3Config
		if err = tlb.LoadFromCell(&config, configCell.BeginParse()); err != nil {
			return fmt.Errorf("load OCR3Config from cell: %w", err)
		}
		c.Commit = &config
	}

	// execute (index 2)
	isNil, err = result.IsNil(2)
	if err != nil {
		return err
	}
	if !isNil {
		configCell, err2 := result.Cell(2)
		if err2 != nil {
			return err2
		}

		var config OCR3Config
		if err = tlb.LoadFromCell(&config, configCell.BeginParse()); err != nil {
			return fmt.Errorf("load OCR3Config from cell: %w", err)
		}
		c.Execute = &config
	}

	return nil
}

func (c *OCR3Base) GetterMethodName() string {
	return ocr3BaseGetter
}

// Config represents the offRamp contract configuration
type Config struct {
	ChainSelector                           uint64           `tlb:"## 64"`
	FeeQuoterAddress                        *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

func (c *Config) UnmarshalResult(result *ton.ExecutionResult) error {
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

func (c *Config) GetterMethodName() string {
	return configGetter
}

// SourceChainConfig represents the configuration for a specific source chain
type SourceChainConfig struct {
	Router                    *address.Address             `tlb:"addr"`
	IsEnabled                 bool                         `tlb:"bool"`
	MinSeqNr                  uint64                       `tlb:"## 64"`
	IsRMNVerificationDisabled bool                         `tlb:"bool"`
	OnRamp                    ccipcommon.CrossChainAddress `tlb:"."`
}

func (c *SourceChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
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

func (c *SourceChainConfig) GetterMethodName() string {
	return srcChainConfigGetter
}

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorMessageNotFromOwnedContract)
		ecMax = int32(ErrorBatchingNotSupported)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorMessageNotFromOwnedContract ExitCode = iota + 8400
	ErrorSourceChainNotEnabled
	ErrorEmptyExecutionReport
	ErrorInvalidMessageDestChainSelector
	ErrorSourceChainSelectorMismatch
	ErrorInvalidOnRampUpdate
	ErrorSenderIsNotRouter
	ErrorSubjectCursed
	ErrorUnauthorized
	ErrorZeroAddressNotAllowed
	ErrorSignatureVerificationRequiredInCommitPlugin
	ErrorSignatureVerificationNotAllowedInExecutionPlugin
	ErrorInvalidInterval
	ErrorBatchingNotSupported
)

// Getter method names for binding fetchers
const (
	SourceChainsGetter   = "sourceChainSelectors"
	srcChainConfigGetter = "sourceChainConfig"
	ocr3BaseGetter       = "ocr3Config"
	configGetter         = "config"
)

// SourceChainConfigMap represents a map of source chain selectors to their configurations.
// This type aligns with the on-chain data structure for source chain configs.
type SourceChainConfigMap map[uint64]SourceChainConfig

// Fetch retrieves all source chain configurations from the off-ramp contract.
func (s *SourceChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, offRampAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, offRampAddr, SourceChainsGetter)
	if err != nil {
		return err
	}

	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(map[uint64]SourceChainConfig)
	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg SourceChainConfig
			opts := []interface{}{dest}
			if err = tvm.FetchResult(egCtx, client, block, offRampAddr, &cfg, opts); err != nil {
				return err
			}

			lock.Lock()
			output[dest] = cfg
			lock.Unlock()
			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		return err
	}

	*s = output
	return nil
}
