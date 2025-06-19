package counter

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var COUNTER_CONTRACT_PATH = test_utils.GetBuildDir("Counter.compiled.json")

type CounterProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewCounterProvider(apiClient tonutils.SignedAPIClient) *CounterProvider {
	return &CounterProvider{
		apiClient: apiClient,
	}
}

type CounterInitData struct {
	ID    uint32
	Value uint32
}

func (p *CounterProvider) Deploy(initData CounterInitData) (Counter, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(uint64(initData.Value), 32)
	contractCode, err := tonutils.CompiledContract(COUNTER_CONTRACT_PATH)
	if err != nil {
		return Counter{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return Counter{}, err
	}

	return Counter{
		Contract: *contract,
	}, nil
}

type Counter struct {
	Contract tonutils.Contract
}

type setCountMethod struct {
	value uint32
}

func (m setCountMethod) OpCode() uint64 {
	return 0x4
}
func (m setCountMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.value), 32)
	return nil
}

func (c Counter) SendSetCount(value uint32) (queryId uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryId = rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(setCountMethod{
		value: value,
	}, queryId, tlb.MustFromTON("0.5"))
	return queryId, msgReceived, err
}

func (c Counter) GetId() (uint32, error) {
	return tonutils.Uint32From(c.Contract.Get("id"))
}

func (c Counter) GetValue() (uint32, error) {
	return tonutils.Uint32From(c.Contract.Get("value"))
}
