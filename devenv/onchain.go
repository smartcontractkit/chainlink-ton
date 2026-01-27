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

	// Token price constants
	const TONtoUSD = 2                 // Example value (test/dev only)
	const TONtoNanoTON = 1e9           // TON has 9 decimals
	const TokenPriceBaseAmount = 1e18  // Base amount for TokenPrices
	var USDDecimals = big.NewInt(1e18) // USD precision

	// Token prices are normalized to account for token decimals.
	// The formula is: (USD price in 1e18) * (1e18 / 10^tokenDecimals)
	// For TON/LINK with 9 decimals: price * 1e18 * (1e18 / 1e9) = price * 1e27
	// See: deployment/ccip/config/tokenPrice.go:CCIPTokenPrice

	// Calculate TON token price: 2 USD with 9 decimals = 2e27
	var TONBaseAmountTokenPrice = big.NewInt(int64(TONtoUSD * (TokenPriceBaseAmount / TONtoNanoTON)))
	oldTonTokenPrice := big.NewInt(0).Mul(TONBaseAmountTokenPrice, USDDecimals)

	// Calculate LINK token price: 20 USD with 9 decimals = 20e27
	// LINK has 9 decimals on TON, same as TON
	oldLinkTokenPrice := big.NewInt(0).Mul(big.NewInt(20), big.NewInt(1e18))
	oldLinkTokenPrice = big.NewInt(0).Mul(oldLinkTokenPrice, big.NewInt(1e9)) // Scale from 1e18 to 1e27

	tonTokenPrice, err := config.CCIPTokenPrice("2", 9)
	if err != nil {
		return fmt.Errorf("failed to calculate TON token price: %w", err)
	}
	linkTokenPrice, err := config.CCIPTokenPrice("20", 9)
	if err != nil {
		return fmt.Errorf("failed to calculate LINK token price: %w", err)
	}

	if tonTokenPrice.Cmp(oldTonTokenPrice) != 0 || linkTokenPrice.Cmp(oldLinkTokenPrice) != 0 {
		errorStr := fmt.Errorf("Token price calculations should match, but got:\nTON token price: expected %s, got %s\nLINK token price: expected %s, got %s\n", oldTonTokenPrice.String(), tonTokenPrice.String(), oldLinkTokenPrice.String(), linkTokenPrice.String())
		env.Logger.Errorf(errorStr.Error())
		return errorStr
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
