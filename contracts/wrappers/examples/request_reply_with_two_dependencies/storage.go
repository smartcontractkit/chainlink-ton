package request_reply_with_two_dependencies

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const STORAGE_CONTRACT_PATH = "../build/examples/request-reply/storage/storage_Storage.pkg"

type StorageProvider struct {
	ac tonutils.ApiClient
}

func NewStorageProvider(apiClient tonutils.ApiClient) *StorageProvider {
	return &StorageProvider{
		ac: apiClient,
	}
}

type StorageIninData struct {
	ID uint32
}

func (p *StorageProvider) Deploy(initData StorageIninData) (Storage, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.MustStoreUInt(uint64(initData.ID), 32)
	contract, err := p.ac.Deploy(STORAGE_CONTRACT_PATH, b.EndCell())
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

type getCapitalFromMethod struct {
	PriceRegistry *address.Address
	Key           uint8
}

func (m getCapitalFromMethod) OpCode() uint64 {
	return 0x1
}
func (m getCapitalFromMethod) StoreArgs(b *cell.Builder) error {
	b.StoreAddr(m.PriceRegistry)
	b.StoreUInt(uint64(m.Key), 8)
	return nil
}

func (s Storage) SendGetCapitalFrom(priceRegistry *address.Address, key uint8) (queryID uint64, msgReceived *tonutils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getCapitalFromMethod{
		PriceRegistry: priceRegistry,
		Key:           key,
	}, queryID)
	return queryID, msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return tonutils.Uint64From(s.Contract.Get("value"))
}
