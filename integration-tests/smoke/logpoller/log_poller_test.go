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

	time.Sleep(20 * time.Second) // wait for events to be processed by the log poller
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
	useAlreadyRunningNetwork := false

	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector, useAlreadyRunningNetwork).WithRetry()
	require.NotNil(t, client)

	t.Run("log poller:loader event ingestion", func(t *testing.T) {
		// t.Parallel()

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
			loader := logpoller.NewLoader(client, logger.Test(t), pageSize, blockConfirmations)

			msgs, err := loader.BackfillForAddresses(
				t.Context(),
				[]*address.Address{emitter.ContractAddress()},
				prevBlock,
				toBlock,
			)
			require.NoError(t, err)
			require.NoError(t, verifyLoadedEvents(msgs, expectedEvents))
		})

		t.Run("loading block by block", func(t *testing.T) {
			var allMsgs []*tlb.ExternalMessageOut

			loader := logpoller.NewLoader(client, logger.Test(t), pageSize, blockConfirmations)

			// iterate block by block from prevBlock to toBlock
			currentBlock := prevBlock
			for seqNo := prevBlock.SeqNo + 1; seqNo <= toBlock.SeqNo; seqNo++ {
				nextBlock, err := client.WaitForBlock(seqNo).LookupBlock(
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

			// verify if we loaded all expected events, without duplicates
			err = verifyLoadedEvents(allMsgs, cfg.BatchCount*cfg.TxPerBatch*cfg.MsgPerTx)
			require.NoError(t, err)
		})
	})

	t.Run("Log Poller Live Event Ingestion", func(t *testing.T) {
		sender := test_utils.CreateRandomHighloadWallet(t, client)
		test_utils.FundWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
		require.NotNil(t, sender)
		emitter, err := event_emitter.NewEventEmitter(t.Context(), client, "emitter", rand.Uint64(), sender, logger.Test(t))
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
			Address:    *emitter.ContractAddress(),
			EventName:  "CounterIncreased",
			EventTopic: event_emitter.CounterIncreasedTopic,
		}
		lp.RegisterFilter(t.Context(), filterA)

		// start listening for logs
		require.NoError(t, lp.Start(t.Context()))
		defer func() {
			require.NoError(t, lp.Close())
		}()

		// start event emission loop, which will stop itself once the target is reached
		err = emitter.StartEventEmitter(t.Context(), 1*time.Second, big.NewInt(targetCounter))
		require.NoError(t, err)
		defer func() {
			emitter.StopEventEmitter()
		}()

		require.Eventually(t, func() bool {
			// check the on-chain counter first as the source of truth.
			master, err := client.CurrentMasterchainInfo(t.Context())
			if err != nil {
				t.Logf("Failed to get masterchain info, retrying: %v", err)
				return false
			}

			currentCounter, err := event_emitter.GetCounter(t.Context(), client.WaitForBlock(master.SeqNo), master, emitter.ContractAddress())
			if err != nil {
				t.Logf("Failed to get on-chain counter, retrying: %v", err)
				return false
			}

			if currentCounter.Uint64() < uint64(targetCounter) {
				t.Logf("Waiting for on-chain counter... have %d, want %d", currentCounter.Uint64(), targetCounter)
				return false
			}

			// get all logs from the log poller.
			logs := lp.GetLogs()

			// if log count is correct, convert them for verification.
			var msgs []*tlb.ExternalMessageOut
			for _, log := range logs {
				c, err := cell.FromBOC(log.Data)
				if err != nil {
					t.Logf("Failed to parse log data, will retry: %v", err)
					return false
				}
				ext := &tlb.ExternalMessageOut{
					Body: c,
				}
				msgs = append(msgs, ext)
			}

			// verify the content of the logs (no duplicates, all counters present).
			verr := verifyLoadedEvents(msgs, targetCounter)
			if verr != nil {
				t.Logf("Log verification failed, will retry: %v", verr)
				return false
			}

			if len(logs) != targetCounter {
				for _, msg := range msgs {
					event, err := test_utils.LoadEventFromMsg[event_emitter.CounterIncreased](msg)
					require.NoError(t, err, "failed to parse event from log")
					t.Logf("Event Counter=%d", event.Counter)
				}

				t.Logf("Waiting for logs... have %d, want %d", len(logs), targetCounter)
				return false // Not enough logs yet, Eventually will retry.
			}

			// if log count and content are correct, the test condition is met.
			return true
		}, 120*time.Second, 3*time.Second, "log poller did not ingest all events correctly in time")

		t.Logf("Successfully processed and verified %d events in live ingestion test", targetCounter)

		t.Run("Log Poller Query With Byte Range", func(t *testing.T) {
			t.Skip("TODO: Implement")
		})
	})

	t.Run("Log Poller CCIP CAL Query Interface", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

	t.Run("Log Poller Replay for a Contract", func(t *testing.T) {
		t.Skip("TODO: Implement")
	})

}
