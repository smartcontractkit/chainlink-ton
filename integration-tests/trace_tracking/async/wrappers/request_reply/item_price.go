package request_reply

import (
	"fmt"

	"integration-tests/trace_tracking/test_utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var ITEM_PRICE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.ItemPrice/tact_ItemPrice.pkg")

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
	err := b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("failed to store ID: %w", err)
	}
	err = b.StoreUInt(initData.Price, 64)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("failed to store Price: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(ITEM_PRICE_CONTRACT_PATH)
	if err != nil {
		return ItemPrice{}, fmt.Errorf("Failed to compile contract: %w", err)
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
