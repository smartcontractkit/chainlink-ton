package smoke

import (
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
)

func sendBulkTestEventTxs(t *testing.T, client ton.APIClientWrapped, config event_emitter.Config) (*event_emitter.EventEmitter, []event_emitter.TxResult) {
	// event sending wallet
	sender := test_utils.CreateTonHighloadWallet(t, client)
	test_utils.FundTonWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
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
	return emitter, txs
}

func verifyLoadedEvents(msgs []*tlb.ExternalMessageOut, expectedCount int) error {
	seen := make(map[uint64]bool, expectedCount)

	// parse all events and track counters
	for i, ext := range msgs {
		event, err := test_utils.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
		if err != nil {
			return fmt.Errorf("failed to parse event #%d: %w", i, err)
		}

		// check for duplicates
		if seen[event.Counter] {
			return fmt.Errorf("duplicate counter %d found at index %d", event.Counter, i)
		}
		seen[event.Counter] = true
	}
	ok := true
	// verify all expected counters are present (1 to expectedCount)
	for i := 1; i <= expectedCount; i++ {
		if !seen[uint64(i)] { //nolint:gosec // test code
			fmt.Printf("Missing counter: %d\n", i)
			ok = false
		}
	}

	if !ok {
		return fmt.Errorf("not all expected counters found, missing some from 1 to %d", expectedCount)
	}

	return nil
}

