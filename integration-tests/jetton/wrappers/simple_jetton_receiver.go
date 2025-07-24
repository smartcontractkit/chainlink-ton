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
	MasterAddress    *address.Address
	JettonWalletCode *cell.Cell
	AmountChecker    uint64
	PayloadChecker   *cell.Cell // can be nil
}

func (p *SimpleJettonReceiverProvider) Deploy(initData SimpleJettonReceiverInitData) (SimpleJettonReceiver, error) {
	// Deploy the contract
	b := cell.BeginCell()

	// Store JettonClient config
	err := b.StoreAddr(initData.MasterAddress)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store MasterAddress: %w", err)
	}
	err = b.StoreRef(initData.JettonWalletCode)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store JettonWalletCode: %w", err)
	}

	err = b.StoreCoins(initData.AmountChecker)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store AmountChecker: %w", err)
	}

	err = b.StoreMaybeRef(initData.PayloadChecker)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store PayloadChecker: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(SimpleJettonReceiverContractPath)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
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
