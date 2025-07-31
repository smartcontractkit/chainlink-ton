package router

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

type Storage struct {
	Ownable common.Ownable2Step `tlb:"^"`
	OnRamp  *address.Address    `tlb:"addr"`
}

type SetRamp struct {
	_                 tlb.Magic        `tlb:"#10000001"` //nolint:revive // Ignore opcode tag
	DestChainSelector uint64           `tlb:"## 64"`
	OnRamp            *address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                                 `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                                    `tlb:"## 64"`
	DestChainSelector uint64                                    `tlb:"## 64"`
	Receiver          common.CrossChainAddress                  `tlb:"^"`
	Data              common.SnakeBytes                         `tlb:"^"`
	TokenAmounts      common.SnakeRef[ocr.Any2TVMTokenTransfer] `tlb:"^"`
	FeeToken          *address.Address                          `tlb:"addr"`
	ExtraArgs         *cell.Cell                                `tlb:"^"`
}

type JettonTransferNotification struct {
	_              tlb.Magic        `tlb:"#7362d09c"` //nolint:revive // Ignore opcode tag
	QueryID        uint64           `tlb:"## 64"`
	Amount         tlb.Coins        `tlb:"^"`
	Sender         *address.Address `tlb:"addr"`
	ForwardPayload *cell.Cell       `tlb:"maybe ^"`
}
