package request_reply

import (
	"math/rand/v2"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const STORAGE_CONTRACT_PATH = "../build/examples/request-reply/storage/storage_Storage.pkg"

type StorageProvider struct {
	ac utils.ApiClient
}

func NewStorageProvider(apiClient utils.ApiClient) *StorageProvider {
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
	time.Sleep(time.Second * 5) // Wait for the contract to be deployed

	return Storage{
		Contract: *contract,
	}, nil
}

type Storage struct {
	Contract utils.Contract
}

type getPriceFromMethod struct {
	PriceRegistry *address.Address
	Key           uint8
}

func (m getPriceFromMethod) OpCode() uint64 {
	return 0x1
}
func (m getPriceFromMethod) StoreArgs(b *cell.Builder) error {
	b.StoreAddr(m.PriceRegistry)
	b.StoreUInt(uint64(m.Key), 8)
	return nil
}

func (s Storage) SendGetPriceFrom(priceRegistry *address.Address, key uint8) (queryID uint64, msgReceived *utils.MessageReceived, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getPriceFromMethod{
		PriceRegistry: priceRegistry,
		Key:           key,
	}, queryID)
	return queryID, msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return utils.Uint64From(s.Contract.Get("value"))
}
