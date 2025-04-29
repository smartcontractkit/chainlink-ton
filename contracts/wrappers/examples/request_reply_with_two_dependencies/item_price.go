package request_reply_with_two_dependencies

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const ITEM_PRICE_CONTRACT_PATH = "../build/examples/request-reply-with-two-dependencies/item_price/item_price_ItemPrice.pkg"

type ItemPriceProvider struct {
	ac utils.ApiClient
}

func NewItemPriceProvider(apiClient utils.ApiClient) *ItemPriceProvider {
	return &ItemPriceProvider{
		ac: apiClient,
	}
}

type ItemPriceIninData struct {
	ID    uint32
	Price uint64
}

func (p *ItemPriceProvider) Deploy(initData ItemPriceIninData) (ItemPrice, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(initData.Price, 64)
	contract, err := p.ac.Deploy(ITEM_PRICE_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return ItemPrice{}, err
	}

	return ItemPrice{
		Contract: *contract,
	}, nil
}

type ItemPrice struct {
	Contract utils.Contract
}
