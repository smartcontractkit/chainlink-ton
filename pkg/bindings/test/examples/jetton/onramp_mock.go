package jetton

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var OnrampMockContractPath = bindings.GetBuildDir("examples.jetton.OnrampMock.compiled.json")

type OnrampMockProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewOnrampMockProvider(apiClient tracetracking.SignedAPIClient) *OnrampMockProvider {
	return &OnrampMockProvider{
		apiClient: apiClient,
	}
}

type OnrampMockInitData struct {
	MasterAddress *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
}

func (p *OnrampMockProvider) Deploy(initData OnrampMockInitData) (OnrampMock, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return OnrampMock{}, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(OnrampMockContractPath)
	if err != nil {
		return OnrampMock{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	body := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), body)
	if err != nil {
		return OnrampMock{}, err
	}

	return OnrampMock{
		Contract: *contract,
	}, nil
}

type OnrampMock struct {
	Contract wrappers.Contract
}

// OnrampMock constants
const (
	OnrampMockFee                         = 5
	OnrampMockIncorrectSenderError        = 100
	OnrampMockForwardPayloadRequiredError = 101
)

// OnrampMock receives jetton transfer notifications automatically
// It doesn't have explicit send methods, but we can add helper methods
// to parse events from transaction logs

type InsufficientFeeEvent struct {
	QueryID uint64           `tlb:"## 64"`
	Sender  *address.Address `tlb:"addr"`
}

type AcceptedRequestEvent struct {
	QueryID uint64           `tlb:"## 64"`
	Sender  *address.Address `tlb:"addr"`
	Payload *cell.Cell       `tlb:"^"`
}

// Helper method to parse events from transaction results
// Note: This would typically be used when parsing transaction events/logs
func ParseAcceptedRequestEvent(cell *cell.Cell) (*AcceptedRequestEvent, error) {
	event := &AcceptedRequestEvent{}
	err := tlb.LoadFromCell(event, cell.BeginParse())
	if err != nil {
		return nil, fmt.Errorf("failed to load AcceptedRequestEvent: %w", err)
	}
	return event, nil
}
