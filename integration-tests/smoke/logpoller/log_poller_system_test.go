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

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	logpoller_testdata "github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/smoke/logpoller/helper"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txloader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/postgres"
)

// storeConfig defines how to create LogStore and FilterStore for parameterized testing.
type storeConfig struct {
	name         string
	createStores func(t *testing.T, chainID string, lggr logger.Logger) (logpoller.LogStore, logpoller.FilterStore)
}

func inMemoryStores() storeConfig {
	return storeConfig{
		name: "InMemory",
		createStores: func(_ *testing.T, chainID string, lggr logger.Logger) (logpoller.LogStore, logpoller.FilterStore) {
			return inmemorystore.NewLogStore(chainID, lggr), inmemorystore.NewFilterStore(chainID, lggr)
		},
	}
}

func postgresStores() storeConfig {
	return storeConfig{
		name: "Postgres",
		createStores: func(t *testing.T, chainID string, lggr logger.Logger) (logpoller.LogStore, logpoller.FilterStore) {
			ds := pgtest.SetupTestDB(t)
			err := pgtest.ExecuteSQL(t.Context(), ds, logpoller_testdata.CreateLogPollerTables)
			require.NoError(t, err)
			orm := postgres.NewORM(chainID, ds, lggr)
			return postgres.NewLogStore(chainID, orm, lggr), postgres.NewFilterStore(chainID, orm, lggr)
		},
	}
}

func allStoreConfigs() []storeConfig {
	return []storeConfig{inMemoryStores(), postgresStores()}
}

