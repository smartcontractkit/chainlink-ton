package onramp

import (
	"context"
	"math/big"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// OnRamp opcodes
const (
	OpcodeOnRampSend                         = 0x10000002
	OpcodeOnRampWithdrawJettons              = 0x266AEACF
	OpcodeOnRampExecutorFinishedSuccessfully = 0xCFA6B336
	OpcodeOnRampExecutorFinishedWithError    = 0xC4068E21
	OpcodeSetDynamicConfig                   = 0x10000003
	OpcodeUpdateDestChainConfigs             = 0x10000004
	OpcodeUpdateAllowlists                   = 0x9dc06185
	OpcodeUpdateSendExecutor                 = 0x82901c45
)

// Topics
const (
	TopicCCIPMessageSent = 0xA45D293C // CRC32("CCIPMessageSent")
)

// Registry method names
const (
	DestChainsGetter      = "destChainSelectors"
	destChainConfigGetter = "destChainConfig"
	dynamicConfigGetter   = "dynamicConfig"
	staticConfigGetter    = "staticConfig"
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
	_                        tlb.Magic `tlb:"#181dcf10"` //nolint:revive // Ignore opcode tag // hex encoded bytes4(keccak256("CCIP EVMExtraArgsV2")), can be verified with hexutil.MustDecode("0x181dcf10")
	GasLimit                 *big.Int  `tlb:"maybe ## 256"`
	AllowOutOfOrderExecution bool      `tlb:"bool"`
}

// SVMExtraArgsV1 represents extra arguments for SVM transactions.
type SVMExtraArgsV1 struct {
	_                        tlb.Magic                          `tlb:"#1f3b3aba"` //nolint:revive // Ignore opcode tag // hex encoded bytes4(keccak256("CCIP SVMExtraArgsV1")), can be verified with hexutil.MustDecode("0x1f3b3aba")
	ComputeUnits             uint32                             `tlb:"## 32"`
	AccountIsWritableBitmap  uint64                             `tlb:"## 64"`
	AllowOutOfOrderExecution bool                               `tlb:"bool"`
	TokenReceiver            []byte                             `tlb:"bits 256"`
	Accounts                 common.SnakeRef[common.SnakeBytes] `tlb:"^"`
}

// Storage represents the storage structure for the CCIP onramp contract.
type Storage struct {
	ID               uint32              `tlb:"## 32"`
	Ownable          common.Ownable2Step `tlb:"."`
	ChainSelector    uint64              `tlb:"## 64"`
	Config           DynamicConfig       `tlb:"^"`
	DestChainConfigs *cell.Dictionary    `tlb:"dict 64"`
	Executor         ExecutorDeployment  `tlb:"."`
}

type ExecutorDeployment struct {
	DeployableCode *cell.Cell `tlb:"^"`
	ExecutorCode   *cell.Cell `tlb:"^"`
	CurrentID      *big.Int   `tlb:"## 224"`
}

// Methods

type SetDynamicConfig struct {
	_ tlb.Magic `tlb:"#10000003"` //nolint:revive // Ignore opcode tag
	DynamicConfig
}

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64           `tlb:"## 64"`
	Router                   *address.Address `tlb:"addr"`
	AllowListEnabled         bool             `tlb:"bool"`
}

type UpdateDestChainConfigs struct {
	_       tlb.Magic                               `tlb:"#10000004"` //nolint:revive // Ignore opcode tag
	Updates common.SnakeData[UpdateDestChainConfig] `tlb:"^"`
}

type UpdateAllowlist struct {
	DestinationChainSelector uint64                             `tlb:"## 64"`
	Add                      common.SnakeData[*address.Address] `tlb:"^"`
	Remove                   common.SnakeData[*address.Address] `tlb:"^"`
}

type UpdateAllowlists struct {
	_       tlb.Magic                        `tlb:"#9dc06185"` //nolint:revive // Ignore opcode tag
	Updates common.SnakeRef[UpdateAllowlist] `tlb:"^"`
}

type WithdrawFeeTokens struct{}

// Message structures that map to the existing types in onramp.go
type Send struct {
	_        tlb.Magic  `tlb:"#10000002"` //nolint:revive // Ignore opcode tag
	Msg      *cell.Cell `tlb:"^"`         // Cell containing the CCIPSend message
	Metadata Metadata   `tlb:"."`         // Cell containing metadata
}

type Metadata struct {
	Sender *address.Address `tlb:"addr"`
	Value  *tlb.Coins       `tlb:"."`
}

type WithdrawJettons struct {
	_                  tlb.Magic        `tlb:"#266AEACF"` //nolint:revive // Ignore opcode tag
	MsgId              big.Int          `tlb:"## 224"`    // Message ID
	Tokens             *cell.Cell       `tlb:"^"`         // Token amounts
	OnrampJettonWallet *address.Address `tlb:"addr"`      // Onramp jetton wallet address
}

type ExecutorFinishedSuccessfully struct {
	_        tlb.Magic     `tlb:"#CFA6B336"` //nolint:revive // Ignore opcode tag
	MsgId    big.Int       `tlb:"## 224"`    // Message ID
	Fee      feequoter.Fee `tlb:"."`         // Fee amount
	Msg      *cell.Cell    `tlb:"^"`         // Original CCIPSend message
	Metadata Metadata      `tlb:"."`         // Metadata
}

