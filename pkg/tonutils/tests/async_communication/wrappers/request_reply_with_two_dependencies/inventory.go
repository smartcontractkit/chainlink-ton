package request_reply_with_two_dependencies

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var INVENTORY_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply-with-two-dependencies.Inventory/tact_Inventory.pkg")

type InventoryProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewInventoryProvider(apiClient tonutils.SignedAPIClient) *InventoryProvider {
	return &InventoryProvider{
		apiClient: apiClient,
	}
}

type InventoryInitData struct {
	ID uint32
}

func (p *InventoryProvider) Deploy(initData InventoryInitData) (Inventory, error) {
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.StoreUInt(uint64(initData.ID), 32)
	contractCode, err := tonutils.CompiledContract(INVENTORY_CONTRACT_PATH)
	if err != nil {
		return Inventory{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return Inventory{}, err
	}

	return Inventory{
		Contract: *contract,
	}, nil
}

type Inventory struct {
	Contract tonutils.Contract
}

type AddItemMethod struct {
	Key       uint8
	PriceAddr *address.Address
	CountAddr *address.Address
}

func (m AddItemMethod) OpCode() uint64 {
	return 0x2
}
func (m AddItemMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.Key), 8)
	b.StoreAddr(m.PriceAddr)
	b.StoreAddr(m.CountAddr)
	return nil
}

func (p Inventory) SendAddItem(key uint8, priceAddr *address.Address, countAddr *address.Address) (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddItemMethod{
		PriceAddr: priceAddr,
		CountAddr: countAddr,
		Key:       key,
	}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}