// Test_LogPoller_System contains system-level integration tests for the LogPoller.
// These tests validate behaviors like service restart, state resumption, replay, and recovery.
func Test_LogPoller_System(t *testing.T) {
	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)
	clientProvider := func(_ context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	t.Run("MC Block Resolution", func(t *testing.T) {
		t.Parallel()

		// setup
		sender, serr := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
		require.NoError(t, serr)
		ferr := test_utils.FundWallets(t, tonChain.Client, []*address.Address{sender.Address()},
			[]tlb.Coins{tlb.MustFromTON("1000")})
		require.NoError(t, ferr)
		emitter, err := helper.NewTestEventSource(t.Context(), tonChain.Client, sender, "mcBlockEmitter", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		chainID := "mc-block-test-chain"
		lggr := logger.Test(t)
		logStore := inmemorystore.NewLogStore(chainID, lggr)
		lp, err := logpoller.NewService(lggr, chainID, clientProvider, &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore(chainID, lggr),
			TxLoader:    txloader.New(lggr, clientProvider),
			LogStore:    logStore,
		})
		require.NoError(t, err)

		_, err = lp.RegisterFilter(t.Context(), models.Filter{
			Name:     "MCBlockFilter",
			Address:  emitter.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased,
		})
		require.NoError(t, err)
		require.NoError(t, lp.Start(t.Context()))
		defer func() { require.NoError(t, lp.Close()) }()

		// emit events
		const numEvents = 3
		for i := 1; i <= numEvents; i++ {
			_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
			require.NoError(t, err)
		}

		// wait for indexing
		require.Eventually(t, func() bool {
			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context())
			if qerr != nil {
				return false
			}
			result, _ := query.DecodedLogs[counter.CountIncreased](logs)
			t.Logf("indexed: %d/%d logs", len(result), numEvents)
			return len(result) == numEvents
		}, 60*time.Second, 2*time.Second, "events should be indexed")

		// verify mc block resolution worked
		latestBlock, _, err := logStore.GetHighestMCBlockSeqno(t.Context())
		require.NoError(t, err)
		require.Positive(t, latestBlock, "mc block seqno should be resolved and stored")
		t.Logf("latest mc block seqno: %d", latestBlock)
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

		// 2. Capture the current block before emitting events (for replay later)
		blockBeforeEvents, err := tonChain.Client.CurrentMasterchainInfo(t.Context())
		require.NoError(t, err)

		// 3. Emit events before logpoller starts
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

		// 4. Start LogPoller (with in-memory stores)
		lggr := logger.Test(t)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
			TxLoader:    txloader.New(lggr, clientProvider),
			LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
		}
		lp, err := logpoller.NewService(lggr, "test-chain", clientProvider, opts)
		require.NoError(t, err)

		// 5. Register filter (without replay)
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

		// 6. Verify no logs before replay
		logs, _, _, _ := lp.NewQuery().
			WithSource(emitter.ContractAddress()).
			WithEventSig(counter.TopicCountIncreased).
			Execute(t.Context())
		require.Empty(t, logs, "should have no logs before replay")

		// 7. Request replay from the block captured before events were emitted
		err = lp.Replay(t.Context(), blockBeforeEvents.SeqNo)
		require.NoError(t, err)

		// 8. Verify replay status
		status := lp.ReplayStatus()
		require.Contains(t, []models.ReplayStatus{
			models.ReplayStatusRequested,
			models.ReplayStatusPending,
		}, status, "replay should be requested or pending")

		// 9. Wait for replay completion and verify logs
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

		// 10. Emit additional events and verify normal polling works
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

	t.Run("Multi-Filter Deduplication", func(t *testing.T) {
		t.Parallel()

		for _, sc := range allStoreConfigs() {
			t.Run(sc.name, func(t *testing.T) {
				// Setup: create wallet and emitter
				sender, serr := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
				require.NoError(t, serr)
				ferr := test_utils.FundWallets(t, tonChain.Client, []*address.Address{sender.Address()},
					[]tlb.Coins{tlb.MustFromTON("1000")})
				require.NoError(t, ferr)

				emitter, err := helper.NewTestEventSource(t.Context(), tonChain.Client, sender, "dedupEmitter-"+sc.name, rand.Uint32(), logger.Test(t))
				require.NoError(t, err)

				chainID := "dedup-test-chain-" + sc.name
				lggr := logger.Test(t)
				logStore, filterStore := sc.createStores(t, chainID, lggr)

				lp, err := logpoller.NewService(lggr, chainID, clientProvider, &logpoller.ServiceOptions{
					Config:      logpoller.DefaultConfigSet,
					FilterStore: filterStore,
					TxLoader:    txloader.New(lggr, clientProvider),
					LogStore:    logStore,
				})
				require.NoError(t, err)

				// Register multiple filters tracking the SAME (address, event_sig)
				filterNames := []string{"filter-alpha", "filter-beta", "filter-gamma"}
				for _, name := range filterNames {
					_, err = lp.RegisterFilter(t.Context(), models.Filter{
						Name:     name,
						Address:  emitter.ContractAddress(),
						MsgType:  tlb.MsgTypeExternalOut,
						EventSig: counter.TopicCountIncreased,
					})
					require.NoError(t, err)
				}

				require.NoError(t, lp.Start(t.Context()))
				defer func() { require.NoError(t, lp.Close()) }()

				// Emit events - each event will be stored once per filter (3 filters × 2 events = 6 rows)
				const numEvents = 2
				for i := range numEvents {
					_, _, err = emitter.SendIncreaseCounterMsg(t.Context())
					require.NoError(t, err)
					_ = i
				}

				// Wait for indexing and verify deduplication
				require.Eventually(t, func() bool {
					logs, _, _, qerr := lp.NewQuery().
						WithSource(emitter.ContractAddress()).
						WithEventSig(counter.TopicCountIncreased).
						Execute(t.Context())
					if qerr != nil {
						return false
					}
					result, _ := query.DecodedLogs[counter.CountIncreased](logs)
					t.Logf("query returned %d logs (expected %d unique events)", len(result), numEvents)
					return len(result) == numEvents
				}, 60*time.Second, 2*time.Second, "should return deduplicated events")

				// Final verification: query should return exactly numEvents unique logs
				logs, _, _, err := lp.NewQuery().
					WithSource(emitter.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context())
				require.NoError(t, err)
				require.Len(t, logs, numEvents, "expected %d unique events, got %d", numEvents, len(logs))

				// Verify each log has unique (TxHash, TxLT, MsgIndex)
				seen := make(map[string]struct{})
				for _, log := range logs {
					key := string(log.TxHash[:]) + "-" + string(rune(log.TxLT)) + "-" + string(rune(log.MsgIndex)) //nolint:gosec // G115 - TODO(lint-migration): golangci-lint 2.11 rule tightened
					require.NotContains(t, seen, key, "duplicate log found")
					seen[key] = struct{}{}
				}
			})
		}
	})

	// TODO(NONEVM-3034): Log pruning test - per-filter retention (expires_at) and max_logs_kept
}
