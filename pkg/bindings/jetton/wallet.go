package jetton

import (
	"fmt"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// JettonWallet opcodes
const (
	OpcodeWalletTransfer             = 0x0f8a7ea5
	OpcodeWalletTransferNotification = 0x7362d09c
	OpcodeWalletInternalTransfer     = 0x178d4519
	OpcodeWalletExcesses             = 0xd53276db
	OpcodeWalletBurn                 = 0x595f07bc
	OpcodeWalletBurnNotification     = 0x7bdd97de
)

var WalletContractPath = path.Join(PathToContracts, "JettonWallet.compiled.json")

type WalletProvider struct {
	MinterAddress *address.Address
}

func NewWalletProvider(minterAddress *address.Address) *WalletProvider {
	return &WalletProvider{
		MinterAddress: minterAddress,
	}
}

type WalletInitData struct {
	Status        uint8            `tlb:"## 4"`
	Balance       tlb.Coins        `tlb:"."`
	OwnerAddress  *address.Address `tlb:"addr"`
	MasterAddress *address.Address `tlb:"addr"`
}

func WalletCode() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(WalletContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

func (p *WalletProvider) GetWalletInitCell(ownerAddress *address.Address) (*cell.Cell, error) {
	initData := WalletInitData{
		Status:        0,
		Balance:       tlb.ZeroCoins,
		OwnerAddress:  ownerAddress,
		MasterAddress: p.MinterAddress,
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}
	return initDataCell, nil
}
