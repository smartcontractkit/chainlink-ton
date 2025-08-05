package twophasecommit

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var CounterContractPath = bindings.GetBuildDir("examples.async-communication.two-phase-commit.Counter/tact_Counter.pkg")

type CounterProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewCounterProvider(apiClient tracetracking.SignedAPIClient) *CounterProvider {
	return &CounterProvider{
		apiClient: apiClient,
	}
}

type CounterInitData struct {
	ID      uint32 `tlb:"## 32"`
	Value   uint32 `tlb:"## 32"`
	AutoAck bool   `tlb:"bool"`
}

func (p *CounterProvider) Deploy(initData CounterInitData) (Counter, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return Counter{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return Counter{}, fmt.Errorf("failed to compile contract: %w", err)
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

type sendAckMessage struct {
	_       tlb.Magic `tlb:"#00000003"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

func (c Counter) SendAck() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(sendAckMessage{
		QueryID: queryID,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

func (c Counter) GetValue() (uint32, error) {
	return wrappers.Uint32From(c.Contract.Get("value"))
}
