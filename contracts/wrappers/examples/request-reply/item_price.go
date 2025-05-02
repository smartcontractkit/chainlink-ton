package request_reply

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const ITEM_PRICE_CONTRACT_PATH = "../build/examples/request-reply/item_price/item_price_ItemPrice.pkg"

type ItemPriceProvider struct {
	ac tonutils.ApiClient
}

func NewItemPriceProvider(apiClient tonutils.ApiClient) *ItemPriceProvider {
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
	Contract tonutils.Contract
}
