package onramp

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// OnRamp opcodes
const (
	OpcodeOnRampSend                         = 0xdcf993c2
	OpcodeOnRampWithdrawJettons              = 0x266AEACF
	OpcodeOnRampExecutorFinishedSuccessfully = 0xCFA6B336
	OpcodeOnRampExecutorFinishedWithError    = 0xC4068E21
	OpcodeSetDynamicConfig                   = 0xa178c62e
	OpcodeUpdateDestChainConfigs             = 0x1a246b6c
	OpcodeUpdateAllowlists                   = 0x9dc06185
	OpcodeUpdateSendExecutor                 = 0x82901c45
)

// Topics
const (
	TopicCCIPMessageSent = 0xA45D293C // CRC32("CCIPMessageSent")
)

// Registry method names
const (
	destChainConfigGetter    = "destChainConfig"
	dynamicConfigGetter      = "dynamicConfig"
	staticConfigGetter       = "staticConfig"
	destChainSelectorsGetter = "destChainSelectors"
)

// CCIPMessageSent uses TVM2AnyRampMessage but with event-specific header (no onramp address)
type CCIPMessageSent struct {
	Message ocr.TVM2AnyRampMessage `tlb:"."`
}

type DestChainSelectorAdded struct {
	DestChainSelector uint64 `tlb:"## 64"`
}

type DestChainSelectorUpdated struct {
	DestChainSelector uint64          `tlb:"## 64"`
	Config            DestChainConfig `tlb:"."`
}

// GenericExtraArgsV2 represents generic extra arguments for transactions.
type GenericExtraArgsV2 struct {
	_                        tlb.Magic `tlb:"#181dcf10" json:"-"` //nolint:revive // Ignore opcode tag // hex encoded bytes4(keccak256("CCIP EVMExtraArgsV2")), can be verified with hexutil.MustDecode("0x181dcf10")
	GasLimit                 *big.Int  `tlb:"maybe ## 256"`
	AllowOutOfOrderExecution bool      `tlb:"bool"`
}

// Account256 is a fixed 256-bit (32 byte) account address wrapper for SVM accounts.
// This matches the onchain SnakedCell<uint256> expectation for account addresses.
type Account256 struct {
	Value []byte `tlb:"bits 256"`
}

// SVMExtraArgsV1 represents extra arguments for SVM transactions.
type SVMExtraArgsV1 struct {
	_                        tlb.Magic                     `tlb:"#1f3b3aba" json:"-"` //nolint:revive // Ignore opcode tag // hex encoded bytes4(keccak256("CCIP SVMExtraArgsV1")), can be verified with hexutil.MustDecode("0x1f3b3aba")
	ComputeUnits             uint32                        `tlb:"## 32"`
	AccountIsWritableBitmap  uint64                        `tlb:"## 64"`
	AllowOutOfOrderExecution bool                          `tlb:"bool"`
	TokenReceiver            []byte                        `tlb:"bits 256"`
	Accounts                 common.SnakedCell[Account256] `tlb:"^"`
}

// Storage represents the storage structure for the CCIP onramp contract.
type Storage struct {
	ID               uint32               `tlb:"## 32"`
	Ownable          ownable2step.Storage `tlb:"."`
	ChainSelector    uint64               `tlb:"## 64"`
	Config           DynamicConfig        `tlb:"^"`
	DestChainConfigs *cell.Dictionary     `tlb:"dict 64"`
	Executor         ExecutorDeployment   `tlb:"."`
}

type ExecutorDeployment struct {
	DeployableCode *cell.Cell `tlb:"^"`
	ExecutorCode   *cell.Cell `tlb:"^"`
	CurrentID      *big.Int   `tlb:"## 224"`
}

// Methods

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64           `tlb:"## 64"`
	Router                   *address.Address `tlb:"addr"`
	AllowListEnabled         bool             `tlb:"bool"`
}

type UpdateDestChainConfigsMessage struct {
	_       tlb.Magic                                `tlb:"#1a246b6c" json:"-"` //nolint:revive // Ignore opcode tag
	Updates common.SnakedCell[UpdateDestChainConfig] `tlb:"^"`
}

type UpdateAllowlist struct {
	DestinationChainSelector uint64                                `tlb:"## 64"`
	Add                      common.SnakedCell[common.AddressWrap] `tlb:"^"`
	Remove                   common.SnakedCell[common.AddressWrap] `tlb:"^"`
}

type UpdateAllowlists struct {
	_       tlb.Magic                          `tlb:"#9dc06185" json:"-"` //nolint:revive // Ignore opcode tag
	Updates common.SnakedCell[UpdateAllowlist] `tlb:"^"`
}

type WithdrawFeeTokens struct {
	_         tlb.Magic                             `tlb:"#7052dc75"` //nolint:revive // Ignore opcode tag
	FeeTokens common.SnakedCell[common.AddressWrap] `tlb:"."`
}

