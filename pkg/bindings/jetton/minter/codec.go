package minter

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

// JettonMinter opcodes
const (
	OpcodeMinterMint              = 0x642b7d07
	OpcodeMinterChangeAdmin       = 0x6501f354
	OpcodeMinterClaimAdmin        = 0xfb88e119
	OpcodeMinterDropAdmin         = 0x7431f221
	OpcodeMinterBurnNotification  = 0x7bdd97de
	OpcodeMinterChangeMetadataURL = 0xcb862902
	OpcodeWalletBurnNotification  = 0x7bdd97de
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			Mint:          codec.TLBCodec[MintMessage](),
			ChangeAdmin:   codec.TLBCodec[ChangeAdminMessage](),
			ClaimAdmin:    codec.TLBCodec[ClaimAdminMessage](),
			DropAdmin:     codec.TLBCodec[DropAdminMessage](),
			ChangeContent: codec.TLBCodec[ChangeContentMessage](),
			Upgrade:       codec.TLBCodec[UpgradeMessage](),
		},
	},
}

type inMessageBuilder struct {
	Mint          codec.CellCodec[MintMessage]
	ChangeAdmin   codec.CellCodec[ChangeAdminMessage]
	ClaimAdmin    codec.CellCodec[ClaimAdminMessage]
	DropAdmin     codec.CellCodec[DropAdminMessage]
	ChangeContent codec.CellCodec[ChangeContentMessage]
	Upgrade       codec.CellCodec[UpgradeMessage]
}

type messageBuilder struct {
	In inMessageBuilder
}

type builder struct {
	Messages messageBuilder
}

type MintMessage struct {
	_           tlb.Magic                      `tlb:"#642b7d07"` //nolint:revive // (opcode) should stay uninitialized
	QueryID     uint64                         `tlb:"## 64"`
	Destination *address.Address               `tlb:"addr"`
	TonAmount   tlb.Coins                      `tlb:"."`
	MasterMsg   wallet.InternalTransferMessage `tlb:"^"`
}

type ChangeAdminMessage struct {
	_        tlb.Magic        `tlb:"#6501f354"` //nolint:revive // (opcode) should stay uninitialized
	QueryID  uint64           `tlb:"## 64"`
	NewAdmin *address.Address `tlb:"addr"`
}

type ClaimAdminMessage struct {
	_       tlb.Magic `tlb:"#fb88e119"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type DropAdminMessage struct {
	_       tlb.Magic `tlb:"#7431f221"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type ChangeContentMessage struct {
	_       tlb.Magic  `tlb:"#cb862902"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Content *cell.Cell `tlb:"^"`
}

type UpgradeMessage struct {
	_       tlb.Magic  `tlb:"#2508d66a"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	NewData *cell.Cell `tlb:"^"`
	NewCode *cell.Cell `tlb:"^"`
}
