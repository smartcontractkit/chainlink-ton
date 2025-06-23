package request_reply_with_two_dependencies

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_PRICE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemPrice/tact_ItemPrice.pkg")

type ItemPriceProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewItemPriceProvider(apiClient trace_tracking.SignedAPIClient) *ItemPriceProvider {
	return &ItemPriceProvider{
		apiClient: apiClient,
	}
}

type ItemPriceInitData struct {
	ID    uint32
	Price uint64
}

func (p *ItemPriceProvider) Deploy(initData ItemPriceInitData) (ItemPrice, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(initData.Price, 64)
	compiledContract, err := wrappers.ParseCompiledContract(ITEM_PRICE_CONTRACT_PATH)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
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
