package request_reply_with_two_dependencies

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_PRICE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemPrice/tact_ItemPrice.pkg")

type ItemPriceProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewItemPriceProvider(apiClient tonutils.SignedAPIClient) *ItemPriceProvider {
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
	contractCode, err := tonutils.CompiledContract(ITEM_PRICE_CONTRACT_PATH)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return ItemPrice{}, err
	}

	return ItemPrice{
		Contract: *contract,
	}, nil
}

type ItemPrice struct {
	Contract tonutils.Contract
}
