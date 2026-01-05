package smoke

import (
	"context"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/smoke/logpoller/helper"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txloader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Test_LogPoller_System contains system-level integration tests for the LogPoller.
// These tests validate behaviors like service restart, state resumption, replay, and recovery.
func Test_LogPoller_System(t *testing.T) {
	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)
	clientProvider := func(_ context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	t.Run("Service Resumption", func(t *testing.T) {
		t.Parallel()

		// setup
		sender, serr := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
		require.NoError(t, serr)
		ferr := test_utils.FundWallets(t, tonChain.Client, []*address.Address{sender.Address()},
			[]tlb.Coins{tlb.MustFromTON("1000")})
		require.NoError(t, ferr)
		emitter, err := helper.NewTestEventSource(t.Context(), tonChain.Client, sender, "resumptionEmitter", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		chainID := "resumption-test-chain"
		lggr := logger.Test(t)
		lp, err := logpoller.NewService(lggr, chainID, clientProvider, &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore(chainID, lggr),
			TxLoader:    txloader.New(lggr, clientProvider),
			LogStore:    inmemorystore.NewLogStore(chainID, lggr),
		})
		require.NoError(t, err)

		_, err = lp.RegisterFilter(t.Context(), models.Filter{
			Name:     "ResumptionFilter",
			Address:  emitter.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased,
		})
		require.NoError(t, err)
		require.NoError(t, lp.Start(t.Context()))

		// first batch
		const firstBatchEvents = 5
		for i := 1; i <= firstBatchEvents; i++ {
			_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
			require.NoError(t, err)
		}

		require.Eventually(t, func() bool {
			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			if qerr != nil {
				return false
			}
			result, _ := query.DecodedLogs[counter.CountIncreased](logs)
			t.Logf("first batch: %d/%d logs", len(result), firstBatchEvents)
			return len(result) == firstBatchEvents
		}, 60*time.Second, 2*time.Second, "first batch should be indexed")

		latestBlockBefore, err := lp.GetLatestBlock(t.Context())
		require.NoError(t, err)
		require.Positive(t, latestBlockBefore, "mc block seqno should be stored")
		t.Logf("latest block before restart: %d", latestBlockBefore)

		// restart
		require.NoError(t, lp.Close())
		require.NoError(t, lp.Start(t.Context()))
		defer func() { require.NoError(t, lp.Close()) }()

		// second batch
		const secondBatchEvents = 3
		for i := 1; i <= secondBatchEvents; i++ {
			_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
			require.NoError(t, err)
		}

		require.Eventually(t, func() bool {
			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			if qerr != nil {
				return false
			}
			result, _ := query.DecodedLogs[counter.CountIncreased](logs)
			t.Logf("after restart: %d/%d logs", len(result), firstBatchEvents+secondBatchEvents)
			return len(result) == firstBatchEvents+secondBatchEvents
		}, 60*time.Second, 2*time.Second, "second batch should be indexed after restart")

		// verify
		latestBlockAfter, err := lp.GetLatestBlock(t.Context())
		require.NoError(t, err)
		require.Greater(t, latestBlockAfter, latestBlockBefore, "should have processed new blocks")
		t.Logf("latest block after restart: %d (was %d)", latestBlockAfter, latestBlockBefore)

		allLogs, _, _, allErr := lp.NewQuery().
			WithSource(emitter.ContractAddress()).
			WithEventSig(counter.TopicCountIncreased).
			WithLimitAndSort(commonquery.LimitAndSort{
				SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
			}).
			Execute(t.Context())
		require.NoError(t, allErr)

		result, decodeErr := query.DecodedLogs[counter.CountIncreased](allLogs)
		require.NoError(t, decodeErr)
		require.Len(t, result, firstBatchEvents+secondBatchEvents)

		seen := make(map[uint32]bool)
		for _, log := range result {
			var event counter.CountIncreased
			lerr := tlb.LoadFromCell(&event, log.Data.BeginParse())
			require.NoError(t, lerr)
			require.False(t, seen[event.Value], "duplicate counter value %d", event.Value)
			seen[event.Value] = true
		}
	})

	t.Run("Replay", func(t *testing.T) {
		t.Parallel()

		// 1. Setup: create new wallet and emitter
		sender, serr := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
		require.NoError(t, serr)

		ferr := test_utils.FundWallets(t, tonChain.Client, []*address.Address{sender.Address()},
			[]tlb.Coins{tlb.MustFromTON("1000")})
		require.NoError(t, ferr)

		emitter, err := helper.NewTestEventSource(t.Context(), tonChain.Client, sender, "replayEmitter", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		// 2. Emit events before logpoller starts
		const preReplayEvents = 5
		for i := 1; i <= preReplayEvents; i++ {
			_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
			require.NoError(t, err)
		}

		// Wait for transactions to be confirmed by checking counter value
		require.Eventually(t, func() bool {
			counterValue, cerr := counter.GetValue(t.Context(), tonChain.Client, emitter.ContractAddress())
			if cerr != nil {
				t.Logf("failed to get counter value: %v", err)
				return false
			}
			return counterValue == preReplayEvents
		}, 30*time.Second, 1*time.Second, "counter should reach expected value")

		counterValue, _ := counter.GetValue(t.Context(), tonChain.Client, emitter.ContractAddress())
		require.Equal(t, preReplayEvents, int(counterValue))

		// 3. Start LogPoller (with in-memory stores)
		lggr := logger.Test(t)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
			TxLoader:    txloader.New(lggr, clientProvider),
			LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
		}
		lp, err := logpoller.NewService(lggr, "test-chain", clientProvider, opts)
		require.NoError(t, err)

		// 4. Register filter (without replay)
		filter := models.Filter{
			Name:     "ReplayFilter",
			Address:  emitter.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased,
		}
		_, err = lp.RegisterFilter(t.Context(), filter)
		require.NoError(t, err)

		require.NoError(t, lp.Start(t.Context()))
		defer func() { require.NoError(t, lp.Close()) }()

		// 5. Verify no logs before replay
		logs, _, _, _ := lp.NewQuery().
			WithSource(emitter.ContractAddress()).
			WithEventSig(counter.TopicCountIncreased).
			Execute(t.Context())
		require.Empty(t, logs, "should have no logs before replay")

		// 6. Request replay
		currentBlock, err := tonChain.Client.CurrentMasterchainInfo(t.Context())
		require.NoError(t, err)
		fromBlock := currentBlock.SeqNo - 100 // sufficiently old block

		err = lp.Replay(t.Context(), fromBlock)
		require.NoError(t, err)

		// 7. Verify replay status
		status := lp.ReplayStatus()
		require.Contains(t, []models.ReplayStatus{
			models.ReplayStatusRequested,
			models.ReplayStatusPending,
		}, status, "replay should be requested or pending")

		// 8. Wait for replay completion and verify logs
		require.Eventually(t, func() bool {
			status := lp.ReplayStatus()
			if status != models.ReplayStatusComplete {
				t.Logf("waiting for replay to complete, current status: %v", status)
				return false
			}

			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			if qerr != nil {
				t.Logf("query error: %v", err)
				return false
			}

			result, _ := query.DecodedLogs[counter.CountIncreased](logs)
			t.Logf("found %d logs after replay", len(result))
			return len(result) == preReplayEvents
		}, 60*time.Second, 2*time.Second, "replay should complete and index all events")

		// 9. Emit additional events and verify normal polling works
		const postReplayEvents = 3
		for i := 1; i <= postReplayEvents; i++ {
			_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
			require.NoError(t, err)
		}

		require.Eventually(t, func() bool {
			logs, _, _, _ := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			result, _ := query.DecodedLogs[counter.CountIncreased](logs)
			return len(result) == preReplayEvents+postReplayEvents
		}, 30*time.Second, 2*time.Second, "should index new events after replay")
	})
}
