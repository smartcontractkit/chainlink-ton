package deployment

import (
	"context"
	"fmt"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	cs "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf_ton_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"go.uber.org/zap/zapcore"
	"testing"
)

func NewMemoryEnvironment(t *testing.T,
	lggr logger.Logger, local bool) (cldf.Environment, error) {

	// If CI
	if !local {
		env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
			Chains:    1,
			TonChains: 1,
		})

		return env, nil
	}

	// If local
	providers := make([]cldf_chain.BlockChain, 0)
	selectors := make([]uint64, 0)
	// EVM one
	chainID := cs.TON_TESTNET.ChainID
	rpcHTTPURL := "liteserver://E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY=@127.0.0.1:40004"

	d, err := cs.GetChainDetailsByChainIDAndFamily(fmt.Sprint(chainID), cs.FamilyTon)
	if err != nil {
		return cldf.Environment{}, err
	}

	selectors = append(selectors, d.ChainSelector)

	p, err := cldf_ton_provider.NewRPCChainProvider(
		d.ChainSelector,
		cldf_ton_provider.RPCChainProviderConfig{
			HTTPURL:           rpcHTTPURL,
			WalletVersion:     "V5R1",
			DeployerSignerGen: cldf_ton_provider.PrivateKeyRandom(),
		},
	).Initialize(t.Context())
	if err != nil {
		return cldf.Environment{}, err
	}
	providers = append(providers, p)

	blockchains := cldf_chain.NewBlockChainsFromSlice(providers)

	bundle := operations.NewBundle(
		func() context.Context { return context.Background() },
		lggr,
		operations.NewMemoryReporter(),
	)

	env := cldf.Environment{
		GetContext:        func() context.Context { return context.Background() },
		Logger:            lggr,
		BlockChains:       blockchains,
		DataStore:         datastore.NewMemoryDataStore().Seal(),
		ExistingAddresses: cldf.NewMemoryAddressBook(),
		OperationsBundle:  bundle,
	}

	return env, nil
}
