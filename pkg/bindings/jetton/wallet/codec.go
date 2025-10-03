package wallet

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// JettonWallet opcodes
const (
	OpcodeWalletTransfer             = 0x0f8a7ea5
	OpcodeWalletTransferNotification = 0x7362d09c
	OpcodeWalletInternalTransfer     = 0x178d4519
	OpcodeWalletExcesses             = 0xd53276db
	OpcodeWalletBurn                 = 0x595f07bc
)

const (
	BalanceError   tvm.ExitCode = tvm.ExitCode(47)
	NotEnoughGas   tvm.ExitCode = tvm.ExitCode(48)
	InvalidMessage tvm.ExitCode = tvm.ExitCode(49)
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			AskToTransfer:    codec.TLBCodec[AskToTransfer](),
			InternalTransfer: codec.TLBCodec[InternalTransferMessage](),
		},
		Out: outMessageBuilder{
			TransferNotification: codec.TLBCodec[TransferNotification](),
		},
	},
}

type inMessageBuilder struct {
	AskToTransfer    codec.CellCodec[AskToTransfer]
	InternalTransfer codec.CellCodec[InternalTransferMessage]
}

type outMessageBuilder struct {
	TransferNotification codec.CellCodec[TransferNotification]
}

type messageBuilder struct {
	In  inMessageBuilder
	Out outMessageBuilder
}

type builder struct {
	Messages messageBuilder
}

type AskToTransfer struct {
	_                   tlb.Magic        `tlb:"#0f8a7ea5"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Amount              tlb.Coins        `tlb:"."`
	Destination         *address.Address `tlb:"addr"`
	ResponseDestination *address.Address `tlb:"addr"`
	CustomPayload       *cell.Cell       `tlb:"either . ^"`
	ForwardTonAmount    tlb.Coins        `tlb:"."`
	ForwardPayload      *cell.Cell       `tlb:"either . ^"`
}

type InternalTransferMessage struct {
	_                tlb.Magic        `tlb:"#178d4519"` //nolint:revive // (opcode) should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"either . ^"`
}

type TransferNotification struct {
	_              tlb.Magic        `tlb:"#7362d09c"` //nolint:revive // Ignore opcode tag
	QueryID        uint64           `tlb:"## 64"`
	Amount         tlb.Coins        `tlb:"^"`
	Sender         *address.Address `tlb:"addr"`
	ForwardPayload *cell.Cell       `tlb:"maybe ^"`
}
