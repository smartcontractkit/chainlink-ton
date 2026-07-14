package ccip

import (
	"bytes"
	"testing"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	tokensapi "github.com/smartcontractkit/chainlink-ccip/deployment/tokens"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
	deployutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
)

func TestTonTokenAdapterRegistered(t *testing.T) {
	t.Parallel()

	adapter, ok := tokensapi.GetTokenAdapterRegistry().GetTokenAdapter(chainselectors.FamilyTon, semver.MustParse("1.6.0"))
	require.True(t, ok, "expected TON token adapter to be registered")
	require.NotNil(t, adapter.DeployToken())
	require.NotNil(t, adapter.DeployTokenPoolForToken())
	require.NotNil(t, adapter.ConfigureTokenForTransfersSequence())
}

func TestTonTokenAdapterDeployTokenAndPool(t *testing.T) {
	t.Parallel()

	lggr := logger.Test(t)
	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	tonSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[tonSelector]
	adapter, ok := tokensapi.GetTokenAdapterRegistry().GetTokenAdapter(chainselectors.FamilyTon, semver.MustParse("1.6.0"))
	require.True(t, ok, "expected TON token adapter to be registered")

	tokenStore := datastore.NewMemoryDataStore()
	b := env.OperationsBundle

	tokenOut, err := operations.ExecuteSequence(b, adapter.DeployToken(), env.BlockChains, tokensapi.DeployTokenInput{
		Name:              "Test Token",
		Symbol:            "TST",
		Decimals:          9,
		ExternalAdmin:     tonChain.WalletAddress.String(),
		CCIPAdmin:         tonChain.WalletAddress.String(),
		Type:              bindings.ShortJettonMinter,
		ChainSelector:     tonSelector,
		ExistingDataStore: tokenStore.Seal(),
	})
	require.NoError(t, err)
	require.Len(t, tokenOut.Output.Addresses, 1)

	tokenRef := tokenOut.Output.Addresses[0]
	tokenRef.Qualifier = "test-token"
	require.Equal(t, datastore.ContractType(bindings.ShortJettonMinter), tokenRef.Type)
	require.NoError(t, tokenStore.Addresses().Add(tokenRef))
	env.DataStore = tokenStore.Seal()

	block, err := tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)
	tokenAddr, err := tonChain.Client.WaitForBlock(block.SeqNo).GetAccount(t.Context(), block, mustParseTONAddr(t, tokenRef.Address))
	require.NoError(t, err)
	require.True(t, tokenAddr.IsActive, "deployed jetton should be active")

	tokenBytes, err := adapter.AddressRefToBytes(tokenRef)
	require.NoError(t, err)
	derivedTokenAddress, err := adapter.DeriveTokenAddress(env, tonSelector, datastore.AddressRef{
		ChainSelector: tonSelector,
		Qualifier:     tokenRef.Qualifier,
	})
	require.NoError(t, err)
	require.Equal(t, tokenRef.Address, derivedTokenAddress)

	decimals, err := adapter.DeriveTokenDecimals(env, tonSelector, tokenRef, tokenBytes)
	require.NoError(t, err)
	require.Equal(t, uint8(9), decimals)

	poolOut, err := operations.ExecuteSequence(b, adapter.DeployTokenPoolForToken(), env.BlockChains, tokensapi.DeployTokenPoolInput{
		TokenRef: &datastore.AddressRef{
			Address:       tokenRef.Address,
			ChainSelector: tokenRef.ChainSelector,
			Type:          tokenRef.Type,
			Version:       tokenRef.Version,
			Qualifier:     tokenRef.Qualifier,
		},
		TokenPoolQualifier: "test-pool",
		PoolType:           bindings.ShortMockTokenPool,
		TokenPoolVersion:   semver.MustParse("1.6.0"),
		ChainSelector:      tonSelector,
		ExistingDataStore:  env.DataStore,
	})
	require.NoError(t, err)
	require.Len(t, poolOut.Output.Addresses, 1)

	poolRef := poolOut.Output.Addresses[0]
	require.Equal(t, datastore.ContractType(bindings.ShortMockTokenPool), poolRef.Type)
	require.Equal(t, "test-pool", poolRef.Qualifier)

	block, err = tonChain.Client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)
	poolAddr, err := tonChain.Client.WaitForBlock(block.SeqNo).GetAccount(t.Context(), block, mustParseTONAddr(t, poolRef.Address))
	require.NoError(t, err)
	require.True(t, poolAddr.IsActive, "deployed token pool should be active")

	counterpart, err := adapter.DeriveTokenPoolCounterpart(env, tonSelector, tokenBytes, tokenBytes)
	require.NoError(t, err)
	require.True(t, bytes.Equal(tokenBytes, counterpart))
}

