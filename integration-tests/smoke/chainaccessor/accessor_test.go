package smoke

import (
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
)

const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.Test(t)
	ctx := t.Context()

	// create memory env to reuse changesets
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    1,
		TonChains: 1,
	})

	// get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	// memory environment doesn't block on funding so changesets can execute before the env is fully ready, manually call fund so we block here
	test_utils.FundWallets(t, tonChain.Client, []*address.Address{deployer.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
	time.Sleep(5 * time.Second)

	// -- deploy contracts
	cs := commonchangeset.Configure(ops.DeployCCIPContracts{}, ops.DeployChainContractsConfig(t, env, chainSelector))
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// -- add lane using helper function
	gasPrices := map[uint64]*big.Int{
		evmSelector:   big.NewInt(1e17),
		chainSelector: big.NewInt(1e17), // Add TON chain gas price
	}
	laneConfig := ops.AddLaneTONConfig(&env, chainSelector, evmSelector, chain_selectors.FamilyTon, chain_selectors.FamilyEVM, gasPrices)
	laneCS := commonchangeset.Configure(ops.AddTonLanes{}, config.UpdateTonLanesConfig{
		Lanes:      []config.LaneConfig{laneConfig},
		TestRouter: false,
	})
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{laneCS})
	require.NoError(t, err, "failed to add lane")

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- start logpoller
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
	lp := logpoller.NewService(
		lggr,
		opts,
	)

	// -- initialize tonaccessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, aerr)

	onRampAddr := state[chainSelector].OnRamp

	// -- bind onramp in accessor, event filter will be registered in Sync()
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)

	// start listening for logs
	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// TODO: use sendmanytx or highload wallet, otherwise we get 33 exit code(too many actions)
	time.Sleep(5 * time.Second)

	const maxSeqNo = 4
	for seqNo := range maxSeqNo {
		t.Log("Sending CCIP message", seqNo)
		extraArgs := onramp.GenericExtraArgsV2{
			GasLimit:                 big.NewInt(100),
			AllowOutOfOrderExecution: false,
		}

		extraArgsCell, err := tlb.ToCell(extraArgs)
		require.NoError(t, err)
		tonSendRequest := ops.TonSendRequest{
			QueryID:   rand.Uint64(),
			Receiver:  tonCommon.CrossChainAddress(make([]byte, 20)),
			Data:      tonCommon.SnakeBytes([]byte("tons of fun")),
			ExtraArgs: extraArgsCell,
			FeeToken:  ops.TonTokenAddr,
		}

		// TODO: send helper args are coupled with core memory environment, can we tidy this?
		ccipState := tonstate.CCIPChainState{
			Router: state[chainSelector].Router,
			OnRamp: state[chainSelector].OnRamp,
		}
		_, _, err = ops.SendTonRequest(env, ccipState, chainSelector, evmSelector, tonSendRequest)
		require.NoError(t, err, "failed to send CCIP message")
		time.Sleep(2 * time.Second)
	}

	t.Run("query CCIP events via TonAccessor", func(t *testing.T) {
		// check the latest message is indexed
		require.Eventually(t, func() bool {
			seqNum, err := accessor.LatestMessageTo(ctx, ccipocr3.ChainSelector(evmSelector))
			require.NoError(t, err, "failed to get latest message sequence number")
			return seqNum == ccipocr3.SeqNum(maxSeqNo)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")

		// check all messages are indexed
		msgs, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(0, maxSeqNo))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs, maxSeqNo, "expected %d messages, got %d", maxSeqNo, len(msgs))
		require.Equal(t, msgs[0].Header.SequenceNumber, ccipocr3.SeqNum(1))
		require.Equal(t, msgs[maxSeqNo-1].Header.SequenceNumber, ccipocr3.SeqNum(maxSeqNo))

		// range query
		const start, end = 2, 4
		msgs2, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(start, end))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs2, end-start+1, "expected %d messages, got %d", end-start+1, len(msgs2))
		require.Equal(t, msgs2[0].Header.SequenceNumber, ccipocr3.SeqNum(start))
		require.Equal(t, msgs2[len(msgs2)-1].Header.SequenceNumber, ccipocr3.SeqNum(end))
	})
}
