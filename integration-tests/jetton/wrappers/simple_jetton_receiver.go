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
	jettonClientBuilder := cell.BeginCell()
	err := jettonClientBuilder.StoreAddr(initData.MasterAddress)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store MasterAddress: %w", err)
	}
	err = jettonClientBuilder.StoreRef(initData.JettonWalletCode)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store JettonWalletCode: %w", err)
	}
	jettonClientCell := jettonClientBuilder.EndCell()

	err = b.StoreRef(jettonClientCell)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store JettonClient: %w", err)
	}

	err = b.StoreCoins(initData.AmountChecker)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to store AmountChecker: %w", err)
	}

	// Store payload checker (optional)
	if initData.PayloadChecker != nil {
		err = b.StoreBoolBit(true)
		if err != nil {
			return SimpleJettonReceiver{}, fmt.Errorf("failed to store PayloadChecker flag: %w", err)
		}
		err = b.StoreRef(initData.PayloadChecker)
		if err != nil {
			return SimpleJettonReceiver{}, fmt.Errorf("failed to store PayloadChecker: %w", err)
		}
	} else {
		err = b.StoreBoolBit(false)
		if err != nil {
			return SimpleJettonReceiver{}, fmt.Errorf("failed to store PayloadChecker flag: %w", err)
		}
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
func (r SimpleJettonReceiver) GetAmountChecker() (uint64, error) {
	return wrappers.Uint64From(r.Contract.Get("amountChecker"))
}

func (r SimpleJettonReceiver) GetPayloadChecker() (*cell.Cell, error) {
	result, err := r.Contract.Get("payloadChecker")
	if err != nil {
		return nil, err
	}

	// Check if payload checker exists
	hasPayload, err := result.Int(0)
	if err != nil {
		return nil, err
	}

	if hasPayload.Uint64() == 1 {
		return result.Cell(1)
	}

	return nil, nil
}