type ExecutorFinishedWithError struct {
	_        tlb.Magic  `tlb:"#C4068E21"` //nolint:revive // Ignore opcode tag
	MsgId    big.Int    `tlb:"## 224"`    // Message ID
	Error    big.Int    `tlb:"## 256"`    // Error reason
	Msg      *cell.Cell `tlb:"^"`         // Original CCIPSend message
	Metadata Metadata   `tlb:"."`         // Metadata
}

type SetDynamicConfigMessage struct {
	_      tlb.Magic     `tlb:"#10000003"` //nolint:revive // Ignore opcode tag
	Config DynamicConfig `tlb:"."`
}

type UpdateDestChainConfigsMessage struct {
	_       tlb.Magic  `tlb:"#10000004"` //nolint:revive // Ignore opcode tag
	Updates *cell.Cell `tlb:"^"`         // Snake-encoded updates
}

type UpdateAllowlistsMessage struct {
	_       tlb.Magic  `tlb:"#9dc06185"` //nolint:revive // Ignore opcode tag
	Updates *cell.Cell `tlb:"^"`         // Snake-encoded updates
}

type UpdateSendExecutorMessage struct {
	_    tlb.Magic  `tlb:"#82901c45"` //nolint:revive // Ignore opcode tag
	Code *cell.Cell `tlb:"^"`         // New executor code
}

// binding types that supports FetchResult interface with rpc client

// DestChainConfig represents the configuration for a destination chain in the CCIP system.
type DestChainConfig struct {
	Router           *address.Address `tlb:"addr"`
	SequenceNumber   uint64           `tlb:"## 64"`
	AllowListEnabled bool             `tlb:"bool"`
	AllowedSender    *cell.Dictionary `tlb:"dict 267"` // it's not documented anywhere, but the address in cell uses 267 bits
}

func (c *DestChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	routerAddressSlice, err := result.Slice(0)
	if err != nil {
		return err
	}
	routerAddress, err := routerAddressSlice.LoadAddr()
	if err != nil {
		return err
	}
	seqNum, err := result.Int(1)
	if err != nil {
		return err
	}
	allowlistEnabledInt, err := result.Int(2)
	if err != nil {
		return err
	}
	allowlistEnabled := allowlistEnabledInt.Cmp(big.NewInt(-1)) == 0
	*c = DestChainConfig{
		Router:           routerAddress,
		SequenceNumber:   seqNum.Uint64(),
		AllowListEnabled: allowlistEnabled,
		// skip parsing allowedSenders
	}
	return nil
}

func (c *DestChainConfig) GetterMethodName() string {
	return destChainConfigGetter
}

// DynamicConfig holds the dynamic configuration for the CCIP system, including fee quoter, fee aggregator, and allow list admin.
type DynamicConfig struct {
	FeeQuoter      *address.Address `tlb:"addr"`
	FeeAggregator  *address.Address `tlb:"addr"`
	AllowListAdmin *address.Address `tlb:"addr"`
}

func (c *DynamicConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	feeQuoterAddressSlice, err := result.Slice(0)
	if err != nil {
		return err
	}
	feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
	if err != nil {
		return err
	}
	feeAggregatorAddressSlice, err := result.Slice(1)
	if err != nil {
		return err
	}
	feeAggregatorAddress, err := feeAggregatorAddressSlice.LoadAddr()
	if err != nil {
		return err
	}
	allowlistAdminAddressSlice, err := result.Slice(2)
	if err != nil {
		return err
	}
	allowlistAdminAddress, err := allowlistAdminAddressSlice.LoadAddr()
	if err != nil {
		return err
	}
	*c = DynamicConfig{
		FeeQuoter:      feeQuoterAddress,
		FeeAggregator:  feeAggregatorAddress,
		AllowListAdmin: allowlistAdminAddress,
	}
	return nil
}

func (c *DynamicConfig) GetterMethodName() string {
	return dynamicConfigGetter
}

type StaticConfig struct {
	ChainSelector uint64 `tlb:"## 64"`
}

func (c *StaticConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	chainSelector, err := result.Int(0)
	if err != nil {
		return err
	}
	*c = StaticConfig{
		ChainSelector: chainSelector.Uint64(),
	}
	return nil
}

func (c *StaticConfig) GetterMethodName() string {
	return staticConfigGetter
}

// DestChainConfigMap represents a map of destination chain selectors to their configurations.
// This type aligns with the on-chain data structure for destination chain configs.
type DestChainConfigMap map[uint64]DestChainConfig

// Fetch retrieves all destination chain configurations from the on-ramp contract.
func (d *DestChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, onRampAddr, DestChainsGetter)
	if err != nil {
		return err
	}

	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]DestChainConfig)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg DestChainConfig
			opts := []interface{}{dest}
			if err = tvm.FetchResult(egCtx, client, block, onRampAddr, &cfg, opts); err != nil {
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

	*d = output
	return nil
}

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(UnknownDestChainSelector)
		ecMax = int32(InvalidConfig)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	UnknownDestChainSelector ExitCode = iota + 18100
	Unauthorized
	SenderNotAllowed
	InvalidConfig
)
