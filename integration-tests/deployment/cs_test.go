package deployment

import (
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	ton_ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

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

const ChainSelEVMTest90000001 = 909606746561742123

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

	// memory environment doesn't block on funding so changesets can execute before the env is fully ready, manually call fund so we block here
	test_utils.FundWallets(t, tonChain.Client, []*address.Address{deployer.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
	time.Sleep(5 * time.Second)

	cs := ton_ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// TODO: LINK token deployment
	linkAddr := ton_ops.TonTokenAddr

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ton_ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
			Lanes: []config.LaneConfig{
				{
					Source: config.TonChainDefinition{
						ConnectionConfig: v1_6.ConnectionConfig{
							RMNVerificationDisabled: true,
							AllowListEnabled:        false,
						},
						Selector: chainSelector,
						GasPrice: big.NewInt(1e17),
						TokenPrices: map[*address.Address]*big.Int{
							ton_ops.TonTokenAddr: big.NewInt(99),
						},
						FeeQuoterDestChainConfig: ton_ops.DefaultFeeQuoterDestChainConfig(true, evmSelector),
						TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{
							// TODO: populate when token transfer enabled
						},
					},
					Dest: config.EVMChainDefinition{
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
					},
					IsDisabled: false,
				},
			},
			TestRouter: false,
		}),
	})
	require.NoError(t, err, "failed to add lane")

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
	onRampAddr := state[chainSelector].OnRamp
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	feeQuoterAddr := state[chainSelector].FeeQuoter
	rawFeeQuoterAddr, err := addrCodec.AddressStringToBytes(feeQuoterAddr.String())
	require.NoError(t, err)
	rawLinkAddr, err := addrCodec.AddressStringToBytes(linkAddr.String())
	require.NoError(t, err)

	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameFeeQuoter, rawFeeQuoterAddr)
	require.NoError(t, err)

	t.Run("GetConfig", func(t *testing.T) {
		config, _, err := accessor.GetAllConfigsLegacy(ctx, ccipocr3.ChainSelector(chainSelector), []ccipocr3.ChainSelector{ChainSelEVMTest90000001})
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
		seqNum, err := accessor.GetExpectedNextSequenceNumber(ctx, ChainSelEVMTest90000001)
		require.NoError(t, err)
		require.Equal(t, ccipocr3.SeqNum(1), seqNum)
	})

	t.Run("GetTokenPriceUSD", func(t *testing.T) {
		timestampedPrice, err := accessor.GetTokenPriceUSD(ctx, rawLinkAddr)
		require.NoError(t, err)
		require.Equal(t, big.NewInt(99), timestampedPrice.Value)
	})

	t.Run("GetFeeQuoterDestChainConfig", func(t *testing.T) {
		config, err := accessor.GetFeeQuoterDestChainConfig(ctx, ccipocr3.ChainSelector(ChainSelEVMTest90000001))
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
