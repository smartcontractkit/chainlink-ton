package minter

import (
	"fmt"

	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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
	OpcodeMintNewJettons            = 0x642b7d07
	OpcodeRequestWalletAddress      = 0x2c76b973
	OpcodeResponseWalletAddress     = 0xd1735400
	OpcodeChangeMinterAdmin         = 0x6501f354
	OpcodeClaimMinterAdmin          = 0xfb88e119
	OpcodeDropMinterAdmin           = 0x7431f221
	OpcodeBurnNotificationForMinter = 0x7bdd97de
	OpcodeChangeMinterMetadataURI   = 0xcb862902
	OpcodeUpgradeMinterCode         = 0x2508d66a
)

type MintNewJettons struct {
	_                   tlb.Magic                   `tlb:"#642b7d07" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64                      `tlb:"## 64"`
	MintRecipient       *address.Address            `tlb:"addr"`
	TonAmount           tlb.Coins                   `tlb:"."`
	InternalTransferMsg wallet.InternalTransferStep `tlb:"^"`
}

type RequestWalletAddress struct {
	_                   tlb.Magic        `tlb:"#2c76b973" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	OwnerAddress        *address.Address `tlb:"addr"`
	IncludeOwnerAddress bool             `tlb:"bool"`
}

type ResponseWalletAddress struct {
	_                   tlb.Magic        `tlb:"#d1735400" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	JettonWalletAddress *address.Address `tlb:"addr"`
	OwnerAddress        *cell.Cell       `tlb:"maybe ^"`
}

type ChangeMinterAdmin struct {
	_               tlb.Magic        `tlb:"#6501f354" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID         uint64           `tlb:"## 64"`
	NewAdminAddress *address.Address `tlb:"addr"`
}

type ClaimMinterAdmin struct {
	_       tlb.Magic `tlb:"#fb88e119" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type DropMinterAdmin struct {
	_       tlb.Magic `tlb:"#7431f221" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type ChangeMinterMetadataURI struct {
	_              tlb.Magic  `tlb:"#cb862902" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	NewMetadataURI *cell.Cell `tlb:"^"`
}

type UpgradeMinterCode struct {
	_       tlb.Magic  `tlb:"#2508d66a" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	NewData *cell.Cell `tlb:"^"`
	NewCode *cell.Cell `tlb:"^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	MintNewJettons{},
	RequestWalletAddress{},
	ResponseWalletAddress{},
	ChangeMinterAdmin{},
	ClaimMinterAdmin{},
	DropMinterAdmin{},
	ChangeMinterMetadataURI{},
	UpgradeMinterCode{},
	jetton.TopUpTons{},
	wallet.BurnNotificationForMinter{},
}).MustWithStorageType(InitData{})
