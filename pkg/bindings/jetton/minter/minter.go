package minter

import (
	"fmt"

	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var MinterContractPath = path.Join(jetton.PathToContracts, "JettonMinter.compiled.json")

type InitData struct {
	TotalSupply   tlb.Coins        `tlb:"."`
	Admin         *address.Address `tlb:"addr"`
	TransferAdmin *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
	JettonContent *cell.Cell       `tlb:"^"`
}

func Code() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(MinterContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

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

var TLBs = lib.MustNewTLBMap([]any{
	MintMessage{},
	ChangeAdminMessage{},
	ClaimAdminMessage{},
	DropAdminMessage{},
	ChangeContentMessage{},
	UpgradeMessage{},
})
