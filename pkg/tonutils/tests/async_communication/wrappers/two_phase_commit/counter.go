package two_phase_commit

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var COUNTER_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.Counter/tact_Counter.pkg")

type CounterProvider struct {
	apiClient tonutils.ApiClient
}

func NewCounterProvider(apiClient tonutils.ApiClient) *CounterProvider {
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
	contract, err := p.apiClient.Deploy(COUNTER_CONTRACT_PATH, c.EndCell(), tlb.MustFromTON("1"))
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

type sendAck struct{}

func (m sendAck) OpCode() uint64 {
	return 0x3
}
func (m sendAck) StoreArgs(b *cell.Builder) error {
	return nil
}

func (c Counter) SendAck() (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(sendAck{}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}

func (c Counter) GetValue() (uint32, error) {
	return tonutils.Uint32From(c.Contract.Get("value"))
}
