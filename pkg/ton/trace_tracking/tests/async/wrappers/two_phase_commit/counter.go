package two_phase_commit

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var COUNTER_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.Counter/tact_Counter.pkg")

type CounterProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewCounterProvider(apiClient trace_tracking.SignedAPIClient) *CounterProvider {
	return &CounterProvider{
		apiClient: apiClient,
	}
}

type CounterInitData struct {
	ID      uint32
	Value   uint32
	AutoAck bool
}

func (p *CounterProvider) Deploy(initData CounterInitData) (Counter, error) {
	// Deploy the contract
	c := cell.BeginCell()
	c.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	c.StoreUInt(uint64(initData.ID), 32)
	c.StoreUInt(uint64(initData.Value), 32)
	c.StoreBoolBit(initData.AutoAck)
	compiledContract, err := wrappers.ParseCompiledContract(COUNTER_CONTRACT_PATH)
	if err != nil {
		return Counter{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, c.EndCell(), tlb.MustFromTON("1"))
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

type sendAckMessage struct {
	queryId uint64
}

func (m sendAckMessage) OpCode() uint64 {
	return 0x3
}
func (m sendAckMessage) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	return nil
}

func (c Counter) SendAck() (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(sendAckMessage{queryId}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
