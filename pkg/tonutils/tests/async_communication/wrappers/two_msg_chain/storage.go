package two_msg_chain

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-msg-chain.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewStorageProvider(apiClient tonutils.SignedAPIClient) *StorageProvider {
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
	contractCode, err := tonutils.CompiledContract(STORAGE_CONTRACT_PATH)
	if err != nil {
		return Storage{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return Storage{}, err
	}

	return Storage{
		Contract: *contract,
	}, nil
}

type Storage struct {
	Contract tonutils.Contract
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

func (s Storage) Store(i uint32) (msgReceived *tonutils.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMessage{queryId, i}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
