package poc_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
)

func Test_TON_Block_Ingestion_POC(t *testing.T) {

	t.Log("Setting up network connection and wallet...")

	lcConnectionPool := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(t.Context(), "http://127.0.0.1:8000/localhost.global.config.json")
	require.NoError(t, err, "Failed to get network config")

	err = lcConnectionPool.AddConnectionsFromConfig(t.Context(), cfg)
	require.NoError(t, err, "Failed to connect to TON network")

	client := ton.NewAPIClient(lcConnectionPool).WithRetry()
	wallet := testutils.CreateTonWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))

	var contractAddress *address.Address

	t.Run("airdrop", func(t *testing.T) {
		testutils.FundTonWallets(t, client,
			[]*address.Address{wallet.WalletAddress()},
			[]tlb.Coins{tlb.MustFromTON("1000")})

		require.Eventually(t, func() bool {
			block, err := client.CurrentMasterchainInfo(t.Context())
			require.NoError(t, err)

			balance, err := wallet.GetBalance(t.Context(), block)
			require.NoError(t, err)
			return !balance.IsZero()
		}, 60*time.Second, 500*time.Millisecond)

		t.Logf("Wallet %s funded successfully", wallet.WalletAddress().String())
	})

	t.Run("deploy test contract", func(t *testing.T) {
		t.Log("Deploying test contract...")
		addr, err := testutils.DeployCounterContract(t.Context(), client, wallet)
		require.NoError(t, err, "Failed to deploy contract")

		contractAddress = addr
		t.Logf("Contract deployed at: %s", addr.String())

		time.Sleep(15 * time.Second)
	})

	t.Run("log poller fetching transaction flow", func(t *testing.T) {
		var masterBlock *ton.BlockIDExt
		t.Run("Fetching latest block", func(t *testing.T) {
			// 1. Fetch the latest masterchain info
			// cached version of GetMasterchainInfo to not do it in parallel many times
			masterBlock, err = client.CurrentMasterchainInfo(t.Context())
			require.NoError(t, err, "Failed to get latest block")
			t.Logf("Latest block: %d, SeqNo: %d", masterBlock.Shard, masterBlock.SeqNo)
		})

		// Helper function to generate shard ID for tracking (from reference)
		getShardID := func(shard *ton.BlockIDExt) string {
			return fmt.Sprintf("%d|%d", shard.Workchain, shard.Shard)
		}

		// Recursive function to detect missing shard blocks (from reference)
		var getNotSeenShards func(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error)
		getNotSeenShards = func(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
			// Check if we've already seen this shard seqno
			if no, ok := shardLastSeqno[getShardID(shard)]; ok && no == shard.SeqNo {
				return nil, nil
			}

			// Get block data to access parent blocks
			b, err := client.GetBlockData(ctx, shard)
			if err != nil {
				return nil, fmt.Errorf("get block data: %w", err)
			}

			// Get parent blocks to detect holes
			// TODO: why? what is the meaning of this?
			parents, err := b.BlockInfo.GetParentBlocks()
			if err != nil {
				return nil, fmt.Errorf("get parent blocks (%d:%x:%d): %w",
					shard.Workchain, uint64(shard.Shard), shard.SeqNo, err)
			}

			var ret []*ton.BlockIDExt

			// Recursively process all parent blocks
			for _, parent := range parents {
				ext, err := getNotSeenShards(ctx, parent, shardLastSeqno)
				if err != nil {
					return nil, err
				}
				ret = append(ret, ext...)
			}

			// Add current block last (topological order)
			ret = append(ret, shard)
			return ret, nil
		}

		// Storage for last seen shard seqno (from reference)
		shardLastSeqno := map[string]uint32{}

		t.Run("Initialize shard tracking", func(t *testing.T) {
			// Get information about other work-chains and shards of first master block
			// to init storage of last seen shard seq numbers
			firstShards, err := client.GetBlockShardsInfo(t.Context(), masterBlock)
			require.NoError(t, err, "Failed to get shards info")

			for _, shard := range firstShards {
				shardLastSeqno[getShardID(shard)] = shard.SeqNo
				t.Logf("Initialized shard %s with seqno %d", getShardID(shard), shard.SeqNo)
			}
		})

		t.Run("Process master block with hole detection", func(t *testing.T) {
			t.Logf("Scanning master block %d...", masterBlock.SeqNo)

			// Get information about other work-chains and shards of master block
			currentShards, err := client.GetBlockShardsInfo(t.Context(), masterBlock)
			require.NoError(t, err, "Failed to get shards info")

			// Shards in master block may have holes, e.g. shard seqno 2756461, then 2756463, and no 2756462
			// Thus we need to scan back in case of discovering a hole, till last seen, to fill the misses
			var newShards []*ton.BlockIDExt
			for _, shard := range currentShards {
				notSeen, err := getNotSeenShards(t.Context(), shard, shardLastSeqno)
				require.NoError(t, err, "Failed to get not seen shards")

				// Update tracking
				shardLastSeqno[getShardID(shard)] = shard.SeqNo
				newShards = append(newShards, notSeen...)
			}

			// Always add master block last
			newShards = append(newShards, masterBlock)

			t.Logf("Found %d blocks to process", len(newShards))
			for i, block := range newShards {
				t.Logf("  Block %d: Workchain %d, Shard %x, SeqNo %d",
					i+1, block.Workchain, uint64(block.Shard), block.SeqNo)
			}
		})

		t.Run("Fetch transactions from blocks", func(t *testing.T) {
			// Get current shards for processing
			currentShards, err := client.GetBlockShardsInfo(t.Context(), masterBlock)
			require.NoError(t, err, "Failed to get shards info")

			// Detect missing blocks
			var blocksToProcess []*ton.BlockIDExt
			for _, shard := range currentShards {
				notSeen, err := getNotSeenShards(t.Context(), shard, shardLastSeqno)
				require.NoError(t, err, "Failed to get not seen shards")
				blocksToProcess = append(blocksToProcess, notSeen...)
			}
			blocksToProcess = append(blocksToProcess, masterBlock)

			var txList []*tlb.Transaction

			// For each shard block, get transactions (from reference)
			for _, shard := range blocksToProcess {
				t.Logf("Scanning block %d of shard %x in workchain %d...",
					shard.SeqNo, uint64(shard.Shard), shard.Workchain)

				var fetchedIDs []ton.TransactionShortInfo
				var after *ton.TransactionID3
				var more = true

				// Load all transactions in batches with 100 transactions each while they exist
				for more {
					// 🔑 KEY: Use WaitForBlock(master.SeqNo) to ensure consistency
					fetchedIDs, more, err = client.WaitForBlock(masterBlock.SeqNo).GetBlockTransactionsV2(
						t.Context(), shard, 100, after)

					if err != nil {
						t.Logf("Error getting tx ids for block %d: %v", shard.SeqNo, err)
						break
					}

					if more {
						// Set load offset for next query (pagination)
						after = fetchedIDs[len(fetchedIDs)-1].ID3()
					}

					// Get full transaction details for each ID
					for _, id := range fetchedIDs {
						// Get full transaction by id
						tx, err := client.GetTransaction(t.Context(), shard,
							address.NewAddress(0, byte(shard.Workchain), id.Account), id.LT)
						if err != nil {
							t.Logf("Error getting tx data: %v", err)
							continue
						}
						txList = append(txList, tx)
					}
				}
			}

			// Log transaction results (from reference)
			for i, transaction := range txList {
				if i < 3 { // Limit output for testing
					t.Logf("Transaction %d: %s", i, transaction.String())
				}
			}

			if len(txList) == 0 {
				t.Logf("No transactions in block %d", masterBlock.SeqNo)
			} else {
				t.Logf("Total transactions found: %d", len(txList))
			}
		})

		t.Run("Demonstrate next block waiting (production pattern)", func(t *testing.T) {
			// This shows how to wait for the next master block (from reference)
			nextSeqno := masterBlock.SeqNo + 1

			t.Logf("Attempting to get next master block (seqno %d)...", nextSeqno)

			// 🔑 KEY: This is the production pattern from reference
			nextMaster, err := client.WaitForBlock(nextSeqno).LookupBlock(
				t.Context(), masterBlock.Workchain, masterBlock.Shard, nextSeqno)

			if err != nil {
				t.Logf("Next master block not available yet (normal): %v", err)
				t.Log("In production, this would wait automatically until the block is available")
			} else {
				t.Logf("✅ Successfully got next master block %d", nextMaster.SeqNo)
			}

			t.Log("")
			t.Log("🎯 Production LogPoller would:")
			t.Log("  1. Wait for next master block using WaitForBlock(seqno+1)")
			t.Log("  2. Get all shards and detect holes with getNotSeenShards()")
			t.Log("  3. Process shard blocks first, then master block")
			t.Log("  4. Use WaitForBlock(master.SeqNo) for all transaction fetching")
			t.Log("  5. Repeat the cycle continuously")
		})
	})
	t.Run("continuous log poller - run forever", func(t *testing.T) {
		// This test runs continuously and monitors all new blocks
		// Send transactions manually in other tests/tools to see them detected here

		t.Log("🚀 Starting continuous TON LogPoller - monitors all new blocks forever")
		t.Log("📝 Send transactions manually to see them detected in real-time")
		t.Log("⏹️  Press Ctrl+C to stop")

		// Helper function to generate shard ID for tracking
		getShardID := func(shard *ton.BlockIDExt) string {
			return fmt.Sprintf("%d|%d", shard.Workchain, shard.Shard)
		}

		// Recursive function to detect missing shard blocks
		var getNotSeenShards func(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error)
		getNotSeenShards = func(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
			if no, ok := shardLastSeqno[getShardID(shard)]; ok && no == shard.SeqNo {
				return nil, nil
			}

			b, err := client.GetBlockData(ctx, shard)
			if err != nil {
				return nil, fmt.Errorf("get block data: %w", err)
			}

			parents, err := b.BlockInfo.GetParentBlocks()
			if err != nil {
				return nil, fmt.Errorf("get parent blocks (%d:%x:%d): %w",
					shard.Workchain, uint64(shard.Shard), shard.SeqNo, err)
			}

			var ret []*ton.BlockIDExt
			for _, parent := range parents {
				ext, err := getNotSeenShards(ctx, parent, shardLastSeqno)
				if err != nil {
					return nil, err
				}
				ret = append(ret, ext...)
			}

			ret = append(ret, shard)
			return ret, nil
		}

		// Get initial master block
		masterBlock, err := client.CurrentMasterchainInfo(t.Context())
		require.NoError(t, err, "Failed to get initial master block")

		// Storage for last seen shard seqno
		shardLastSeqno := map[string]uint32{}

		// Initialize shard tracking
		firstShards, err := client.GetBlockShardsInfo(t.Context(), masterBlock)
		require.NoError(t, err, "Failed to get initial shards info")

		for _, shard := range firstShards {
			shardLastSeqno[getShardID(shard)] = shard.SeqNo
			t.Logf("📋 Initialized shard %s with seqno %d", getShardID(shard), shard.SeqNo)
		}

		t.Logf("🎯 Starting from master block %d", masterBlock.SeqNo)
		t.Log("⏱️  Polling for new blocks every 3 seconds...")

		// Continuous polling loop - THIS RUNS FOREVER
		currentMaster := masterBlock
		blockCount := 0
		totalTxCount := 0

		for {
			select {
			case <-t.Context().Done():
				t.Log("🛑 Context cancelled, stopping continuous poller")
				return
			default:
				// Continue processing
			}

			// Try to get next master block
			nextSeqno := currentMaster.SeqNo + 1

			// Use WaitForBlock to get next master block
			// This will block until the next block is available
			t.Logf("⏳ Waiting for master block %d...", nextSeqno)

			// Create a timeout context for each block wait (5 seconds)
			waitCtx, cancel := context.WithTimeout(t.Context(), 5*time.Second)

			nextMaster, err := client.WaitForBlock(nextSeqno).LookupBlock(
				waitCtx, currentMaster.Workchain, currentMaster.Shard, nextSeqno)
			cancel()

			if err != nil {
				// Block not available yet, wait a bit and retry
				t.Logf("   Master block %d not ready yet, retrying in 3s...", nextSeqno)
				time.Sleep(3 * time.Second)
				continue
			}

			blockCount++
			t.Logf("🆕 NEW MASTER BLOCK %d (processed %d blocks total)", nextMaster.SeqNo, blockCount)

			// Process this master block
			currentShards, err := client.GetBlockShardsInfo(t.Context(), nextMaster)
			if err != nil {
				t.Logf("❌ Error getting shards info: %v", err)
				continue
			}

			// Detect missing blocks and process them
			var blocksToProcess []*ton.BlockIDExt
			for _, shard := range currentShards {
				notSeen, err := getNotSeenShards(t.Context(), shard, shardLastSeqno)
				if err != nil {
					t.Logf("❌ Error detecting holes for shard %s: %v", getShardID(shard), err)
					continue
				}

				if len(notSeen) > 0 {
					t.Logf("   🕳️  Found %d missing blocks for shard %s", len(notSeen), getShardID(shard))
				}

				shardLastSeqno[getShardID(shard)] = shard.SeqNo
				blocksToProcess = append(blocksToProcess, notSeen...)
			}
			blocksToProcess = append(blocksToProcess, nextMaster)

			t.Logf("   📦 Processing %d blocks (shards + master)", len(blocksToProcess))

			// Process all transactions in all blocks
			blockTxCount := 0
			for _, block := range blocksToProcess {
				t.Logf("   🔍 Scanning block %d (WC:%d, Shard:%x) for transactions...",
					block.SeqNo, block.Workchain, uint64(block.Shard))

				var after *ton.TransactionID3
				var more = true
				var thisBlockTxCount = 0

				for more {
					fetchedIDs, hasMore, err := client.WaitForBlock(nextMaster.SeqNo).GetBlockTransactionsV2(
						t.Context(), block, 100, after)

					if err != nil {
						t.Logf("   ❌ Error getting transactions for block %d: %v", block.SeqNo, err)
						break
					}

					more = hasMore

					// Show details for each transaction
					for _, id := range fetchedIDs {
						thisBlockTxCount++

						// Show transaction details
						t.Logf("     📋 TX %d: Hash=%x, Account=%x, LT=%d",
							thisBlockTxCount, id.Hash, id.Account, id.LT)

						// Optionally get full transaction details for first few transactions
						if thisBlockTxCount <= 3 {
							addr := address.NewAddress(0, byte(block.Workchain), id.Account)
							tx, err := client.GetTransaction(t.Context(), block, addr, id.LT)
							if err != nil {
								t.Logf("       ❌ Failed to get full transaction: %v", err)
							} else {
								t.Logf("       📄 Full TX: Account=%s, Hash=%x", addr.String(), tx.Hash)

								// Show in/out message counts
								inMsgCount := 0
								if tx.IO.In != nil {
									inMsgCount = 1
								}

								outMsgCount := 0
								if tx.IO.Out != nil {
									if outList, err := tx.IO.Out.ToSlice(); err == nil {
										outMsgCount = len(outList)
									}
								}

								t.Logf("       💬 Messages: In=%d, Out=%d", inMsgCount, outMsgCount)
							}
						}
					}

					if more && len(fetchedIDs) > 0 {
						after = fetchedIDs[len(fetchedIDs)-1].ID3()
					}

					// Limit to prevent overwhelming logs (but show more detail)
					if thisBlockTxCount >= 20 {
						t.Logf("   📊 Block %d has %d+ transactions (showing first 20 for detail)",
							block.SeqNo, thisBlockTxCount)
						break
					}
				}

				if thisBlockTxCount > 0 {
					t.Logf("   ✅ Block %d processed: %d transactions found", block.SeqNo, thisBlockTxCount)
				} else {
					t.Logf("   ⭕ Block %d: No transactions", block.SeqNo)
				}

				blockTxCount += thisBlockTxCount
			}

			totalTxCount += blockTxCount

			if blockTxCount > 0 {
				t.Logf("   ✅ Block %d processed: %d transactions (total processed: %d)",
					nextMaster.SeqNo, blockTxCount, totalTxCount)
			} else {
				t.Logf("   ✅ Block %d processed: 0 transactions", nextMaster.SeqNo)
			}

			// Update current master
			currentMaster = nextMaster

			// Brief pause before next iteration
			time.Sleep(1 * time.Second)
		}
	})
	_ = contractAddress
}
