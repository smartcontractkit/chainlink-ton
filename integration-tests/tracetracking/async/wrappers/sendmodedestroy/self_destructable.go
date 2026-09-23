package sendmodedestroy

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var SelfDestroyContractPath = bindings.GetBuildDir("examples.async-communication.send-mode-destroy.SelfDestructable.compiled.json")

type SelfDestroyProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewSelfDestructableProvider(apiClient tracetracking.SignedAPIClient) *SelfDestroyProvider {
	return &SelfDestroyProvider{
		apiClient: apiClient,
	}
}

type SelfDestroyInitData struct {
}

func (p *SelfDestroyProvider) Deploy(initData SelfDestroyInitData) (SelfDestroy, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return SelfDestroy{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(SelfDestroyContractPath)
	if err != nil {
		return SelfDestroy{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	body := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"), body)
	if err != nil {
		return SelfDestroy{}, err
	}

	return SelfDestroy{
		Contract: *contract,
	}, nil
}

type SelfDestroy struct {
	Contract wrappers.Contract
}

type SendSelfDestructMessage struct {
	_       tlb.Magic `tlb:"#00000001"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

func (c SelfDestroy) SendSelfDestruct() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = c.Contract.CallWaitRecursively(SendSelfDestructMessage{
		QueryID: queryID,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