// TestTonTokenAdapterConfigureTokenForTransfers exercises the full
// deploy-jetton → deploy-pool → register-with-router flow. It requires a live
// Router + TokenRegistryDeployment on chain, so CCIP contracts are deployed first.
func TestTonTokenAdapterConfigureTokenForTransfers(t *testing.T) {
	t.Parallel()

	lggr := logger.Test(t)
	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	tonSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[tonSelector]

	contractID, err := tonops.RandomUint32()
	require.NoError(t, err)
	cs := commonchangeset.Configure(
		tonops.DeployCCIPContracts{},
		tonops.DeployChainContractsConfig(t, env, tonSelector, deployutils.ContractsVersionLocal, contractID),
	)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	adapter, ok := tokensapi.GetTokenAdapterRegistry().GetTokenAdapter(chainselectors.FamilyTon, semver.MustParse("1.6.0"))
	require.True(t, ok, "expected TON token adapter to be registered")

	b := env.OperationsBundle

	tokenOut, err := operations.ExecuteSequence(b, adapter.DeployToken(), env.BlockChains, tokensapi.DeployTokenInput{
		Name:              "Test Token",
		Symbol:            "TST",
		Decimals:          9,
		ExternalAdmin:     tonChain.WalletAddress.String(),
		CCIPAdmin:         tonChain.WalletAddress.String(),
		Type:              bindings.ShortJettonMinter,
		ChainSelector:     tonSelector,
		ExistingDataStore: env.DataStore,
	})
	require.NoError(t, err)
	require.Len(t, tokenOut.Output.Addresses, 1)

	tokenRef := tokenOut.Output.Addresses[0]
	tokenRef.Qualifier = "test-token"

	poolOut, err := operations.ExecuteSequence(b, adapter.DeployTokenPoolForToken(), env.BlockChains, tokensapi.DeployTokenPoolInput{
		TokenRef: &datastore.AddressRef{
			Address:       tokenRef.Address,
			ChainSelector: tokenRef.ChainSelector,
			Type:          tokenRef.Type,
			Version:       tokenRef.Version,
			Qualifier:     tokenRef.Qualifier,
		},
		TokenPoolQualifier: "test-pool",
		PoolType:           bindings.ShortMockTokenPool,
		TokenPoolVersion:   semver.MustParse("1.6.0"),
		ChainSelector:      tonSelector,
		ExistingDataStore:  env.DataStore,
	})
	require.NoError(t, err)
	require.Len(t, poolOut.Output.Addresses, 1)
	poolRef := poolOut.Output.Addresses[0]

	_, err = operations.ExecuteSequence(b, adapter.ConfigureTokenForTransfersSequence(), env.BlockChains, tokensapi.ConfigureTokenForTransfersInput{
		ChainSelector:     tonSelector,
		TokenPoolAddress:  poolRef.Address,
		TokenRef:          tokenRef,
		ExistingDataStore: env.DataStore,
	})
	require.NoError(t, err, "expected ConfigureTokenForTransfersSequence to succeed against on-chain Router")
}

func mustParseTONAddr(t *testing.T, raw string) *address.Address {
	t.Helper()

	addr, err := address.ParseAddr(raw)
	require.NoError(t, err)
	return addr
}
