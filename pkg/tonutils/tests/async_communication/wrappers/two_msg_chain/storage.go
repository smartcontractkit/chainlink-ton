package two_msg_chain

import (
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
	contract, err := p.apiClient.Deploy(STORAGE_CONTRACT_PATH, b.EndCell(), tlb.MustFromTON("1"))
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

type storeMethod struct {
	Value uint32
}

func (m storeMethod) OpCode() uint64 {
	return 0x1
}
func (m storeMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (s Storage) Store(i uint32) (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMethod{
		Value: i,
	}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}
