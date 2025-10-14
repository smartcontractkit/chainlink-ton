package minter

import (
	"fmt"

	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
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
