package two_msg_chain

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const MEMORY_CONTRACT_PATH = "../build/examples/two-msg-chain/memory/memory_Memory.pkg"

type MemoryProvider struct {
	ac tonutils.ApiClient
}

func NewMemoryProvider(apiClient tonutils.ApiClient) *MemoryProvider {
	return &MemoryProvider{
		ac: apiClient,
	}
}

type MemoryIninData struct {
	ID uint32
}

func (p *MemoryProvider) Deploy(initData MemoryIninData) (Memory, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreUInt(uint64(0), 32)
	contract, err := p.ac.Deploy(MEMORY_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return Memory{}, err
	}

	return Memory{
		Contract: *contract,
	}, nil
}

type Memory struct {
	Contract tonutils.Contract
}

type setValueMethod struct {
	Value uint32
}

func (m setValueMethod) OpCode() uint64 {
	return 0x1
}
func (m setValueMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (m Memory) SetValue(i uint32) (queryID uint64, msgReceived *tonutils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(setValueMethod{
		Value: i,
	}, queryID)
	return queryID, msgReceived, err
}

func (m Memory) GetValue() (uint32, error) {
	return tonutils.Uint32From(m.Contract.Get("value"))
}
