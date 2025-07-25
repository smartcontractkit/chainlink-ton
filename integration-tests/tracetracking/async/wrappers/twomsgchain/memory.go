package twomsgchain

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var MemoryContractPath = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Memory/tact_Memory.pkg")

type MemoryProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewMemoryProvider(apiClient tracetracking.SignedAPIClient) *MemoryProvider {
	return &MemoryProvider{
		apiClient: apiClient,
	}
}

type MemoryInitData struct {
	ID uint32    `tlb:"## 32"`
	_  tlb.Magic `tlb:"#00000000"`
}

func (p *MemoryProvider) Deploy(initData MemoryInitData) (Memory, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return Memory{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(MemoryContractPath)
	if err != nil {
		return Memory{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
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
	_       tlb.Magic `tlb:"#00000001"`
	queryID uint64    `tlb:"## 64"`
	Value   uint32    `tlb:"## 32"`
}

func (m setValueMessage) OpCode() uint64 {
	return 0x1
}

func (m Memory) SendSetValue(i uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(setValueMessage{
		queryID: queryID,
		Value:   i,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (m Memory) GetValue() (uint32, error) {
	return wrappers.Uint32From(m.Contract.Get("value"))
}
