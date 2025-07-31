package wrappers

import (
	"fmt"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var OnrampMockContractPath = test_utils.GetBuildDir("examples.jetton.OnrampMock.compiled.json")

type OnrampMockProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewOnrampMockProvider(apiClient tracetracking.SignedAPIClient) *OnrampMockProvider {
	return &OnrampMockProvider{
		apiClient: apiClient,
	}
}

type OnrampMockInitData struct {
	MasterAddress    *address.Address `tlb:"addr"`
	JettonWalletCode *cell.Cell       `tlb:"^"`
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
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), cell.BeginCell().EndCell())
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

// Event opcodes (these are typically used in logs/events)
const (
	OnrampMockInsufficientFeeEvent = "InsufficientFee"
	OnrampMockAcceptedRequestEvent = "AcceptedRequest"
)

// OnrampMock receives jetton transfer notifications automatically
// It doesn't have explicit send methods, but we can add helper methods
// to parse events from transaction logs

type InsufficientFeeEvent struct {
	QueryID uint64
	Sender  *address.Address
}

type AcceptedRequestEvent struct {
	QueryID uint64
	Sender  *address.Address
	Payload *cell.Cell
}

// Helper methods to parse events from transaction logs
func ParseInsufficientFeeEvent(cell *cell.Cell) (InsufficientFeeEvent, error) {
	slice := cell.BeginParse()
	queryID, err := slice.LoadUInt(64)
	if err != nil {
		return InsufficientFeeEvent{}, fmt.Errorf("failed to load queryID: %w", err)
	}

	sender, err := slice.LoadAddr()
	if err != nil {
		return InsufficientFeeEvent{}, fmt.Errorf("failed to load sender: %w", err)
	}

	return InsufficientFeeEvent{
		QueryID: queryID,
		Sender:  sender,
	}, nil
}

// Helper method to parse events from transaction results
// Note: This would typically be used when parsing transaction events/logs
func ParseAcceptedRequestEvent(eventCell *cell.Cell) (AcceptedRequestEvent, error) {
	slice := eventCell.BeginParse()
	queryID, err := slice.LoadUInt(64)
	if err != nil {
		return AcceptedRequestEvent{}, fmt.Errorf("failed to load queryID: %w", err)
	}

	sender, err := slice.LoadAddr()
	if err != nil {
		return AcceptedRequestEvent{}, fmt.Errorf("failed to load sender: %w", err)
	}

	// For now, we'll assume the payload is stored as a simple cell
	// In a real implementation, the payload structure depends on the contract
	if slice.BitsLeft() > 0 {
		// Create a new cell with the remaining data
		payloadBuilder := cell.BeginCell()
		// Store the remaining slice content (this is a simplified approach)
		payloadCell := payloadBuilder.EndCell()

		return AcceptedRequestEvent{
			QueryID: queryID,
			Sender:  sender,
			Payload: payloadCell,
		}, nil
	}

	return AcceptedRequestEvent{
		QueryID: queryID,
		Sender:  sender,
		Payload: nil,
	}, nil
}
