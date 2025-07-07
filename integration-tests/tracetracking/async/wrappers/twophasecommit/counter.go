package twophasecommit

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var CounterContractPath = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.Counter/tact_Counter.pkg")

type CounterProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewCounterProvider(apiClient tracetracking.SignedAPIClient) *CounterProvider {
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
	err := c.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = c.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store ID: %w", err)
	}
	err = c.StoreUInt(uint64(initData.Value), 32)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store Value: %w", err)
	}
	err = c.StoreBoolBit(initData.AutoAck)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to store AutoAck: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return Counter{}, fmt.Errorf("Failed to compile contract: %w", err)
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
	queryID uint64
}

func (m sendAckMessage) OpCode() uint64 {
	return 0x3
}
func (m sendAckMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (c Counter) SendAck() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64() //nolint:gosec
	msgReceived, err = c.Contract.CallWaitRecursively(sendAckMessage{queryID}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
