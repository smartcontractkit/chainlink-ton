package request_reply

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

var PriceRegistryContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply.PriceRegistry/tact_PriceRegistry.pkg")

type PriceRegistryProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewPriceRegistryProvider(apiClient tracetracking.SignedAPIClient) *PriceRegistryProvider {
	return &PriceRegistryProvider{
		apiClient: apiClient,
	}
}

type PriceRegistryInitData struct {
	ID uint32
}

func (p *PriceRegistryProvider) Deploy(initData PriceRegistryInitData) (PriceRegistry, error) {
	b := cell.BeginCell()
	err := b.StoreUInt(0, 1)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("failed to store ID: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(PriceRegistryContractPath)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("Failed to compile contract: %w", err)
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
	err := b.StoreUInt(m.queryId, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryId: %w", err)
	}
	err = b.StoreUInt(uint64(m.Key), 8)
	if err != nil {
		return fmt.Errorf("failed to store Key: %w", err)
	}
	err = b.StoreAddr(m.Addr)
	if err != nil {
		return fmt.Errorf("failed to store Addr: %w", err)
	}
	return nil
}

func (p PriceRegistry) SendAddPriceItem(key uint8, addr *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddPriceItemMessage{queryId, key, addr}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
