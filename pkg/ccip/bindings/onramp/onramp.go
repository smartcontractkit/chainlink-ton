package onramp

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type CCIPMessageSent struct {
	DestChainSelector uint64   `tlb:"## 64"`
	SequenceNumber    uint64   `tlb:"## 64"`
	Message           CCIPSend `tlb:"^"`
}

// GenericExtraArgsV2 represents generic extra arguments for transactions.
type GenericExtraArgsV2 struct {
	GasLimit                 *big.Int `tlb:"## 256"`
	AllowOutOfOrderExecution bool     `tlb:"bool"`
}

// SVMExtraArgsV1 represents extra arguments for SVM transactions.
type SVMExtraArgsV1 struct {
	ComputeUnits             uint32                             `tlb:"## 32"`
	AccountIsWritableBitmap  uint64                             `tlb:"## 64"`
	AllowOutOfOrderExecution bool                               `tlb:"bool"`
	TokenReceiver            []byte                             `tlb:"bits 256"`
	Accounts                 common.SnakeRef[common.SnakeBytes] `tlb:"^"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

// CCIPSend represents a CCIP message to be sent.
type CCIPSend struct {
	QueryID                  uint64                        `tlb:"## 64"`
	DestinationChainSelector uint64                        `tlb:"## 64"`
	Receiver                 common.CrossChainAddress      `tlb:"."`
	TokenAmounts             common.SnakeData[TokenAmount] `tlb:"^"`
	ExtraArgs                *cell.Cell                    `tlb:"^"`
}

// DestChainConfig represents the configuration for a destination chain in the CCIP system.
type DestChainConfig struct {
	Router           *address.Address `tlb:"addr"`
	SequenceNumber   uint64           `tlb:"## 64"`
	AllowListEnabled bool             `tlb:"bool"`
	AllowedSender    *cell.Dictionary `tlb:"dict 267"` // it's not documented anywhere, but the address in cell uses 267 bits
}

// DynamicConfig holds the dynamic configuration for the CCIP system, including fee quoter, fee aggregator, and allow list admin.
type DynamicConfig struct {
	FeeQuoter      *address.Address `tlb:"addr"`
	FeeAggregator  *address.Address `tlb:"addr"`
	AllowListAdmin *address.Address `tlb:"addr"`
}

// Storage represents the storage structure for the CCIP onramp contract.
type Storage struct {
	Ownable          common.Ownable2Step `tlb:"^"`
	ChainSelector    uint64              `tlb:"## 64"`
	Config           DynamicConfig       `tlb:"^"`
	DestChainConfigs *cell.Dictionary    `tlb:"dict 64"`
}

// Methods

type SetDynamicConfig struct {
	_ tlb.Magic `tlb:"#10000003"`
	DynamicConfig
}

type UpdateDestChainConfig struct {
	// TODO: missing isEnabled?
	DestinationChainSelector uint64                   `tlb:"## 64"`
	Router                   common.CrossChainAddress `tlb:"."`
	AllowListEnabled         bool                     `tlb:"bool"`
}

type UpdateDestChainConfigs struct {
	_       tlb.Magic                               `tlb:"#10000004"`
	Updates common.SnakeData[UpdateDestChainConfig] `tlb:"^"`
}

type UpdateAllowlist struct {
	DestinationChainSelector uint64                             `tlb:"## 64"`
	Add                      common.SnakeData[*address.Address] `tlb:"^"`
	Remove                   common.SnakeData[*address.Address] `tlb:"^"`
}

type UpdateAllowlists struct {
	_       tlb.Magic                         `tlb:"#10000005"`
	Updates common.SnakeData[UpdateAllowlist] `tlb:"^"`
}

type WithdrawFeeTokens struct{}
