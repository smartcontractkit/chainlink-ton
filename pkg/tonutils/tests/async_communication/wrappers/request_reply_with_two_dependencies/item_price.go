package request_reply_with_two_dependencies

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_PRICE_CONTRACT_PATH = test_utils.GetBuildDir("examples/async-communication/request-reply-with-two-dependencies/item_price/item_price_ItemPrice.pkg")

type ItemPriceProvider struct {
	apiClient tonutils.ApiClient
}

func NewItemPriceProvider(apiClient tonutils.ApiClient) *ItemPriceProvider {
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
	contract, err := p.apiClient.Deploy(ITEM_PRICE_CONTRACT_PATH, b.EndCell())
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
