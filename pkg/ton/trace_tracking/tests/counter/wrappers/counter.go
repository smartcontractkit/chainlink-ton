package counter

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/node_modules/chainlink-ton/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var COUNTER_CONTRACT_PATH = test_utils.GetBuildDir("Counter.compiled.json")

type CounterProvider struct {
	apiClient trace_tracking.SignedAPIClient // TODO use pointer
}

func NewCounterProvider(apiClient trace_tracking.SignedAPIClient) *CounterProvider {
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
	contractCode, err := wrappers.CompiledContract(COUNTER_CONTRACT_PATH)
	if err != nil {
		return Counter{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(contractCode, &p.apiClient, b.EndCell(), tlb.MustFromTON("1"))
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
	queryId uint64
	value   uint32
}

func (m setCountMessage) OpCode() uint64 {
	return 0x4
}
func (m setCountMessage) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	b.StoreUInt(uint64(m.value), 32)
	return nil
}

func (c Counter) SendSetCount(value uint32) (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(setCountMessage{queryId, value}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetId() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("id"))
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
