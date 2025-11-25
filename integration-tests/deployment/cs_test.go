package deployment

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"testing"

	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txloader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
)

func TestDeploy(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Build(t)
	require.NoError(t, err)

	// Get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet
	t.Log("Deployer: ", deployer.WalletAddress().String())
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	// Random contract's ID to avoid collision on subsequence runs of the test against the same chain node
	contractID, err := tonops.RandomUint32()
	require.NoError(t, err)
	cs := commonchangeset.Configure(tonops.DeployCCIPContracts{}, tonops.DeployChainContractsConfig(t, env, chainSelector, sequence.ContractsLocalVersion, contractID))

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// <redeploy>
	// Execute deploy one more time to make sure that no contracts are redeployed
	env, output, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to re-deploy ccip")
	addresses, err := output[0].DataStore.Addresses().Fetch()
	require.NoError(t, err, "failed to get addresses from data store")
	require.Empty(t, addresses, "expected no new addresses on redeploy, got: %v", addresses)
	// </redeploy>

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	linkAddr := state[chainSelector].LinkTokenAddress
	t.Log("Link Token Addr: ", linkAddr.String())

	tonDefinition := config.ChainDefinition{
		ConnectionConfig: config.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			tvm.TonTokenAddr.String(): big.NewInt(99),
			linkAddr.String():         big.NewInt(20),
		},
		FeeQuoterDestChainConfig: tonops.TonFeeQuoterDestChainConfig,
		// TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{},
	}
	evmDefinition := config.ChainDefinition{
		Selector:                 evmSelector,
		GasPrice:                 big.NewInt(1e17),
		TokenPrices:              map[string]*big.Int{},
		FeeQuoterDestChainConfig: tonops.EvmFeeQuoterDestChainConfig,
		ConnectionConfig: config.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
	}

	// TON->EVM
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(tonops.AddTonLanes{}, config.UpdateTonLanesConfig{
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
		commonchangeset.Configure(tonops.AddTonLanes{}, config.UpdateTonLanesConfig{
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
		commonchangeset.Configure(tonops.SetOCR3Config{}, tonops.SetOCR3OffRampConfig{
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

	state, err = tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- TON Accessor tests
	lpCfg := logpoller.DefaultConfigSet
	filterStore := inmemorystore.NewFilterStore("test-chain", lggr)
	opts := &logpoller.ServiceOptions{
		Config:      lpCfg,
		FilterStore: filterStore,
		TxLoader:    txloader.New(lggr, clientProvider),
		LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
	}
	lp := logpoller.NewService(lggr, "test-chain",
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
	getRouterAddressResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &receiverAddr, "getAuthorizedCaller")
	require.NoError(t, err)
	shouldBeRouterAddress := getRouterAddressResponse.MustSlice(0).MustLoadAddr()
	require.Equal(t, routerAddr.String(), shouldBeRouterAddress.String())
	behaviorResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &receiverAddr, "getBehavior")
	require.NoError(t, err)
	currentBehavior, err := behaviorResponse.Int(0)
	require.NoError(t, err)
	require.Equal(t, 0, currentBehavior.Sign())
	// </Verify receiver address>

	// <Verify timelock address>
	timelockAddr := state[chainSelector].Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)
	isInitializedResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err := isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized := rawIsInitialized.Sign() != 0
	require.True(t, isInitialized)
	getProposerResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleProposer)
	require.NoError(t, err)
	getExecutorResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleExecutor)
	require.NoError(t, err)
	getCancellerResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleCanceller)
	require.NoError(t, err)
	getBypasserResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleBaypasser)
	require.NoError(t, err)
	getAdminResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleAdmin)
	require.NoError(t, err)
	shouldBeDeployer1 := getProposerResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer2 := getExecutorResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer3 := getCancellerResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer4 := getBypasserResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer5 := getAdminResponse.MustSlice(0).MustLoadAddr()
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer1.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer2.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer3.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer4.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer5.String())
	// </Verify timelock address>

	rawDeployerAddr, err := addrCodec.AddressStringToBytes(deployer.WalletAddress().String())
	require.NoError(t, err)

	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOffRamp, rawOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	t.Run("FetchTokenPrice", func(t *testing.T) {
		// known token address, price updated during changeset execution
		var tonAddrBytes []byte
		var updates map[ccipocr3.UnknownEncodedAddress]ccipocr3.TimestampedUnixBig
		addr := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99")
		tonAddrBytes, err = addrCodec.AddressStringToBytes(addr.String())
		require.NoError(t, err)
		updates, err = accessor.GetFeeQuoterTokenUpdates(ctx, []ccipocr3.UnknownAddress{tonAddrBytes})
		if err != nil {
			return
		}

		require.NoError(t, err)
		require.NotNil(t, updates[ccipocr3.UnknownEncodedAddress(addr.String())])
		require.Equal(t, int64(99), updates[ccipocr3.UnknownEncodedAddress(addr.String())].Value.Int64())

		// random address, should return empty token price
		addr = address.MustParseAddr("kQDpbpFeXR2DGPQcAY_Fr8b1owx_K6LbvRoz9Ct-JJv4JkPH")
		tonAddrBytes, err = addrCodec.AddressStringToBytes(addr.String())
		require.NoError(t, err)
		updates, err = accessor.GetFeeQuoterTokenUpdates(ctx, []ccipocr3.UnknownAddress{tonAddrBytes})
		require.NoError(t, err)
		bounceableAddr, err2 := addrCodec.AddressBytesToString(tonAddrBytes)
		require.NoError(t, err2)
		update := updates[ccipocr3.UnknownEncodedAddress(bounceableAddr)]
		require.NotNil(t, update)
		require.Equal(t, int64(0), update.Value.Int64())
	})

	t.Run("GetChainFeePriceUpdate", func(t *testing.T) {
		// evm chain selector
		var feePriceUpdate map[ccipocr3.ChainSelector]ccipocr3.TimestampedUnixBig
		feePriceUpdate, err = accessor.GetChainFeePriceUpdate(ctx, []ccipocr3.ChainSelector{ccipocr3.ChainSelector(evmSelector)})
		require.NoError(t, err)
		require.NotEqual(t, "0", feePriceUpdate[ccipocr3.ChainSelector(evmSelector)].Value.String())

		// unknown chain selector, returns default values
		feePriceUpdate, err = accessor.GetChainFeePriceUpdate(ctx, []ccipocr3.ChainSelector{ccipocr3.ChainSelector(1)})
		require.NoError(t, err)
		require.Equal(t, "0", feePriceUpdate[ccipocr3.ChainSelector(1)].Value.String())
	})

	t.Run("ExecuteProposalShouldCatchChangesetError", func(t *testing.T) {
		expectedErrStr := "failed to apply changeset at index 0: transaction failed with exit code: 1000"
		_, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
			commonchangeset.Configure(tonops.SetOCR3Config{}, tonops.SetOCR3OffRampConfig{
				RemoteChainSels: []uint64{tonChain.Selector},
				Configs: map[operation.PluginType]operation.OCR3ConfigArgs{
					operation.PluginTypeCCIPCommit: {
						F: 0, // invalid F, F must be positive or will revert on chain with ERROR_BIG_F_MUST_BE_POSITIVE (1000)
					},
				},
			}),
		})
		require.Error(t, err)
		require.Equal(t, expectedErrStr, err.Error())
	})

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
		require.Equal(t, big.NewInt(20), timestampedPrice.Value)
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
			EnforceOutOfOrder:                 true,
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
		require.Equal(t, chainSelector, offRampView.Config.ChainSelector)
		require.Equal(t, feeQuoterAddr.String(), offRampView.Config.FeeQuoterAddress.String())
		data, err := json.MarshalIndent(generatedView, "", "  ")
		require.NoError(t, err)
		fmt.Print("JSON encoded TON state view:\n" + string(data))
	})
}