// Message structures that map to the existing types in onramp.go
type Send struct {
	_        tlb.Magic  `tlb:"#dcf993c2" json:"-"` //nolint:revive // Ignore opcode tag
	Msg      *cell.Cell `tlb:"^"`                  // Cell containing the CCIPSend message
	Metadata Metadata   `tlb:"."`                  // Cell containing metadata
}

type Metadata struct {
	Sender *address.Address `tlb:"addr"`
	Value  *tlb.Coins       `tlb:"."`
}

type WithdrawJettons struct {
	_                  tlb.Magic        `tlb:"#266AEACF" json:"-"` //nolint:revive // Ignore opcode tag
	MsgId              *big.Int         `tlb:"## 224"`             // Message ID
	Tokens             *cell.Cell       `tlb:"^"`                  // Token amounts
	OnrampJettonWallet *address.Address `tlb:"addr"`               // Onramp jetton wallet address
}

type ExecutorFinishedSuccessfully struct {
	_        tlb.Magic     `tlb:"#CFA6B336" json:"-"` //nolint:revive // Ignore opcode tag
	MsgId    *big.Int      `tlb:"## 224"`             // Message ID
	Fee      feequoter.Fee `tlb:"."`                  // Fee amount
	Msg      *cell.Cell    `tlb:"^"`                  // Original CCIPSend message
	Metadata Metadata      `tlb:"."`                  // Metadata
}

type ExecutorFinishedWithError struct {
	_        tlb.Magic  `tlb:"#C4068E21" json:"-"` //nolint:revive // Ignore opcode tag
	MsgId    *big.Int   `tlb:"## 224"`             // Message ID
	Error    *big.Int   `tlb:"## 256"`             // Error reason
	Msg      *cell.Cell `tlb:"^"`                  // Original CCIPSend message
	Metadata Metadata   `tlb:"."`                  // Metadata
}

type SetDynamicConfigMessage struct {
	_      tlb.Magic     `tlb:"#a178c62e" json:"-"` //nolint:revive // Ignore opcode tag
	Config DynamicConfig `tlb:"."`
}

type UpdateAllowlistsMessage struct {
	_       tlb.Magic  `tlb:"#9dc06185" json:"-"` //nolint:revive // Ignore opcode tag
	Updates *cell.Cell `tlb:"^"`                  // Snake-encoded updates
}

type UpdateSendExecutorMessage struct {
	_    tlb.Magic  `tlb:"#82901c45" json:"-"` //nolint:revive // Ignore opcode tag
	Code *cell.Cell `tlb:"^"`                  // New executor code
}

var TLBs = tvm.MustNewTLBMap([]any{
	UpdateAllowlists{},
	Send{},
	WithdrawJettons{},
	ExecutorFinishedSuccessfully{},
	ExecutorFinishedWithError{},
	SetDynamicConfigMessage{},
	UpdateDestChainConfigsMessage{},
	UpdateAllowlistsMessage{},
	UpdateSendExecutorMessage{},
}).MustWithStorageType(Storage{})

// binding types that supports FetchResult interface with rpc client

// DestChainConfig represents the configuration for a destination chain in the CCIP system.
type DestChainConfig struct {
	Router           *address.Address `tlb:"addr"`
	SequenceNumber   uint64           `tlb:"## 64"`
	AllowListEnabled bool             `tlb:"bool"`
	AllowedSender    *cell.Dictionary `tlb:"dict 267"` // it's not documented anywhere, but the address in cell uses 267 bits
}

// Deprecated: Use GetDestChainConfig getter instead.
func (c *DestChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetDestChainConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetDestChainConfig getter instead.
func (c *DestChainConfig) GetterMethodName() string {
	return destChainConfigGetter
}

// DynamicConfig holds the dynamic configuration for the CCIP system, including fee quoter, fee aggregator, and allow list admin.
type DynamicConfig struct {
	FeeQuoter      *address.Address `tlb:"addr"`
	FeeAggregator  *address.Address `tlb:"addr"`
	AllowListAdmin *address.Address `tlb:"addr"`
	Reserve        tlb.Coins        `tlb:"."`
}

// Deprecated: Use GetDynamicConfig getter instead.
func (c *DynamicConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetDynamicConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetDynamicConfig getter instead.
func (c *DynamicConfig) GetterMethodName() string {
	return dynamicConfigGetter
}

type StaticConfig struct {
	ChainSelector uint64 `tlb:"## 64"`
}

// Deprecated: Use GetStaticConfig getter instead.
func (c *StaticConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetStaticConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetStaticConfig getter instead.
func (c *StaticConfig) GetterMethodName() string {
	return staticConfigGetter
}

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(UnknownDestChainSelector)
		ecMax = int32(InsufficientValue)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	UnknownDestChainSelector ExitCode = iota + 18100
	Unauthorized
	SenderNotAllowed
	InvalidConfig
	UnknownToken
	InsufficientValue
)
