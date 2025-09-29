package router

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type Storage struct {
	ID      uint32              `tlb:"## 32"`
	Ownable common.Ownable2Step `tlb:"."`
	OnRamps *cell.Dictionary    `tlb:"dict 64"`
	KeyLen  uint16              `tlb:"## 16"`
}

// DestChainSelector is a wrapper uint64 to support SnakeData encoding.
type DestChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

type SetRamps struct {
	_                  tlb.Magic                           `tlb:"#10000001"` //nolint:revive // Ignore opcode tag
	QueryID            uint64                              `tlb:"## 64"`
	DestChainSelectors common.SnakeData[DestChainSelector] `tlb:"^"`
	OnRamps            *address.Address                    `tlb:"addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                    `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                       `tlb:"## 64"`
	DestChainSelector uint64                       `tlb:"## 64"`
	Receiver          common.CrossChainAddress     `tlb:"."`
	Data              common.SnakeBytes            `tlb:"^"`
	TokenAmounts      common.SnakeRef[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address             `tlb:"addr"`
	ExtraArgs         *cell.Cell                   `tlb:"^"`
}

type JettonTransferNotification struct {
	_              tlb.Magic        `tlb:"#7362d09c"` //nolint:revive // Ignore opcode tag
	QueryID        uint64           `tlb:"## 64"`
	Amount         tlb.Coins        `tlb:"^"`
	Sender         *address.Address `tlb:"addr"`
	ForwardPayload *cell.Cell       `tlb:"maybe ^"`
}
