package ccipton

import (
	"context"
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/simple_node_set"
	"github.com/xssnick/tonutils-go/address"

	tonseqs "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (m *CCIP16TON) PreDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	return nil
}

func (m *CCIP16TON) PostDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	const TONtoUSD = 2                 // Example value
	const TONtoNanoTON = 1e9           // Smallest denomination
	const TokenPriceBaseAmount = 1e18  // Defined for `TokenPrices`
	var USDDecimals = big.NewInt(1e18) // Defined for `TokenPrices`
	var TONBaseAmountTokenPrice = big.NewInt(int64(TONtoUSD * (TokenPriceBaseAmount / TONtoNanoTON)))
	tonTokenPrice := big.NewInt(0).Mul(TONBaseAmountTokenPrice, USDDecimals)
	updateConfig := operation.UpdateFeeQuoterPricesInput{
		TokenPrices: map[string]*big.Int{
			tvm.TonTokenAddr.String(): tonTokenPrice,
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
	a := &tonseqs.TonAdapter{}
	tonChain := env.BlockChains.TonChains()[selector]
	fqAddr, err := a.GetFQAddress(env.DataStore, selector)
	if err != nil {
		return fmt.Errorf("failed to get router address: %w", err)
	}
	addrCodec := codec.NewAddressCodec()
	rawFq, err := addrCodec.AddressBytesToString(fqAddr)
	if err != nil {
		return fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}
	fqContractAddress, err := address.ParseAddr(rawFq)
	if err != nil {
		return fmt.Errorf("failed to parse router address: %w", err)
	}
	deps := config.CCIPDeps{
		TonChain: tonChain,
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			tonChain.Selector: {
				FeeQuoter: *fqContractAddress,
			},
		},
	}
	updatePricesReport, err := operations.ExecuteOperation(bundle, operation.UpdateFeeQuoterPricesOp, deps, updateConfig)
	if err != nil {
		return fmt.Errorf("failed to update feequoter prices: %w", err)
	}
	txs := updatePricesReport.Output
	// Execute the txs || MCMS proposals
	err = helpers.ExecuteTransactions(bundle.GetContext(), bundle.Logger, deps.TonChain.Client, deps.TonChain.Wallet, txs)
	if err != nil {
		return fmt.Errorf("failed to execute update feequoter prices txs: %w", err)
	}
	return nil
}
