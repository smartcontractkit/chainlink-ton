package two_msg_chain

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// const STORAGE_CONTRACT_PATH = "contracts/build/examples/two-msg-chain/storage/storage_Storage.pkg"

const STORAGE_CONTRACT_PATH = "../build/examples/two-msg-chain/storage/storage_Storage.pkg"

type StorageProvider struct {
	ac utils.ApiClient
}

func NewStorageProvider(apiClient utils.ApiClient) *StorageProvider {
	return &StorageProvider{
		ac: apiClient,
	}
}

type StorageIninData struct {
	ID            uint32
	MemoryAddress *address.Address
}

func (p *StorageProvider) Deploy(initData StorageIninData) (Storage, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(uint64(initData.ID), 32)
	b.StoreAddr(initData.MemoryAddress)
	contract, err := p.ac.Deploy(STORAGE_CONTRACT_PATH, b.EndCell())
	if err != nil {
		return Storage{}, err
	}

	return Storage{
		Contract: *contract,
	}, nil
}

type Storage struct {
	Contract utils.Contract
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

func (s Storage) Store(i uint32) (queryID uint64, msgReceived *utils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(storeMethod{
		Value: i,
	}, queryID)
	return queryID, msgReceived, err
}
