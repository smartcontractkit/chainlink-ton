package requestreplywithtwodependencies

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

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
	ID uint32
}

func (p *InventoryProvider) Deploy(initData InventoryInitData) (Inventory, error) {
	b := cell.BeginCell()
	err := b.StoreUInt(0, 1)
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to store ID: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(InventoryContractPath)
	if err != nil {
		return Inventory{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
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
	queryID   uint64
	Key       uint8
	PriceAddr *address.Address
	CountAddr *address.Address
}

func (m AddItemMessage) OpCode() uint64 {
	return 0x2
}
func (m AddItemMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreUInt(uint64(m.Key), 8)
	if err != nil {
		return fmt.Errorf("failed to store Key: %w", err)
	}
	err = b.StoreAddr(m.PriceAddr)
	if err != nil {
		return fmt.Errorf("failed to store PriceAddr: %w", err)
	}
	err = b.StoreAddr(m.CountAddr)
	if err != nil {
		return fmt.Errorf("failed to store CountAddr: %w", err)
	}
	return nil
}

func (p Inventory) SendAddItem(key uint8, priceAddr *address.Address, countAddr *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddItemMessage{queryID, key, priceAddr, countAddr}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}
