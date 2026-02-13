package ton

import (
	"context"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// FundMode can be parsed from string in the input JSON, ("ExactAmount", "TopUp").
//
//go:generate go run github.com/dmarkham/enumer@v1.6.3 -type=FundMode -json -text -trimprefix=FundMode
type FundMode uint8

const (
	// FundModeExactAmount means the specified amount will be transferred to the contract, regardless of its current balance.
	FundModeExactAmount FundMode = iota
	// FundModeTopUp means the current balance of the contract will be topped up to reach the specified amount (i.e. if the contract already has some balance, only the difference between the current balance and the target amount will be transferred). If the current balance is greater than or equal to the target amount, no transfer will be made.
	FundModeTopUp
)

// Target can be parsed from string in the input JSON, ("All", "CCIP", "MCMS").
//
//go:generate go run github.com/dmarkham/enumer@v1.6.3 -type=Target -json -text -trimprefix=Target
type Target uint8

const (
	TargetAll Target = iota
	TargetCCIP
	TargetMCMS
)

var TargetDefault = TargetAll

type FundContractsInput struct {
	// Funding mode, either "exact_amount" or "top_up" to target amount
	Mode FundMode `json:"mode"`
	// Decimal string representing the amount in TON (e.g. "1.5" for 1.5 TON or 1_500_000_000 nanoton)
	//
	// If Mode is FundModeExactAmount, this is the exact amount to transfer to the contract.
	// If Mode is FundModeTopUp, this is the target balance for the contract after funding (i.e. current balance will be topped up to reach this amount).
	Amount string `json:"amount"`
	// Target specifies which contracts to fund. If TargetAll, both CCIP and MCMS contracts will be funded. If TargetCcip, only CCIP contracts (Router, OnRamp, OffRamp, FeeQuoter) will be funded. If TargetMcms, only MCMS contracts (Owner MCMS, RMN MCMS) will be funded. If nil, defaults to TargetAll.
	Target *Target `json:"target,omitempty"`

	Plan bool `json:"plan"`
}

func (in FundContractsInput) IsPlan() bool {
	return in.Plan
}

type FundContractsOutput SendMessagesOutput

func (o FundContractsOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o FundContractsOutput) GetTransaction() *tlbe.Cell[tlb.Transaction] {
	return o.Transaction
}

var FundContractsOp = operations.NewOperation(
	"ton/ops/fund-contracts",
	semver.MustParse("0.1.0"),
	"Funds CCIP/MCMS contracts with the specified amounts",
	fundContracts,
)

type parsedFundContractsInput struct {
	Mode   FundMode
	Amount tlb.Coins
	Target Target
	Plan   bool
}

func fundContracts(b operations.Bundle, dp *dep.DependencyProvider, in FundContractsInput) (FundContractsOutput, error) {
	parsedInput, err := parseFundContractsInput(in)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to parse input: %w", err)
	}

	tonChain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to resolve ton chain: %w", err)
	}

	targetContracts, err := resolveTargetContracts(dp, parsedInput)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to resolve target contracts: %w", err)
	}

	messages, err := func() ([]InternalMessage[any], error) {
		if parsedInput.Mode == FundModeExactAmount {
			return prepareTransfers(parsedInput.Amount, targetContracts)
		}
		return prepareTopUps(b.GetContext(), b.Logger, parsedInput.Amount, targetContracts, tonChain)
	}()
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to generate funding requests: %w", err)
	}

	_in := SendMessagesInput{
		Messages: messages,
		Plan:     parsedInput.Plan,
	}

	r, err := operations.ExecuteOperation(b, SendMessages, dp, _in)
	if err != nil {
		return FundContractsOutput{}, fmt.Errorf("failed to execute send messages operation: %w", err)
	}

	return FundContractsOutput(r.Output), nil
}

func parseFundContractsInput(in FundContractsInput) (parsedFundContractsInput, error) {
	amount, err := tlb.FromTON(in.Amount)
	if err != nil {
		return parsedFundContractsInput{}, fmt.Errorf("failed to parse amount: %w", err)
	}

	target := TargetDefault
	if in.Target != nil {
		target = *in.Target
	}

	return parsedFundContractsInput{
		Mode:   in.Mode,
		Amount: amount,
		Target: target,
		Plan:   in.Plan,
	}, nil
}

type targetContract struct {
	name string
	addr address.Address
}

func resolveTargetContracts(dp *dep.DependencyProvider, parsedInput parsedFundContractsInput) ([]targetContract, error) {
	ccipState, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	mcmsState, err := dep.Resolve[tonstate.MCMSChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton mcms state: %w", err)
	}
	_ = mcmsState

	ccipContracts := []targetContract{
		{name: "Router", addr: ccipState.Router},
		{name: "OnRamp", addr: ccipState.OnRamp},
		{name: "OffRamp", addr: ccipState.OffRamp},
		{name: "FeeQuoter", addr: ccipState.FeeQuoter},
	}
	mcmsContracts := []targetContract{
		// {name: "MCMS", addr: mcmsState.ByQualifier("default")},
		// {name: "Timelock", addr: mcmsState.Timelock},
	}
	targetContracts := make([]targetContract, 0, len(ccipContracts)+len(mcmsContracts))

	switch parsedInput.Target {
	case TargetAll:
		targetContracts = append(targetContracts, ccipContracts...)
		targetContracts = append(targetContracts, mcmsContracts...)
	case TargetCCIP:
		targetContracts = append(targetContracts, ccipContracts...)
	case TargetMCMS:
		targetContracts = append(targetContracts, mcmsContracts...)
	default:
		return nil, fmt.Errorf("invalid target: %s", parsedInput.Target)
	}
	return targetContracts, nil
}

func prepareTransfers(amount tlb.Coins, targetContracts []targetContract) ([]InternalMessage[any], error) {
	requests := make([]InternalMessage[any], 0, len(targetContracts))
	for _, contract := range targetContracts {
		if contract.addr.IsAddrNone() {
			continue
		}

		requests = append(requests, fundingMessage(contract.addr, amount))
	}
	return requests, nil
}

func prepareTopUps(ctx context.Context, logger logger.Logger, targetAmount tlb.Coins, targetContracts []targetContract, tonChain cldf_ton.Chain) ([]InternalMessage[any], error) {
	requests := make([]InternalMessage[any], 0, len(targetContracts))
	for _, contract := range targetContracts {
		if contract.addr.IsAddrNone() {
			continue
		}

		block, err := tonChain.Client.CurrentMasterchainInfo(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
		}
		contractState, err := tonChain.Client.GetAccount(ctx, block, &contract.addr)
		if err != nil {
			return nil, fmt.Errorf("failed to get account state for contract %s: %w", contract.name, err)
		}
		contractBalance := contractState.State.Balance
		if contractBalance.GreaterOrEqual(&targetAmount) {
			logger.Infof("Contract %s (%s) already has balance %s greater than or equal to target amount %s, skipping funding\n", contract.name, contract.addr.String(), contractBalance.String(), targetAmount.String())
			continue
		}
		amount, err := targetAmount.Sub(&contractBalance)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate top-up amount for contract %s: %w", contract.name, err)
		}

		requests = append(requests, fundingMessage(contract.addr, *amount))
	}
	return requests, nil
}

func fundingMessage(addr address.Address, amount tlb.Coins) InternalMessage[any] {
	return InternalMessage[any]{
		Bounce:  true, // bouncing is enabled to avoid losing funds in case of incorrect addresses or other issues. All CCIP/MCMS contracts should accept empty message.
		DstAddr: &addr,
		Amount:  amount,
		Body:    nil, // empty message
	}
}
