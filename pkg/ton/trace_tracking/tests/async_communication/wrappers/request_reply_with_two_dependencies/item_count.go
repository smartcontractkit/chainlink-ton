package request_reply_with_two_dependencies

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_COUNT_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.ItemCount/tact_ItemCount.pkg")

type ItemCountProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewItemCountProvider(apiClient trace_tracking.SignedAPIClient) *ItemCountProvider {
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
	contractCode, err := wrappers.CompiledContract(ITEM_COUNT_CONTRACT_PATH)
	if err != nil {
		return ItemCount{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(contractCode, &p.apiClient, b.EndCell(), tlb.MustFromTON("1"))
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