func Test_LogPoller(t *testing.T) {
	useAlreadyRunningNetwork := true

	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector, useAlreadyRunningNetwork).WithRetry()
	require.NotNil(t, client)

	t.Run("log poller loader event ingestion", func(t *testing.T) {
		t.Parallel()

		cfg := event_emitter.Config{
			BatchCount: 3,
			TxPerBatch: 2,
			MsgPerTx:   5,
		}
		expectedEvents := cfg.BatchCount * cfg.TxPerBatch * cfg.MsgPerTx

		emitter, txs := sendBulkTestEventTxs(t, client, cfg)

		t.Run("loading entire block range v2", func(t *testing.T) {
			const blockConfirmations = 10

			firstTx, lastTx := txs[0], txs[len(txs)-1]
			loader := logpoller.NewLoader(client, logger.Test(t), 5, blockConfirmations)

			// Define the range simply, from one before the first tx...
			prevBlock, err := client.LookupBlock(
				t.Context(),
				address.MasterchainID,
				firstTx.Block.Shard,
				firstTx.Block.SeqNo-1, // exclusive lower bound
			)
			require.NoError(t, err)

			toBlock, err := client.WaitForBlock(lastTx.Block.SeqNo).LookupBlock(
				t.Context(),
				address.MasterchainID,
				lastTx.Block.Shard,
				lastTx.Block.SeqNo, // inclusive upper bound
			)
			require.NoError(t, err)

			t.Logf("toblock: %+v, prevBlock: %+v", toBlock, prevBlock)

			t.Logf("lastTx.Block: %+v, toBlock: %+v", lastTx.Block, toBlock)
			t.Logf("toBlock equals lastTx.Block: %v", toBlock.Equals(lastTx.Block))

			t.Logf("Waiting for %d confirmations on top of block %d...", blockConfirmations, toBlock.SeqNo)
			require.Eventually(t, func() bool {
				latestMaster, err := client.CurrentMasterchainInfo(t.Context())
				if err != nil {
					return false
				}
				t.Logf("Latest masterchain block seqno: %d", latestMaster.SeqNo)
				t.Logf("Target block seqno: %d + %d", toBlock.SeqNo, blockConfirmations)
				// Keep polling until the chain head is at least `blockConfirmations` past our target block.
				return latestMaster.SeqNo >= toBlock.SeqNo+blockConfirmations
			}, 30*time.Second, 1*time.Second, "Chain did not advance enough for confirmations")

			t.Log("Required confirmations have been met.")

			msgs, err := loader.BackfillForAddresses(
				t.Context(),
				[]*address.Address{emitter.ContractAddress()},
				prevBlock,
				toBlock,
			)
			require.NoError(t, err)
			require.NoError(t, verifyLoadedEvents(msgs, expectedEvents))
		})

		t.Run("loading entire block range", func(t *testing.T) {
			t.Skip("TODO: Implement")
			firstTx, lastTx := txs[0], txs[len(txs)-1]

			const blockConfirmations = 10
			loader := logpoller.NewLoader(client, logger.Test(t), 4, blockConfirmations)

			prevBlock, err := client.LookupBlock(
				t.Context(),
				address.MasterchainID,
				firstTx.Block.Shard,
				firstTx.Block.SeqNo-1, // exclusive lower bound
			)
			require.NoError(t, err)

			toBlock, err := client.WaitForBlock(lastTx.Block.SeqNo).LookupBlock(
				t.Context(),
				address.MasterchainID,
				lastTx.Block.Shard,
				lastTx.Block.SeqNo, // inclusive upper bound
			)
			require.NoError(t, err)

			msgs, err := loader.BackfillForAddresses(
				t.Context(),
				[]*address.Address{emitter.ContractAddress()},
				prevBlock,
				toBlock,
			)
			require.NoError(t, err)

			err = verifyLoadedEvents(msgs, expectedEvents)
			require.NoError(t, err)
		})

		t.Run("loading block by block", func(t *testing.T) {
			t.Skip("TODO: Implement")
			firstTx, lastTx := txs[0], txs[len(txs)-1]

			prevBlock, err := client.LookupBlock(
				t.Context(),
				firstTx.Block.Workchain,
				firstTx.Block.Shard,
				firstTx.Block.SeqNo-1, // exclusive lower bound
			)
			require.NoError(t, err)

			toBlock, err := client.WaitForBlock(lastTx.Block.SeqNo+1).LookupBlock(
				t.Context(),
				lastTx.Block.Workchain,
				lastTx.Block.Shard,
				lastTx.Block.SeqNo, // inclusive upper bound
			)
			require.NoError(t, err)

			loader := logpoller.NewLoader(client, logger.Test(t), 4, 6)
			var allMsgs []*tlb.ExternalMessageOut

			// Iterate block by block from prevBlock to toBlock
			currentBlock := prevBlock
			for seqNo := prevBlock.SeqNo + 1; seqNo <= toBlock.SeqNo; seqNo++ {
				nextBlock, err := client.LookupBlock(
					t.Context(),
					firstTx.Block.Workchain,
					firstTx.Block.Shard,
					seqNo,
				)
				require.NoError(t, err)

				msgs, err := loader.BackfillForAddresses(
					t.Context(),
					[]*address.Address{emitter.ContractAddress()},
					currentBlock, // from current block (exclusive)
					nextBlock,    // to next block (inclusive)
				)
				require.NoError(t, err)

				allMsgs = append(allMsgs, msgs...)
				currentBlock = nextBlock // update for next iteration
			}

			err = verifyLoadedEvents(allMsgs, cfg.BatchCount*cfg.TxPerBatch*cfg.MsgPerTx)
			require.NoError(t, err)
		})
	})

	t.Run("Log Poller Event Loading", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

	t.Run("Log Poller Live Event Ingestion", func(t *testing.T) {
		t.Skip("TODO: Implement")
		sender := test_utils.CreateTonHighloadWallet(t, client)
		test_utils.FundTonWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
		require.NotNil(t, sender)
		emitter, err := event_emitter.NewEventEmitter(t.Context(), client, "evA", rand.Uint64(), sender, logger.Test(t))
		require.NoError(t, err)

		lp := logpoller.NewLogPoller(
			logger.Test(t),
			client,
			3*time.Second,
			100, // page size
		)

		// register filters
		filterA := types.Filter{
			Address:    *emitter.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: event_emitter.CounterIncreasedTopic,
		}
		lp.RegisterFilter(t.Context(), filterA)

		require.NoError(t, lp.Start(t.Context()))
		defer func() {
			require.NoError(t, lp.Close())
		}()

		// start event emitters
		err = emitter.StartEventEmitter(t.Context(), 300*time.Millisecond)
		require.NoError(t, err)
		require.True(t, emitter.IsRunning(), "event emitter A should be running")

		time.Sleep(15 * time.Second) // wait for event emitters to start and emit events

		b, err := client.CurrentMasterchainInfo(t.Context())
		require.NoError(t, err)
		onchainSeqNoA, err := event_emitter.GetCounter(t.Context(), client, b, emitter.ContractAddress())
		require.NoError(t, err)

		require.Positive(t, onchainSeqNoA.Cmp(big.NewInt(0)), "unexpected sequence number for contract A")
		// TODO: get logs by filter and validate if polling is not missing any events
		// TODO: scale up the number of events and validate that log poller can handle multiple events

		require.Eventually(t, func() bool {
			return len(lp.GetLogs()) > 0
		}, 30*time.Second, 1*time.Second, "expected at least one send event")

		logs := lp.GetLogs()
		require.NotEmpty(t, logs, "expected at least one log entry")

		c, err := cell.FromBOC(logs[0].Data)
		require.NoError(t, err)
		event, err := test_utils.LoadEventFromCell[event_emitter.CounterIncreased](c)
		require.NoError(t, err)

		t.Logf("Received event: %+v", event)
		// require.Equal(t, uint32(1), event.NewValue, "unexpected new value in event")
	})

	t.Run("Log Poller Backfill Event Ingestion", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

	t.Run("Log Poller Query Interface", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})
}
