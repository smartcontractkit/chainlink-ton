package deployment

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"testing"
	"time"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"

	ton_ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink/deployment/environment/memory"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap/zapcore"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
)

func TestDeploy(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    1,
		TonChains: 1,
	})

	// Get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet
	t.Log("Deployer: ", deployer.Address().String())
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	// memory environment doesn't block on funding so changesets can execute before the env is fully ready, manually call fund so we block here
	test_utils.FundWallets(t, tonChain.Client, []*address.Address{deployer.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
	time.Sleep(5 * time.Second)

	cs := commonchangeset.Configure(ton_ops.DeployCCIPContracts{}, ton_ops.DeployChainContractsConfig(t, env, chainSelector, sequence.ContractsLocalVersion, hash.CRC32("github.com/smartcontractkit/chainlink-ton/integration-tests/deployment/cs_test.TestDeploy")))

	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// TODO: LINK token deployment
	linkAddr := ton_ops.TonTokenAddr

	tonDefinition := config.ChainDefinition{
		ConnectionConfig: config.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			ton_ops.TonTokenAddr.String(): big.NewInt(99),
		},
		FeeQuoterDestChainConfig: ton_ops.TonFeeQuoterDestChainConfig,
		// TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{},
	}
	evmDefinition := config.ChainDefinition{
		Selector:                 evmSelector,
		GasPrice:                 big.NewInt(1e17),
		TokenPrices:              map[string]*big.Int{},
		FeeQuoterDestChainConfig: ton_ops.EvmFeeQuoterDestChainConfig,
		ConnectionConfig: config.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
	}

	// TON->EVM
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			Lanes: []config.LaneConfig{
				{
					Source:     tonDefinition,
					Dest:       evmDefinition,
					IsDisabled: false,
				},
			},
			TestRouter: false,
		}),
	})
	require.NoError(t, err, "failed to add lane")

	// EVM->TON
	onRamp := []byte{1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99}
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			Lanes: []config.LaneConfig{
				{
					Source:        evmDefinition,
					Dest:          tonDefinition,
					IsDisabled:    false,
					OnRampVersion: []byte{1, 6, 1},
					OnRamp:        onRamp,
				},
			},
			TestRouter: false,
		}),
	})
	require.NoError(t, err, "failed to add lane")

	signers := [][]byte{
		{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1},
		{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
		{3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3},
		{4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4},
	}
	transmitters := [][]byte{
		{0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1},
		{0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
		{0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3},
		{0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4},
	}
	configDigest := [32]byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.SetOCR3Config{}, ton_ops.SetOCR3OffRampConfig{
			RemoteChainSels: []uint64{tonChain.Selector},
			Configs: map[operation.PluginType]operation.OCR3ConfigArgs{
				operation.PluginTypeCCIPCommit: {
					ConfigDigest:                   configDigest,
					PluginType:                     operation.PluginTypeCCIPCommit, // maybe map is redundant? make it an array
					F:                              1,
					IsSignatureVerificationEnabled: true,
					Signers:                        signers,
					Transmitters:                   transmitters,
				},
				operation.PluginTypeCCIPExec: {
					ConfigDigest:                   [32]byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
					PluginType:                     operation.PluginTypeCCIPExec, // maybe map is redundant? make it an array
					F:                              1,
					IsSignatureVerificationEnabled: false,
					Signers:                        signers,
					Transmitters:                   transmitters,
				},
			},
		}),
	})
	require.NoError(t, err, "failed to set ocr3 config")

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- TON Accessor tests
	lpCfg := logpoller.DefaultConfigSet
	filterStore := inmemorystore.NewFilterStore()
	opts := &logpoller.ServiceOptions{
		Config:   lpCfg,
		Filters:  filterStore,
		TxLoader: account.NewTxLoader(lggr, clientProvider, lpCfg.PageSize),
		TxParser: txparser.NewTxParser(lggr, filterStore),
		Store:    inmemorystore.NewLogStore(lggr),
	}
	lp := logpoller.NewService(lggr,
		clientProvider,
		opts,
	)
	addrCodec := codec.NewAddressCodec()
	accessor, err := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, err)

	ctx := t.Context()
	routerAddr := state[chainSelector].Router
	rawRouterAddr, err := addrCodec.AddressStringToBytes(routerAddr.String())
	require.NoError(t, err)
	onRampAddr := state[chainSelector].OnRamp
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	offRampAddr := state[chainSelector].OffRamp
	rawOffRampAddr, err := addrCodec.AddressStringToBytes(offRampAddr.String())
	require.NoError(t, err)
	feeQuoterAddr := state[chainSelector].FeeQuoter
	rawFeeQuoterAddr, err := addrCodec.AddressStringToBytes(feeQuoterAddr.String())
	require.NoError(t, err)
	rawLinkAddr, err := addrCodec.AddressStringToBytes(linkAddr.String())
	require.NoError(t, err)
	// <Verify receiver address>
	receiverAddr := state[chainSelector].ReceiverAddress
	_, err = addrCodec.AddressStringToBytes(receiverAddr.String())
	require.NoError(t, err)
	mc, err := tonChain.Client.GetMasterchainInfo(ctx)
	require.NoError(t, err)
	getOfframpAddressResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &receiverAddr, "getOfframpAddress")
	require.NoError(t, err)
	shouldBeOffRampAddress := getOfframpAddressResponse.MustSlice(0).MustLoadAddr()
	require.Equal(t, offRampAddr.String(), shouldBeOffRampAddress.String())
	// </Verify receiver address>
	rawDeployerAddr, err := addrCodec.AddressStringToBytes(deployer.WalletAddress().String())
	require.NoError(t, err)

	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOffRamp, rawOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	t.Run("GetConfig", func(t *testing.T) {
		// destination
		config, sourceChainConfigs, err := accessor.GetAllConfigsLegacy(ctx, ccipocr3.ChainSelector(chainSelector), []ccipocr3.ChainSelector{ccipocr3.ChainSelector(evmSelector)})
		require.NoError(t, err)
		require.Equal(t, ccipocr3.OfframpConfig{
			CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{
				OCRConfig: ccipocr3.OCRConfig{
					ConfigInfo: ccipocr3.ConfigInfo{
						ConfigDigest:                   configDigest,
						F:                              1,
						N:                              4,
						IsSignatureVerificationEnabled: true,
					},
					Signers:      signers,
					Transmitters: transmitters,
				},
			},
			ExecLatestOCRConfig: ccipocr3.OCRConfigResponse{
				OCRConfig: ccipocr3.OCRConfig{
					ConfigInfo: ccipocr3.ConfigInfo{
						ConfigDigest:                   configDigest,
						F:                              1,
						N:                              0,
						IsSignatureVerificationEnabled: false,
					},
					Signers:      [][]byte{},
					Transmitters: transmitters,
				},
			},
			StaticConfig: ccipocr3.OffRampStaticChainConfig{
				ChainSelector:        ccipocr3.ChainSelector(tonChain.Selector),
				GasForCallExactCheck: 0,
				RmnRemote:            nil,
				TokenAdminRegistry:   nil,
				NonceManager:         nil,
			},
			DynamicConfig: ccipocr3.OffRampDynamicChainConfig{
				FeeQuoter:                               rawFeeQuoterAddr,
				PermissionLessExecutionThresholdSeconds: 0,
				IsRMNVerificationDisabled:               true,
				MessageInterceptor:                      nil,
			},
		}, config.Offramp)
		require.Equal(t, map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig{
			ccipocr3.ChainSelector(evmSelector): {
				Router:                    rawRouterAddr,
				IsEnabled:                 true,
				IsRMNVerificationDisabled: true,
				MinSeqNr:                  1,
				OnRamp:                    onRamp,
			},
		}, sourceChainConfigs)

		// source
		config, _, err = accessor.GetAllConfigsLegacy(ctx, ccipocr3.ChainSelector(evmSelector), []ccipocr3.ChainSelector{ccipocr3.ChainSelector(chainSelector)})
		require.NoError(t, err)
		require.Equal(t, ccipocr3.OnRampConfig{
			DynamicConfig: ccipocr3.GetOnRampDynamicConfigResponse{
				DynamicConfig: ccipocr3.OnRampDynamicConfig{
					FeeQuoter:              rawFeeQuoterAddr,
					ReentrancyGuardEntered: false,
					MessageInterceptor:     []byte{},
					FeeAggregator:          rawDeployerAddr,
					AllowListAdmin:         rawDeployerAddr,
				},
			},
			DestChainConfig: ccipocr3.OnRampDestChainConfig{
				SequenceNumber:   0,
				AllowListEnabled: false,
				Router:           rawRouterAddr,
			},
		}, config.OnRamp)
	})

	t.Run("GetExpectedNextSequenceNumber", func(t *testing.T) {
		seqNum, err := accessor.GetExpectedNextSequenceNumber(ctx, ccipocr3.ChainSelector(evmSelector))
		require.NoError(t, err)
		require.Equal(t, ccipocr3.SeqNum(1), seqNum)
	})

	t.Run("GetTokenPriceUSD", func(t *testing.T) {
		timestampedPrice, err := accessor.GetTokenPriceUSD(ctx, rawLinkAddr)
		require.NoError(t, err)
		require.Equal(t, big.NewInt(99), timestampedPrice.Value)
	})

	t.Run("GetFeeQuoterDestChainConfig", func(t *testing.T) {
		config, err := accessor.GetFeeQuoterDestChainConfig(ctx, ccipocr3.ChainSelector(evmSelector))
		require.NoError(t, err)
		// v1_6.DefaultFeeQuoterDestChainConfig()
		require.Equal(t, ccipocr3.FeeQuoterDestChainConfig{
			IsEnabled:                         true,
			MaxNumberOfTokensPerMsg:           10,
			MaxDataBytes:                      30_000,
			MaxPerMsgGasLimit:                 3_000_000,
			DestGasOverhead:                   300_000,
			DestGasPerPayloadByteBase:         16,
			DestGasPerPayloadByteHigh:         40,
			DestGasPerPayloadByteThreshold:    3000,
			DestDataAvailabilityOverheadGas:   100,
			DestGasPerDataAvailabilityByte:    16,
			DestDataAvailabilityMultiplierBps: 1,
			ChainFamilySelector:               [4]byte{0x28, 0x12, 0xd5, 0x2c},
			EnforceOutOfOrder:                 false,
			DefaultTokenFeeUSDCents:           25,
			DefaultTokenDestGasOverhead:       90_000,
			DefaultTxGasLimit:                 200_000,
			GasMultiplierWeiPerEth:            11e17,
			GasPriceStalenessThreshold:        0,
			NetworkFeeUSDCents:                10,
		}, config)
	})

	t.Run("StateView", func(t *testing.T) {
		generatedView, err := state[chainSelector].GenerateView(&env, chainSelector, "-1")
		require.NoError(t, err)
		require.Equal(t, "-1", generatedView.ChainID)
		require.Equal(t, chainSelector, generatedView.ChainSelector)
		onRampView, exit := generatedView.OnRamp[onRampAddr.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, onRampAddr, *onRampView.Address)

		routerView, exit := generatedView.Router[routerAddr.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, routerAddr, *routerView.Address)

		feeQuoterView, exit := generatedView.FeeQuoter[feeQuoterAddr.String()]
		require.True(t, exit, "feeQuoter view not found")
		require.Equal(t, feeQuoterAddr, *feeQuoterView.Address)
		destConfig, exist := feeQuoterView.DestChainConfig[evmSelector]
		require.True(t, exist, "feeQuoter view dest config not found")
		require.True(t, destConfig.IsEnabled)
		require.Equal(t, uint16(10), destConfig.MaxNumberOfTokensPerMsg)
		require.Equal(t, uint32(3000000), destConfig.MaxPerMsgGasLimit)

		offRampView, exit := generatedView.OffRamp[offRampAddr.String()]
		require.True(t, exit, "offRamp view not found")
		require.Equal(t, offRampAddr, *offRampView.Address)
		data, err := json.MarshalIndent(generatedView, "", "  ")
		require.NoError(t, err)
		fmt.Print("JSON encoded TON state view:\n" + string(data))
	})
}
