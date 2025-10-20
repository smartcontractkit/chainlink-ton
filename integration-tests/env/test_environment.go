package env

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"go.uber.org/zap/zapcore"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf_evm_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/evm/provider"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/evm/provider/rpcclient"
	cldf_ton_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
)

const DEFAULT_TON_WALLET_VERSION = "V5R1"
const LOCAL_ENV_CONFIF_FILE = "local-env.toml"
const TESTNET_ENV_CONFIF_FILE = "testnet-env.toml"
const DEFAULT_FUND_AMOUNT_TON = "1000"

type EnvironmentType int

const (
	CTF EnvironmentType = iota
	LOCAL
	TESTNET
	CUSTOM
)

type ChainsEnvironmentConfig struct {
	EVMChains int
	TONChains int
}

type TestEnvironmentBuilder struct {
	Logger                  logger.Logger
	Type                    EnvironmentType
	ChainsEnvironmentConfig ChainsEnvironmentConfig
	EnvConfigFile           string
}

func NewTestEnvironmentBuilder(lggr logger.Logger) *TestEnvironmentBuilder {
	return &TestEnvironmentBuilder{Logger: lggr}
}

func (b *TestEnvironmentBuilder) CTF() *TestEnvironmentBuilder {
	b.Type = CTF
	return b
}

func (b *TestEnvironmentBuilder) Local() *TestEnvironmentBuilder {
	b.Type = LOCAL
	b.EnvConfigFile = LOCAL_ENV_CONFIF_FILE
	return b
}

func (b *TestEnvironmentBuilder) Testnet() *TestEnvironmentBuilder {
	b.Type = TESTNET
	b.EnvConfigFile = TESTNET_ENV_CONFIF_FILE
	return b
}

func (b *TestEnvironmentBuilder) Custom(envConfigFile string) *TestEnvironmentBuilder {
	b.Type = CUSTOM
	b.EnvConfigFile = envConfigFile
	return b
}

func (b *TestEnvironmentBuilder) WithTON() *TestEnvironmentBuilder {
	b.ChainsEnvironmentConfig.TONChains = 1
	return b
}

func (b *TestEnvironmentBuilder) WithEVM() *TestEnvironmentBuilder {
	b.ChainsEnvironmentConfig.EVMChains = 1
	return b
}

func (b *TestEnvironmentBuilder) Build(t *testing.T) (cldf.Environment, error) {
	var (
		env cldf.Environment
		err error
	)

	switch b.Type {
	case CTF:
		env, err = b.newCTFBasedEnvironment(t)
	case LOCAL, TESTNET, CUSTOM:
		env, err = b.newConfigFileBasedEnvironment(t)
	default:
		env, err = cldf.Environment{}, fmt.Errorf("unsupported environment type: %d", b.Type)
	}

	if err != nil {
		return cldf.Environment{}, err
	}

	// Only do this when using my local ton.
	if b.Type == CTF || b.Type == LOCAL {
		for _, chain := range env.BlockChains.TonChains() {
			test_utils.FundWallets(t, chain.Client, []*address.Address{chain.WalletAddress}, []tlb.Coins{tlb.MustFromTON(DEFAULT_FUND_AMOUNT_TON)})
			time.Sleep(5 * time.Second)
		}
	}

	return env, err
}

func (b *TestEnvironmentBuilder) newCTFBasedEnvironment(t *testing.T) (cldf.Environment, error) {
	env := memory.NewMemoryEnvironment(t, b.Logger, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    b.ChainsEnvironmentConfig.EVMChains,
		TonChains: b.ChainsEnvironmentConfig.TONChains,
	})

	return env, nil
}

func (b *TestEnvironmentBuilder) newConfigFileBasedEnvironment(t *testing.T) (cldf.Environment, error) {
	providers := make([]cldf_chain.BlockChain, 0)
	selectors := make([]uint64, 0)

	config, err := LoadEnvironmentConfig(b.EnvConfigFile)
	if err != nil {
		return cldf.Environment{}, err
	}

	// TON Testnet
	for _, chain := range config.Onchain.TonBlockchains {
		tonChainId := chain.ChainId
		chainDetails, err := chain_selectors.GetChainDetailsByChainIDAndFamily(fmt.Sprint(tonChainId), chain_selectors.FamilyTon)
		if err != nil {
			return cldf.Environment{}, err
		}

		tonChainSelector := chainDetails.ChainSelector
		selectors = append(selectors, tonChainSelector)

		var (
			deployerSignerGen cldf_ton_provider.PrivateKeyGenerator
		)

		walletVersion := DEFAULT_TON_WALLET_VERSION
		deployerSignerGen = cldf_ton_provider.PrivateKeyRandom()

		if chain.WalletVersion != "" {
			walletVersion = chain.WalletVersion
		}

		if chain.DeployerKey != "" {
			deployerSignerGen = cldf_ton_provider.PrivateKeyFromRaw(chain.DeployerKey)
		}

		tonProvider, err := cldf_ton_provider.NewRPCChainProvider(
			tonChainSelector,
			cldf_ton_provider.RPCChainProviderConfig{
				HTTPURL:           chain.HTTPURL,
				WalletVersion:     cldf_ton_provider.WalletVersion(walletVersion),
				DeployerSignerGen: deployerSignerGen,
			},
		).Initialize(t.Context())

		if err != nil {
			return cldf.Environment{}, err
		}
		providers = append(providers, tonProvider)

	}

	for _, chain := range config.Onchain.EvmBlockchains {
		evmChainId := chain.ChainId
		chainDetails, err := chain_selectors.GetChainDetailsByChainIDAndFamily(fmt.Sprint(evmChainId), chain_selectors.FamilyEVM)
		if err != nil {
			return cldf.Environment{}, err
		}

		evmChainSelector := chainDetails.ChainSelector

		var (
			deployerSignerGen cldf_evm_provider.SignerGenerator
		)

		deployerSignerGen = cldf_evm_provider.TransactorRandom()

		if chain.DeployerKey != "" {
			deployerSignerGen = cldf_evm_provider.TransactorFromRaw(chain.DeployerKey)
		}

		evmProvider, err := cldf_evm_provider.NewRPCChainProvider(
			evmChainSelector,
			cldf_evm_provider.RPCChainProviderConfig{
				DeployerTransactorGen: deployerSignerGen,
				RPCs: []rpcclient.RPC{
					{
						Name:               chain.Name,
						WSURL:              chain.WSSURL,
						HTTPURL:            chain.HTTPURL,
						PreferredURLScheme: rpcclient.URLSchemePreferenceHTTP,
					},
				},
				ConfirmFunctor: cldf_evm_provider.ConfirmFuncGeth(1 * time.Minute),
			},
		).Initialize(t.Context())

		if err != nil {
			return cldf.Environment{}, err
		}
		providers = append(providers, evmProvider)

	}

	blockchains := cldf_chain.NewBlockChainsFromSlice(providers)
	bundle := operations.NewBundle(
		func() context.Context { return context.Background() },
		b.Logger,
		operations.NewMemoryReporter(),
	)

	env := cldf.Environment{
		GetContext:        func() context.Context { return context.Background() },
		Logger:            b.Logger,
		BlockChains:       blockchains,
		DataStore:         datastore.NewMemoryDataStore().Seal(),
		ExistingAddresses: cldf.NewMemoryAddressBook(),
		OperationsBundle:  bundle,
	}

	return env, nil
}
