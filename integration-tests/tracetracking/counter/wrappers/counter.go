package counter

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	test_utils "integration-tests/utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var CounterContractPath = test_utils.GetBuildDir("Counter.compiled.json")

//nolint:revive // test purpose
type CounterProvider struct {
	apiClient tracetracking.SignedAPIClient // TODO use pointer
}

func NewCounterProvider(apiClient tracetracking.SignedAPIClient) *CounterProvider {
	return &CounterProvider{
		apiClient: apiClient,
	}
}

//nolint:revive // test purpose
type CounterInitData struct {
	ID    uint32
	Value uint32
}

func (p *CounterProvider) Deploy(initData CounterInitData) (Counter, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store ID: %w", err)
	}
	err = b.StoreUInt(uint64(initData.Value), 32)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store Value: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return Counter{}, err
	}

	return Counter{
		Contract: *contract,
	}, nil
}

type Counter struct {
	Contract wrappers.Contract
}

type setCountMessage struct {
	queryID uint64
	value   uint32
}

func (m setCountMessage) OpCode() uint64 {
	return 0x4
}
func (m setCountMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreUInt(uint64(m.value), 32)
	if err != nil {
		return fmt.Errorf("failed to store value: %w", err)
	}
	return nil
}

func (c Counter) SendSetCount(value uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(setCountMessage{queryID, value}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetID() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("id"))
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
