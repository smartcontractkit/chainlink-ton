package request_reply_with_two_dependencies

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tonutils.ApiClient
}

func NewStorageProvider(apiClient tonutils.ApiClient) *StorageProvider {
	return &StorageProvider{
		apiClient: apiClient,
	}
}

type StorageInitData struct {
	ID uint32
}

func (p *StorageProvider) Deploy(initData StorageInitData) (Storage, error) {
	// Deploy the contract
	b := cell.BeginCell()
	b.StoreUInt(0, 1)
	b.MustStoreUInt(uint64(initData.ID), 32)
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

func (s Storage) SendGetCapitalFrom(priceRegistry *address.Address, key uint8) (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getCapitalFromMethod{
		PriceRegistry: priceRegistry,
		Key:           key,
	}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return tonutils.Uint64From(s.Contract.Get("value"))
}
