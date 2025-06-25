package two_msg_chain

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/trace_tracking/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var MEMORY_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Memory.compiled.json")

type MemoryProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewMemoryProvider(apiClient trace_tracking.SignedAPIClient) *MemoryProvider {
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
	b.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(uint64(0), 32)
	compiledContract, err := wrappers.ParseCompiledContract(MEMORY_CONTRACT_PATH)
	if err != nil {
		return Memory{}, fmt.Errorf("Failed to compile contract: %v", err)
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
	b.StoreUInt(m.queryId, 64)
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (m Memory) SendSetValue(i uint32) (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(setValueMessage{queryId, i}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (m Memory) GetValue() (uint32, error) {
	return wrappers.Uint32From(m.Contract.Get("value"))
}
