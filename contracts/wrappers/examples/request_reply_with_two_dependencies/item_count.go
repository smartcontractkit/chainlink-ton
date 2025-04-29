package request_reply_with_two_dependencies

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const ITEM_COUNT_CONTRACT_PATH = "../build/examples/request-reply-with-two-dependencies/item_count/item_count_ItemPrice.pkg"

type ItemCountProvider struct {
	ac utils.ApiClient
}

func NewItemCountProvider(apiClient utils.ApiClient) *ItemCountProvider {
	return &ItemCountProvider{
		ac: apiClient,
	}
}

type ItemCountIninData struct {
	ID    uint32
	Count uint64
}

func (p *ItemCountProvider) Deploy(initData ItemCountIninData) (ItemCount, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(initData.Count, 64)
	contract, err := p.ac.Deploy(ITEM_COUNT_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return ItemCount{}, err
	}

	return ItemCount{
		Contract: *contract,
	}, nil
}

type ItemCount struct {
	Contract utils.Contract
}
