package request_reply

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewStorageProvider(apiClient tonutils.SignedAPIClient) *StorageProvider {
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

type getPriceFromMessage struct {
	queryId       uint64
	PriceRegistry *address.Address
	Key           uint8
}

func (m getPriceFromMessage) OpCode() uint64 {
	return 0x1
}
func (m getPriceFromMessage) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	b.StoreAddr(m.PriceRegistry)
	b.StoreUInt(uint64(m.Key), 8)
	return nil
}

func (s Storage) SendGetPriceFrom(priceRegistry *address.Address, key uint8) (msgReceived *tonutils.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getPriceFromMessage{queryId, priceRegistry, key}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return tonutils.Uint64From(s.Contract.Get("value"))
}
