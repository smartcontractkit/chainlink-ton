package smoke

import (
	"encoding/hex"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"go.uber.org/zap/zapcore"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	tonstate "github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview/ton"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"

	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
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
	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// -- add lane using helper function
	// gasPrices := map[uint64]*big.Int{
	// 	evmSelector:   big.NewInt(1e17),
	// 	chainSelector: big.NewInt(1e17), // Add TON chain gas price
	// }
	// TODO: fix this call - for now comment out to avoid compilation errors
	// laneCS := ops.AddLaneTONChangesets(&env, chainSelector, evmSelector, chain_selectors.FamilyTon, chain_selectors.FamilyEVM, gasPrices)
	// env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{laneCS})
	// require.NoError(t, err, "failed to add lane")

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
	for seqNo := 0; seqNo < maxSeqNo; seqNo++ {
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
			TonChains: map[uint64]tonstate.CCIPChainState{
				chainSelector: {
					Router: state[chainSelector].Router,
					OnRamp: state[chainSelector].OnRamp,
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

func Test_TonAccessorCommitEventQueries(t *testing.T) {
	// BOC data from "Test commit with one merkle root for one empty message"
	merkleRootOnlyBocBytes, err := hex.DecodeString("b5ee9c7241010101005000009b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d00000000000000008000000000000000df513addb30a7c281b29b5e33872a05e3a408c74829bdc220e4a83397ba303eaa06e51f72f")
	require.NoError(t, err, "failed to decode hex string")
	merkleRootOnlyCell, err := cell.FromBOC(merkleRootOnlyBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	// BOC data from "Can commit with no roots and only price updates"
	priceOnlyBocBytes, err := hex.DecodeString("b5ee9c7241010401006e000101600102000203007b80186c5b823fab63015c89fcbba3a5f7da0f33a4d86ab8550295cefee69c53a674a00000000000000000000000000000000000000000000000000000003000480c9f9284461c852b00000000000000000000000000010000000000000000000000000001e97333c0")
	require.NoError(t, err, "failed to decode hex string")
	priceOnlyCell, err := cell.FromBOC(priceOnlyBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	t.Run("Test BOC decoding - Merkle Root only", func(t *testing.T) {
		// Decode using Go bindings
		var commitReportAccepted offramp.CommitReportAccepted
		err = tlb.LoadFromCell(&commitReportAccepted, merkleRootOnlyCell.BeginParse())
		require.NoError(t, err, "failed to decode CommitReportAccepted from BOC")

		// Validate the decoded data
		t.Logf("Successfully decoded CommitReportAccepted with MerkleRoot:")

		require.NotNil(t, commitReportAccepted.MerkleRoot, "MerkleRoot should be present")
		t.Logf("  MerkleRoot:")
		t.Logf("    SourceChainSelector: %d", commitReportAccepted.MerkleRoot.SourceChainSelector)
		t.Logf("    MinSeqNr: %d", commitReportAccepted.MerkleRoot.MinSeqNr)
		t.Logf("    MaxSeqNr: %d", commitReportAccepted.MerkleRoot.MaxSeqNr)
		t.Logf("    OnRampAddress: %x", commitReportAccepted.MerkleRoot.OnRampAddress)
		t.Logf("    MerkleRoot: %x", commitReportAccepted.MerkleRoot.MerkleRoot)

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), commitReportAccepted.MerkleRoot.SourceChainSelector, "Source chain selector should match EVM test chain")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MinSeqNr, "MinSeqNr should be 1")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MaxSeqNr, "MaxSeqNr should be 1")

		require.Nil(t, commitReportAccepted.PriceUpdates, "PriceUpdates should be nil for this test")
		t.Log("BOC decoding test (MerkleRoot only) passed!")
	})

	t.Run("Test BOC decoding - Price Updates only", func(t *testing.T) {
		// Decode using Go bindings
		var commitReportAccepted offramp.CommitReportAccepted
		err = tlb.LoadFromCell(&commitReportAccepted, priceOnlyCell.BeginParse())
		require.NoError(t, err, "failed to decode CommitReportAccepted from BOC")

		// Validate the decoded data
		t.Logf("Successfully decoded CommitReportAccepted with PriceUpdates:")

		require.Nil(t, commitReportAccepted.MerkleRoot, "MerkleRoot should be nil for this test")

		require.NotNil(t, commitReportAccepted.PriceUpdates, "PriceUpdates should be present")
		t.Logf("  PriceUpdates:")

		// Validate TokenPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, "TokenPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, 1, "Should have exactly 1 token price update")

		tokenUpdate := commitReportAccepted.PriceUpdates.TokenPriceUpdates[0]
		t.Logf("    TokenPriceUpdate[0]:")
		t.Logf("      SourceToken: %s", tokenUpdate.SourceToken.String())
		t.Logf("      UsdPerToken: %s", tokenUpdate.UsdPerToken.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, "EQDDYtwR_VsYCuRP5d0dL77QeZ0mw1XCqBSud_c04p0zpcYO", tokenUpdate.SourceToken.String(), "SourceToken should match expected address")
		require.Equal(t, big.NewInt(1), tokenUpdate.UsdPerToken, "UsdPerToken should be 1")

		// Validate GasPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, "GasPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, 1, "Should have exactly 1 gas price update")

		gasUpdate := commitReportAccepted.PriceUpdates.GasPriceUpdates[0]
		t.Logf("    GasPriceUpdate[0]:")
		t.Logf("      DestChainSelector: %d", gasUpdate.DestChainSelector)
		t.Logf("      UsdPerUnitGas: %s", gasUpdate.UsdPerUnitGas.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), gasUpdate.DestChainSelector, "DestChainSelector should match EVM test chain")
		expectedGasPrice := new(big.Int)
		expectedGasPrice.SetString("5192296858534827628530496329220097", 10)
		require.Equal(t, expectedGasPrice, gasUpdate.UsdPerUnitGas, "UsdPerUnitGas should match expected value")

		t.Log("BOC decoding test (PriceUpdates only) passed!")
	})

	t.Run("Ton Accessor - CommitReportsGTETimestamp", func(t *testing.T) {
		lpCfg := logpoller.DefaultConfigSet
		filterStore := inmemorystore.NewFilterStore()
		opts := &logpoller.ServiceOptions{
			Config:   lpCfg,
			Client:   nil,
			Filters:  filterStore,
			TxLoader: nil,
			TxParser: nil,
			Store:    inmemorystore.NewLogStore(),
		}

		lp := logpoller.NewService(
			logger.Test(t),
			opts,
		)

		mockOffRampAddr := "EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF"

		// Set timestamp before saving the log
		logTimestamp := time.Now()
		queryTimestamp := logTimestamp.Add(-1 * time.Minute) // Query from 1 minute before the log

		// save log
		lp.GetStore().SaveLog(types.Log{
			Address:     address.MustParseAddr(mockOffRampAddr),
			EventSig:    hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:        merkleRootOnlyCell,
			TxTimestamp: logTimestamp,
		})

		// query report via ton accessor
		addrCodec := codec.NewAddressCodec()
		accessor, aerr := chainaccessor.NewTONAccessor(logger.Test(t), ccipocr3.ChainSelector(13879075125137744094), nil, lp, addrCodec)
		require.NoError(t, aerr)

		rawMockOffRampAddr, err := addrCodec.AddressStringToBytes(mockOffRampAddr)
		require.NoError(t, err)
		err = accessor.Sync(t.Context(), consts.ContractNameOffRamp, rawMockOffRampAddr)
		require.NoError(t, err)

		reports, err := accessor.CommitReportsGTETimestamp(t.Context(), queryTimestamp, primitives.Finalized, 10)
		require.NoError(t, err, "failed to get commit reports")
		require.Len(t, reports, 1, "expected 1 commit report")

		// Validate the returned report
		report := reports[0]
		t.Logf("Retrieved commit report:")
		t.Logf("  Report timestamp: %v", report.Timestamp)
		t.Logf("  Number of blessed merkle roots: %d", len(report.Report.BlessedMerkleRoots))
		t.Logf("  Number of unblessed merkle roots: %d", len(report.Report.UnblessedMerkleRoots))

		// Validate the report contains expected data from merkleRootOnlyCell
		require.Len(t, report.Report.BlessedMerkleRoots, 1, "expected 1 blessed merkle root in the report")

		merkleRoot := report.Report.BlessedMerkleRoots[0]
		t.Logf("  BlessedMerkleRoot[0]:")
		t.Logf("    ChainSelector: %d", merkleRoot.ChainSel)
		t.Logf("    SeqNumsRange: %d-%d", merkleRoot.SeqNumsRange.Start(), merkleRoot.SeqNumsRange.End())
		t.Logf("    MerkleRoot: %x", merkleRoot.MerkleRoot)

		// Validate expected values match what we decoded in the BOC test
		require.Equal(t, ccipocr3.ChainSelector(909606746561742123), merkleRoot.ChainSel, "ChainSelector should match")
		require.Equal(t, ccipocr3.SeqNum(1), merkleRoot.SeqNumsRange.Start(), "MinSeqNr should be 1")
		require.Equal(t, ccipocr3.SeqNum(1), merkleRoot.SeqNumsRange.End(), "MaxSeqNr should be 1")

		expectedMerkleRootBytes, _ := hex.DecodeString("bea275bb6614f85036536bc670e540bc748118e90537b8441c950672f74607d5")
		require.Equal(t, expectedMerkleRootBytes, merkleRoot.MerkleRoot[:], "MerkleRoot should match")

		// Validate PriceUpdates should be empty for this test (since we used merkleRootOnlyCell)
		require.Empty(t, report.Report.PriceUpdates.TokenPriceUpdates, "TokenPriceUpdates should be empty for merkle root only test")
		require.Empty(t, report.Report.PriceUpdates.GasPriceUpdates, "GasPriceUpdates should be empty for merkle root only test")

		t.Log("CommitReportsGTETimestamp test passed!")
	})
}
