package smoke

import (
	"encoding/binary"
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"integration-tests/smoke/logpoller/counter"
	helper "integration-tests/smoke/logpoller/helper"
	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

func Test_LogPoller(t *testing.T) {
	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector).WithRetry()
	require.NotNil(t, client)

	t.Run("log poller:log collector event ingestion", func(t *testing.T) {
		t.Parallel()
		// test event source config
		const batchCount = 3
		const txPerBatch = 5
		const msgPerTx = 2

		// block buffer(lastTx contains original msg and we should discover extOutMsg)
		// TODO: realistically how many more blocks to be processed from the original tx? depends on network load?
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
			loader := logpoller.NewLogCollector(client, logger.Test(t), pageSize)

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

			loader := logpoller.NewLogCollector(client, logger.Test(t), pageSize)

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

		emitterA, err := helper.NewTestEventSource(t.Context(), client, senderA, "emitterA", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		emitterB, err := helper.NewTestEventSource(t.Context(), client, senderB, "emitterB", rand.Uint32(), logger.Test(t))
		require.NoError(t, err)

		const targetCounter = 10

		cfg := logpoller.DefaultConfigSet
		lp := logpoller.NewLogPoller(
			logger.Test(t),
			client,
			cfg,
		)

		// register filters
		filterA := types.Filter{
			Name:       "FilterA",
			Address:    types.Address{Address: emitterA.ContractAddress()},
			EventName:  "CounterIncreased",
			EventTopic: counter.CountIncreasedEventTopic,
		}
		faerr := lp.RegisterFilter(t.Context(), filterA)
		require.NoError(t, faerr)

		filterB := types.Filter{
			Name:       "FilterB",
			Address:    types.Address{Address: emitterB.ContractAddress()},
			EventName:  "CounterIncreased",
			EventTopic: counter.CountIncreasedEventTopic,
		}
		fberr := lp.RegisterFilter(t.Context(), filterB)
		require.NoError(t, fberr)

		// start listening for logs
		require.NoError(t, lp.Start(t.Context()))
		defer func() {
			require.NoError(t, lp.Close())
		}()

		// start event emission loops, which will stop itself once the target is reached
		err = emitterA.Start(t.Context(), 1*time.Second, big.NewInt(targetCounter))
		require.NoError(t, err)
		err = emitterB.Start(t.Context(), 1*time.Second, big.NewInt(targetCounter))
		require.NoError(t, err)
		defer func() {
			emitterA.Stop()
			emitterB.Stop()
		}()

		require.Eventually(t, func() bool {
			// Check both emitters' on-chain counters
			master, err := client.CurrentMasterchainInfo(t.Context())
			if err != nil {
				t.Logf("failed to get masterchain info, retrying: %v", err)
				return false
			}

			// Check emitterA
			counterA, err := emitterA.GetCounterValue(t.Context(), master)
			if err != nil {
				t.Logf("failed to get on-chain counter for emitterA, retrying: %v", err)
				return false
			}

			if counterA.Uint64() < uint64(targetCounter) {
				t.Logf("waiting for counter A to be updated: %d/%d", counterA.Uint64(), targetCounter)
				return false
			}

			// Check emitterB
			counterB, err := emitterB.GetCounterValue(t.Context(), master)
			if err != nil {
				t.Logf("failed to get on-chain counter for emitterB, retrying: %v", err)
				return false
			}

			if counterB.Uint64() < uint64(targetCounter) {
				t.Logf("waiting for counter B to be updated: %d/%d", counterB.Uint64(), targetCounter)
				return false
			}

			// get all logs
			queries := []logpoller.CellQuery{
				{
					Offset:   4,
					Operator: logpoller.GT,
					Value:    binary.BigEndian.AppendUint32(nil, 0),
				},
				{
					Offset:   4,
					Operator: logpoller.LTE,
					Value:    binary.BigEndian.AppendUint32(nil, targetCounter),
				},
			}

			options := logpoller.QueryOptions{} // Default options (no sorting, no pagination)

			resA, err := lp.FilteredLogs(t.Context(), emitterA.ContractAddress(), counter.CountIncreasedEventTopic, queries, options)
			require.NoError(t, err) // query should not fail
			resB, err := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.CountIncreasedEventTopic, queries, options)
			require.NoError(t, err) // query should not fail

			t.Logf("emitterA logs count: %d, emitterB logs count: %d", len(resA.Logs), len(resB.Logs))

			// Convert logs to messages for emitterA
			var msgsA []*tlb.ExternalMessageOut
			for _, log := range resA.Logs {
				c, cberr := cell.FromBOC(log.Data)
				if cberr != nil {
					t.Logf("failed to parse log data for emitterA, will retry: %v", err)
					return false
				}
				ext := &tlb.ExternalMessageOut{
					Body: c,
				}
				msgsA = append(msgsA, ext)
			}

			// Convert logs to messages for emitterB
			var msgsB []*tlb.ExternalMessageOut
			for _, log := range resB.Logs {
				c, cberr := cell.FromBOC(log.Data)
				if cberr != nil {
					t.Logf("failed to parse log data for emitterB, will retry: %v", err)
					return false
				}
				ext := &tlb.ExternalMessageOut{
					Body: c,
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
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, msg.Body.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterA Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs A... have %d, want %d", len(resA.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			if len(resB.Logs) != targetCounter {
				for _, msg := range msgsB {
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, msg.Body.BeginParse())
					require.NoError(t, err)
					t.Logf("emitterB Event Counter=%d", event.Value)
				}
				t.Logf("waiting for logs B... have %d, want %d", len(resB.Logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// If log count and content are correct for both, the test condition is met
			return true
		}, 180*time.Second, 5*time.Second, "log poller did not ingest all events correctly in time")

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
				queries := []logpoller.CellQuery{
					{
						Offset:   4,
						Operator: logpoller.GT,
						Value:    binary.BigEndian.AppendUint32(nil, 5),
					},
					{
						Offset:   4,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, 10),
					},
				}

				options := logpoller.QueryOptions{} // Default options (no sorting, no pagination)

				result, err := lp.FilteredLogs(t.Context(), emitterA.ContractAddress(), counter.CountIncreasedEventTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, 5, "expected exactly 5 logs for the range 6-10")

				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, c.BeginParse())
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.Greater(t, event.Value, uint32(5))
					require.LessOrEqual(t, event.Value, uint32(10))
				}
			})

			t.Run("Log Poller Query With Cell Filter, events from emitter B", func(t *testing.T) {
				t.Parallel()
				queries := []logpoller.CellQuery{
					{
						Offset:   4,
						Operator: logpoller.GTE,
						Value:    binary.BigEndian.AppendUint32(nil, 1),
					},
					{
						Offset:   4,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, 3),
					},
				}

				options := logpoller.QueryOptions{} // Default options

				result, err := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.CountIncreasedEventTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, 3, "expected exactly 3 logs for the range 1-3")

				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, c.BeginParse())
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.GreaterOrEqual(t, event.Value, uint32(1))
					require.LessOrEqual(t, event.Value, uint32(3))
				}
			})

			t.Run("Log Poller Query With Cell Query, all events from emitter B", func(t *testing.T) {
				t.Parallel()
				// the CounterIncreased event data layout is [ID (4 bytes), Counter (4 bytes)].
				queries := []logpoller.CellQuery{
					{
						Offset:   0,
						Operator: logpoller.EQ,
						Value:    binary.BigEndian.AppendUint32(nil, emitterB.GetID()), // compare ID
					},
				}

				options := logpoller.QueryOptions{} // Default options

				result, err := lp.FilteredLogs(t.Context(), emitterB.ContractAddress(), counter.CountIncreasedEventTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, c.BeginParse())
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

				parser := func(c *cell.Cell) (any, error) {
					var event counter.CountIncreasedEvent
					err := tlb.LoadFromCell(&event, c.BeginParse())
					if err != nil {
						return nil, fmt.Errorf("failed to parse event from cell: %w", err)
					}
					return event, nil
				}

				res, err := lp.FilteredLogsWithParser(t.Context(), emitterB.ContractAddress(), counter.CountIncreasedEventTopic, parser, nil)
				require.NoError(t, err)

				require.Len(t, res, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint32]bool, targetCounter)
				for i, item := range res {
					require.IsType(t, counter.CountIncreasedEvent{}, item, "item at index %d has wrong type", i)
					ev := item.(counter.CountIncreasedEvent)

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

			t.Run("Log Poller query with parser pattern with filter, events between 1 to 10 from emitter B", func(t *testing.T) {
				t.Parallel()
				from, to := (1), (10)

				parser := func(c *cell.Cell) (any, error) {
					var event counter.CountIncreasedEvent
					err := tlb.LoadFromCell(&event, c.BeginParse())
					if err != nil {
						return nil, fmt.Errorf("failed to parse event from cell: %w", err)
					}
					return event, nil
				}

				filter := func(parsedEvent any) bool {
					evt, ok := parsedEvent.(counter.CountIncreasedEvent)
					if !ok {
						return false
					}
					return evt.Value >= uint32(from) && evt.Value <= uint32(to) //nolint:gosec // test code
				}

				res, err := lp.FilteredLogsWithParser(t.Context(), emitterB.ContractAddress(), counter.CountIncreasedEventTopic, parser, filter)
				require.NoError(t, err)

				require.Len(t, res, to-from+1, "expected exactly 10 logs for the range 1-10")
				seen := make(map[uint32]bool, to-from+1)
				for i, item := range res {
					require.IsType(t, counter.CountIncreasedEvent{}, item, "item at index %d has wrong type", i)
					ev := item.(counter.CountIncreasedEvent)

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

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{}, // No cell filters
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, targetCounter)

				// verify ascending order by TxLT
				for i := 1; i < len(result.Logs); i++ {
					require.LessOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"logs should be sorted by TxLT in ascending order at index %d", i)
				}
			})

			t.Run("Sort by TxLT descending", func(t *testing.T) {
				t.Parallel()

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC},
					},
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
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
				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit: pageSize,
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, pageSize)
				require.True(t, result.HasMore, "should have more results")
				require.Equal(t, targetCounter, result.Total)
			})

			t.Run("Pagination with offset", func(t *testing.T) {
				t.Parallel()

				const pageSize = 2
				const offset = 8

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  pageSize,
					Offset: offset,
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, pageSize)

				// Get first page for comparison
				firstPageOptions := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit: offset + pageSize,
				}

				firstPageResult, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{},
					firstPageOptions,
				)
				require.NoError(t, err)

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
					options := logpoller.QueryOptions{
						SortBy: []logpoller.SortBy{
							{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
						},
						Limit:  pageSize,
						Offset: offset,
					}

					result, err := lp.FilteredLogs(t.Context(),
						emitterA.ContractAddress(),
						counter.CountIncreasedEventTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

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
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   4,
						Operator: logpoller.GTE,
						Value:    binary.BigEndian.AppendUint32(nil, uint32(from)),
					},
					{
						Offset:   4,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint32(nil, uint32(to)),
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC}, // Newest first
					},
					Limit:  count,
					Offset: 0,
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					cellQueries,
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, count)

				// Verify the filtering worked
				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, c.BeginParse())
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
					options := logpoller.QueryOptions{
						SortBy: []logpoller.SortBy{
							{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
						},
						Limit:  pageSize,
						Offset: offset,
					}

					result, err := lp.FilteredLogs(t.Context(),
						emitterB.ContractAddress(),
						counter.CountIncreasedEventTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

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
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					var event counter.CountIncreasedEvent
					err = tlb.LoadFromCell(&event, c.BeginParse())
					require.NoError(t, err)

					require.Equal(t, emitterB.GetID(), event.ID, "log should belong to emitterB")
				}
			})

			t.Run("Edge case: empty results pagination", func(t *testing.T) {
				t.Parallel()

				// Filter for impossible range
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   4,
						Operator: logpoller.GT,
						Value:    binary.BigEndian.AppendUint32(nil, 100), // No events should match
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  10,
					Offset: 0,
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					cellQueries,
					options,
				)
				require.NoError(t, err)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
				require.Equal(t, 0, result.Total)
			})

			t.Run("Edge case: offset beyond total", func(t *testing.T) {
				t.Parallel()

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  5,
					Offset: targetCounter + 10, // Way beyond available data
				}

				result, err := lp.FilteredLogs(t.Context(),
					emitterA.ContractAddress(),
					counter.CountIncreasedEventTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
			})
		})
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})
}
