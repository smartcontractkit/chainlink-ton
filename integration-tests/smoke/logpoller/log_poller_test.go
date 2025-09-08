package smoke

import (
	"bytes"
	"context"
	"encoding/binary"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	helper "github.com/smartcontractkit/chainlink-ton/integration-tests/smoke/logpoller/helper"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

func Test_LogPoller(t *testing.T) {
	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector).WithRetry()
	require.NotNil(t, client)

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
		emitter, txs := helper.SendBulkTestEventTxs(t, client, batchCount, txPerBatch, msgPerTx)

		firstTx, lastTx := txs[0], txs[len(txs)-1]

		prevBlock, err := client.LookupBlock(
			t.Context(),
			address.MasterchainID,
			firstTx.Block.Shard,
			firstTx.Block.SeqNo-1, // exclusive lower bound
		)
		require.NoError(t, err)

		toBlock, err := client.WaitForBlock(lastTx.Block.SeqNo+blockBuffer).LookupBlock(
			t.Context(),
			address.MasterchainID,
			lastTx.Block.Shard,
			lastTx.Block.SeqNo+blockBuffer, // inclusive upper bound + buffer
		)
		require.NoError(t, err)

		blockRange := &types.BlockRange{
			Prev: prevBlock,
			To:   toBlock,
		}

		t.Run("loading entire block range at once", func(t *testing.T) {
			t.Parallel()
			loader := account.NewTxLoader(client, logger.Test(t), pageSize)

			txs, berr := loader.LoadTxsForAddresses(
				t.Context(),
				blockRange,
				[]*address.Address{emitter.ContractAddress()},
			)
			require.NoError(t, berr)
			indexedCells := make([]*cell.Cell, 0, len(txs))
			for _, tx := range txs {
				msgs, _ := tx.Tx.IO.Out.ToSlice()
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

			loader := account.NewTxLoader(client, logger.Test(t), pageSize)

			// iterate block by block from prevBlock to toBlock
			currentBlock := prevBlock
			for seqNo := prevBlock.SeqNo + 1; seqNo <= toBlock.SeqNo; seqNo++ {
				nextBlock, nberr := client.WaitForBlock(seqNo).LookupBlock(
					t.Context(),
					firstTx.Block.Workchain,
					firstTx.Block.Shard,
					seqNo,
				)
				require.NoError(t, nberr)

				// Create a block range for just this single block
				iterRange := &types.BlockRange{
					Prev: currentBlock,
					To:   nextBlock,
				}

				loadedTxs, berr := loader.LoadTxsForAddresses(
					t.Context(),
					iterRange,
					[]*address.Address{emitter.ContractAddress()},
				)
				require.NoError(t, berr)

				// Extract messages from the loaded transactions
				for _, tx := range loadedTxs {
					msgs, _ := tx.Tx.IO.Out.ToSlice()
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
		senderA := test_utils.CreateRandomHighloadWallet(t, client)
		senderB := test_utils.CreateRandomHighloadWallet(t, client)
		test_utils.FundWallets(t, client, []*address.Address{senderA.Address(), senderB.Address()}, []tlb.Coins{tlb.MustFromTON("1000"), tlb.MustFromTON("1000")})
		require.NotNil(t, senderA)

		emitterA, err := helper.NewTestEventSource(client, senderA, "emitterA", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		emitterB, err := helper.NewTestEventSource(client, senderB, "emitterB", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		const targetCounter = 10
		const interval = 1 * time.Second
		const timeout = 60 * time.Second

		cfg := logpoller.DefaultConfigSet
		fs := inmemorystore.NewFilterStore()

		opts := &logpoller.ServiceOptions{
			Config:   cfg,
			Client:   client,
			Filters:  fs,
			TxLoader: account.NewTxLoader(client, logger.Test(t), cfg.PageSize),
			TxParser: txparser.NewTxParser(logger.Test(t), fs),
			Store:    inmemorystore.NewLogStore(),
		}
		lp := logpoller.NewService(
			logger.Test(t),
			opts,
		)

		// register filters
		filterA := types.Filter{
			Name:     "FilterA",
			Address:  emitterA.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased, // event topic
		}
		faerr := lp.RegisterFilter(t.Context(), filterA)
		require.NoError(t, faerr)

		filterB := types.Filter{
			Name:     "FilterB",
			Address:  emitterB.ContractAddress(),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased, // event topic
		}
		fberr := lp.RegisterFilter(t.Context(), filterB)
		require.NoError(t, fberr)

		// register filter for internal message
		filterC := types.Filter{
			Name:     "FilterC",
			Address:  emitterA.ContractAddress(),
			MsgType:  tlb.MsgTypeInternal,
			EventSig: 0x41c92746, // opcode
		}
		fcerr := lp.RegisterFilter(t.Context(), filterC)
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
			counterA, caerr := counter.GetValue(t.Context(), client, emitterA.ContractAddress())
			if caerr != nil {
				t.Logf("failed to get on-chain counter for emitterA, retrying: %v", caerr)
				return false
			}

			if counterA < targetCounter {
				t.Logf("waiting for counter A to be updated: %d/%d", counterA, targetCounter)
				return false
			}

			// Check emitterB
			counterB, cberr := counter.GetValue(t.Context(), client, emitterB.ContractAddress())
			if cberr != nil {
				t.Logf("failed to get on-chain counter for emitterB, retrying: %v", cberr)
				return false
			}

			if counterB < targetCounter {
				t.Logf("waiting for counter B to be updated: %d/%d", counterB, targetCounter)
				return false
			}

			// get all logs
			resA, resAErr := logpoller.NewQuery[counter.CountIncreased]().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				SkipBytes(4). // skip ID field to reach Counter field
				FilterBytes(4,
					query.GT(binary.BigEndian.AppendUint32(nil, 0)),
					query.LTE(binary.BigEndian.AppendUint32(nil, targetCounter)),
				).
				Execute(t.Context(), lp.GetStore())
			require.NoError(t, resAErr) // query should not fail

			resB, resBErr := logpoller.NewQuery[counter.CountIncreased]().
				WithSource(emitterB.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				SkipBytes(4). // skip ID field to reach Counter field
				FilterBytes(4,
					query.GT(binary.BigEndian.AppendUint32(nil, 0)),
					query.LTE(binary.BigEndian.AppendUint32(nil, targetCounter)),
				).
				Execute(t.Context(), lp.GetStore())
			require.NoError(t, resBErr) // query should not fail

			t.Logf("emitterA logs count: %d, emitterB logs count: %d", len(resA.Logs), len(resB.Logs))

			// Convert logs to messages for emitterA
			var indexedLogsA []*cell.Cell
			for _, log := range resA.Logs {
				indexedLogsA = append(indexedLogsA, log.Data)
			}

			// Convert logs to messages for emitterB
			var indexedLogsB []*cell.Cell
			for _, log := range resB.Logs {
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

			if len(resA.Logs) != targetCounter {
				for _, data := range indexedLogsA {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, data.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterA Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs A... have %d, want %d", len(resA.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			if len(resB.Logs) != targetCounter {
				for _, data := range indexedLogsB {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, data.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterB Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs B... have %d, want %d", len(resB.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// verify stored internal messages
			replyLogsRes, rlerr := logpoller.NewQuery[counter.CountIncreasedMsg]().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(0x41c92746). //TODO: how can we get opcode directly from binding?
				SkipBytes(4).             // skip ID field to reach Counter field
				FilterBytes(4,
					query.GT(binary.BigEndian.AppendUint32(nil, 0)),
					query.LTE(binary.BigEndian.AppendUint32(nil, targetCounter)),
				).
				Execute(t.Context(), lp.GetStore())
			require.NoError(t, rlerr) // query should not fail

			var indexedLogsFromInternalMsgs []*cell.Cell
			for _, log := range replyLogsRes.Logs {
				indexedLogsFromInternalMsgs = append(indexedLogsFromInternalMsgs, log.Data)
			}

			verifyInternalLogsErr := helper.VerifyAllCountLogs(indexedLogsFromInternalMsgs, targetCounter)
			if verifyInternalLogsErr != nil {
				t.Logf("log verification failed for emitterB, will retry: %v", verifyInternalLogsErr)
				return false
			}

			if len(replyLogsRes.Logs) != targetCounter {
				for _, log := range replyLogsRes.Logs {
					t.Logf("emitterA Reply Log: %s", log.String())

					var event counter.CountIncreasedMsg
					err = tlb.LoadFromCell(&event, log.Data.BeginParse(), true)
					require.NoError(t, err)

					t.Logf("emitterA Reply Event Counter=%d", event.Value)
				}
				t.Logf("waiting for internal messages to be indexed... have %d, want %d", len(replyLogsRes.Logs), targetCounter)
				return false
			}

			// If log count and content are correct for both, the test condition is met
			return true
		}, 120*time.Second, 5*time.Second, "log poller did not ingest all events correctly in time")

		t.Run("Stored Block validation", func(t *testing.T) {
			// get all logs
			result, qerr := logpoller.NewQuery[counter.CountIncreased]().
				WithSource(emitterA.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				SkipBytes(4). // skip ID field to reach Counter field
				FilterBytes(4,
					query.GT(binary.BigEndian.AppendUint32(nil, 0)),
					query.LTE(binary.BigEndian.AppendUint32(nil, targetCounter)),
				).
				OrderBy(query.SortByTxLT, query.ASC).
				Execute(t.Context(), lp.GetStore())
			require.NoError(t, qerr)

			for _, logEntry := range result.Logs {
				ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
				defer cancel()

				// call GetTransaction to fetch the transaction and verify the proof.
				// The API client must have proof checking enabled for this to work.
				tx, terr := client.GetTransaction(ctx, logEntry.Block, logEntry.Address, logEntry.TxLT)
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
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					SkipBytes(4). // skip ID field to reach Counter field
					FilterBytes(4,
						query.GT(binary.BigEndian.AppendUint32(nil, 5)),
						query.LTE(binary.BigEndian.AppendUint32(nil, 10)),
					).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, 5, "expected exactly 5 logs for the range 6-10")

				// Parse the logs manually since FilterBytes doesn't parse events
				for _, log := range result.Logs {
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

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					SkipBytes(8). // skip to sender address field
					FilterBytes(uint(len(senderBytes)), query.EQ(senderBytes)).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, targetCounter)

				// Parse events from logs to verify data
				for _, log := range result.Logs {
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
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					SkipBytes(4). // skip ID field to reach Counter field
					FilterBytes(4,
						query.GTE(binary.BigEndian.AppendUint32(nil, 1)),
						query.LTE(binary.BigEndian.AppendUint32(nil, 3)),
					).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, 3, "expected exactly 3 logs for the range 1-3")

				// Parse events from logs to verify data
				for _, log := range result.Logs {
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
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					FilterBytes(4, query.EQ(binary.BigEndian.AppendUint32(nil, emitterB.GetID()))). // compare ID at offset 0
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, log := range result.Logs {
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

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, log := range result.Logs {
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

				// Filter for events where the counter value is odd
				filter := func(event counter.CountIncreased) bool {
					return event.Value%2 == 1 // odd numbers
				}

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					FilterTyped(filter).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				expectedOddCount := 5 // From 1-10, odd numbers are: 1, 3, 5, 7, 9
				require.Len(t, result.Logs, expectedOddCount, "expected exactly %d odd-valued logs", expectedOddCount)

				// Verify all returned logs have odd values
				for _, log := range result.Logs {
					require.Equal(t, uint32(1), log.TypedData.Value%2, "all returned logs should have odd values, got %d", log.TypedData.Value)
					require.GreaterOrEqual(t, log.TypedData.Value, uint32(1))
					require.LessOrEqual(t, log.TypedData.Value, uint32(targetCounter))
				}
			})

			t.Run("Log Poller query with parser pattern with filter, events between 1 to 10 from emitter B", func(t *testing.T) {
				t.Parallel()
				from, to := (1), (10)

				filter := func(event counter.CountIncreased) bool {
					return event.Value >= uint32(from) && event.Value <= uint32(to) //nolint:gosec // test code
				}

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterB.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					FilterTyped(filter).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, to-from+1, "expected exactly 10 logs for the range 1-10")
				seen := make(map[uint32]bool, to-from+1)
				for _, log := range result.Logs {
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

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.ASC).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, targetCounter)

				// verify ascending order by TxLT
				for i := 1; i < len(result.Logs); i++ {
					require.LessOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"logs should be sorted by TxLT in ascending order at index %d", i)
				}
			})

			t.Run("Sort by TxLT descending", func(t *testing.T) {
				t.Parallel()

				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.DESC).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, targetCounter)

				// Verify descending order by TxLT
				for i := 1; i < len(result.Logs); i++ {
					require.GreaterOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"logs should be sorted by TxLT in descending order at index %d", i)
				}
			})

			t.Run("Pagination with limit", func(t *testing.T) {
				t.Parallel()
				const pageSize = 7
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.ASC).
					Limit(7).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, pageSize)
				require.True(t, result.HasMore, "should have more results")
				require.Equal(t, targetCounter, result.Total)
			})

			t.Run("Pagination with offset", func(t *testing.T) {
				t.Parallel()
				const pageSize = 2
				const offset = 8
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.ASC).
					Offset(offset).
					Limit(pageSize).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, pageSize)

				firstPageResult, frerr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.ASC).
					Limit(offset+pageSize). // get first page for comparison
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, frerr)

				// Verify offset page starts where expected
				for i := 0; i < pageSize; i++ {
					require.Equal(t, firstPageResult.Logs[offset+i].TxLT, result.Logs[i].TxLT,
						"offset page should match the correct slice of first page at index %d", i)
				}
			})

			t.Run("Complete pagination test", func(t *testing.T) {
				t.Parallel()

				const pageSize = 6
				var allLogs []types.TypedLog[counter.CountIncreased]
				var pageCount int

				for offset := 0; ; offset += pageSize {
					result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
						WithSource(emitterA.ContractAddress()).
						WithEventSig(counter.TopicCountIncreased).
						OrderBy(query.SortByTxLT, query.ASC).
						Offset(offset).
						Limit(pageSize).
						Execute(t.Context(), lp.GetStore())
					require.NoError(t, queryErr)

					if len(result.Logs) == 0 {
						break
					}

					allLogs = append(allLogs, result.Logs...)
					pageCount++
					if !result.HasMore {
						break
					}
				}

				// Verify we got all logs and no duplicates
				require.Len(t, allLogs, targetCounter, "should have collected all logs through pagination")

				// Verify no duplicates by checking TxLT uniqueness
				seenLTs := make(map[uint64]bool)
				for _, log := range allLogs {
					require.False(t, seenLTs[log.TxLT], "found duplicate TxLT: %d", log.TxLT)
					seenLTs[log.TxLT] = true
				}

				// Verify still sorted after combining pages
				for i := 1; i < len(allLogs); i++ {
					require.LessOrEqual(t, allLogs[i-1].TxLT, allLogs[i].TxLT,
						"combined pages should maintain sort order at index %d", i)
				}
			})

			t.Run("Sorting + filtering + pagination", func(t *testing.T) {
				t.Parallel()
				from, to := 4, 8
				count := to - from + 1

				// Filter for counters 4-8, then sort and paginate
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					SkipBytes(4). // skip ID field to reach Counter field
					FilterBytes(4,
						query.GTE(binary.BigEndian.AppendUint32(nil, uint32(from))),
						query.LTE(binary.BigEndian.AppendUint32(nil, uint32(to))),
					).
					OrderBy(query.SortByTxLT, query.DESC). // Newest first
					Offset(0).
					Limit(count).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, count)

				// Verify the filtering worked
				for _, log := range result.Logs {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Value, uint32(from))
					require.LessOrEqual(t, event.Value, uint32(to))
				}

				// Verify descending sort order
				for i := 1; i < len(result.Logs); i++ {
					require.GreaterOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"filtered results should be sorted in descending TxLT order at index %d", i)
				}
			})

			t.Run("Cross-emitter pagination test", func(t *testing.T) {
				t.Parallel()

				// Test pagination with emitterB events
				const pageSize = 4
				var emitterBPages [][]types.TypedLog[counter.CountIncreased]

				for offset := 0; offset < targetCounter; offset += pageSize {
					result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
						WithSource(emitterB.ContractAddress()).
						WithEventSig(counter.TopicCountIncreased).
						OrderBy(query.SortByTxLT, query.ASC).
						Offset(offset).
						Limit(pageSize).
						Execute(t.Context(), lp.GetStore())
					require.NoError(t, queryErr)

					if len(result.Logs) > 0 {
						emitterBPages = append(emitterBPages, result.Logs)
					}
				}

				// Flatten all pages
				var allEmitterBLogs []types.TypedLog[counter.CountIncreased]
				for _, page := range emitterBPages {
					allEmitterBLogs = append(allEmitterBLogs, page...)
				}

				require.Len(t, allEmitterBLogs, targetCounter, "should have all emitterB logs")

				// Verify each log belongs to emitterB by checking the ID in cell data
				for _, log := range allEmitterBLogs {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					require.Equal(t, emitterB.GetID(), event.ID, "log should belong to emitterB")
				}
			})

			t.Run("Edge case: empty results pagination", func(t *testing.T) {
				t.Parallel()
				// filter for impossible range
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					SkipBytes(4).                                                      // skip ID field to reach Counter field
					FilterBytes(4, query.GT(binary.BigEndian.AppendUint32(nil, 100))). // No events should match
					OrderBy(query.SortByTxLT, query.ASC).
					Offset(0).
					Limit(10).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
				require.Equal(t, 0, result.Total)
			})

			t.Run("Edge case: offset beyond total", func(t *testing.T) {
				t.Parallel()
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitterA.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					OrderBy(query.SortByTxLT, query.ASC).
					Offset(targetCounter+10). // Way beyond available data
					Limit(5).
					Execute(t.Context(), lp.GetStore())
				require.NoError(t, queryErr)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
			})
		})
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

	t.Run("Lookback Window Discovery", func(t *testing.T) {
		t.Run("Basic lookback discovery - all events within window", func(t *testing.T) {
			t.Parallel()
			// Test configuration
			const targetCounter = 10
			const interval = 2 * time.Second
			expectedEvents := targetCounter

			// Setup event emitter
			sender := test_utils.CreateRandomHighloadWallet(t, client)
			test_utils.FundWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
			emitter, err := helper.NewTestEventSource(client, sender, "lookbackTestEmitter", rand.Uint32(), logger.Test(t))
			require.NoError(t, err)

			// 1. Start emitting events over time (targetCounter events at 2-second intervals = 20 seconds total)
			evctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			t.Logf("Starting to emit %d events at %v intervals...", expectedEvents, interval)
			err = emitter.Start(evctx, interval, big.NewInt(int64(targetCounter)))
			require.NoError(t, err)

			// Wait for all events to be emitted
			require.NoError(t, emitter.Wait())
			t.Logf("Finished emitting events, now waiting 30 seconds before starting logpoller")

			// 2. Wait 30 seconds after all events are done
			time.Sleep(30 * time.Second)

			// 3. Start logpoller with 3-minute lookback window (should capture all events)
			cfg := logpoller.DefaultConfigSet
			cfg.LogPollerStartingLookback = 10 * time.Minute // Lookback window longer than wait time
			cfg.PollPeriod = 2 * time.Second                 // Faster polling for test

			fs := inmemorystore.NewFilterStore()
			opts := &logpoller.ServiceOptions{
				Config:   cfg,
				Client:   client,
				Filters:  fs,
				TxLoader: account.NewTxLoader(client, logger.Test(t), cfg.PageSize),
				TxParser: txparser.NewTxParser(logger.Test(t), fs),
				Store:    inmemorystore.NewLogStore(),
			}
			lp := logpoller.NewService(logger.Test(t), opts)

			// Register filter for the emitted events
			filter := types.Filter{
				Name:     "LookbackTestFilter",
				Address:  emitter.ContractAddress(),
				MsgType:  tlb.MsgTypeExternalOut,
				EventSig: counter.TopicCountIncreased,
			}
			require.NoError(t, lp.RegisterFilter(t.Context(), filter))

			// Start the logpoller
			require.NoError(t, lp.Start(t.Context()))
			defer func() {
				require.NoError(t, lp.Close())
			}()

			// 4. Verify all events were ingested via lookback discovery
			require.Eventually(t, func() bool {
				result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
					WithSource(emitter.ContractAddress()).
					WithEventSig(counter.TopicCountIncreased).
					Execute(t.Context(), lp.GetStore())
				if queryErr != nil {
					t.Logf("Query failed: %v", queryErr)
					return false
				}

				actualEvents := len(result.Logs)
				t.Logf("Lookback discovery progress: found %d/%d events", actualEvents, expectedEvents)

				if actualEvents != expectedEvents {
					return false
				}

				// Verify event content integrity
				var indexedCells []*cell.Cell
				for _, log := range result.Logs {
					indexedCells = append(indexedCells, log.Data)
				}

				verifyErr := helper.VerifyAllCountLogs(indexedCells, expectedEvents)
				if verifyErr != nil {
					t.Logf("Event verification failed: %v", verifyErr)
					return false
				}

				t.Logf("✓ Successfully discovered all %d events via lookback window", expectedEvents)
				return true
			}, 60*time.Second, 5*time.Second, "logpoller should discover all events within lookback window")
		})

		t.Run("Edge case - events outside lookback window", func(t *testing.T) {
			t.Parallel()
			// Test configuration
			const targetCounter = 10
			const interval = 3 * time.Second
			expectedEvents := targetCounter

			// Setup event emitter
			sender := test_utils.CreateRandomHighloadWallet(t, client)
			test_utils.FundWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
			emitter, err := helper.NewTestEventSource(client, sender, "lookbackEdgeTestEmitter", rand.Uint32(), logger.Test(t))
			require.NoError(t, err)

			// 1. Start emitting events over time (targetCounter events at 3-second intervals = 30 seconds total)
			evctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			t.Logf("Starting to emit %d events at %v intervals (total duration ~30s)...", expectedEvents, interval)
			err = emitter.Start(evctx, interval, big.NewInt(int64(targetCounter)))
			require.NoError(t, err)

			// Wait for all events to be emitted
			require.NoError(t, emitter.Wait())
			t.Logf("Finished emitting events, now waiting 15 seconds to age some events")

			// 2. Wait 15 seconds after all events are done (some events will be 15-45 seconds old)
			time.Sleep(15 * time.Second)

			// 3. Start logpoller with 20-second lookback window (should miss early events)
			// Events span: oldest=45s ago, newest=15s ago, lookback=20s → should find ~5-6 recent events
			cfg := logpoller.DefaultConfigSet
			cfg.LogPollerStartingLookback = 20 * time.Second // Should catch events from last 20s only
			cfg.PollPeriod = 2 * time.Second                 // Faster polling for test
			t.Logf("Lookback window: %v (should miss events older than 20s)", cfg.LogPollerStartingLookback)

			fs := inmemorystore.NewFilterStore()
			opts := &logpoller.ServiceOptions{
				Config:   cfg,
				Client:   client,
				Filters:  fs,
				TxLoader: account.NewTxLoader(client, logger.Test(t), cfg.PageSize),
				TxParser: txparser.NewTxParser(logger.Test(t), fs),
				Store:    inmemorystore.NewLogStore(),
			}
			lp := logpoller.NewService(logger.Test(t), opts)

			// Register filter for the emitted events
			filter := types.Filter{
				Name:     "LookbackEdgeTestFilter",
				Address:  emitter.ContractAddress(),
				MsgType:  tlb.MsgTypeExternalOut,
				EventSig: counter.TopicCountIncreased,
			}
			require.NoError(t, lp.RegisterFilter(t.Context(), filter))

			// Start the logpoller
			require.NoError(t, lp.Start(t.Context()))
			defer func() {
				require.NoError(t, lp.Close())
			}()

			// 4. Wait for lookback discovery to complete, then verify fewer events were found
			time.Sleep(30 * time.Second) // Give logpoller time to complete lookback discovery

			result, queryErr := logpoller.NewQuery[counter.CountIncreased]().
				WithSource(emitter.ContractAddress()).
				WithEventSig(counter.TopicCountIncreased).
				Execute(t.Context(), lp.GetStore())
			require.NoError(t, queryErr)

			actualEvents := len(result.Logs)
			t.Logf("Edge case result: found %d events (expected fewer than %d total)", actualEvents, expectedEvents)
			t.Logf("Timeline: events emitted over 30s, waited 15s, lookback=%v", cfg.LogPollerStartingLookback)

			// Verify that we found fewer events than expected (some were outside the lookback window)
			// With 20s lookback and events aged 15-45s, we should find roughly the last 5-6 events
			expectedMinEvents := 3 // At least some recent events
			expectedMaxEvents := 7 // But not all 10 events

			require.GreaterOrEqual(t, actualEvents, expectedMinEvents,
				"should find at least some recent events within lookback window")
			require.LessOrEqual(t, actualEvents, expectedMaxEvents,
				"should not find all events due to lookback window limitation")

			// Verify the content of found events is still valid
			if actualEvents > 0 {
				var indexedCells []*cell.Cell
				for _, log := range result.Logs {
					indexedCells = append(indexedCells, log.Data)
				}

				// Verify found events are valid (but don't expect all events)
				for _, logCell := range indexedCells {
					var event counter.CountIncreased
					parseErr := tlb.LoadFromCell(&event, logCell.BeginParse())
					require.NoError(t, parseErr, "found events should be parseable")
				}

				t.Logf("✓ Successfully demonstrated lookback window boundary: %d/%d events found",
					actualEvents, expectedEvents)
			}
		})
	})
}
