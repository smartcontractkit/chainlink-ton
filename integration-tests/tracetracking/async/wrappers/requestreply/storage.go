package requestreply

import (
	"context"
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/contracts"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

var StorageContractPath = contracts.TestDataPath("legacy-tact/examples.async-communication.request-reply.Storage/tact_Storage.pkg")

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

func (p *StorageProvider) Deploy(ctx context.Context, initData StorageInitData) (Storage, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return Storage{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(StorageContractPath)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	body := tvm.EmptyCell
	contract, _, err := wrappers.DeployActivateOnly(ctx, &p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), body)
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
	_             tlb.Magic        `tlb:"#00000001" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID       uint64           `tlb:"## 64"`
	PriceRegistry *address.Address `tlb:"addr"`
	Key           uint8            `tlb:"## 8"`
}

func (s Storage) SendGetPriceFrom(ctx context.Context, priceRegistry *address.Address, key uint8) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(ctx, getPriceFromMessage{
		QueryID:       queryID,
		PriceRegistry: priceRegistry,
		Key:           key,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

var getValue = wrappers.NewUint64Getter("value")

func (s Storage) GetValue(ctx context.Context) (uint64, error) {
	return tvm.CallGetterLatest(ctx, s.Contract.Client.Client, s.Contract.Address, getValue)
}
