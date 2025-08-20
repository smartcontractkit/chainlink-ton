package smoke

import (
	"context"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"go.uber.org/zap/zapcore"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/indexer"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// TODO: maybe it's better to reuse memory environment from deployment test
const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
	ctx := t.Context()

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

	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.AddTonLanes{}, config.UpdateTonLanesConfig{
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
							ops.TonTokenAddr: big.NewInt(99),
						},
						FeeQuoterDestChainConfig: feequoter.DestChainConfig{ // minimal valid config
							IsEnabled:                         true,
							MaxNumberOfTokensPerMsg:           0,
							MaxDataBytes:                      100,
							MaxPerMsgGasLimit:                 100,
							DestGasOverhead:                   0,
							DestGasPerPayloadByteBase:         0,
							DestGasPerPayloadByteHigh:         0,
							DestGasPerPayloadByteThreshold:    0,
							DestDataAvailabilityOverheadGas:   0,
							DestGasPerDataAvailabilityByte:    0,
							DestDataAvailabilityMultiplierBps: 0,
							ChainFamilySelector:               0,
							EnforceOutOfOrder:                 false,
							DefaultTokenFeeUsdCents:           0,
							DefaultTokenDestGasOverhead:       0,
							DefaultTxGasLimit:                 1,
							GasMultiplierWeiPerEth:            0,
							GasPriceStalenessThreshold:        0,
							NetworkFeeUsdCents:                0,
						},
						TokenTransferFeeConfigs: map[uint64]feequoter.UpdateTokenTransferFeeConfig{
							// TODO:
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

	// -- start logpoller
	lpCfg := logpoller.DefaultConfigSet
	logStore := inmemorystore.NewLogStore()
	filterStore := inmemorystore.NewFilterStore()
	loader := account.NewTxLoader(tonChain.Client, lggr, lpCfg.PageSize)
	indexer := indexer.NewIndexer(lggr, filterStore)

	opts := &logpoller.ServiceOptions{
		Config:    lpCfg,
		Client:    tonChain.Client,
		Filters:   filterStore,
		TxLoader:  loader,
		TxIndexer: indexer,
		Store:     logStore,
	}
	lp := logpoller.NewService(
		lggr,
		opts,
	)

	// -- initialize tonaccessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, aerr)

	onRampAddr := state[chainSelector].OnRamp
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)

	// -- bind onramp
	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)

	// -- register filter
	faerr := lp.RegisterFilter(ctx, types.Filter{
		Name:     "CCIPMessageSent",
		Address:  &onRampAddr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: hash.CRC32("CCIPMessageSent"),
	})
	require.NoError(t, faerr)

	// start listening for logs
	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	time.Sleep(10 * time.Second)
	// -- send CCIP message
	// _ = &client.CCIPSendReqConfig{
	// 	SourceChain:  chainSelector,
	// 	DestChain:    evmSelector,
	// 	IsTestRouter: false,
	// 	Sender:       nil,
	// 	Message:      nil,
	// 	MaxRetries:   3,
	// }
	// TODO: cannot use state[chainSelector] (map index expression of struct type "github.com/smartcontractkit/chainlink-ton/deployment/state".CCIPChainState) as stateview.CCIPOnChainState value in argument to ops.SendTonRequest
	// ops.SendTonRequest(env, state[chainSelector], msgCfg)

	// -- send CCIP message manually
	routerAddr := state[chainSelector].Router

	sendCCIPMessage(t, ctx, evmSelector, routerAddr, tonChain.Client, deployer)

	t.Run("query CCIP message via TonAccessor", func(t *testing.T) {
		require.Eventually(t, func() bool {
			seqNum, err := accessor.LatestMessageTo(ctx, ccipocr3.ChainSelector(evmSelector))
			require.NoError(t, err, "failed to get latest message sequence number")
			return seqNum == ccipocr3.SeqNum(1)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")
		// accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(1, 100))
		// t.Skip("implement me")
	})
}

func sendCCIPMessage(t *testing.T, ctx context.Context, evmSelector uint64, routerAddr address.Address, client ton.APIClientWrapped, deployer *wallet.Wallet) {
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(5000),
		AllowOutOfOrderExecution: false,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	require.NoError(t, err)

	body, err := tlb.ToCell(router.CCIPSend{
		QueryID:           rand.Uint64(),
		DestChainSelector: evmSelector,
		Receiver:          tonCommon.CrossChainAddress("0x32Be343B94f860124dC4fEe278FDCBD38C102D88"),
		Data:              make([]byte, 1000),
		FeeToken:          ops.TonTokenAddr,
		ExtraArgs:         extraArgsCell,
	})
	require.NoError(t, err)

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     &routerAddr,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        body,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(client, *deployer)
	rMsg, blockID, err := ttConn.SendWaitTransaction(ctx, routerAddr, msg)
	require.NoError(t, err, "failed to send message")

	t.Log("transaction sent", "blockID", blockID, "receivedMsg", rMsg)
	err = rMsg.WaitForTrace(client)
	require.NoError(t, err, "failed to wait for trace")
}
