package two_phase_commit

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const COUNTER_CONTRACT_PATH = "../build/examples/two-phase-commit/counter/counter_Counter.pkg"

type CounterProvider struct {
	ac tonutils.ApiClient
}

func NewCounterProvider(apiClient tonutils.ApiClient) *CounterProvider {
	return &CounterProvider{
		ac: apiClient,
	}
}

type CounterIninData struct {
	ID      uint32
	Value   uint32
	AutoAck bool
}

func (p *CounterProvider) Deploy(initData CounterIninData) (Counter, error) {
	// Deploy the contract
	c := cell.BeginCell()
	c.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	c.StoreUInt(uint64(initData.ID), 32)
	c.StoreUInt(uint64(initData.Value), 32)
	c.StoreBoolBit(initData.AutoAck)
	contract, err := p.ac.Deploy(COUNTER_CONTRACT_PATH, c.EndCell())
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

func (c Counter) SendAck() (queryID uint64, msgReceived *tonutils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(sendAck{}, queryID)
	return queryID, msgReceived, err
}

func (c Counter) GetValue() (uint32, error) {
	return tonutils.Uint32From(c.Contract.Get("value"))
}
