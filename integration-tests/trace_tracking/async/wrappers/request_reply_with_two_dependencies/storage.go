package request_reply_with_two_dependencies

import (
	"fmt"
	"math/rand/v2"

	"integration-tests/trace_tracking/test_utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var STORAGE_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.request-reply.Storage/tact_Storage.pkg")

type StorageProvider struct {
	apiClient trace_tracking.SignedAPIClient
}

func NewStorageProvider(apiClient trace_tracking.SignedAPIClient) *StorageProvider {
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
	compiledContract, err := wrappers.ParseCompiledContract(STORAGE_CONTRACT_PATH)
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
	queryId       uint64
	PriceRegistry *address.Address
	Key           uint8
}

func (m getCapitalFromMessage) OpCode() uint64 {
	return 0x1
}
func (m getCapitalFromMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryId, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryId: %w", err)
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

func (s Storage) SendGetCapitalFrom(priceRegistry *address.Address, key uint8) (msgReceived *trace_tracking.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(getCapitalFromMessage{queryId, priceRegistry, key}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (s Storage) GetValue() (uint64, error) {
	return wrappers.Uint64From(s.Contract.Get("value"))
}
