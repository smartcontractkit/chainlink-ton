package smoke

import (
	"encoding/hex"
	"errors"
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
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

// TODO: clean up
func Test_LogPoller(t *testing.T) {
	useAlreadyRunningNetwork := false

	nodeClient := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector, useAlreadyRunningNetwork)
	require.NotNil(t, nodeClient)

	admin := test_utils.CreateRandomTonWallet(t, nodeClient, config.WalletVersion, wallet.WithWorkchain(0))
	require.NotNil(t, admin)

	sender := test_utils.CreateTonHighloadWallet(t, nodeClient)
	require.NotNil(t, sender)

	tonChain := test_utils.StartTonChain(t, nodeClient, chainsel.TON_LOCALNET.Selector, admin)
	require.NotNil(t, tonChain)

	test_utils.FundTonWallets(t, nodeClient, []*address.Address{admin.Address(), sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000"), tlb.MustFromTON("1000")})

	client := tonChain.Client

	emitter, err := event_emitter.NewEventEmitter(t.Context(), client, "evA", rand.Uint64(), sender, logger.Test(t))
	require.NoError(t, err)

	// Configuration
	events := event_emitter.Config{
		TotalBatches: 3,
		TxPerBatch:   2,
		MsgPerTx:     5,
	}
	allTxResults, err := emitter.CreateTestEvents(t.Context(), events)
	require.NoError(t, err)
	blockCounts := make(map[uint32]int)
	for _, tx := range allTxResults {
		blockCounts[tx.Block.SeqNo]++
	}

	lastTx := allTxResults[len(allTxResults)-1]

	t.Logf("All transactions sent. Final tx: Block=%d, LT=%d", lastTx.Block.SeqNo, lastTx.Tx.LT)
	expectedEventCount := events.TotalBatches * events.TxPerBatch * events.MsgPerTx

	t.Logf("=== Ready for ListTransactions testing ===")

	time.Sleep(10 * time.Second) // Give some time for the chain to process
	currBlock, err := client.WaitForBlock(lastTx.Block.SeqNo + 1).CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	t.Logf("Current block: SeqNo=%d", currBlock.SeqNo)

	contractRes, err := client.GetAccount(t.Context(), currBlock, emitter.ContractAddress())
	require.NoError(t, err)
	require.NotNil(t, contractRes, "expected contract account to be found")

	t.Logf("Contract state: LT=%d, Hash=%s", contractRes.LastTxLT, hex.EncodeToString(contractRes.LastTxHash))

	// Get contract transactions with small limit to test pagination
	var allContractTxs []*tlb.Transaction
	var allExtMsgs []*tlb.ExternalMessageOut

	curLT := contractRes.LastTxLT
	curHash := contractRes.LastTxHash
	pageNum := 0
	limit := uint32(4) // TODO: should be able to fetch all messages without duplication

	for {
		t.Logf("Fetching contract transactions page %d with limit %d", pageNum, limit)

		batch, err := client.ListTransactions(t.Context(), emitter.ContractAddress(), limit, curLT, curHash)
		if err != nil {
			if errors.Is(err, ton.ErrNoTransactionsWereFound) {
				break
			}
			require.NoError(t, err, "failed to list contract transactions")
		}

		if len(batch) == 0 {
			break
		}

		t.Logf("Contract page %d: %d transactions", pageNum, len(batch))
		allContractTxs = append(allContractTxs, batch...)

		// Extract ExternalMessageOut from each transaction
		for _, tx := range batch {
			t.Logf("Contract tx: LT=%d, Hash=%s, HasOut=%t",
				tx.LT, hex.EncodeToString(tx.Hash)[:16]+"...", tx.IO.Out != nil)

			if tx.IO.Out != nil {
				msgs, _ := tx.IO.Out.ToSlice()
				for _, msg := range msgs {
					if msg.MsgType == tlb.MsgTypeExternalOut {
						ext := msg.AsExternalOut()
						if ext.Body != nil {
							t.Logf("Found ExternalMessageOut: Src=%s, Dst=%s",
								ext.SrcAddr, ext.DstAddr)
							allExtMsgs = append(allExtMsgs, ext)
						}
					}
				}
			}
		}

		// Move to next page, ListTransactions returns the old transactions first
		lastTxInBatch := batch[0]
		curLT = lastTxInBatch.PrevTxLT
		curHash = lastTxInBatch.PrevTxHash
		pageNum++
	}

	t.Logf("Contract pagination: %d pages, %d transactions, %d ExternalMessageOut",
		pageNum, len(allContractTxs), len(allExtMsgs))

	t.Logf("Expected ~%d external messages from counter events", expectedEventCount)

	t.Logf("Expected exactly %d external messages from counter events", expectedEventCount)
	t.Logf("Actually found %d ExternalMessageOut messages", len(allExtMsgs))

	t.Logf("=== Parsing ExternalMessageOut Events ===")

	var counterValues []uint64
	var uniqueCounters = make(map[uint64]int)
	var duplicateCounters = make(map[uint64][]int)

	for i, extMsg := range allExtMsgs {
		event, err := test_utils.LoadEventFromMsg[event_emitter.CounterIncreased](extMsg)
		if err != nil {
			t.Logf("Failed to parse event %d: %v", i, err)
			continue
		}

		counterValues = append(counterValues, event.Counter)

		if prevIndex, exists := uniqueCounters[event.Counter]; exists {
			duplicateCounters[event.Counter] = append(duplicateCounters[event.Counter], prevIndex, i)
		} else {
			uniqueCounters[event.Counter] = i
		}
	}

	t.Logf("=== Counter Analysis ===")
	t.Logf("Total events parsed: %d", len(counterValues))
	t.Logf("Unique counter values: %d", len(uniqueCounters))

	if len(duplicateCounters) > 0 {
		t.Logf("DUPLICATE COUNTERS FOUND:")
		for counter, indices := range duplicateCounters {
			t.Logf("  Counter %d appears at indices: %v", counter, indices)
		}
	} else {
		t.Logf("✅ No duplicate counter values found")
	}

	if len(counterValues) > 0 {
		minCounter := counterValues[0]
		maxCounter := counterValues[0]
		for _, counter := range counterValues {
			if counter < minCounter {
				minCounter = counter
			}
			if counter > maxCounter {
				maxCounter = counter
			}
		}
		t.Logf("Counter range: %d to %d (expected: 1 to %d)", minCounter, maxCounter, expectedEventCount)

		expectedRange := maxCounter - minCounter + 1
		t.Logf("Expected range size: %d, Actual unique counters: %d", expectedRange, len(uniqueCounters))
	}

	require.Len(t, uniqueCounters, expectedEventCount, "Should have exactly %d unique counter values", expectedEventCount)

	t.Logf("=== Verifying Loader.BackfillForAddresses ===")

	firstTx := allTxResults[0] // very first event

	fromBlock, err := client.LookupBlock(
		t.Context(),
		firstTx.Block.Workchain,
		firstTx.Block.Shard,
		firstTx.Block.SeqNo-1,
	)
	require.NoError(t, err)

	time.Sleep(10 * time.Second) // Give some time for the chain to process
	toBlock, err := client.CurrentMasterchainInfo(t.Context())
	require.NoError(t, err)

	loader := logpoller.NewLoader(client, logger.Test(t), limit)
	msgs, err := loader.BackfillForAddresses(
		t.Context(),
		[]*address.Address{emitter.ContractAddress()},
		fromBlock,
		toBlock,
	)
	require.NoError(t, err)

	seen := map[uint64]bool{}
	for i, ext := range msgs {
		ev, lerr := test_utils.LoadEventFromMsg[event_emitter.CounterIncreased](ext)
		require.NoError(t, lerr, "failed to parse event #%d", i)
		require.False(t, seen[ev.Counter],
			"duplicate counter %d in loader result", ev.Counter)
		seen[ev.Counter] = true
	}

	t.Logf("all seen counters: %+v", seen)

	for i := uint64(1); i <= uint64(expectedEventCount); i++ {
		require.True(t, seen[i], "missing counter %d from loader result", i)
	}

	require.Len(t, msgs, expectedEventCount,
		"Loader should return exactly %d ExternalMessageOut messages, got %d", expectedEventCount, len(msgs))

	t.Logf("✅ Loader.BackfillForAddresses passed: got all %d events", expectedEventCount)

	totalBlocks := toBlock.SeqNo - fromBlock.SeqNo + 1
	chunkSize := totalBlocks / 3 // Split into 3 chunks

	// TODO: block range is different with source transactions, find a better way to get blocks that extMsgOut is included
	testRanges := []struct {
		name    string
		fromSeq uint32
		toSeq   uint32
	}{
		{"chunk_1", fromBlock.SeqNo - 1, fromBlock.SeqNo + chunkSize},
		{"chunk_2", fromBlock.SeqNo + chunkSize, fromBlock.SeqNo + 2*chunkSize},
		{"chunk_3", fromBlock.SeqNo + 2*chunkSize, toBlock.SeqNo},
	}

	var totalChunkedCounters = make(map[uint64]bool)
	allCounters := []uint64{}
	for _, tr := range testRanges {
		fromBlk, err := client.LookupBlock(t.Context(), fromBlock.Workchain, fromBlock.Shard, tr.fromSeq)
		require.NoError(t, err)

		toBlk, err := client.LookupBlock(t.Context(), fromBlock.Workchain, fromBlock.Shard, tr.toSeq)
		require.NoError(t, err)

		chunkMsgs, err := loader.BackfillForAddresses(t.Context(), []*address.Address{emitter.ContractAddress()}, fromBlk, toBlk)
		require.NoError(t, err)

		var chunkCounters []uint64
		for _, ext := range chunkMsgs {
			var ev event_emitter.CounterIncreased
			if err := tlb.LoadFromCell(&ev, ext.Body.BeginParse()); err == nil {
				chunkCounters = append(chunkCounters, ev.Counter)
				allCounters = append(allCounters, ev.Counter)
				totalChunkedCounters[ev.Counter] = true
			}
		}

		t.Logf("%s [%d→%d]: %d messages, counters: %v", tr.name, tr.fromSeq, tr.toSeq, len(chunkMsgs), chunkCounters)
	}

	t.Logf("Chunked results: %d unique counters (expected %d from full range)", len(totalChunkedCounters), len(seen))
	require.Len(t, allCounters, len(seen))
	t.Logf("✅ Chunked range queries work correctly")

	t.Run("Log Poller Live Event Ingestion", func(t *testing.T) {
		t.Skip("TODO: Implement")

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
