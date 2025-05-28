package request_reply_with_two_dependencies

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_COUNT_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemCount/tact_ItemCount.pkg")

type ItemCountProvider struct {
	apiClient tonutils.ApiClient
}

func NewItemCountProvider(apiClient tonutils.ApiClient) *ItemCountProvider {
	return &ItemCountProvider{
		apiClient: apiClient,
	}
}

type ItemCountInitData struct {
	ID    uint32
	Count uint64
}

func (p *ItemCountProvider) Deploy(initData ItemCountInitData) (ItemCount, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(initData.Count, 64)
	contract, err := p.apiClient.Deploy(ITEM_COUNT_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return ItemCount{}, err
	}

	return ItemCount{
		Contract: *contract,
	}, nil
}

type ItemCount struct {
	Contract tonutils.Contract
}
