package smoke

import (
	"context"
	"encoding/binary"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	helper "integration-tests/smoke/logpoller/helper"
	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

func Test_LogPoller(t *testing.T) {
	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector).WithRetry()
	require.NotNil(t, client)

	t.Run("log poller:accountmsgloader event ingestion", func(t *testing.T) {
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

		t.Run("loading entire block range at once", func(t *testing.T) {
			t.Parallel()
			loader := account.NewMsgLoader(client, logger.Test(t), pageSize)

			msgs, berr := loader.BackfillForAddresses(
				t.Context(),
				[]*address.Address{emitter.ContractAddress()},
				prevBlock,
				toBlock,
			)
			require.NoError(t, berr)
			exts := make([]*tlb.ExternalMessageOut, 0, len(msgs))
			for _, msg := range msgs {
				exts = append(exts, msg.Msg)
			}
			require.NoError(t, helper.VerifyLoadedEvents(exts, expectedEvents))
		})

		t.Run("loading block by block", func(t *testing.T) {
			t.Parallel()
			var allMsgs []*tlb.ExternalMessageOut

			loader := account.NewMsgLoader(client, logger.Test(t), pageSize)

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

				msgs, berr := loader.BackfillForAddresses(
					t.Context(),
					[]*address.Address{emitter.ContractAddress()},
					currentBlock, // from current block (exclusive)
					nextBlock,    // to next block (inclusive)
				)
				require.NoError(t, berr)

				exts := make([]*tlb.ExternalMessageOut, 0, len(msgs))
				for _, msg := range msgs {
					exts = append(exts, msg.Msg)
				}
				allMsgs = append(allMsgs, exts...)
				currentBlock = nextBlock // update for next iteration
			}

			// verify if we loaded all expected events, without duplicates
			err = helper.VerifyLoadedEvents(allMsgs, batchCount*txPerBatch*msgPerTx)
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
		// DI
		logStore := inmemorystore.NewLogStore(logger.Test(t))
		filterStore := inmemorystore.NewFilterStore()
		loader := account.NewMsgLoader(client, logger.Test(t), cfg.PageSize)

		opts := &logpoller.ServiceOptions{
			Client:        client,
			Config:        cfg,
			Store:         logStore,
			Filters:       filterStore,
			MessageLoader: loader,
		}
		lp := logpoller.NewService(
			logger.Test(t),
			opts,
		)

		// register filters
		filterA := types.Filter{
			Name:       "FilterA",
			Address:    emitterA.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: counter.TopicCountIncreased,
		}
		faerr := lp.RegisterFilter(t.Context(), filterA)
		require.NoError(t, faerr)

		filterB := types.Filter{
			Name:       "FilterB",
			Address:    emitterB.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: counter.TopicCountIncreased,
		}
		fberr := lp.RegisterFilter(t.Context(), filterB)
		require.NoError(t, fberr)

		hasFilterA := lp.HasFilter(t.Context(), filterA.Name)
		require.True(t, hasFilterA)
		hasFilterB := lp.HasFilter(t.Context(), filterB.Name)
		require.True(t, hasFilterB)
		hasFilterC := lp.HasFilter(t.Context(), "tons of fun")
		require.False(t, hasFilterC)

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
			queries := []cellquery.CellQuery{
				{
					Offset:   4,
					Operator: cellquery.GT,
					Value:    binary.BigEndian.AppendUint32(nil, 0),
				},
				{
					Offset:   4,
					Operator: cellquery.LTE,
					Value:    binary.BigEndian.AppendUint32(nil, targetCounter),
				},
			}

			options := cellquery.QueryOptions{} // Default options (no sorting, no pagination)

			resA, resAErr := lp.FilteredLogs(t.Context(), emitterA.ContractAddress(), counter.TopicCountIncreased, queries, options)
			require.NoError(t, resAErr) // query should not fail
			resB, resBErr := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased, queries, options)
			require.NoError(t, resBErr) // query should not fail

			t.Logf("emitterA logs count: %d, emitterB logs count: %d", len(resA.Logs), len(resB.Logs))

			// Convert logs to messages for emitterA
			var msgsA []*tlb.ExternalMessageOut
			for _, log := range resA.Logs {
				ext := &tlb.ExternalMessageOut{
					Body: log.Data,
				}
				msgsA = append(msgsA, ext)
			}

			// Convert logs to messages for emitterB
			var msgsB []*tlb.ExternalMessageOut
			for _, log := range resB.Logs {
				ext := &tlb.ExternalMessageOut{
					Body: log.Data,
				}
				msgsB = append(msgsB, ext)
			}

			// Verify the content of the logs for emitterA (no duplicates, all counters present)
			verrA := helper.VerifyLoadedEvents(msgsA, targetCounter)
			if verrA != nil {
				t.Logf("log verification failed for emitterA, will retry: %v", verrA)
				return false
			}

			// Verify the content of the logs for emitterB (no duplicates, all counters present)
			verrB := helper.VerifyLoadedEvents(msgsB, targetCounter)
			if verrB != nil {
				t.Logf("log verification failed for emitterB, will retry: %v", verrB)
				return false
			}

			if len(resA.Logs) != targetCounter {
				for _, msg := range msgsA {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, msg.Body.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterA Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs A... have %d, want %d", len(resA.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			if len(resB.Logs) != targetCounter {
				for _, msg := range msgsB {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, msg.Body.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterB Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs B... have %d, want %d", len(resB.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// If log count and content are correct for both, the test condition is met
			return true
		}, 120*time.Second, 5*time.Second, "log poller did not ingest all events correctly in time")

		t.Run("Cell Query Tests", func(t *testing.T) {
			// the log poller service itself provides a simple query interface(w/o full DSL support)
			// define filters to find logs where the counter is between 5 and 10.
			// the CounterIncreased event data layout is [ID (4 bytes), Counter (4 bytes)].
			// so, the Counter field is at offset 4.
			// we can try to create event type > cell filter util, but that's whole another story.
			// this is somewhat similar to "LogsDataWordBetween" in evm logpoller,
			// TODO: with SQL we might need to implement a more efficient way to query logs.
			t.Run("Cell Query, events from emitter A", func(t *testing.T) {
				t.Parallel()
				queries := []cellquery.CellQuery{
					{
						Offset:   4,
						Operator: cellquery.GT,
						Value:    binary.BigEndian.AppendUint32(nil, 5),
					},
					{
						Offset:   4,
						Operator: cellquery.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, 10),
					},
				}

				options := cellquery.QueryOptions{} // Default options (no sorting, no pagination)

				result, queryErr := lp.FilteredLogs(t.Context(), emitterA.ContractAddress(), counter.TopicCountIncreased, queries, options)
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, 5, "expected exactly 5 logs for the range 6-10")

				for _, log := range result.Logs {
					require.NoError(t, err)
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.Greater(t, event.Value, uint32(5))
					require.LessOrEqual(t, event.Value, uint32(10))
				}
			})

			t.Run("Log Poller Query With Cell Filter, events from emitter B", func(t *testing.T) {
				t.Parallel()
				queries := []cellquery.CellQuery{
					{
						Offset:   4,
						Operator: cellquery.GTE,
						Value:    binary.BigEndian.AppendUint32(nil, 1),
					},
					{
						Offset:   4,
						Operator: cellquery.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, 3),
					},
				}

				options := cellquery.QueryOptions{} // Default options

				result, queryErr := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased, queries, options)
				require.NoError(t, queryErr)

				require.Len(t, result.Logs, 3, "expected exactly 3 logs for the range 1-3")

				for _, log := range result.Logs {
					var event counter.CountIncreased
					err = tlb.LoadFromCell(&event, log.Data.BeginParse())
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.GreaterOrEqual(t, event.Value, uint32(1))
					require.LessOrEqual(t, event.Value, uint32(3))
				}
			})

			t.Run("Log Poller Query With Cell Query, all events from emitter B", func(t *testing.T) {
				t.Parallel()
				// the CounterIncreased event data layout is [ID (4 bytes), Counter (4 bytes)].
				queries := []cellquery.CellQuery{
					{
						Offset:   0,
						Operator: cellquery.EQ,
						Value:    binary.BigEndian.AppendUint32(nil, emitterB.GetID()), // compare ID
					},
				}

				options := cellquery.QueryOptions{} // Default options

				result, queryErr := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased, queries, options)
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

				res, queryErr := logpoller.NewQuery[counter.CountIncreased](lp).All(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased)
				require.NoError(t, queryErr)

				require.Len(t, res, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, ev := range res {
					require.GreaterOrEqual(t, ev.Value, uint32(1))
					require.LessOrEqual(t, ev.Value, uint32(targetCounter))

					if seen[ev.Value] {
						t.Fatalf("duplicate counter %d found", ev.Value)
					}
					seen[ev.Value] = true
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

				res, queryErr := logpoller.NewQuery[counter.CountIncreased](lp).WithFilter(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased, filter)
				require.NoError(t, queryErr)

				expectedOddCount := 5 // From 1-10, odd numbers are: 1, 3, 5, 7, 9
				require.Len(t, res, expectedOddCount, "expected exactly %d odd-valued logs", expectedOddCount)

				// Verify all returned events have odd values
				for _, ev := range res {
					require.Equal(t, uint32(1), ev.Value%2, "all returned events should have odd values, got %d", ev.Value)
					require.GreaterOrEqual(t, ev.Value, uint32(1))
					require.LessOrEqual(t, ev.Value, uint32(targetCounter))
				}
			})

			t.Run("Log Poller query with parser pattern with filter, events between 1 to 10 from emitter B", func(t *testing.T) {
				t.Parallel()
				from, to := (1), (10)

				filter := func(event counter.CountIncreased) bool {
					return event.Value >= uint32(from) && event.Value <= uint32(to) //nolint:gosec // test code
				}

				res, queryErr := logpoller.NewQuery[counter.CountIncreased](lp).WithFilter(t.Context(), emitterB.ContractAddress(), counter.TopicCountIncreased, filter)
				require.NoError(t, queryErr)

				require.Len(t, res, to-from+1, "expected exactly 10 logs for the range 1-10")
				seen := make(map[uint32]bool, to-from+1)
				for _, ev := range res {
					require.GreaterOrEqual(t, ev.Value, uint32(from)) //nolint:gosec // test code
					require.LessOrEqual(t, ev.Value, uint32(to))      //nolint:gosec // test code

					if seen[ev.Value] {
						t.Fatalf("duplicate counter %d found", ev.Value)
					}
					seen[ev.Value] = true
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

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{}, // No cell filters
					options,
				)
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

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.DESC},
					},
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{},
					options,
				)
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
				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
					Limit: pageSize,
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{},
					options,
				)
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, pageSize)
				require.True(t, result.HasMore, "should have more results")
				require.Equal(t, targetCounter, result.Total)
			})

			t.Run("Pagination with offset", func(t *testing.T) {
				t.Parallel()

				const pageSize = 2
				const offset = 8

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
					Limit:  pageSize,
					Offset: offset,
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{},
					options,
				)
				require.NoError(t, queryErr)
				require.Len(t, result.Logs, pageSize)

				// Get first page for comparison
				firstPageOptions := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
					Limit: offset + pageSize,
				}

				firstPageResult, frerr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{},
					firstPageOptions,
				)
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
				var allLogs []types.Log
				var pageCount int

				for offset := 0; ; offset += pageSize {
					options := cellquery.QueryOptions{
						SortBy: []cellquery.SortBy{
							{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
						},
						Limit:  pageSize,
						Offset: offset,
					}

					result, queryErr := lp.FilteredLogs(t.Context(),
						emitterA.ContractAddress(),
						counter.TopicCountIncreased,
						[]cellquery.CellQuery{},
						options,
					)
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
				cellQueries := []cellquery.CellQuery{
					{
						Offset:   4,
						Operator: cellquery.GTE,
						Value:    binary.BigEndian.AppendUint32(nil, uint32(from)),
					},
					{
						Offset:   4,
						Operator: cellquery.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, uint32(to)),
					},
				}

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.DESC}, // Newest first
					},
					Limit:  count,
					Offset: 0,
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					cellQueries,
					options,
				)
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
				var emitterBPages [][]types.Log

				for offset := 0; offset < targetCounter; offset += pageSize {
					options := cellquery.QueryOptions{
						SortBy: []cellquery.SortBy{
							{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
						},
						Limit:  pageSize,
						Offset: offset,
					}

					result, queryErr := lp.FilteredLogs(t.Context(),
						emitterB.ContractAddress(),
						counter.TopicCountIncreased,
						[]cellquery.CellQuery{},
						options,
					)
					require.NoError(t, queryErr)

					if len(result.Logs) > 0 {
						emitterBPages = append(emitterBPages, result.Logs)
					}
				}

				// Flatten all pages
				var allEmitterBLogs []types.Log
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

				// Filter for impossible range
				cellQueries := []cellquery.CellQuery{
					{
						Offset:   4,
						Operator: cellquery.GT,
						Value:    binary.BigEndian.AppendUint32(nil, 100), // No events should match
					},
				}

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
					Limit:  10,
					Offset: 0,
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					cellQueries,
					options,
				)
				require.NoError(t, queryErr)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
				require.Equal(t, 0, result.Total)
			})

			t.Run("Edge case: offset beyond total", func(t *testing.T) {
				t.Parallel()

				options := cellquery.QueryOptions{
					SortBy: []cellquery.SortBy{
						{Field: cellquery.SortByTxLT, Order: cellquery.ASC},
					},
					Limit:  5,
					Offset: targetCounter + 10, // Way beyond available data
				}

				result, queryErr := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.TopicCountIncreased,
					[]cellquery.CellQuery{},
					options,
				)
				require.NoError(t, queryErr)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
			})
		})
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})
}
