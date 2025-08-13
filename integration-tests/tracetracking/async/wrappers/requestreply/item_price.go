package requestreply

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var ItemPriceContractPath = bindings.GetBuildDir("examples.async-communication.request-reply.ItemPrice/tact_ItemPrice.pkg")

type ItemPriceProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewItemPriceProvider(apiClient tracetracking.SignedAPIClient) *ItemPriceProvider {
	return &ItemPriceProvider{
		apiClient: apiClient,
	}
}

type ItemPriceInitData struct {
	ID    uint32 `tlb:"## 32"`
	Price uint64 `tlb:"## 64"`
}

func (p *ItemPriceProvider) Deploy(initData ItemPriceInitData) (ItemPrice, error) {
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(ItemPriceContractPath)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	body := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), body)
	if err != nil {
		return ItemPrice{}, err
	}

	return ItemPrice{
		Contract: *contract,
	}, nil
}

type ItemPrice struct {
	Contract wrappers.Contract
}
