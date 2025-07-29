package twomsgchain

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var StorageContractPath = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewStorageProvider(apiClient tracetracking.SignedAPIClient) *StorageProvider {
	return &StorageProvider{
		apiClient: apiClient,
	}
}

type StorageInitData struct {
	ID            uint32           `tlb:"## 32"`
	MemoryAddress *address.Address `tlb:"addr"`
}

func (p *StorageProvider) Deploy(initData StorageInitData) (Storage, error) {
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(StorageContractPath)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return Storage{}, err
	}

	return Storage{
		Contract: *contract,
	}, nil
}

type Storage struct {
	Contract wrappers.Contract
}

type storeMessage struct {
	_       tlb.Magic `tlb:"#00000001"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
	Value   uint32    `tlb:"## 32"`
}

func (m storeMessage) OpCode() uint64 {
	return 0x1
}

func (s Storage) SendStore(i uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMessage{
		QueryID: queryID,
		Value:   i,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
