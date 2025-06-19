package request_reply

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var PRICE_REGISTRY_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.PriceRegistry/tact_PriceRegistry.pkg")

type PriceRegistryProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewPriceRegistryProvider(apiClient trace_tracking.SignedAPIClient) *PriceRegistryProvider {
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
	compiledContract, err := wrappers.ParseCompiledContract(PRICE_REGISTRY_CONTRACT_PATH)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return PriceRegistry{}, err
	}

	return PriceRegistry{
		Contract: *contract,
	}, nil
}

type PriceRegistry struct {
	Contract wrappers.Contract
}

type AddPriceItemMessage struct {
	queryId uint64
	Key     uint8
	Addr    *address.Address
}

func (m AddPriceItemMessage) OpCode() uint64 {
	return 0x3
}
func (m AddPriceItemMessage) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	b.StoreUInt(uint64(m.Key), 8)
	b.StoreAddr(m.Addr)
	return nil
}

func (p PriceRegistry) SendAddPriceItem(key uint8, addr *address.Address) (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddPriceItemMessage{queryId, key, addr}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
