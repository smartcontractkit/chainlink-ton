package ton

import (
	"context"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type FundMode uint8

const (
	// FUND_MODE_EXACT_AMOUNT means the specified amount will be transferred to the contract, regardless of its current balance.
	FUND_MODE_EXACT_AMOUNT FundMode = 1 + iota
	// FUND_MODE_TOP_UP means the current balance of the contract will be topped up to reach the specified amount (i.e. if the contract already has some balance, only the difference between the current balance and the target amount will be transferred). If the current balance is greater than or equal to the target amount, no transfer will be made.
	FUND_MODE_TOP_UP
)

type Target uint8

const (
	TARGET_ALL Target = 1 + iota
	TARGET_CCIP
	TARGET_MCMS
)

var TARGET_DEFAULT Target = TARGET_ALL

type FundContractsInput struct {
	Mode FundMode
	// Decimal string representing the amount in TON (e.g. "1.5" for 1.5 TON or 1_500_000_000 nanoton)
	//
	// If Mode is FUND_MODE_EXACT_AMOUNT, this is the exact amount to transfer to the contract.
	// If Mode is FUND_MODE_TOP_UP, this is the target balance for the contract after funding (i.e. current balance will be topped up to reach this amount).
	Amount string
	// Target specifies which contracts to fund. If TARGET_ALL, both CCIP and MCMS contracts will be funded. If TARGET_CCIP, only CCIP contracts (Router, OnRamp, OffRamp, FeeQuoter) will be funded. If TARGET_MCMS, only MCMS contracts (Owner MCMS, RMN MCMS) will be funded. If nil, defaults to TARGET_ALL.
	Target *Target
}

var FundContractsOp = operations.NewOperation(
	"ton/ops/fund-contracts",
	semver.MustParse("0.1.0"),
	"Funds CCIP/MCMS contracts with the specified amounts",
	fundContracts,
)

func fundContracts(b operations.Bundle, dp *dep.DependencyProvider, in FundContractsInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	if in.Target == nil {
		in.Target = &TARGET_DEFAULT
	}

	// TODO: MCMS contracts not found in state, need to be added when MCMS is deployed
	if *in.Target == TARGET_MCMS {
		return nil, fmt.Errorf("funding MCMS contracts is not supported yet as MCMS contracts are not in state")
	}

	stateCCIP, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	tonChain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton chain: %w", err)
	}

	ccipContracts := []targetContract{
		{name: "Router", addr: stateCCIP.Router},
		{name: "OnRamp", addr: stateCCIP.OnRamp},
		{name: "OffRamp", addr: stateCCIP.OffRamp},
		{name: "FeeQuoter", addr: stateCCIP.FeeQuoter},
	}
	mcmsContracts := []targetContract{
		// TODO: MCMS contracts not found in state, need to be added when MCMS is deployed
		// {name: "OwnerMCMS", addr: stateCCIP.OwnerMCMS},
		// {name: "RMNMCMS", addr: stateCCIP.RMNMCMS},
	}
	targetContracts := make([]targetContract, 0, len(ccipContracts)+len(mcmsContracts))

	switch *in.Target {
	case TARGET_ALL:
		targetContracts = append(targetContracts, ccipContracts...)
		targetContracts = append(targetContracts, mcmsContracts...)
	case TARGET_CCIP:
		targetContracts = append(targetContracts, ccipContracts...)
	case TARGET_MCMS:
		targetContracts = append(targetContracts, mcmsContracts...)
	default:
		return nil, fmt.Errorf("invalid target: %d", *in.Target)
	}

	amount, err := tlb.FromTON(in.Amount)
	if err != nil {
		return nil, fmt.Errorf("failed to parse amount: %w", err)
	}
	fundingRequests, err := func() ([]tlb.InternalMessage, error) {
		if in.Mode == FUND_MODE_EXACT_AMOUNT {
			return prepareTransfers(targetContracts, amount)
		}
		return prepareTopUps(context.TODO(), amount, targetContracts, tonChain)
	}()
	if err != nil {
		return nil, fmt.Errorf("failed to generate funding requests: %w", err)
	}

	return tlbe.ManyCellsFrom(fundingRequests)
}

type targetContract struct {
	name string
	addr address.Address
}

func prepareTransfers(targetContracts []targetContract, amount tlb.Coins) ([]tlb.InternalMessage, error) {
	requests := make([]tlb.InternalMessage, 0, len(targetContracts))
	for _, contract := range targetContracts {
		if contract.addr.IsAddrNone() {
			continue
		}

		requests = append(requests, tlb.InternalMessage{
			Bounce:  true,
			Amount:  amount,
			DstAddr: &contract.addr,
			Body:    &cell.Cell{},
		})
	}
	return requests, nil
}

func prepareTopUps(ctx context.Context, targetAmount tlb.Coins, targetContracts []targetContract, tonChain cldf_ton.Chain) ([]tlb.InternalMessage, error) {
	requests := make([]tlb.InternalMessage, 0, len(targetContracts))
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
			fmt.Printf("Contract %s (%s) already has balance %s greater than or equal to target amount %s, skipping funding\n", contract.name, contract.addr.String(), contractBalance.String(), targetAmount.String())
			continue
		}
		amount, err := targetAmount.Sub(&contractBalance)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate top-up amount for contract %s: %w", contract.name, err)
		}

		requests = append(requests, tlb.InternalMessage{
			Bounce:  true,
			Amount:  *amount,
			DstAddr: &contract.addr,
			Body:    &cell.Cell{},
		})
	}
	return requests, nil
}
