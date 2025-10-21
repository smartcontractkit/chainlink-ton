package env

import (
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"go.uber.org/zap/zapcore"

	chainselectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfevm "github.com/smartcontractkit/chainlink-deployments-framework/chain/evm/provider"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/evm/provider/rpcclient"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"

	testutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

const (
	DefaultTonWalletVersion = "V5R1"
	LocalEnvConfigFile      = "local-env.toml"
	TestnetEnvConfigFile    = "testnet-env.toml"
	DefaultFundAmountTon    = "1000"
)

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
	b.EnvConfigFile = LocalEnvConfigFile
	return b
}

func (b *TestEnvironmentBuilder) Testnet() *TestEnvironmentBuilder {
	b.Type = TESTNET
	b.EnvConfigFile = TestnetEnvConfigFile
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

	// Only fund wallets when using my-local-ton.
	if b.Type == CTF || b.Type == LOCAL {
		for _, chain := range env.BlockChains.TonChains() {
			testutils.FundWallets(t, chain.Client, []*address.Address{chain.WalletAddress}, []tlb.Coins{tlb.MustFromTON(DefaultFundAmountTon)})
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
	providers := make([]cldfchain.BlockChain, 0)

	config, err := LoadEnvironmentConfig(b.EnvConfigFile)
	if err != nil {
		return cldf.Environment{}, err
	}

	// TON Testnet
	for _, chain := range config.Onchain.TonBlockchains {
		tonChainID := chain.ChainID
		chainDetails, err := chainselectors.GetChainDetailsByChainIDAndFamily(strconv.Itoa(tonChainID), chainselectors.FamilyTon)
		if err != nil {
			return cldf.Environment{}, err
		}

		tonChainSelector := chainDetails.ChainSelector

		var (
			deployerSignerGen cldfton.PrivateKeyGenerator
		)

		walletVersion := DefaultTonWalletVersion
		deployerSignerGen = cldfton.PrivateKeyRandom()

		if chain.WalletVersion != "" {
			walletVersion = chain.WalletVersion
		}

		if chain.DeployerKey != "" {
			deployerSignerGen = cldfton.PrivateKeyFromRaw(chain.DeployerKey)
		}

		tonProvider, err := cldfton.NewRPCChainProvider(
			tonChainSelector,
			cldfton.RPCChainProviderConfig{
				HTTPURL:           chain.HTTPURL,
				WalletVersion:     cldfton.WalletVersion(walletVersion),
				DeployerSignerGen: deployerSignerGen,
			},
		).Initialize(t.Context())

		if err != nil {
			return cldf.Environment{}, err
		}

		providers = append(providers, tonProvider)
	}

	for _, chain := range config.Onchain.EvmBlockchains {
		evmChainID := chain.ChainID
		chainDetails, err := chainselectors.GetChainDetailsByChainIDAndFamily(strconv.Itoa(evmChainID), chainselectors.FamilyEVM)
		if err != nil {
			return cldf.Environment{}, err
		}

		evmChainSelector := chainDetails.ChainSelector

		var (
			deployerSignerGen cldfevm.SignerGenerator
		)

		deployerSignerGen = cldfevm.TransactorRandom()

		if chain.DeployerKey != "" {
			deployerSignerGen = cldfevm.TransactorFromRaw(chain.DeployerKey)
		}

		evmProvider, err := cldfevm.NewRPCChainProvider(
			evmChainSelector,
			cldfevm.RPCChainProviderConfig{
				DeployerTransactorGen: deployerSignerGen,
				RPCs: []rpcclient.RPC{
					{
						Name:               chain.Name,
						WSURL:              chain.WSSURL,
						HTTPURL:            chain.HTTPURL,
						PreferredURLScheme: rpcclient.URLSchemePreferenceHTTP,
					},
				},
				ConfirmFunctor: cldfevm.ConfirmFuncGeth(1 * time.Minute),
			},
		).Initialize(t.Context())

		if err != nil {
			return cldf.Environment{}, err
		}

		providers = append(providers, evmProvider)
	}

	blockchains := cldfchain.NewBlockChainsFromSlice(providers)
	bundle := operations.NewBundle(
		t.Context,
		b.Logger,
		operations.NewMemoryReporter(),
	)

	env := cldf.Environment{
		GetContext:        t.Context,
		Logger:            b.Logger,
		BlockChains:       blockchains,
		DataStore:         datastore.NewMemoryDataStore().Seal(),
		ExistingAddresses: cldf.NewMemoryAddressBook(),
		OperationsBundle:  bundle,
	}

	return env, nil
}
