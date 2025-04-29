package request_reply

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const PRICE_REGISTRY_CONTRACT_PATH = "../build/examples/request-reply/price_registry/price_registry_PriceRegistry.pkg"

type PriceRegistryProvider struct {
	ac utils.ApiClient
}

func NewPriceRegistryProvider(apiClient utils.ApiClient) *PriceRegistryProvider {
	return &PriceRegistryProvider{
		ac: apiClient,
	}
}

type PriceRegistryIninData struct {
	ID uint32
}

func (p *PriceRegistryProvider) Deploy(initData PriceRegistryIninData) (PriceRegistry, error) {
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.StoreUInt(uint64(initData.ID), 32)
	contract, err := p.ac.Deploy(PRICE_REGISTRY_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return PriceRegistry{}, err
	}

	return PriceRegistry{
		Contract: *contract,
	}, nil
}

type PriceRegistry struct {
	Contract utils.Contract
}

type AddPriceItemMethod struct {
	Key  uint8
	Addr *address.Address
}

func (m AddPriceItemMethod) OpCode() uint64 {
	return 0x3
}
func (m AddPriceItemMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.Key), 8)
	b.StoreAddr(m.Addr)
	return nil
}

func (p PriceRegistry) SendAddPriceItem(key uint8, addr *address.Address) (queryID uint64, msgReceived *utils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddPriceItemMethod{
		Addr: addr,
		Key:  key,
	}, queryID)
	return queryID, msgReceived, err
}
