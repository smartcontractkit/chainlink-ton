package wrappers

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
	JettonWalletTransfer             = 0x0f8a7ea5
	JettonWalletTransferNotification = 0x7362d09c
	JettonWalletInternalTransfer     = 0x178d4519
	JettonWalletExcesses             = 0xd53276db
	JettonWalletBurn                 = 0x595f07bc
	JettonWalletBurnNotification     = 0x7bdd97de
)

var JettonWalletContractPath = path.Join(PathContractsJetton, "JettonWallet.compiled.json")

type JettonWalletProvider struct {
	JettonMinterAddress *address.Address
}

func NewJettonWalletProvider(jettonMinterAddress *address.Address) *JettonWalletProvider {
	return &JettonWalletProvider{
		JettonMinterAddress: jettonMinterAddress,
	}
}

type JettonWalletInitData struct {
	Status              uint8            `tlb:"## 4"`
	Balance             tlb.Coins        `tlb:"."`
	OwnerAddress        *address.Address `tlb:"addr"`
	JettonMasterAddress *address.Address `tlb:"addr"`
}

func JettonWalletCode() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(JettonWalletContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

func (p *JettonWalletProvider) GetWalletInitCell(ownerAddress *address.Address) (*cell.Cell, error) {
	initData := JettonWalletInitData{
		Status:              0,
		Balance:             tlb.ZeroCoins,
		OwnerAddress:        ownerAddress,
		JettonMasterAddress: p.JettonMinterAddress,
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}
	return initDataCell, nil
}

type JettonWallet struct {
	Contract wrappers.Contract
}

// Getter methods
func (w JettonWallet) GetJettonBalance() (*tlb.Coins, error) {
	result, err := w.Contract.Get("get_wallet_data")
	if err != nil {
		return nil, fmt.Errorf("failed to get wallet data: %w", err)
	}
	amount, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to parse amount: %w", err)
	}
	coins := tlb.MustFromNano(amount, 18)
	return &coins, nil
}

func (w JettonWallet) GetWalletStatus() (uint32, error) {
	return wrappers.Uint32From(w.Contract.Get("get_wallet_data"))
}
