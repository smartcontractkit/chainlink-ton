package two_msg_chain

import (
	"fmt"
	"math/rand/v2"

	"integration-tests/tracetracking/test_utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var MEMORY_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Memory/tact_Memory.pkg")

type MemoryProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewMemoryProvider(apiClient tracetracking.SignedAPIClient) *MemoryProvider {
	return &MemoryProvider{
		apiClient: apiClient,
	}
}

type MemoryInitData struct {
	ID uint32
}

func (p *MemoryProvider) Deploy(initData MemoryInitData) (Memory, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	if err != nil {
		return Memory{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Memory{}, fmt.Errorf("failed to store ID: %w", err)
	}
	err = b.StoreUInt(uint64(0), 32)
	if err != nil {
		return Memory{}, fmt.Errorf("failed to store initial value: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(MEMORY_CONTRACT_PATH)
	if err != nil {
		return Memory{}, fmt.Errorf("Failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return Memory{}, err
	}

	return Memory{
		Contract: *contract,
	}, nil
}

type Memory struct {
	Contract wrappers.Contract
}

type setValueMessage struct {
	queryId uint64
	Value   uint32
}

func (m setValueMessage) OpCode() uint64 {
	return 0x1
}
func (m setValueMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryId, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryId: %w", err)
	}
	err = b.StoreUInt(uint64(m.Value), 32)
	if err != nil {
		return fmt.Errorf("failed to store Value: %w", err)
	}
	return nil
}

func (m Memory) SendSetValue(i uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(setValueMessage{queryId, i}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (m Memory) GetValue() (uint32, error) {
	return wrappers.Uint32From(m.Contract.Get("value"))
}
