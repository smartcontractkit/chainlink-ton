package requestreplywithtwodependencies

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var StorageContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewStorageProvider(apiClient tracetracking.SignedAPIClient) *StorageProvider {
	return &StorageProvider{
		apiClient: apiClient,
	}
}

type StorageInitData struct {
	ID uint32 `tlb:"## 32"`
}

func (p *StorageProvider) Deploy(initData StorageInitData) (Storage, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
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

type getCapitalFromMessage struct {
	_             tlb.Magic        `tlb:"#00000001"`
	QueryID       uint64           `tlb:"## 64"`
	PriceRegistry *address.Address `tlb:"addr"`
	Key           uint8            `tlb:"## 8"`
}

func (m getCapitalFromMessage) OpCode() uint64 {
	return 0x1
}

func (s Storage) SendGetCapitalFrom(priceRegistry *address.Address, key uint8) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getCapitalFromMessage{
		QueryID:       queryID,
		PriceRegistry: priceRegistry,
		Key:           key,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return wrappers.Uint64From(s.Contract.Get("value"))
}
