package wallet

import (
	"fmt"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var WalletContractPath = path.Join(jetton.PathToContracts, "JettonWallet.compiled.json")

type Provider struct {
	MinterAddress *address.Address
}

func NewWalletProvider(minterAddress *address.Address) *Provider {
	return &Provider{
		MinterAddress: minterAddress,
	}
}

type InitData struct {
	Status        uint8            `tlb:"## 4"`
	Balance       tlb.Coins        `tlb:"."`
	OwnerAddress  *address.Address `tlb:"addr"`
	MasterAddress *address.Address `tlb:"addr"`
}

func Code() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(WalletContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

func (p *Provider) GetWalletInitCell(ownerAddress *address.Address) (*cell.Cell, error) {
	initData := InitData{
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
