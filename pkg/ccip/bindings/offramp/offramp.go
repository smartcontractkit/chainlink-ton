package offramp

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"

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

// ReceiveExecutorInitExecuteBounced represents the ReceiveExecutorInitExecuteBounced event data
type ReceiveExecutorInitExecuteBounced struct {
	ReceiveExecutor *address.Address `tlb:"addr"`
	Root            *address.Address `tlb:"addr"`
	SequenceNumber  uint64           `tlb:"## 64"`
}

// DeployableInitializeBounced represents the DeployableInitializeBounced event data
type DeployableInitializeBounced struct {
	DeployableAddress *address.Address `tlb:"addr"`
}

// RouteMessageBounced represents the RouteMessageBounced event data
type RouteMessageBounced struct {
	Router *address.Address `tlb:"addr"`
	ExecID []byte           `tlb:"bits 192"`
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

// CCIPReceive represents the CCIP message received on TON
type CCIPReceive struct {
	_       tlb.Magic      `tlb:"#b3126df1" json:"-"` //nolint:revive // Ignore opcode tag
	RootID  []byte         `tlb:"bits 192"`
	Message Any2TVMMessage `tlb:"."`
}

// Any2TVMMessage represents a cross-chain message to TON
type Any2TVMMessage struct {
	MessageID           []byte                       `tlb:"bits 256"`
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
	_                              tlb.Magic                                     `tlb:"#2b78359f" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID                        uint64                                        `tlb:"## 64"`
	ConfigDigest                   []byte                                        `tlb:"bits 256"`
	PluginType                     uint16                                        `tlb:"## 16"`
	F                              uint8                                         `tlb:"## 8"`
	IsSignatureVerificationEnabled bool                                          `tlb:"bool"`
	Signers                        ccipcommon.SnakedCell[Signer]                 `tlb:"^"`
	Transmitters                   ccipcommon.SnakedCell[ccipcommon.AddressWrap] `tlb:"^"`
}

// UpdateSourceChainConfig represents the updateSourceChainConfig structure
type UpdateSourceChainConfig struct {
	SourceChainSelector uint64            `tlb:"## 64"`
	Config              SourceChainConfig `tlb:"."`
}

// UpdateSourceChainConfigs represents the updateSourceChainConfigs method call on the offRamp contract
type UpdateSourceChainConfigs struct {
	_       tlb.Magic                                      `tlb:"#22b4f05c" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64                                         `tlb:"## 64"`
	Configs ccipcommon.SnakedCell[UpdateSourceChainConfig] `tlb:"^"`
}

// Commit represents the commit method call on the offRamp contract
type Commit struct {
	_                tlb.Magic                                   `tlb:"#9d431905" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID          uint64                                      `tlb:"## 64"`
	ConfigDigest     []byte                                      `tlb:"bits 512"`
	CommitReport     ocr.CommitReport                            `tlb:"."`
	SignatureEd25519 ccipcommon.SnakedCell[ocr.SignatureEd25519] `tlb:"^"`
}

// Execute represents the execute method call on the offRamp contract
type Execute struct {
	_             tlb.Magic         `tlb:"#27bdac33" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID       uint64            `tlb:"## 64"`
	ConfigDigest  []byte            `tlb:"bits 512"`
	ExecuteReport ocr.ExecuteReport `tlb:"."`
}

type SetDynamicConfig struct {
	_                                       tlb.Magic        `tlb:"#95bc5a5c" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID                                 uint64           `tlb:"## 64"`
	FeeQuoter                               *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

type UpdateDeployables struct {
	_                   tlb.Magic  `tlb:"#a015e0e2" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID             uint64     `tlb:"## 64"`
	ReceiveExecutorCode *cell.Cell `tlb:"maybe ^"`
	MerkleRootCode      *cell.Cell `tlb:"maybe ^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	CCIPReceive{},
	SetOCR3Config{},
	UpdateSourceChainConfigs{},
	Commit{},
	Execute{},
	SetDynamicConfig{},
	UpdateDeployables{},
}).MustWithStorageType(Storage{})

var (
	OpcodeCCIPReceive = tvm.MustExtractMagic(reflect.TypeOf(CCIPReceive{}))
)

// Config types that implements getter fetching interface with rpc client

// OCR3Base represents the OCR3 base configuration stored on-chain
type OCR3Base struct {
	ChainID uint8       `tlb:"## 8"`
	Commit  *OCR3Config `tlb:"maybe ^"`
	Execute *OCR3Config `tlb:"maybe ^"`
}

// Deprecated: Use GetOCR3Config getter instead.
func (c *OCR3Base) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetOCR3Config.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetOCR3Config getter instead.
func (c *OCR3Base) GetterMethodName() string {
	return ocr3BaseGetter
}

// Config represents the offRamp contract configuration
type Config struct {
	ChainSelector                           uint64           `tlb:"## 64"`
	FeeQuoterAddress                        *address.Address `tlb:"addr"`
	PermissionlessExecutionThresholdSeconds uint32           `tlb:"## 32"`
}

// Deprecated: Use GetConfig getter instead.
func (c *Config) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetConfig getter instead.
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

// Deprecated: Use GetSourceChainConfig getter instead.
func (c *SourceChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetSourceChainConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetSourceChainConfig getter instead.
func (c *SourceChainConfig) GetterMethodName() string {
	return srcChainConfigGetter
}

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorMessageNotFromOwnedContract)
		ecMax = int32(ErrorMerkleRootCannotBeZero)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorMessageNotFromOwnedContract ExitCode = iota + 22100 // Facility ID * 100
	ErrorSourceChainNotEnabled
	ErrorEmptyExecutionReport
	ErrorInvalidMessageDestChainSelector
	ErrorSourceChainSelectorMismatch
	ErrorInvalidOnRampUpdate
	ErrorInsufficientFee
	ErrorSubjectCursed
	ErrorUnauthorized
	ErrorZeroAddressNotAllowed
	ErrorTooManyMessagesInReport
	ErrorSignatureVerificationRequiredInCommitPlugin
	ErrorSignatureVerificationNotAllowedInExecutionPlugin
	ErrorInvalidInterval
	ErrorBatchingNotSupported
	ErrorOnRampAddressMismatch
	ErrorEmptyCommitReport
	ErrorMerkleRootCannotBeZero
)

// Getter method names for binding fetchers
const (
	srcChainConfigGetter       = "sourceChainConfig"
	ocr3BaseGetter             = "ocr3Config"
	configGetter               = "config"
	sourceChainSelectorsGetter = "sourceChainSelectors"
	cursedSubjectsGetter       = "cursedSubjects"
)
