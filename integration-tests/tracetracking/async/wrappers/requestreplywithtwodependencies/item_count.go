package requestreplywithtwodependencies

import (
	"fmt"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var ItemCountContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemCount/tact_ItemCount.pkg")

type ItemCountProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewItemCountProvider(apiClient tracetracking.SignedAPIClient) *ItemCountProvider {
	return &ItemCountProvider{
		apiClient: apiClient,
	}
}

type ItemCountInitData struct {
	ID    uint32 `tlb:"## 32"`
	Count uint64 `tlb:"## 64"`
}

func (p *ItemCountProvider) Deploy(initData ItemCountInitData) (ItemCount, error) {
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return ItemCount{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(ItemCountContractPath)
	if err != nil {
		return ItemCount{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return ItemCount{}, err
	}

	return ItemCount{
		Contract: *contract,
	}, nil
}

type ItemCount struct {
	Contract wrappers.Contract
}
