package smoke

import (
	"encoding/binary"
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	event_emitter "integration-tests/smoke/logpoller/eventemitter"
	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
)

func sendBulkTestEventTxs(t *testing.T, client ton.APIClientWrapped, config event_emitter.Config) (*event_emitter.EventEmitter, []event_emitter.TxResult) {
	// event sending wallet
	sender := test_utils.CreateRandomHighloadWallet(t, client)
	test_utils.FundWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
	require.NotNil(t, sender)
	// deploy event emitter contract
	emitter, err := event_emitter.NewEventEmitter(t.Context(), client, "emitter", rand.Uint64(), sender, logger.Test(t))
	require.NoError(t, err)
	// bulk send events
	txs, err := emitter.CreateBulkTestEvents(t.Context(), config)
	require.NoError(t, err)

	expectedCounter := uint64(config.BatchCount * config.TxPerBatch * config.MsgPerTx) //nolint:gosec // test code

	require.Eventually(t, func() bool {
		master, err := client.CurrentMasterchainInfo(t.Context())
		if err != nil {
			return false
		}
		currentCounter, err := event_emitter.GetCounter(t.Context(), client.WaitForBlock(master.SeqNo), master, emitter.ContractAddress())
		if err != nil {
			return false
		}
		return currentCounter.Uint64() == expectedCounter
	}, 30*time.Second, 2*time.Second, "Counter did not reach expected value within timeout")

	t.Logf("On-chain counter reached expected value of %d.", expectedCounter)

	time.Sleep(20 * time.Second)
	return emitter, txs
}

