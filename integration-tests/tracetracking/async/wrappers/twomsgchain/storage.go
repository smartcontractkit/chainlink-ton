package twomsgchain

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewStorageProvider(apiClient tracetracking.SignedAPIClient) *StorageProvider {
	return &StorageProvider{
		apiClient: apiClient,
	}
}

type StorageInitData struct {
	ID            uint32
	MemoryAddress *address.Address
}

func (p *StorageProvider) Deploy(initData StorageInitData) (Storage, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to store ID: %w", err)
	}
	err = b.StoreAddr(initData.MemoryAddress)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to store MemoryAddress: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(STORAGE_CONTRACT_PATH)
	if err != nil {
		return Storage{}, fmt.Errorf("Failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
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
	queryID uint64
	Value   uint32
}

func (m storeMessage) OpCode() uint64 {
	return 0x1
}
func (m storeMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreUInt(uint64(m.Value), 32)
	if err != nil {
		return fmt.Errorf("failed to store Value: %w", err)
	}
	return nil
}

func (s Storage) SendStore(i uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMessage{queryID, i}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
