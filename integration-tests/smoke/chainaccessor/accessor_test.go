package smoke

import (
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"go.uber.org/zap/zapcore"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	tonStateView "github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview/ton"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"

	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
)

const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
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

	// -- deploy contracts
	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// -- add lane using helper function
	gasPrices := map[uint64]*big.Int{
		evmSelector:   big.NewInt(1e17),
		chainSelector: big.NewInt(1e17), // Add TON chain gas price
	}
	laneCS := ops.AddLaneTONChangesets(&env, chainSelector, evmSelector, chain_selectors.FamilyTon, chain_selectors.FamilyEVM, gasPrices)
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

	feeQuoterAddr := state[chainSelector].FeeQuoter

	// -- set fee token manually
	feeTokenDict := cell.NewDict(267) // key size for address
	feeToken := feequoter.FeeToken{PremiumMultiplierWeiPerEth: 1}
	feeTokenCell, err := tlb.ToCell(feeToken)
	require.NoError(t, err, "failed to encode FeeToken")

	// Add the fee token to dictionary (address as key)
	addressKeyCell := cell.BeginCell().MustStoreAddr(ops.TonTokenAddr).EndCell()
	err = feeTokenDict.Set(addressKeyCell, feeTokenCell)
	require.NoError(t, err, "failed to add fee token to dictionary")

	updateFeeTokensMsg := feequoter.UpdateFeeTokens{
		Add:    feeTokenDict,
		Remove: tonCommon.SnakeData[*address.Address]{}, // Empty remove list
	}

	updateFeeTokensCell, err := tlb.ToCell(updateFeeTokensMsg)
	require.NoError(t, err, "failed to encode UpdateFeeTokens message")

	updateFeeTokensInternalMsg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     &feeQuoterAddr,
			Amount:      tlb.MustFromTON("0.01"),
			Body:        updateFeeTokensCell,
		},
	}

	tt := tracetracking.NewSignedAPIClient(tonChain.Client, *deployer)
	updateFeeTokensResult, updateFeeTokensBlockID, err := tt.SendWaitTransaction(ctx, feeQuoterAddr, updateFeeTokensInternalMsg)
	require.NoError(t, err, "failed to send UpdateFeeTokens transaction")

	t.Logf("UpdateFeeTokens transaction sent successfully - Block: %d, ExitCode: %d",
		updateFeeTokensBlockID.SeqNo, updateFeeTokensResult.ExitCode)

	// TODO: use sendmanytx or highload wallet, otherwise we get 33 exit code(too many actions)
	time.Sleep(5 * time.Second)

	const maxSeqNo = 4
	for seqNo := 0; seqNo <= maxSeqNo; seqNo++ {
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

		msgCfg := &client.CCIPSendReqConfig{
			SourceChain:  chainSelector,
			DestChain:    evmSelector,
			IsTestRouter: false,
			Sender:       nil,            // For TON, sender is handled by the environment
			Message:      tonSendRequest, // Populate with the CCIP message
			MaxRetries:   3,
		}

		// TODO: send helper args are coupled with core memory environment, can we tidy this?
		ccipState := stateview.CCIPOnChainState{
			TonChains: map[uint64]tonStateView.CCIPChainState{
				chainSelector: {
					Router: state[chainSelector].Router,
				},
			},
		}
		_, err = ops.SendTonRequest(env, ccipState, msgCfg)
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
		require.Len(t, msgs, maxSeqNo+1, "expected %d messages, got %d", maxSeqNo+1, len(msgs))
		require.Equal(t, msgs[0].Header.SequenceNumber, ccipocr3.SeqNum(0))
		require.Equal(t, msgs[maxSeqNo].Header.SequenceNumber, ccipocr3.SeqNum(maxSeqNo))

		// range query
		const start, end = 2, 4
		msgs2, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(start, end))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs2, end-start+1, "expected %d messages, got %d", end-start+1, len(msgs2))
		require.Equal(t, msgs2[0].Header.SequenceNumber, ccipocr3.SeqNum(start))
		require.Equal(t, msgs2[len(msgs2)-1].Header.SequenceNumber, ccipocr3.SeqNum(end))
	})
}
