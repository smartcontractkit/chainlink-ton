package router

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeSetRamps       = 0x20272c81
	OpcodeCCIPSend       = 0x31768d95
	OpcodeUpdateOffRamps = 0x234110a7
)

const (
	ErrorDestChainNotEnabled   tvm.ExitCode = tvm.ExitCode(49600)
	ErrorSourceChainNotEnabled tvm.ExitCode = tvm.ExitCode(49601)
	SenderIsNotOffRamp         tvm.ExitCode = tvm.ExitCode(49602)
	OffRampNotSetForSelector   tvm.ExitCode = tvm.ExitCode(49603)
	OffRampAddressMismatch     tvm.ExitCode = tvm.ExitCode(49604)
	ErrorUnknownMessage        tvm.ExitCode = tvm.ExitCode(0x1002)
)

type Storage struct {
	ID       uint32              `tlb:"## 32"`
	Ownable  common.Ownable2Step `tlb:"."`
	OnRamps  *cell.Dictionary    `tlb:"dict 64"`
	OffRamps *cell.Dictionary    `tlb:"dict 64"`
}

// ChainSelector is a wrapper uint64 to support SnakeData encoding.
type ChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

type SetRamps struct {
	_                  tlb.Magic                       `tlb:"#20272c81"` //nolint:revive // Ignore opcode tag
	QueryID            uint64                          `tlb:"## 64"`
	DestChainSelectors common.SnakeData[ChainSelector] `tlb:"^"`
	OnRamps            *address.Address                `tlb:"addr"`
}

type UpdateOffRamps struct {
	_                         tlb.Magic                       `tlb:"#234110a7"` //nolint:revive // Ignore opcode tag
	QueryID                   uint64                          `tlb:"## 64"`
	SourceChainSelectorAdd    common.SnakeData[ChainSelector] `tlb:"^"`
	OffRampAdd                *address.Address                `tlb:"maybe addr"`
	SourceChainSelectorRemove common.SnakeData[ChainSelector] `tlb:"^"`
	OffRampRemove             *address.Address                `tlb:"maybe addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                    `tlb:"#31768d95"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                       `tlb:"## 64"`
	DestChainSelector uint64                       `tlb:"## 64"`
	Receiver          common.CrossChainAddress     `tlb:"."`
	Data              common.SnakeBytes            `tlb:"^"`
	TokenAmounts      common.SnakeRef[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address             `tlb:"addr"`
	ExtraArgs         *cell.Cell                   `tlb:"^"`
}
