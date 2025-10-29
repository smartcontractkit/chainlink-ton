package router

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeSetRamps = 0x10000001
	OpcodeCCIPSend = 0x00000001
)

const (
	ErrorDestChainNotEnabled tvm.ExitCode = tvm.ExitCode(0x1001)
	ErrorUnknownMessage      tvm.ExitCode = tvm.ExitCode(0x1002)
)

type Storage struct {
	ID      uint32                  `tlb:"## 32"`
	Ownable ccipcommon.Ownable2Step `tlb:"."`
	OnRamps *cell.Dictionary        `tlb:"dict 64"`
}

// DestChainSelector is a wrapper uint64 to support SnakeData encoding.
type DestChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

type SetRamps struct {
	_                  tlb.Magic                               `tlb:"#10000001"` //nolint:revive // Ignore opcode tag
	QueryID            uint64                                  `tlb:"## 64"`
	DestChainSelectors ccipcommon.SnakeData[DestChainSelector] `tlb:"^"`
	OnRamps            *address.Address                        `tlb:"addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                        `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                           `tlb:"## 64"`
	DestChainSelector uint64                           `tlb:"## 64"`
	Receiver          ccipcommon.CrossChainAddress     `tlb:"."`
	Data              ccipcommon.SnakeBytes            `tlb:"^"`
	TokenAmounts      ccipcommon.SnakeRef[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address                 `tlb:"addr"`
	ExtraArgs         *cell.Cell                       `tlb:"^"`
}
