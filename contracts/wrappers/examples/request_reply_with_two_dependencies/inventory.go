package request_reply_with_two_dependencies

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const INVENTORY_CONTRACT_PATH = "../build/examples/request-reply-with-two-dependencies/inventory/inventory_Inventory.pkg"

type InventoryProvider struct {
	ac utils.ApiClient
}

func NewInventoryProvider(apiClient utils.ApiClient) *InventoryProvider {
	return &InventoryProvider{
		ac: apiClient,
	}
}

type InventoryIninData struct {
	ID uint32
}

func (p *InventoryProvider) Deploy(initData InventoryIninData) (Inventory, error) {
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.StoreUInt(uint64(initData.ID), 32)
	contract, err := p.ac.Deploy(INVENTORY_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return Inventory{}, err
	}

	return Inventory{
		Contract: *contract,
	}, nil
}

type Inventory struct {
	Contract utils.Contract
}

type AddItemMethod struct {
	Key           uint8
	PriceAddr     *address.Address
	InventoryAddr *address.Address
}

func (m AddItemMethod) OpCode() uint64 {
	return 0x2
}
func (m AddItemMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.Key), 8)
	b.StoreAddr(m.PriceAddr)
	b.StoreAddr(m.InventoryAddr)
	return nil
}

func (p Inventory) SendAddItem(key uint8, addr *address.Address) (queryID uint64, msgReceived *utils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddItemMethod{
		PriceAddr:     addr,
		InventoryAddr: addr,
		Key:           key,
	}, queryID)
	return queryID, msgReceived, err
}
