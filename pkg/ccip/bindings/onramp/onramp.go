package onramp

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type CCIPMessageSent struct {
	DestChainSelector uint64          `tlb:"## 64"`
	SequenceNumber    uint64          `tlb:"## 64"`
	Message           router.CCIPSend `tlb:"^"`
}

// GenericExtraArgsV2 represents generic extra arguments for transactions.
type GenericExtraArgsV2 struct {
	_                        tlb.Magic `tlb:"#181dcf10"` //nolint:revive // Ignore opcode tag // hex encoded bytes4(keccak256("CCIP EVMExtraArgsV2")), can be verified with hexutil.MustDecode("0x181dcf10")
	GasLimit                 *big.Int  `tlb:"## 256"`
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

// DestChainConfig represents the configuration for a destination chain in the CCIP system.
type DestChainConfig struct {
	Router           *address.Address `tlb:"addr"`
	SequenceNumber   uint64           `tlb:"## 64"`
	AllowListEnabled bool             `tlb:"bool"`
	AllowedSender    *cell.Dictionary `tlb:"dict 267"` // it's not documented anywhere, but the address in cell uses 267 bits
}

func (c *DestChainConfig) FromResult(result *ton.ExecutionResult) error {
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

// DynamicConfig holds the dynamic configuration for the CCIP system, including fee quoter, fee aggregator, and allow list admin.
type DynamicConfig struct {
	FeeQuoter      *address.Address `tlb:"addr"`
	FeeAggregator  *address.Address `tlb:"addr"`
	AllowListAdmin *address.Address `tlb:"addr"`
}

func (c *DynamicConfig) FromResult(result *ton.ExecutionResult) error {
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

// Storage represents the storage structure for the CCIP onramp contract.
type Storage struct {
	Ownable          common.Ownable2Step `tlb:"."`
	ChainSelector    uint64              `tlb:"## 64"`
	Config           DynamicConfig       `tlb:"^"`
	DestChainConfigs *cell.Dictionary    `tlb:"dict 64"`
	KeyLen           uint16              `tlb:"## 16"`
}

// Methods

type SetDynamicConfig struct {
	_ tlb.Magic `tlb:"#10000003"` //nolint:revive // Ignore opcode tag
	DynamicConfig
}

type UpdateDestChainConfig struct {
	// TODO: missing isEnabled?
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
	_       tlb.Magic                         `tlb:"#10000005"` //nolint:revive // Ignore opcode tag
	Updates common.SnakeData[UpdateAllowlist] `tlb:"^"`
}

type WithdrawFeeTokens struct{}
