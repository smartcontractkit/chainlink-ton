package ccipton

import (
	"context"
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/simple_node_set"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (m *CCIP16TON) PreDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	return nil
}

func (m *CCIP16TON) PostDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	// load the full CCIP state to get LinkTokenAddress
	stateCCIP, err := state.LoadCCIPOnChainStateUsingDataStore(env.DataStore, selector)
	if err != nil {
		return fmt.Errorf("failed to load CCIP state: %w", err)
	}

	// Calculate TON token price: 2 USD with 9 decimals = 2e27
	tonTokenPrice, err := config.CCIPTokenPrice("2", 9)
	if err != nil {
		return fmt.Errorf("failed to calculate TON token price: %w", err)
	}
	// Calculate LINK token price: 20 USD with 9 decimals = 20e27
	// LINK has 9 decimals on TON, same as TON
	linkTokenPrice, err := config.CCIPTokenPrice("20", 9)
	if err != nil {
		return fmt.Errorf("failed to calculate LINK token price: %w", err)
	}

	updateConfig := operation.UpdateFeeQuoterPricesInput{
		TokenPrices: map[string]*big.Int{
			tvm.TonTokenAddr.String():           tonTokenPrice,
			stateCCIP.LinkTokenAddress.String(): linkTokenPrice,
		},
	}
	bundle := operations.NewBundle(
		//nolint:gocritic //replace the lambda with context.Background()
		func() context.Context { return context.Background() },
		env.Logger,
		operations.NewMemoryReporter(),
	)
	env.OperationsBundle = bundle
	bundle.Logger.Infow("Updating prices on FeeQuoter", "input", updateConfig)
	chain := env.BlockChains.TonChains()[selector]
	dp, err := dep.NewDependencyProvider(
		dep.Provide(chain),
		dep.Provide(stateCCIP),
	)
	if err != nil {
		return fmt.Errorf("failed to create dependency provider: %w", err)
	}

	updatePricesReport, err := operations.ExecuteOperation(bundle, operation.UpdateFeeQuoterPricesOp, dp, updateConfig)
	if err != nil {
		return fmt.Errorf("failed to update feequoter prices: %w", err)
	}
	msgs := updatePricesReport.Output
	// Execute the txs || MCMS proposals
	if len(msgs) != 0 {
		_, err := operations.ExecuteOperation(bundle, ton.SendMessagesRaw, dp, ton.SendMessagesRawInput{Messages: msgs})
		if err != nil {
			return fmt.Errorf("failed to send messages: %w", err)
		}
	}

	return nil
}
