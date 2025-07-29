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

var JettonReceiverContractPath = test_utils.GetBuildDir("examples.jetton.JettonReceiver.compiled.json")

type JettonReceiverProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonReceiverProvider(apiClient tracetracking.SignedAPIClient) *JettonReceiverProvider {
	return &JettonReceiverProvider{
		apiClient: apiClient,
	}
}

type JettonClient struct {
	MasterAddress    *address.Address `tlb:"addr"`
	JettonWalletCode *cell.Cell       `tlb:"^"`
}

type JettonReceiverInitData struct {
	JettonClient   JettonClient `tlb:"^"`
	AmountChecker  tlb.Coins    `tlb:"."`
	PayloadChecker *cell.Cell   `tlb:"^"`
}

func (p *JettonReceiverProvider) Deploy(initData JettonReceiverInitData) (JettonReceiver, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return JettonReceiver{}, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(JettonReceiverContractPath)
	if err != nil {
		return JettonReceiver{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"))
	if err != nil {
		return JettonReceiver{}, err
	}

	return JettonReceiver{
		Contract: *contract,
	}, nil
}

type JettonReceiver struct {
	Contract wrappers.Contract
}

// JettonReceiver constants
const (
	JettonReceiverIncorrectSenderError = 100
)

// JettonReceiver automatically receives jetton transfer notifications
// It validates the amount and payload against stored checkers

// Getter methods
func (r JettonReceiver) GetAmountChecker() (uint64, error) {
	return wrappers.Uint64From(r.Contract.Get("amountChecker"))
}

func (r JettonReceiver) GetPayloadChecker() (*cell.Cell, error) {
	result, err := r.Contract.Get("payloadChecker")
	if err != nil {
		return nil, err
	}
	return result.Cell(0)
}
