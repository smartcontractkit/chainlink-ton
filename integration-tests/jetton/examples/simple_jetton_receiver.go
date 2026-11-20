package examples

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

var SimpleJettonReceiverContractPath = bindings.GetBuildDir("examples.jetton.SimpleJettonReceiver.compiled.json")

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

func (p *SimpleJettonReceiverProvider) Deploy(ctx context.Context, initData SimpleJettonReceiverInitData) (SimpleJettonReceiver, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(SimpleJettonReceiverContractPath)
	if err != nil {
		return SimpleJettonReceiver{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	body := tvm.EmptyCell
	contract, _, err := wrappers.Deploy(ctx, &p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), body)
	if err != nil {
		return SimpleJettonReceiver{}, err
	}

	return SimpleJettonReceiver{
		Contract: *contract,
	}, nil
}

// SimpleJettonReceiver automatically receives jetton transfer notifications
// It validates the amount and optionally the payload against stored checkers
type SimpleJettonReceiver struct {
	Contract wrappers.Contract
}

var getAmountChecker = tvm.NewNoArgsGetter(tvm.NoArgsOpts[tlb.Coins]{
	Name: "amountChecker",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (tlb.Coins, error) {
		amount, err := r.Int(0)
		if err != nil {
			return tlb.Coins{}, fmt.Errorf("failed to get amount checker: %w", err)
		}
		return tlb.FromNanoTON(amount), nil
	}),
})

// getPayloadChecker returns a nil cell when no payload checker is set.
var getPayloadChecker = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*cell.Cell]{
	Name: "payloadChecker",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*cell.Cell, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("failed to check if payload checker is nil: %w", err)
		}
		if isNil {
			return nil, nil
		}
		payload, err := r.Cell(0)
		if err != nil {
			return nil, fmt.Errorf("failed to get payload checker cell: %w", err)
		}
		return payload, nil
	}),
})

func (r SimpleJettonReceiver) GetAmountChecker(ctx context.Context) (tlb.Coins, error) {
	return tvm.CallGetterLatest(ctx, r.Contract.Client.Client, r.Contract.Address, getAmountChecker)
}

// GetPayloadChecker returns the stored payload checker, or nil when no payload
// validation is performed.
func (r SimpleJettonReceiver) GetPayloadChecker(ctx context.Context) (*cell.Cell, error) {
	return tvm.CallGetterLatest(ctx, r.Contract.Client.Client, r.Contract.Address, getPayloadChecker)
}
