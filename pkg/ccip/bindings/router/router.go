package router

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/plugin"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Storage struct {
	Ownable common.Ownable2Step `tlb:"^"`
	OnRamp  *address.Address    `tlb:"addr"`
}

type SetRamp struct {
	_                 tlb.Magic        `tlb:"#10000001"`
	DestChainSelector uint64           `tlb:"##64"`
	OnRamp            *address.Address `tlb:"addr"`
}

// TODO check if CCIPSend and JettonTransferNotification are needed for CLD

type CCIPSend struct {
	_                 tlb.Magic                                    `tlb:"#00000001"`
	QueryID           uint64                                       `tlb:"##64"`
	DestChainSelector uint64                                       `tlb:"##64"`
	Receiver          common.CrossChainAddress                     `tlb:"^"`
	Data              cell.Cell                                    `tlb:"^"`
	TokenAmounts      common.SnakeRef[plugin.Any2TVMTokenTransfer] `tlb:"^"`
	FeeToken          *address.Address                             `tlb:"addr"`
	ExtraArgs         *cell.Cell                                   `tlb:"^"`
}

type JettonTransferNotification struct {
	_              tlb.Magic        `tlb:"#7362d09c"`
	QueryId        uint64           `tlb:"##64"`
	Amount         tlb.Coins        `tlb:"^"`
	Sender         *address.Address `tlb:"addr"`
	ForwardPayload *cell.Cell       `tlb:"maybe ^"`
}
