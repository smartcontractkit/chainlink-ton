package requestreplywithtwodependencies

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var InventoryContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.Inventory/tact_Inventory.pkg")

type InventoryProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewInventoryProvider(apiClient tracetracking.SignedAPIClient) *InventoryProvider {
	return &InventoryProvider{
		apiClient: apiClient,
	}
}

type InventoryInitData struct {
	ID uint32 `tlb:"## 32"`
}

func (p *InventoryProvider) Deploy(initData InventoryInitData) (Inventory, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(InventoryContractPath)
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return Inventory{}, err
	}

	return Inventory{
		Contract: *contract,
	}, nil
}

type Inventory struct {
	Contract wrappers.Contract
}

type AddItemMessage struct {
	_         tlb.Magic        `tlb:"#00000002"`
	queryID   uint64           `tlb:"## 64"`
	Key       uint8            `tlb:"## 8"`
	PriceAddr *address.Address `tlb:"addr"`
	CountAddr *address.Address `tlb:"addr"`
}

func (m AddItemMessage) OpCode() uint64 {
	return 0x2
}

func (p Inventory) SendAddItem(key uint8, priceAddr *address.Address, countAddr *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddItemMessage{
		queryID:   queryID,
		Key:       key,
		PriceAddr: priceAddr,
		CountAddr: countAddr,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}
