package requestreply

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var StorageContractPath = bindings.GetBuildDir("examples.async-communication.request-reply.Storage/tact_Storage.pkg")

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
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), cell.BeginCell().EndCell())
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

type getPriceFromMessage struct {
	_             tlb.Magic        `tlb:"#00000001"` //nolint:revive // This field should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	PriceRegistry *address.Address `tlb:"addr"`
	Key           uint8            `tlb:"## 8"`
}

func (s Storage) SendGetPriceFrom(priceRegistry *address.Address, key uint8) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getPriceFromMessage{
		QueryID:       queryID,
		PriceRegistry: priceRegistry,
		Key:           key,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return wrappers.Uint64From(s.Contract.Get("value"))
}
