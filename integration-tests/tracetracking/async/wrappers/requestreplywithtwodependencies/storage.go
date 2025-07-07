package requestreplywithtwodependencies

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

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
	ID uint32
}

func (p *StorageProvider) Deploy(initData StorageInitData) (Storage, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreUInt(0, 1)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = b.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return Storage{}, fmt.Errorf("failed to store ID: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(StorageContractPath)
	if err != nil {
		return Storage{}, fmt.Errorf("Failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
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
	queryID       uint64
	PriceRegistry *address.Address
	Key           uint8
}

func (m getCapitalFromMessage) OpCode() uint64 {
	return 0x1
}
func (m getCapitalFromMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreAddr(m.PriceRegistry)
	if err != nil {
		return fmt.Errorf("failed to store PriceRegistry address: %w", err)
	}
	err = b.StoreUInt(uint64(m.Key), 8)
	if err != nil {
		return fmt.Errorf("failed to store Key: %w", err)
	}
	return nil
}

func (s Storage) SendGetCapitalFrom(priceRegistry *address.Address, key uint8) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64() //nolint:gosec
	msgReceived, err = s.Contract.CallWaitRecursively(getCapitalFromMessage{queryID, priceRegistry, key}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return wrappers.Uint64From(s.Contract.Get("value"))
}
