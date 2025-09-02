package deployment

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"

	ton_ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"

	"github.com/xssnick/tonutils-go/address"
	"go.uber.org/zap/zapcore"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
)

func TestDeploy(t *testing.T) {
	t.Parallel()
	// env := setupEnv(t)
	lggr := logger.TestLogger(t)
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

	cs := ton_ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// TODO: LINK token deployment
	linkAddr := ton_ops.TonTokenAddr

	tonDefinition := config.TonChainDefinition{
		ConnectionConfig: v1_6.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[*address.Address]*big.Int{
			ton_ops.TonTokenAddr: big.NewInt(99),
		},
		FeeQuoterDestChainConfig: ton_ops.DefaultFeeQuoterDestChainConfig(true),
		TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{},
	}
	evmDefinition := config.EVMChainDefinition{
		ChainDefinition: v1_6.ChainDefinition{
			Selector:                 evmSelector,
			GasPrice:                 big.NewInt(1e17),
			TokenPrices:              map[common.Address]*big.Int{},
			FeeQuoterDestChainConfig: v1_6.DefaultFeeQuoterDestChainConfig(true),
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
		},
		OnRampVersion: []byte{1, 6, 1},
		OnRamp:        []byte{1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99},
	}

	// TON->EVM
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
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
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
			Lanes: []config.LaneConfig{
				{
					Source:     evmDefinition,
					Dest:       tonDefinition,
					IsDisabled: false,
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
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.SetOCR3Config{}, ton_ops.SetOCR3OffRampConfig{
			RemoteChainSels: []uint64{tonChain.Selector},
			MCMS:            &proposalutils.TimelockConfig{},
			Configs: map[operation.PluginType]operation.OCR3ConfigArgs{
				operation.PluginTypeCCIPCommit: {
					ConfigDigest: []byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},

					PluginType:                     operation.PluginTypeCCIPCommit, // maybe map is redundant? make it an array
					F:                              1,
					IsSignatureVerificationEnabled: false,
					Signers:                        signers,
					Transmitters:                   transmitters,
				},
				operation.PluginTypeCCIPExec: {
					ConfigDigest:                   []byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
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
		Client:   tonChain.Client,
		Filters:  filterStore,
		TxLoader: account.NewTxLoader(tonChain.Client, lggr, lpCfg.PageSize),
		TxParser: txparser.NewTxParser(lggr, filterStore),
		Store:    inmemorystore.NewLogStore(),
	}
	lp := logpoller.NewService(lggr, opts)
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

	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOffRamp, rawOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	t.Run("GetConfig", func(t *testing.T) {
		// destination
		_, sourceChainConfigs, err := accessor.GetAllConfigsLegacy(ctx, ccipocr3.ChainSelector(chainSelector), []ccipocr3.ChainSelector{ccipocr3.ChainSelector(evmSelector)})
		require.NoError(t, err)
		require.Equal(t, map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig{
			ccipocr3.ChainSelector(evmSelector): {
				Router:                    rawRouterAddr,
				IsEnabled:                 true,
				IsRMNVerificationDisabled: true,
				MinSeqNr:                  0,
				OnRamp:                    evmDefinition.OnRamp,
			},
		}, sourceChainConfigs)

		// source
		config, _, err := accessor.GetAllConfigsLegacy(ctx, ccipocr3.ChainSelector(evmSelector), []ccipocr3.ChainSelector{ccipocr3.ChainSelector(chainSelector)})
		require.NoError(t, err)
		require.Equal(t, ccipocr3.OnRampConfig{
			DynamicConfig: ccipocr3.GetOnRampDynamicConfigResponse{
				DynamicConfig: ccipocr3.OnRampDynamicConfig{},
			},
			DestChainConfig: ccipocr3.OnRampDestChainConfig{
				SequenceNumber:   0,
				AllowListEnabled: false,
				Router:           nil,
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
}