func verifyLoadedEvents(msgs []*tlb.ExternalMessageOut, expectedCount int) error {
	seen := make(map[uint64]bool, expectedCount)

	// parse all events and track counters
	for i, ext := range msgs {
		event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
		if err != nil {
			return fmt.Errorf("failed to parse event #%d: %w", i, err)
		}

		// check for duplicates
		if seen[event.Counter] {
			return fmt.Errorf("duplicate counter %d found at index %d", event.Counter, i)
		}
		seen[event.Counter] = true
	}
	// verify all expected counters are present (1 to expectedCount)
	var missing []int
	for i := 1; i <= expectedCount; i++ {
		if !seen[uint64(i)] { //nolint:gosec // test code
			missing = append(missing, i)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("not all expected counters found, missing some from 1 to %v", missing)
	}

	return nil
}

func waitForBlock(t *testing.T, client ton.APIClientWrapped, toBlock *ton.BlockIDExt, blockConfirmations uint32) {
	require.Eventually(t, func() bool {
		latestMaster, err := client.CurrentMasterchainInfo(t.Context())
		if err != nil {
			return false
		}
		t.Logf("latest / target seqno: %d / %d, %d left", latestMaster.SeqNo, toBlock.SeqNo+blockConfirmations, (toBlock.SeqNo+blockConfirmations)-latestMaster.SeqNo)
		// Keep polling until the chain head is at least `blockConfirmations` past our target block.
		return latestMaster.SeqNo >= toBlock.SeqNo+blockConfirmations
	}, 120*time.Second, 2*time.Second, "Chain did not advance enough for confirmations")
}

func Test_LogPoller(t *testing.T) {
	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector).WithRetry()
	require.NotNil(t, client)

	t.Run("log poller:log collector event ingestion", func(t *testing.T) {
		t.Parallel()

		cfg := event_emitter.Config{
			BatchCount: 3,
			TxPerBatch: 5,
			MsgPerTx:   2,
		}
		expectedEvents := cfg.BatchCount * cfg.TxPerBatch * cfg.MsgPerTx

		emitter, txs := sendBulkTestEventTxs(t, client, cfg)

		const blockConfirmations = 10
		const pageSize = 5

		firstTx, lastTx := txs[0], txs[len(txs)-1]

		prevBlock, err := client.LookupBlock(
			t.Context(),
			address.MasterchainID,
			firstTx.Block.Shard,
			firstTx.Block.SeqNo-1, // exclusive lower bound
		)
		require.NoError(t, err)

		toBlock, err := client.WaitForBlock(lastTx.Block.SeqNo+blockConfirmations).LookupBlock(
			t.Context(),
			address.MasterchainID,
			lastTx.Block.Shard,
			lastTx.Block.SeqNo+blockConfirmations, // inclusive upper bound + pad
		)
		require.NoError(t, err)

		waitForBlock(t, client, toBlock, blockConfirmations)

		t.Run("loading entire block range at once", func(t *testing.T) {
			t.Parallel()
			loader := logpoller.NewLogCollector(client, logger.Test(t), pageSize, blockConfirmations)

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
			require.NoError(t, verifyLoadedEvents(exts, expectedEvents))
		})

		t.Run("loading block by block", func(t *testing.T) {
			t.Parallel()
			var allMsgs []*tlb.ExternalMessageOut

			loader := logpoller.NewLogCollector(client, logger.Test(t), pageSize, blockConfirmations)

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
			err = verifyLoadedEvents(allMsgs, cfg.BatchCount*cfg.TxPerBatch*cfg.MsgPerTx)
			require.NoError(t, err)
		})
	})

	t.Run("Logpoller live event ingestion", func(t *testing.T) {
		t.Parallel()
		senderA := test_utils.CreateRandomHighloadWallet(t, client)
		senderB := test_utils.CreateRandomHighloadWallet(t, client)
		test_utils.FundWallets(t, client, []*address.Address{senderA.Address(), senderB.Address()}, []tlb.Coins{tlb.MustFromTON("1000"), tlb.MustFromTON("1000")})
		require.NotNil(t, senderA)

		emitterA, err := event_emitter.NewEventEmitter(t.Context(), client, "emitterA", rand.Uint64(), senderA, logger.Test(t))
		require.NoError(t, err)

		emitterB, err := event_emitter.NewEventEmitter(t.Context(), client, "emitterB", rand.Uint64(), senderB, logger.Test(t))
		require.NoError(t, err)

		const blockConfirmations = 10
		const pageSize = 5

		const targetCounter = 20

		lp := logpoller.NewLogPoller(
			logger.Test(t),
			client,
			3*time.Second,
			pageSize,
			blockConfirmations,
		)

		// register filters
		filterA := types.Filter{
			Name:       "FilterA",
			Address:    *emitterA.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: event_emitter.CounterIncreasedTopic,
		}
		lp.RegisterFilter(t.Context(), filterA)

		filterB := types.Filter{
			Name:       "FilterB",
			Address:    *emitterB.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: event_emitter.CounterIncreasedTopic,
		}
		lp.RegisterFilter(t.Context(), filterB)

		// start listening for logs
		require.NoError(t, lp.Start(t.Context()))
		defer func() {
			require.NoError(t, lp.Close())
		}()

		// start event emission loops, which will stop itself once the target is reached
		err = emitterA.StartEventEmitter(t.Context(), 1*time.Second, big.NewInt(targetCounter))
		require.NoError(t, err)
		err = emitterB.StartEventEmitter(t.Context(), 1*time.Second, big.NewInt(targetCounter))
		require.NoError(t, err)
		defer func() {
			emitterA.StopEventEmitter()
			emitterB.StopEventEmitter()
		}()

		require.Eventually(t, func() bool {
			// Check both emitters' on-chain counters
			master, err := client.CurrentMasterchainInfo(t.Context())
			if err != nil {
				t.Logf("Failed to get masterchain info, retrying: %v", err)
				return false
			}

			// Check emitterA
			counterA, err := event_emitter.GetCounter(t.Context(), client.WaitForBlock(master.SeqNo), master, emitterA.ContractAddress())
			if err != nil {
				t.Logf("Failed to get on-chain counter for emitterA, retrying: %v", err)
				return false
			}

			if counterA.Uint64() < uint64(targetCounter) {
				t.Logf("Waiting for on-chain counter A... have %d, want %d", counterA.Uint64(), targetCounter)
				return false
			}

			// Check emitterB
			counterB, err := event_emitter.GetCounter(t.Context(), client.WaitForBlock(master.SeqNo), master, emitterB.ContractAddress())
			if err != nil {
				t.Logf("Failed to get on-chain counter for emitterB, retrying: %v", err)
				return false
			}

			if counterB.Uint64() < uint64(targetCounter) {
				t.Logf("Waiting for on-chain counter B... have %d, want %d", counterB.Uint64(), targetCounter)
				return false
			}

			// Check log poller has ingested events from both
			logsA := lp.GetLogs(emitterA.ContractAddress())
			logsB := lp.GetLogs(emitterB.ContractAddress())

			t.Logf("Log poller has %d logs for emitter A, %d logs for emitter B", len(logsA), len(logsB))

			// Convert logs to messages for emitterA
			var msgsA []*tlb.ExternalMessageOut
			for _, log := range logsA {
				c, err := cell.FromBOC(log.Data)
				if err != nil {
					t.Logf("Failed to parse log data for emitterA, will retry: %v", err)
					return false
				}
				ext := &tlb.ExternalMessageOut{
					Body: c,
				}
				msgsA = append(msgsA, ext)
			}

			// Convert logs to messages for emitterB
			var msgsB []*tlb.ExternalMessageOut
			for _, log := range logsB {
				c, err := cell.FromBOC(log.Data)
				if err != nil {
					t.Logf("Failed to parse log data for emitterB, will retry: %v", err)
					return false
				}
				ext := &tlb.ExternalMessageOut{
					Body: c,
				}
				msgsB = append(msgsB, ext)
			}

			// Verify the content of the logs for emitterA (no duplicates, all counters present)
			verrA := verifyLoadedEvents(msgsA, targetCounter)
			if verrA != nil {
				t.Logf("Log verification failed for emitterA, will retry: %v", verrA)
				return false
			}

			// Verify the content of the logs for emitterB (no duplicates, all counters present)
			verrB := verifyLoadedEvents(msgsB, targetCounter)
			if verrB != nil {
				t.Logf("Log verification failed for emitterB, will retry: %v", verrB)
				return false
			}

			if len(logsA) != targetCounter {
				for _, msg := range msgsA {
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](msg)
					require.NoError(t, err, "failed to parse event from log")
					t.Logf("EmitterA Event Counter=%d", event.Counter)
				}
				t.Logf("Waiting for logs A... have %d, want %d", len(logsA), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			if len(logsB) != targetCounter {
				for _, msg := range msgsB {
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](msg)
					require.NoError(t, err, "failed to parse event from log")
					t.Logf("EmitterB Event Counter=%d", event.Counter)
				}
				t.Logf("Waiting for logs B... have %d, want %d", len(logsB), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// If log count and content are correct for both, the test condition is met
			return true
		}, 180*time.Second, 3*time.Second, "log poller did not ingest all events correctly in time")

		t.Run("Cell Query Tests", func(t *testing.T) {
			// the log poller service itself provides a simple query interface(w/o full DSL support)
			// define filters to find logs where the counter is between 5 and 10.
			// the CounterIncreased event data layout is [ID (8 bytes), Counter (8 bytes)].
			// so, the Counter field is at offset 8.
			// we can try to create event type > cell filter util, but that's whole another story.
			// this is somewhat similar to "LogsDataWordBetween" in evm logpoller,
			// TODO: with SQL we might need to implement a more efficient way to query logs.
			t.Run("Cell Query, events from emitter A", func(t *testing.T) {
				t.Parallel()
				queries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GT,
						Value:    binary.BigEndian.AppendUint64(nil, 5),
					},
					{
						Offset:   8,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint64(nil, 10),
					},
				}

				options := logpoller.QueryOptions{} // Default options (no sorting, no pagination)

				result, err := lp.FilteredLogs(emitterA.ContractAddress(), event_emitter.CounterIncreasedTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, 5, "expected exactly 5 logs for the range 6-10")

				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.Greater(t, event.Counter, uint64(5))
					require.LessOrEqual(t, event.Counter, uint64(10))
					t.Logf("Verified filtered event with counter: %d", event.Counter)
				}
			})

			t.Run("Log Poller Query With Cell Filter, events from emitter B", func(t *testing.T) {
				t.Parallel()
				queries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GTE,
						Value:    binary.BigEndian.AppendUint64(nil, 1),
					},
					{
						Offset:   8,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint64(nil, 3),
					},
				}

				options := logpoller.QueryOptions{} // Default options

				result, err := lp.FilteredLogs(emitterB.ContractAddress(), event_emitter.CounterIncreasedTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, 3, "expected exactly 3 logs for the range 1-3")

				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					// check that the counter is within the expected range
					require.GreaterOrEqual(t, event.Counter, uint64(1))
					require.LessOrEqual(t, event.Counter, uint64(3))
					t.Logf("Verified filtered event with counter: %d", event.Counter)
				}
			})

			t.Run("Log Poller Query With Cell Query, all events from emitter B", func(t *testing.T) {
				t.Parallel()
				// the CounterIncreased event data layout is [ID (8 bytes), Counter (8 bytes)].
				queries := []logpoller.CellQuery{
					{
						Offset:   0,
						Operator: logpoller.EQ,
						Value:    binary.BigEndian.AppendUint64(nil, emitterB.GetID()), // compare ID
					},
				}

				options := logpoller.QueryOptions{} // Default options

				result, err := lp.FilteredLogs(emitterB.ContractAddress(), event_emitter.CounterIncreasedTopic, queries, options)
				require.NoError(t, err)

				require.Len(t, result.Logs, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint64]bool, targetCounter)
				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Counter, uint64(1))
					require.LessOrEqual(t, event.Counter, uint64(targetCounter))

					if seen[event.Counter] {
						t.Fatalf("duplicate counter %d found", event.Counter)
					}
					seen[event.Counter] = true
				}

				for i := 1; i <= int(targetCounter); i++ {
					if !seen[uint64(i)] { //nolint:gosec // test code
						t.Fatalf("missing counter %d", i)
					}
				}
			})

			t.Run("Log Poller query with parser pattern, all events from emitter B", func(t *testing.T) {
				t.Parallel()

				parser := func(c *cell.Cell) (any, error) {
					return event.LoadEventFromCell[event_emitter.CounterIncreased](c)
				}

				res, err := lp.FilteredParsedLogs(emitterB.ContractAddress(), event_emitter.CounterIncreasedTopic, parser, nil)
				require.NoError(t, err)

				require.Len(t, res, targetCounter, "expected exactly %d logs for the emitter B", targetCounter)

				seen := make(map[uint64]bool, targetCounter)
				for i, item := range res {
					require.IsType(t, event_emitter.CounterIncreased{}, item, "item at index %d has wrong type", i)
					ev := item.(event_emitter.CounterIncreased)

					require.GreaterOrEqual(t, ev.Counter, uint64(1))
					require.LessOrEqual(t, ev.Counter, uint64(targetCounter))

					if seen[ev.Counter] {
						t.Fatalf("duplicate counter %d found", ev.Counter)
					}
					seen[ev.Counter] = true
				}

				for i := 1; i <= int(targetCounter); i++ {
					if !seen[uint64(i)] { //nolint:gosec // test code
						t.Fatalf("missing counter %d", i)
					}
				}
			})

			t.Run("Log Poller query with parser pattern with filter, events between 1 to 10 from emitter B", func(t *testing.T) {
				t.Parallel()
				from, to := (1), (10)

				parser := func(c *cell.Cell) (any, error) {
					return event.LoadEventFromCell[event_emitter.CounterIncreased](c)
				}

				filter := func(parsedEvent any) bool {
					evt, ok := parsedEvent.(event_emitter.CounterIncreased)
					if !ok {
						return false
					}
					return evt.Counter >= uint64(from) && evt.Counter <= uint64(to) //nolint:gosec // test code
				}

				res, err := lp.FilteredParsedLogs(emitterB.ContractAddress(), event_emitter.CounterIncreasedTopic, parser, filter)
				require.NoError(t, err)

				require.Len(t, res, to-from+1, "expected exactly 10 logs for the range 1-10")
				seen := make(map[uint64]bool, to-from+1)
				for i, item := range res {
					require.IsType(t, event_emitter.CounterIncreased{}, item, "item at index %d has wrong type", i)
					ev := item.(event_emitter.CounterIncreased)

					require.GreaterOrEqual(t, ev.Counter, uint64(from)) //nolint:gosec // test code
					require.LessOrEqual(t, ev.Counter, uint64(to))      //nolint:gosec // test code

					if seen[ev.Counter] {
						t.Fatalf("duplicate counter %d found", ev.Counter)
					}
					seen[ev.Counter] = true
				}

				for i := 1; i <= to; i++ {
					if !seen[uint64(i)] { //nolint:gosec // test code
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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
				t.Logf("Verified %d logs in ascending TxLT order", len(result.Logs))
			})

			t.Run("Sort by TxLT descending", func(t *testing.T) {
				t.Parallel()

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC},
					},
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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
				t.Logf("Verified %d logs in descending TxLT order", len(result.Logs))
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, pageSize)
				require.True(t, result.HasMore, "should have more results")
				require.Equal(t, targetCounter, result.Total)

				t.Logf("First page: got %d logs, HasMore=%t, Total=%d",
					len(result.Logs), result.HasMore, result.Total)
			})

			t.Run("Pagination with offset", func(t *testing.T) {
				t.Parallel()

				const pageSize = 5
				const offset = 8

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  pageSize,
					Offset: offset,
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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

				firstPageResult, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					firstPageOptions,
				)
				require.NoError(t, err)

				// Verify offset page starts where expected
				for i := 0; i < pageSize; i++ {
					require.Equal(t, firstPageResult.Logs[offset+i].TxLT, result.Logs[i].TxLT,
						"offset page should match the correct slice of first page at index %d", i)
				}

				t.Logf("Offset page verification passed: offset=%d, pageSize=%d", offset, pageSize)
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

					result, err := lp.FilteredLogs(
						emitterA.ContractAddress(),
						event_emitter.CounterIncreasedTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

					if len(result.Logs) == 0 {
						break
					}

					allLogs = append(allLogs, result.Logs...)
					pageCount++

					t.Logf("Page %d: got %d logs, HasMore=%t", pageCount, len(result.Logs), result.HasMore)

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

				t.Logf("Complete pagination test passed: %d pages, %d total logs", pageCount, len(allLogs))
			})

			t.Run("Sorting + filtering + pagination", func(t *testing.T) {
				t.Parallel()

				// Filter for counters 8-15, then sort and paginate
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GTE,
						Value:    binary.BigEndian.AppendUint64(nil, 8),
					},
					{
						Offset:   8,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint64(nil, 15),
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC}, // Newest first
					},
					Limit:  4,
					Offset: 1, // Skip the first (newest) result
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					cellQueries,
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, 4)

				// Verify the filtering worked
				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Counter, uint64(8))
					require.LessOrEqual(t, event.Counter, uint64(15))
				}

				// Verify descending sort order
				for i := 1; i < len(result.Logs); i++ {
					require.GreaterOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"filtered results should be sorted in descending TxLT order at index %d", i)
				}

				t.Logf("Combined filtering + sorting + pagination test passed")
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

					result, err := lp.FilteredLogs(
						emitterB.ContractAddress(),
						event_emitter.CounterIncreasedTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

					if len(result.Logs) > 0 {
						emitterBPages = append(emitterBPages, result.Logs)
						t.Logf("EmitterB page %d: got %d logs", len(emitterBPages), len(result.Logs))
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
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					require.Equal(t, emitterB.GetID(), event.ID, "log should belong to emitterB")
				}

				t.Logf("Cross-emitter pagination test passed: %d pages, %d logs", len(emitterBPages), len(allEmitterBLogs))
			})

			t.Run("Edge case: empty results pagination", func(t *testing.T) {
				t.Parallel()

				// Filter for impossible range
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GT,
						Value:    binary.BigEndian.AppendUint64(nil, 100), // No events should match
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  10,
					Offset: 0,
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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
				t.Logf("Verified %d logs in ascending TxLT order", len(result.Logs))
			})

			t.Run("Sort by TxLT descending", func(t *testing.T) {
				t.Parallel()

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC},
					},
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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
				t.Logf("Verified %d logs in descending TxLT order", len(result.Logs))
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, pageSize)
				require.True(t, result.HasMore, "should have more results")
				require.Equal(t, targetCounter, result.Total)

				t.Logf("First page: got %d logs, HasMore=%t, Total=%d",
					len(result.Logs), result.HasMore, result.Total)
			})

			t.Run("Pagination with offset", func(t *testing.T) {
				t.Parallel()

				const pageSize = 5
				const offset = 8

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  pageSize,
					Offset: offset,
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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

				firstPageResult, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					firstPageOptions,
				)
				require.NoError(t, err)

				// Verify offset page starts where expected
				for i := 0; i < pageSize; i++ {
					require.Equal(t, firstPageResult.Logs[offset+i].TxLT, result.Logs[i].TxLT,
						"offset page should match the correct slice of first page at index %d", i)
				}

				t.Logf("Offset page verification passed: offset=%d, pageSize=%d", offset, pageSize)
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

					result, err := lp.FilteredLogs(
						emitterA.ContractAddress(),
						event_emitter.CounterIncreasedTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

					if len(result.Logs) == 0 {
						break
					}

					allLogs = append(allLogs, result.Logs...)
					pageCount++

					t.Logf("Page %d: got %d logs, HasMore=%t", pageCount, len(result.Logs), result.HasMore)

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

				t.Logf("Complete pagination test passed: %d pages, %d total logs", pageCount, len(allLogs))
			})

			t.Run("Sorting + filtering + pagination", func(t *testing.T) {
				t.Parallel()

				// Filter for counters 8-15, then sort and paginate
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GTE,
						Value:    binary.BigEndian.AppendUint64(nil, 8),
					},
					{
						Offset:   8,
						Operator: logpoller.LTE,
						Value:    binary.BigEndian.AppendUint64(nil, 15),
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.DESC}, // Newest first
					},
					Limit:  4,
					Offset: 1, // Skip the first (newest) result
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					cellQueries,
					options,
				)
				require.NoError(t, err)
				require.Len(t, result.Logs, 4)

				// Verify the filtering worked
				for _, log := range result.Logs {
					c, err := cell.FromBOC(log.Data)
					require.NoError(t, err)
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					require.GreaterOrEqual(t, event.Counter, uint64(8))
					require.LessOrEqual(t, event.Counter, uint64(15))
				}

				// Verify descending sort order
				for i := 1; i < len(result.Logs); i++ {
					require.GreaterOrEqual(t, result.Logs[i-1].TxLT, result.Logs[i].TxLT,
						"filtered results should be sorted in descending TxLT order at index %d", i)
				}

				t.Logf("Combined filtering + sorting + pagination test passed")
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

					result, err := lp.FilteredLogs(
						emitterB.ContractAddress(),
						event_emitter.CounterIncreasedTopic,
						[]logpoller.CellQuery{},
						options,
					)
					require.NoError(t, err)

					if len(result.Logs) > 0 {
						emitterBPages = append(emitterBPages, result.Logs)
						t.Logf("EmitterB page %d: got %d logs", len(emitterBPages), len(result.Logs))
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
					ext := &tlb.ExternalMessageOut{Body: c}
					event, err := event.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
					require.NoError(t, err)

					require.Equal(t, emitterB.GetID(), event.ID, "log should belong to emitterB")
				}

				t.Logf("Cross-emitter pagination test passed: %d pages, %d logs", len(emitterBPages), len(allEmitterBLogs))
			})

			t.Run("Edge case: empty results pagination", func(t *testing.T) {
				t.Parallel()

				// Filter for impossible range
				cellQueries := []logpoller.CellQuery{
					{
						Offset:   8,
						Operator: logpoller.GT,
						Value:    binary.BigEndian.AppendUint64(nil, 100), // No events should match
					},
				}

				options := logpoller.QueryOptions{
					SortBy: []logpoller.SortBy{
						{Field: logpoller.SortByTxLT, Order: logpoller.ASC},
					},
					Limit:  10,
					Offset: 0,
				}

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
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

				result, err := lp.FilteredLogs(
					emitterA.ContractAddress(),
					event_emitter.CounterIncreasedTopic,
					[]logpoller.CellQuery{},
					options,
				)
				require.NoError(t, err)
				require.Empty(t, result.Logs)
				require.False(t, result.HasMore)
			})
		})
	})

	t.Run("Log Poller CCIP CAL Query Interface", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})
}
