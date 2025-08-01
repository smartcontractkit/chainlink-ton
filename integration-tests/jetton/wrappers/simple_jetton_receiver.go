package wrappers

import (
	"fmt"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var SimpleJettonReceiverContractPath = test_utils.GetBuildDir("examples.jetton.SimpleJettonReceiver.compiled.json")

type SimpleJettonReceiverProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewSimpleJettonReceiverProvider(apiClient tracetracking.SignedAPIClient) *SimpleJettonReceiverProvider {
	return &SimpleJettonReceiverProvider{
		apiClient: apiClient,
	}
}

type SimpleJettonReceiverInitData struct {
	JettonClient   jetton.Client `tlb:"."`
	AmountChecker  tlb.Coins     `tlb:"."`
	PayloadChecker *cell.Cell    `tlb:"maybe ^"`
}

func (p *SimpleJettonReceiverProvider) Deploy(initData SimpleJettonReceiverInitData) (SimpleJettonReceiver, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(SimpleJettonReceiverContractPath)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), cell.BeginCell().EndCell())
	if err != nil {
		return SimpleJettonReceiver{}, err
	}

	return SimpleJettonReceiver{
		Contract: *contract,
	}, nil
}

type SimpleJettonReceiver struct {
	Contract wrappers.Contract
}

// SimpleJettonReceiver automatically receives jetton transfer notifications
// It validates the amount and optionally the payload against stored checkers

// Getter methods
func (r SimpleJettonReceiver) GetAmountChecker() (*tlb.Coins, error) {
	result, err := r.Contract.Get("amountChecker")
	if err != nil {
		return nil, err
	}
	amount, err := result.Int(0)
	if err != nil {
		return nil, err
	}
	coins := tlb.MustFromNano(amount, 18)
	return &coins, nil
}

func (r SimpleJettonReceiver) GetPayloadChecker() (*cell.Cell, error) {
	result, err := r.Contract.Get("payloadChecker")
	if err != nil {
		return nil, fmt.Errorf("failed to get payload checker: %w", err)
	}

	isPayloadCheckerNil, err := result.IsNil(0)
	if err != nil {
		return nil, fmt.Errorf("failed to check if payload checker is nil: %w", err)
	}
	if isPayloadCheckerNil {
		fmt.Printf("Payload checker is nil, no payload validation will be performed\n")
		fmt.Printf("As tupple: %v\n", result.AsTuple())
		return nil, nil // No payload checker set
	}

	payload, err := result.Cell(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get payload checker cell: %w", err)
	}
	return payload, nil
}
