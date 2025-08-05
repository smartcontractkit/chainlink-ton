package counter

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var CounterContractPath = bindings.GetBuildDir("examples.counter.compiled.json")

//nolint:revive // test purpose
type CounterProvider struct {
	apiClient tracetracking.SignedAPIClient // TODO use pointer
}

func NewCounterProvider(apiClient tracetracking.SignedAPIClient) *CounterProvider {
	return &CounterProvider{
		apiClient: apiClient,
	}
}

//nolint:revive // test purpose
type CounterInitData struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}

func (p *CounterProvider) Deploy(initData CounterInitData) (Counter, error) {
	compiledContract, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	body := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), body)
	if err != nil {
		return Counter{}, err
	}

	return Counter{
		Contract: *contract,
	}, nil
}

type Counter struct {
	Contract wrappers.Contract
}

type setCountMessage struct {
	_       tlb.Magic `tlb:"#00000004"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
	Value   uint32    `tlb:"## 32"`
}

func (c Counter) SendSetCount(value uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(setCountMessage{
		QueryID: queryID,
		Value:   value,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetID() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("id"))
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
