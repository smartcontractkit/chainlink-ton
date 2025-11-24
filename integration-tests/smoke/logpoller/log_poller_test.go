package smoke

import (
	"bytes"
	"context"
	"encoding/binary"
	"math/big"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	helper "github.com/smartcontractkit/chainlink-ton/integration-tests/smoke/logpoller/helper"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	txloader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
)

func Test_LogPoller(t *testing.T) {
	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client, nil
	}

	t.Run("log poller:Loader event ingestion", func(t *testing.T) {
		t.Parallel()
		// test event source config
		const batchCount = 3
		const txPerBatch = 5
		const msgPerTx = 2

		// block buffer(lastTx contains original msg and we should discover extOutMsg)
		const blockBuffer = 10

		// log collector config
		const pageSize = 5

		expectedEvents := batchCount * txPerBatch * msgPerTx
		emitter, txs := helper.SendBulkTestEventTxs(t, tonChain.Client, batchCount, txPerBatch, msgPerTx)

		firstTx, lastTx := txs[0], txs[len(txs)-1]

		prevBlock, err := tonChain.Client.LookupBlock(
			t.Context(),
			address.MasterchainID,
			firstTx.Block.Shard,
			firstTx.Block.SeqNo-1, // exclusive lower bound
		)
		require.NoError(t, err)

		toBlock, err := tonChain.Client.WaitForBlock(lastTx.Block.SeqNo+blockBuffer).LookupBlock(
			t.Context(),
			address.MasterchainID,
			lastTx.Block.Shard,
			lastTx.Block.SeqNo+blockBuffer, // inclusive upper bound + buffer
		)
		require.NoError(t, err)

		blockRange := &models.BlockRange{
			Prev: prevBlock,
			To:   toBlock,
		}

		t.Run("loading entire block range at once", func(t *testing.T) {
			t.Parallel()
			loader := txloader.New(logger.Test(t), clientProvider)

			txs, gerr := loader.GetTxsForAddress(
				t.Context(),
				blockRange,
				emitter.ContractAddress(),
				pageSize,
			)
			require.NoError(t, gerr)

			indexedCells := make([]*cell.Cell, 0, len(txs))
			for _, tx := range txs {
				msgs, _ := tx.Transaction.IO.Out.ToSlice()
				for _, msg := range msgs {
					// test contract only emits ExternalMessageOut
					if msg.MsgType == tlb.MsgTypeExternalOut {
						if extOut := msg.AsExternalOut(); extOut != nil {
							indexedCells = append(indexedCells, extOut.Payload())
						}
					}
				}
			}
			require.NoError(t, helper.VerifyAllCountLogs(indexedCells, expectedEvents))
		})

		t.Run("loading block by block", func(t *testing.T) {
			t.Parallel()
			var allLoadedLogCells []*cell.Cell
			loader := txloader.New(logger.Test(t), clientProvider)

			// iterate block by block from prevBlock to toBlock
			currentBlock := prevBlock
			for seqNo := prevBlock.SeqNo + 1; seqNo <= toBlock.SeqNo; seqNo++ {
				nextBlock, nberr := tonChain.Client.WaitForBlock(seqNo).LookupBlock(
					t.Context(),
					firstTx.Block.Workchain,
					firstTx.Block.Shard,
					seqNo,
				)
				require.NoError(t, nberr)

				// Create a block range for just this single block
				iterRange := &models.BlockRange{
					Prev: currentBlock,
					To:   nextBlock,
				}

				txs, gerr := loader.GetTxsForAddress(
					t.Context(),
					iterRange,
					emitter.ContractAddress(),
					pageSize,
				)
				require.NoError(t, gerr)

				// Extract messages from the loaded transactions
				for _, tx := range txs {
					msgs, _ := tx.Transaction.IO.Out.ToSlice()
					for _, msg := range msgs {
						if msg.MsgType == tlb.MsgTypeExternalOut {
							if extOut := msg.AsExternalOut(); extOut != nil {
								allLoadedLogCells = append(allLoadedLogCells, extOut.Payload())
							}
						}
					}
				}
				currentBlock = nextBlock // update for next iteration
			}

			// verify if we loaded all expected events, without duplicates
			err = helper.VerifyAllCountLogs(allLoadedLogCells, batchCount*txPerBatch*msgPerTx)
			require.NoError(t, err)
		})
	})

	t.Run("Logpoller live event ingestion", func(t *testing.T) {
		t.Parallel()
		senderA, saerr := test_utils.CreateRandomHighloadWallet(tonChain.Client)
		require.NoError(t, saerr)
		senderB, sberr := test_utils.CreateRandomHighloadWallet(tonChain.Client)
		require.NoError(t, sberr)

		ferr := test_utils.FundWallets(t, tonChain.Client, []*address.Address{senderA.Address(), senderB.Address()}, []tlb.Coins{tlb.MustFromTON("1000"), tlb.MustFromTON("1000")})
		require.NoError(t, ferr)

		emitterA, err := helper.NewTestEventSource(t.Context(), tonChain.Client, senderA, "emitterA", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		emitterB, err := helper.NewTestEventSource(t.Context(), tonChain.Client, senderB, "emitterB", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		const targetCounter = 10
		const interval = 1 * time.Second
		const timeout = 60 * time.Second

		lggr := logger.Test(t)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
			TxLoader:    txloader.New(lggr, clientProvider),
			LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
		}
		lp := logpoller.NewService(
			lggr,
			"test-chain",
			clientProvider,
			opts,
		)

		// register filters
		filterA := models.Filter{
			Name:     "FilterA",
			Address:  emitterA.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased, // event topic
		}
		_, faerr := lp.RegisterFilter(t.Context(), filterA)
		require.NoError(t, faerr)

		filterB := models.Filter{
			Name:     "FilterB",
			Address:  emitterB.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased, // event topic
		}
		_, fberr := lp.RegisterFilter(t.Context(), filterB)
		require.NoError(t, fberr)

		// register filter for internal message
		filterC := models.Filter{
			Name:     "FilterC",
			Address:  emitterA.ContractAddress(),
			MsgType:  tlb.MsgTypeInternal,
			EventSig: 0x41c92746, // opcode
		}
		_, fcerr := lp.RegisterFilter(t.Context(), filterC)
		require.NoError(t, fcerr)

		hasFilterA, aerr := lp.HasFilter(t.Context(), filterA.Name)
		require.NoError(t, aerr)
		require.True(t, hasFilterA)
		hasFilterB, berr := lp.HasFilter(t.Context(), filterB.Name)
		require.NoError(t, berr)
		require.True(t, hasFilterB)
		hasFilterC, cerr := lp.HasFilter(t.Context(), filterC.Name)
		require.NoError(t, cerr)
		require.True(t, hasFilterC)

		hasFilterD, derr := lp.HasFilter(t.Context(), "tons of fun")
		require.NoError(t, derr)
		require.False(t, hasFilterD)

		// start listening for logs
		require.NoError(t, lp.Start(t.Context()))
		defer func() {
			require.NoError(t, lp.Close())
		}()

		// start event emission loops, which will stop itself once the target is reached
		evctx, cancel := context.WithTimeout(context.Background(), timeout) // 10 counter each, should be enough
		defer cancel()
		err = emitterA.Start(evctx, interval, big.NewInt(targetCounter))
		require.NoError(t, err)
		err = emitterB.Start(evctx, interval, big.NewInt(targetCounter))
		require.NoError(t, err)
		defer func() {
			esrr := emitterA.Wait()
			require.NoError(t, esrr)
			esrr2 := emitterB.Wait()
			require.NoError(t, esrr2)
		}()

		require.Eventually(t, func() bool {
			// Check emitterA
			counterA, caerr := counter.GetValue(t.Context(), tonChain.Client, emitterA.ContractAddress())
			if caerr != nil {
				t.Logf("failed to get on-chain counter for emitterA, retrying: %v", caerr)
				return false
			}

			if counterA < targetCounter {
				t.Logf("waiting for counter A to be updated: %d/%d", counterA, targetCounter)
				return false
			}

			// Check emitterB
			counterB, cberr := counter.GetValue(t.Context(), tonChain.Client, emitterB.ContractAddress())
			if cberr != nil {
				t.Logf("failed to get on-chain counter for emitterB, retrying: %v", cberr)
				return false
			}

			if counterB < targetCounter {
				t.Logf("waiting for counter B to be updated: %d/%d", counterB, targetCounter)
				return false
			}

			// get all logs
			logsA, _, _, resAErr := lp.NewQuery().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				WithBocBytes(
					query.SkipBytes(4), // skip ID field to reach Counter field
					query.MatchBytes(4,
						query.WithCondition(binary.BigEndian.AppendUint32(nil, 0), primitives.Gt),
						query.WithCondition(binary.BigEndian.AppendUint32(nil, targetCounter), primitives.Lte),
					),
				).
				Execute(t.Context())
			require.NoError(t, resAErr) // query should not fail

			resA, resAErr := query.DecodedLogs[counter.CountIncreased](logsA)
			require.NoError(t, resAErr) // parsing should not fail

			logsB, _, _, resBErr := lp.NewQuery().
				WithSource(emitterB.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				WithBocBytes(
					query.SkipBytes(4), // skip ID field to reach Counter field
					query.MatchBytes(4,
						query.WithCondition(binary.BigEndian.AppendUint32(nil, 0), primitives.Gt),
						query.WithCondition(binary.BigEndian.AppendUint32(nil, targetCounter), primitives.Lte),
					),
				).
				Execute(t.Context())
			require.NoError(t, resBErr) // query should not fail

			resB, resBErr := query.DecodedLogs[counter.CountIncreased](logsB)
			require.NoError(t, resBErr) // parsing should not fail

			t.Logf("emitterA logs count: %d, emitterB logs count: %d", len(resA), len(resB))

			// Convert logs to messages for emitterA
			var indexedLogsA []*cell.Cell
			for _, log := range resA {
				indexedLogsA = append(indexedLogsA, log.Data)
			}

			// Convert logs to messages for emitterB
			var indexedLogsB []*cell.Cell
			for _, log := range resB {
				indexedLogsB = append(indexedLogsB, log.Data)
			}

			// Verify the content of the logs for emitterA (no duplicates, all counters present)
			verrA := helper.VerifyAllCountLogs(indexedLogsA, targetCounter)
			if verrA != nil {
				t.Logf("log verification failed for emitterA, will retry: %v", verrA)
				return false
			}

			// Verify the content of the logs for emitterB (no duplicates, all counters present)
			verrB := helper.VerifyAllCountLogs(indexedLogsB, targetCounter)
			if verrB != nil {
				t.Logf("log verification failed for emitterB, will retry: %v", verrB)
				return false
			}

			if len(resA) != targetCounter {
				for _, data := range indexedLogsA {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, data.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterA Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs A... have %d, want %d", len(resA), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			if len(resB) != targetCounter {
				for _, data := range indexedLogsB {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, data.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterB Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs B... have %d, want %d", len(resB), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// verify stored internal messages
			replyLogs, _, _, rlerr := lp.NewQuery().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(0x41c92746). //TODO: how can we get opcode directly from binding?
				WithBocBytes(
					query.SkipBytes(4), // skip ID field to reach Counter field
					query.MatchBytes(4,
						query.WithCondition(binary.BigEndian.AppendUint32(nil, 0), primitives.Gt),
						query.WithCondition(binary.BigEndian.AppendUint32(nil, targetCounter), primitives.Lte),
					),
				).
				Execute(t.Context())
			require.NoError(t, rlerr) // query should not fail

			replyLogsRes, rlerr := query.DecodedLogs[counter.CountIncreasedMsg](replyLogs)
			require.NoError(t, rlerr) // parsing should not fail

			var indexedLogsFromInternalMsgs []*cell.Cell
			for _, log := range replyLogsRes {
				indexedLogsFromInternalMsgs = append(indexedLogsFromInternalMsgs, log.Data)
			}

			verifyInternalLogsErr := helper.VerifyAllCountLogs(indexedLogsFromInternalMsgs, targetCounter)
			if verifyInternalLogsErr != nil {
				t.Logf("log verification failed for emitterB, will retry: %v", verifyInternalLogsErr)
				return false
			}

			if len(replyLogsRes) != targetCounter {
				for _, log := range replyLogsRes {
					t.Logf("emitterA Reply Log: %s", log.String())

					var event counter.CountIncreasedMsg
					err = tlb.LoadFromCell(&event, log.Data.BeginParse(), true)
					require.NoError(t, err)

					t.Logf("emitterA Reply Event Counter=%d", event.Value)
				}
				t.Logf("waiting for internal messages to be indexed... have %d, want %d", len(replyLogsRes), targetCounter)
				return false
			}

			// If log count and content are correct for both, the test condition is met
			return true
		}, 120*time.Second, 5*time.Second, "log poller did not ingest all events correctly in time")

		t.Run("Stored Block validation", func(t *testing.T) {
			// get all logs
			logs, _, _, qerr := lp.NewQuery().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				WithBocBytes(
					query.SkipBytes(4), // skip ID field to reach Counter field
					query.MatchBytes(4,
						query.WithCondition(binary.BigEndian.AppendUint32(nil, 0), primitives.Gt),
						query.WithCondition(binary.BigEndian.AppendUint32(nil, targetCounter), primitives.Lte),
					),
				).
				WithLimitAndSort(commonquery.LimitAndSort{
					SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
				}).
				Execute(t.Context())
			require.NoError(t, qerr)

			result, qerr := query.DecodedLogs[counter.CountIncreased](logs)
			require.NoError(t, qerr)

			for _, logEntry := range result {
				ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
				defer cancel()

				// call GetTransaction to fetch the transaction and verify the proof.
				// The API tonChain.Client must have proof checking enabled for this to work.
				tx, terr := tonChain.Client.GetTransaction(ctx, logEntry.Block, logEntry.Address, logEntry.TxLT)
				require.NoError(t, terr, "Transaction verification failed for lt %d", logEntry.TxLT)

				// final check: ensure the hash of the fetched transaction matches the hash from the log.
				require.True(t, bytes.Equal(tx.Hash, logEntry.TxHash[:]), "Transaction hash mismatch: log hash %x, chain hash %x", logEntry.TxHash, tx.Hash)
			}
		})

		t.Run("Query Tests", func(t *testing.T) {
			// the log poller service itself provides a simple query interface(w/o full DSL support)
			// define filters to find logs where the counter is between 5 and 10.
			// the CounterIncreased event data layout is [ID (4 bytes), Counter (4 bytes)].
			// so, the Counter field is at offset 4.
			// we can try to create event type > cell filter util, but that's whole another story.
			// this is somewhat similar to "LogsDataWordBetween" in evm logpoller,
			// TODO: with SQL we might need to implement a more efficient way to query logs.
			t.Run("Cell Query, events from emitter A", func(t *testing.T) {
				t.Parallel()
				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.SkipBytes(4), // skip ID field to reach Counter field
						query.MatchBytes(4,
							query.WithCondition(binary.BigEndian.AppendUint32(nil, 5), primitives.Gt),
							query.WithCondition(binary.BigEndian.AppendUint32(nil, 10), primitives.Lte),
						),
					).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)

				require.Len(t, result, 5, "expected exactly 5 logs for the range 6-10")

				// Parse the logs manually since FilterBytes doesn't parse events
				for _, log := range result {
					var event counter.CountIncreased
					lerr := tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, lerr)
					// check that the counter is within the expected range
					require.Greater(t, event.Value, uint32(5))
					require.LessOrEqual(t, event.Value, uint32(10))
				}
			})

			t.Run("Query by Sender Address", func(t *testing.T) {
				t.Parallel()
				testCell := cell.BeginCell().
					MustStoreAddr(emitterA.Wallet()).
					EndCell()
				testSlice := testCell.BeginParse()
				senderBytes, sberr := testSlice.LoadSlice(267) // Load exactly 267 bits
				require.NoError(t, sberr)

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.SkipBytes(8), // skip to sender address field
						query.MatchBytes(uint64(len(senderBytes)), query.WithCondition(senderBytes, primitives.Eq)),
					).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)

				require.Len(t, result, targetCounter)

				// Parse events from logs to verify data
				for _, log := range result {
					var event counter.CountIncreased
					lerr := tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, lerr)
					// check that the counter is within the expected range
					require.GreaterOrEqual(t, event.Value, uint32(1))
					require.LessOrEqual(t, event.Value, uint32(targetCounter))
				}
			})

			t.Run("Log Poller Query With CellFilter, events from emitter B", func(t *testing.T) {
				t.Parallel()
				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.SkipBytes(4), // skip ID field to reach Counter field
						query.MatchBytes(4,
							query.WithCondition(binary.BigEndian.AppendUint32(nil, 1), primitives.Gte),
							query.WithCondition(binary.BigEndian.AppendUint32(nil, 3), primitives.Lte),
						),
					).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)

				require.Len(t, result, 3, "expected exactly 3 logs for the range 1-3")

				// Parse events from logs to verify data
				for _, log := range result {
					var event counter.CountIncreased
					lerr := tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, lerr)
					// check that the counter is within the expected range
					require.GreaterOrEqual(t, event.Value, uint32(1))
					require.LessOrEqual(t, event.Value, uint32(3))
				}
			})

			t.Run("Log Poller Query With CellFilter, all events from emitter B", func(t *testing.T) {
				t.Parallel()
				// the CounterIncreased event data layout is [ID (4 bytes), Counter (4 bytes)].
				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.MatchBytes(4, query.WithCondition(binary.BigEndian.AppendUint32(nil, emitterB.GetID()), primitives.Eq)), // compare ID at offset 0
					).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)

				require.Len(t, result, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, log := range result {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Value, uint32(1))
					require.LessOrEqual(t, event.Value, uint32(targetCounter))

					if seen[event.Value] {
						t.Fatalf("duplicate counter %d found", event.Value)
					}
					seen[event.Value] = true
				}

				for i := 1; i <= int(targetCounter); i++ {
					if !seen[uint32(i)] { //nolint:gosec // test code
						t.Fatalf("missing counter %d", i)
					}
				}
			})

			t.Run("Log Poller query with parser pattern, all events from emitter B", func(t *testing.T) {
				t.Parallel()

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)

				require.Len(t, result, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, log := range result {
					require.GreaterOrEqual(t, log.TypedData.Value, uint32(1))
					require.LessOrEqual(t, log.TypedData.Value, uint32(targetCounter))

					if seen[log.TypedData.Value] {
						t.Fatalf("duplicate counter %d found", log.TypedData.Value)
					}
					seen[log.TypedData.Value] = true
				}

				for i := 1; i <= int(targetCounter); i++ {
					if !seen[uint32(i)] { //nolint:gosec // test code
						t.Fatalf("missing counter %d", i)
					}
				}
			})

			t.Run("Log Poller query with filter, events with odd values from emitter B", func(t *testing.T) {
				t.Parallel()

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context())
				require.NoError(t, queryErr)

				// Filter for events where the counter value is odd
				result, queryErr := query.DecodedLogsWithFilter(logs, func(event counter.CountIncreased) bool {
					return event.Value%2 == 1 // odd numbers
				})
				require.NoError(t, queryErr)

				expectedOddCount := 5 // From 1-10, odd numbers are: 1, 3, 5, 7, 9
				require.Len(t, result, expectedOddCount, "expected exactly %d odd-valued logs", expectedOddCount)

				// Verify all returned logs have odd values
				for _, log := range result {
					require.Equal(t, uint32(1), log.TypedData.Value%2, "all returned logs should have odd values, got %d", log.TypedData.Value)
					require.GreaterOrEqual(t, log.TypedData.Value, uint32(1))
					require.LessOrEqual(t, log.TypedData.Value, uint32(targetCounter))
				}
			})

			t.Run("Log Poller query with parser pattern with filter, events between 1 to 10 from emitter B", func(t *testing.T) {
				t.Parallel()
				from, to := (1), (10)

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogsWithFilter(logs, func(event counter.CountIncreased) bool {
					return event.Value >= uint32(from) && event.Value <= uint32(to) //nolint:gosec // test code
				})
				require.NoError(t, queryErr)

				require.Len(t, result, to-from+1, "expected exactly 10 logs for the range 1-10")
				seen := make(map[uint32]bool, to-from+1)
				for _, log := range result {
					require.GreaterOrEqual(t, log.TypedData.Value, uint32(from)) //nolint:gosec // test code
					require.LessOrEqual(t, log.TypedData.Value, uint32(to))      //nolint:gosec // test code

					if seen[log.TypedData.Value] {
						t.Fatalf("duplicate counter %d found", log.TypedData.Value)
					}
					seen[log.TypedData.Value] = true
				}

				for i := 1; i <= to; i++ {
					if !seen[uint32(i)] { //nolint:gosec // test code
						t.Fatalf("missing counter %d", i)
					}
				}
			})
		})

		t.Run("Sorting and Pagination Tests", func(t *testing.T) {
			t.Run("Sort by TxLT ascending", func(t *testing.T) {
				t.Parallel()

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithLimitAndSort(commonquery.LimitAndSort{
						SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
					}).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)
				require.Len(t, result, targetCounter)

				// verify ascending order by TxLT
				for i := 1; i < len(result); i++ {
					require.LessOrEqual(t, result[i-1].TxLT, result[i].TxLT,
						"logs should be sorted by TxLT in ascending order at index %d", i)
				}
			})

			t.Run("Sort by TxLT descending", func(t *testing.T) {
				t.Parallel()

				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithLimitAndSort(commonquery.LimitAndSort{
						SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Desc)},
					}).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)
				require.Len(t, result, targetCounter)

				// Verify descending order by TxLT
				for i := 1; i < len(result); i++ {
					require.GreaterOrEqual(t, result[i-1].TxLT, result[i].TxLT,
						"logs should be sorted by TxLT in descending order at index %d", i)
				}
			})

			t.Run("Pagination with limit", func(t *testing.T) {
				t.Parallel()
				const pageSize = 7
				logs, hasMore, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithLimitAndSort(commonquery.LimitAndSort{
						SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
						Limit:  commonquery.CountLimit(pageSize),
					}).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)
				require.Len(t, result, pageSize)
				require.True(t, hasMore, "should have more results")
			})

			t.Run("Sorting + filtering + pagination", func(t *testing.T) {
				t.Parallel()
				from, to := 4, 8
				count := to - from + 1

				// Filter for counters 4-8, then sort and paginate
				logs, _, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.SkipBytes(4), // skip ID field to reach Counter field
						query.MatchBytes(4,
							query.WithCondition(binary.BigEndian.AppendUint32(nil, uint32(from)), primitives.Gte),
							query.WithCondition(binary.BigEndian.AppendUint32(nil, uint32(to)), primitives.Lte),
						),
					).
					WithLimitAndSort(commonquery.LimitAndSort{
						SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Desc)},
						Limit:  commonquery.CountLimit(uint64(count)), //nolint:gosec // test code with small values
					}).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)
				require.Len(t, result, count)

				// Verify the filtering worked
				for _, log := range result {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Value, uint32(from))
					require.LessOrEqual(t, event.Value, uint32(to))
				}

				// Verify descending sort order
				for i := 1; i < len(result); i++ {
					require.GreaterOrEqual(t, result[i-1].TxLT, result[i].TxLT,
						"filtered results should be sorted in descending TxLT order at index %d", i)
				}
			})

			t.Run("Edge case: empty results pagination", func(t *testing.T) {
				t.Parallel()
				// filter for impossible range
				logs, hasMore, _, queryErr := lp.NewQuery().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					WithBocBytes(
						query.SkipBytes(4), // skip ID field to reach Counter field
						query.MatchBytes(4, query.WithCondition(binary.BigEndian.AppendUint32(nil, 100), primitives.Gt)), // No events should match
					).
					WithLimitAndSort(commonquery.LimitAndSort{
						SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
						Limit:  commonquery.CountLimit(10),
					}).
					Execute(t.Context())
				require.NoError(t, queryErr)

				result, queryErr := query.DecodedLogs[counter.CountIncreased](logs)
				require.NoError(t, queryErr)
				require.Empty(t, result)
				require.False(t, hasMore)
			})
		})
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Parallel()

		// 1. Setup: create new wallet and emitter
		sender, serr := test_utils.CreateRandomHighloadWallet(tonChain.Client)
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
		lp := logpoller.NewService(lggr, "test-chain", clientProvider, opts)

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
