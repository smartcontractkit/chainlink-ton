package requestreplywithtwodependencies

import (
	"fmt"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var ItemPriceContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemPrice/tact_ItemPrice.pkg")

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
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), cell.BeginCell().EndCell())
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
