package request_reply

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var PRICE_REGISTRY_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.PriceRegistry/tact_PriceRegistry.pkg")

type PriceRegistryProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewPriceRegistryProvider(apiClient tonutils.SignedAPIClient) *PriceRegistryProvider {
	return &PriceRegistryProvider{
		apiClient: apiClient,
	}
}

type PriceRegistryInitData struct {
	ID uint32
}

func (p *PriceRegistryProvider) Deploy(initData PriceRegistryInitData) (PriceRegistry, error) {
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.StoreUInt(uint64(initData.ID), 32)
	contractCode, err := tonutils.CompiledContract(PRICE_REGISTRY_CONTRACT_PATH)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return PriceRegistry{}, err
	}

	return PriceRegistry{
		Contract: *contract,
	}, nil
}

type PriceRegistry struct {
	Contract tonutils.Contract
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

func (p PriceRegistry) SendAddPriceItem(key uint8, addr *address.Address) (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddPriceItemMethod{
		Addr: addr,
		Key:  key,
	}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}
