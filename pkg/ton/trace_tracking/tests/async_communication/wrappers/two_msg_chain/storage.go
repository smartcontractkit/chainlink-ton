package two_msg_chain

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewStorageProvider(apiClient trace_tracking.SignedAPIClient) *StorageProvider {
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
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreAddr(initData.MemoryAddress)
	compiledContract, err := wrappers.ParseCompiledContract(STORAGE_CONTRACT_PATH)
	if err != nil {
		return Storage{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := wrappers.Deploy(compiledContract, &p.apiClient, b.EndCell(), tlb.MustFromTON("1"))
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
	queryId uint64
	Value   uint32
}

func (m storeMessage) OpCode() uint64 {
	return 0x1
}
func (m storeMessage) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (s Storage) SendStore(i uint32) (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMessage{queryId, i}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
