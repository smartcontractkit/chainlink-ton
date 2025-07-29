package requestreply

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var PriceRegistryContractPath = test_utils.GetBuildDir("examples.async-communication.request-reply.PriceRegistry/tact_PriceRegistry.pkg")

type PriceRegistryProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewPriceRegistryProvider(apiClient tracetracking.SignedAPIClient) *PriceRegistryProvider {
	return &PriceRegistryProvider{
		apiClient: apiClient,
	}
}

type PriceRegistryInitData struct {
	ID uint32 `tlb:"## 32"`
}

func (p *PriceRegistryProvider) Deploy(initData PriceRegistryInitData) (PriceRegistry, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(PriceRegistryContractPath)
	if err != nil {
		return PriceRegistry{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return PriceRegistry{}, err
	}

	return PriceRegistry{
		Contract: *contract,
	}, nil
}

type PriceRegistry struct {
	Contract wrappers.Contract
}

type AddPriceItemMessage struct {
	_       tlb.Magic        `tlb:"#00000003"` //nolint:revive // This field should stay uninitialized
	QueryID uint64           `tlb:"## 64"`
	Key     uint8            `tlb:"## 8"`
	Addr    *address.Address `tlb:"addr"`
}

func (m AddPriceItemMessage) OpCode() uint64 {
	return 0x3
}

func (p PriceRegistry) SendAddPriceItem(key uint8, addr *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = p.Contract.CallWaitRecursively(AddPriceItemMessage{
		QueryID: queryID,
		Key:     key,
		Addr:    addr,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
