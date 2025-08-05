// Package logpoller contains unit tests for the getNotSeenShards method in msg_loader.go.
package logpoller

import (
	"context"
	"errors"
	"math/bits"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/test-go/testify/mock"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	mockton "github.com/smartcontractkit/chainlink-ton/mocks/tonutils-go/ton"
)

const (
	MasterchainShard = int64(-9223372036854775808) // 0x8000000000000000
)

// shardIDToIdent converts a standard 64-bit shard ID into a tlb.ShardIdent struct.
func shardIDToIdent(workchain int32, shardID int64) tlb.ShardIdent {
	s := uint64(shardID) //nolint:gosec // test shard ID
	if workchain == -1 && s == 0x8000000000000000 {
		return tlb.ShardIdent{WorkchainID: workchain, ShardPrefix: 0, PrefixBits: 0}
	}
	if s == 0 {
		// A shard ID of 0 for a workchain represents the entire chain before any splits.
		return tlb.ShardIdent{WorkchainID: workchain, ShardPrefix: 0, PrefixBits: 0}
	}
	lowestBit := s & -s
	prefixLen := 63 - bits.TrailingZeros64(lowestBit)
	prefix := s & ^lowestBit
	return tlb.ShardIdent{WorkchainID: workchain, ShardPrefix: prefix, PrefixBits: int8(prefixLen)} //nolint:gosec // test code
}

// newTestBlock creates a tlb.Block object for testing purposes.
func newTestBlock(id *ton.BlockIDExt, afterMerge, afterSplit bool, parentSeqNos ...uint32) *tlb.Block {
	hdr := tlb.BlockHeader{}
	hdr.Shard = shardIDToIdent(id.Workchain, id.Shard)
	hdr.SeqNo = id.SeqNo
	hdr.AfterMerge = afterMerge
	hdr.AfterSplit = afterSplit
	hdr.GenUtime = uint32(time.Now().Unix()) //nolint:gosec // test code

	if len(parentSeqNos) > 0 {
		hdr.PrevRef.Prev1.SeqNo = parentSeqNos[0]
	}
	if len(parentSeqNos) > 1 {
		hdr.PrevRef.Prev2 = &tlb.ExtBlkRef{SeqNo: parentSeqNos[1]}
	}
	return &tlb.Block{BlockInfo: hdr}
}

// createTestBlockID is a helper to create a block identifier for tests.
func createTestBlockID(workchain int32, shard int64, seqno uint32) *ton.BlockIDExt {
	return &ton.BlockIDExt{Workchain: workchain, Shard: shard, SeqNo: seqno}
}

func TestLogCollector_BackfillForAddresses(t *testing.T) {
	ctx := context.Background()
	lggr := logger.Test(t)
	pageSize := uint32(10)

	t.Run("successful backfill on a linear chain", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		fromBlock := createTestBlockID(-1, MasterchainShard, 100)
		toBlock := createTestBlockID(-1, MasterchainShard, 102)
		monitoredAddr := address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")

		master101 := createTestBlockID(-1, MasterchainShard, 101)
		master102 := toBlock
		shardA101 := createTestBlockID(0, 4611686018427387904, 101)
		shardB102 := createTestBlockID(0, 1, 102)

		mockClient.On("GetBlockShardsInfo", ctx, fromBlock).Return([]*ton.BlockIDExt{
			createTestBlockID(0, 4611686018427387904, 100),
			createTestBlockID(0, 1, 100),
		}, nil).Once()

		mockClient.On("LookupBlock", ctx, address.MasterchainID, toBlock.Shard, uint32(101)).Return(master101, nil).Once()
		mockClient.On("LookupBlock", ctx, address.MasterchainID, toBlock.Shard, uint32(102)).Return(master102, nil).Once()

		mockClient.On("GetBlockShardsInfo", ctx, master101).Return([]*ton.BlockIDExt{shardA101}, nil).Once()
		mockClient.On("GetBlockShardsInfo", ctx, master102).Return([]*ton.BlockIDExt{shardB102}, nil).Once()

		// Mocks for getNotSeenShards parent traversal
		mockClient.On("GetBlockData", ctx, shardA101).Return(newTestBlock(shardA101, false, false, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, shardB102).Return(newTestBlock(shardB102, false, false, 100), nil).Once()

		// Mocks for fetchTransactionsInBlock (to get timestamp)
		mockClient.On("GetBlockData", ctx, shardA101).Return(newTestBlock(shardA101, false, false), nil).Once()
		mockClient.On("GetBlockData", ctx, shardB102).Return(newTestBlock(shardB102, false, false), nil).Once()

		mockClient.On("GetBlockTransactionsV2", ctx, shardA101, pageSize, (*ton.TransactionID3)(nil)).Return(nil, false, nil).Once()

		txInfo := ton.TransactionShortInfo{Account: monitoredAddr.Data(), LT: 12345}
		mockClient.On("GetBlockTransactionsV2", ctx, shardB102, pageSize, (*ton.TransactionID3)(nil)).Return([]ton.TransactionShortInfo{txInfo}, false, nil).Once()

		tx := &tlb.Transaction{}
		tx.IO.Out = &tlb.MessagesList{List: cell.NewDict(15)}
		outMsgCell, _ := tlb.ToCell(tlb.ExternalMessageOut{Body: cell.BeginCell().MustStoreUInt(0xDEADBEEF, 32).EndCell()})
		tx.IO.Out.List.Set(cell.BeginCell().MustStoreUInt(0, 15).EndCell(), cell.BeginCell().MustStoreRef(outMsgCell).EndCell())

		mockClient.On("GetTransaction", ctx, shardB102, monitoredAddr, txInfo.LT).Return(tx, nil).Once()

		msgs, err := logCollector.BackfillForAddresses(ctx, []*address.Address{monitoredAddr}, fromBlock, toBlock)

		require.NoError(t, err)
		require.Len(t, msgs, 1)
		// check extracted message
		assert.Equal(t, uint64(0xDEADBEEF), msgs[0].Msg.Body.BeginParse().MustLoadUInt(32))
		assert.Equal(t, master102, msgs[0].MasterBlock)
		assert.Equal(t, shardB102, msgs[0].ShardBlock)
	})

	t.Run("successful backfill with nil prevBlock", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		toBlock := createTestBlockID(-1, MasterchainShard, 102)
		fromBlock := createTestBlockID(-1, MasterchainShard, 101)

		mockClient.On("GetBlockData", ctx, toBlock).Return(newTestBlock(toBlock, false, false, 101), nil).Once()
		mockClient.On("GetBlockShardsInfo", ctx, fromBlock).Return(nil, nil).Once()
		mockClient.On("LookupBlock", ctx, mock.Anything, mock.Anything, mock.Anything).Return(toBlock, nil)
		mockClient.On("GetBlockShardsInfo", ctx, toBlock).Return(nil, nil).Once()

		msgs, err := logCollector.BackfillForAddresses(ctx, nil, nil, toBlock)

		require.NoError(t, err)
		assert.Empty(t, msgs)
	})

	t.Run("handles transaction pagination", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, 2) // small page size

		fromBlock := createTestBlockID(-1, MasterchainShard, 100)
		toBlock := createTestBlockID(-1, MasterchainShard, 101)
		monitoredAddr := address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF") // random address from public doc
		shard := createTestBlockID(0, 1, 101)

		mockClient.On("GetBlockShardsInfo", ctx, fromBlock).Return([]*ton.BlockIDExt{createTestBlockID(0, 1, 100)}, nil).Once()
		mockClient.On("LookupBlock", ctx, mock.Anything, mock.Anything, mock.Anything).Return(toBlock, nil).Once()
		mockClient.On("GetBlockShardsInfo", ctx, toBlock).Return([]*ton.BlockIDExt{shard}, nil).Once()
		mockClient.On("GetBlockData", ctx, shard).Return(newTestBlock(shard, false, false, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, shard).Return(newTestBlock(shard, false, false), nil).Once() // For fetchTransactionsInBlock

		// First page of transactions
		txInfo1 := ton.TransactionShortInfo{Account: monitoredAddr.Data(), LT: 12345}
		txInfo2 := ton.TransactionShortInfo{Account: monitoredAddr.Data(), LT: 12346}
		mockClient.On("GetBlockTransactionsV2", ctx, shard, uint32(2), (*ton.TransactionID3)(nil)).Return([]ton.TransactionShortInfo{txInfo1, txInfo2}, true, nil).Once()

		// Second page of transactions
		txInfo3 := ton.TransactionShortInfo{Account: monitoredAddr.Data(), LT: 12347}
		mockClient.On("GetBlockTransactionsV2", ctx, shard, uint32(2), txInfo2.ID3()).Return([]ton.TransactionShortInfo{txInfo3}, false, nil).Once()

		// Mock full transaction data for all three
		tx := &tlb.Transaction{}
		tx.IO.Out = &tlb.MessagesList{List: cell.NewDict(15)}
		mockClient.On("GetTransaction", ctx, shard, monitoredAddr, mock.Anything).Return(tx, nil)

		_, err := logCollector.BackfillForAddresses(ctx, []*address.Address{monitoredAddr}, fromBlock, toBlock)
		require.NoError(t, err)

		// Assert that GetTransaction was called for all three transactions
		mockClient.AssertCalled(t, "GetTransaction", ctx, shard, monitoredAddr, txInfo1.LT)
		mockClient.AssertCalled(t, "GetTransaction", ctx, shard, monitoredAddr, txInfo2.LT)
		mockClient.AssertCalled(t, "GetTransaction", ctx, shard, monitoredAddr, txInfo3.LT)
	})

	t.Run("handles error from GetBlockShardsInfo", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		fromBlock := createTestBlockID(-1, MasterchainShard, 100)
		toBlock := createTestBlockID(-1, MasterchainShard, 102)

		expectedErr := errors.New("shards info error")
		mockClient.On("GetBlockShardsInfo", ctx, fromBlock).Return(nil, expectedErr).Once()

		_, err := logCollector.BackfillForAddresses(ctx, nil, fromBlock, toBlock)

		require.Error(t, err)
		assert.Contains(t, err.Error(), expectedErr.Error())
	})

	t.Run("handles error from LookupBlock and fails", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		fromBlock := createTestBlockID(-1, MasterchainShard, 100)
		toBlock := createTestBlockID(-1, MasterchainShard, 102)

		mockClient.On("GetBlockShardsInfo", ctx, fromBlock).Return(nil, nil).Once()

		expectedErr := errors.New("lookup error")
		// Fails on 101
		mockClient.On("LookupBlock", ctx, address.MasterchainID, toBlock.Shard, uint32(101)).Return(nil, expectedErr).Once()

		_, err := logCollector.BackfillForAddresses(ctx, nil, fromBlock, toBlock)

		require.Error(t, err)
		assert.Contains(t, err.Error(), expectedErr.Error())
		assert.Contains(t, err.Error(), "failed to lookup master block 101")
	})
}

func TestLogCollector_getNotSeenShards(t *testing.T) {
	ctx := context.Background()
	lggr := logger.Test(t)
	pageSize := uint32(100)

	t.Run("base case - shard already seen with equal seqno", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		shard := createTestBlockID(0, 1, 100)
		shardLastSeqno := map[string]uint32{
			"0|1": 100,
		}

		result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)

		require.NoError(t, err)
		assert.Nil(t, result)
	})

	t.Run("base case - shard already seen with higher seqno", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		shard := createTestBlockID(0, 1, 100)
		shardLastSeqno := map[string]uint32{
			"0|1": 150,
		}

		result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)

		require.NoError(t, err)
		assert.Nil(t, result)
	})

	t.Run("error getting block data", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		shard := createTestBlockID(0, 1, 100)
		shardLastSeqno := map[string]uint32{
			"0|1": 50, // lower than current seqno, so we should proceed
		}

		expectedError := errors.New("failed to get block data")
		mockClient.On("GetBlockData", ctx, shard).Return(nil, expectedError).Once()

		result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "get block data")
		assert.Nil(t, result)
	})

	t.Run("edge case - empty shard map triggers GetBlockData", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		shard := createTestBlockID(0, 1, 100)
		shardLastSeqno := map[string]uint32{} // empty map

		expectedError := errors.New("simulated GetBlockData error")
		mockClient.On("GetBlockData", ctx, shard).Return(nil, expectedError).Once()

		result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "get block data")
		assert.Nil(t, result)
	})

	t.Run("edge case - different workchain triggers GetBlockData", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		shard := createTestBlockID(-1, 1, 100)
		shardLastSeqno := map[string]uint32{
			"0|1": 150, // same shard but different workchain
		}

		expectedError := errors.New("simulated GetBlockData error")
		mockClient.On("GetBlockData", ctx, shard).Return(nil, expectedError).Once()

		result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "get block data")
		assert.Nil(t, result)
	})

	t.Run("edge case - seqno boundary conditions", func(t *testing.T) {
		tests := []struct {
			name          string
			shardSeqNo    uint32
			lastSeenSeqNo uint32
			shouldProcess bool
		}{
			{"exactly equal", 100, 100, false},
			{"last seen is greater", 100, 101, false},
			{"current is greater by 1", 101, 100, true},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				mockClient := mockton.NewAPIClientWrapped(t)
				logCollector := NewLogCollector(mockClient, lggr, pageSize)

				shard := createTestBlockID(0, 1, tt.shardSeqNo)
				shardLastSeqno := map[string]uint32{
					"0|1": tt.lastSeenSeqNo,
				}

				if tt.shouldProcess {
					expectedError := errors.New("simulated GetBlockData error")
					mockClient.On("GetBlockData", ctx, shard).Return(nil, expectedError).Once()

					result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)
					require.Error(t, err)
					assert.Nil(t, result)
				} else {
					result, err := logCollector.getNotSeenShards(ctx, shard, shardLastSeqno)
					require.NoError(t, err)
					assert.Nil(t, result)
				}
			})
		}
	})
}

func TestLogCollector_getNotSeenShards_Recursion(t *testing.T) {
	ctx := context.Background()
	lggr := logger.Test(t)
	pageSize := uint32(100)

	t.Run("recursive case - deep linear chain", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		block100 := createTestBlockID(0, -9223372036854775808, 100)
		block101 := createTestBlockID(0, -9223372036854775808, 101)
		block102 := createTestBlockID(0, -9223372036854775808, 102)

		shardLastSeqno := map[string]uint32{getShardID(block100): 99}

		mockClient.On("GetBlockData", ctx, block102).Return(newTestBlock(block102, false, false, 101), nil).Once()
		mockClient.On("GetBlockData", ctx, block101).Return(newTestBlock(block101, false, false, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, block100).Return(newTestBlock(block100, false, false, 99), nil).Once()

		result, err := logCollector.getNotSeenShards(ctx, block102, shardLastSeqno)

		require.NoError(t, err)
		require.Len(t, result, 3, "Should return blocks 100, 101, and 102")
		assert.Equal(t, uint32(100), result[0].SeqNo)
		assert.Equal(t, uint32(101), result[1].SeqNo)
		assert.Equal(t, uint32(102), result[2].SeqNo)
	})

	t.Run("recursive case - shard merge with two parents", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		parentA := createTestBlockID(0, 4611686018427387904, 101)  // Left child of root
		parentB := createTestBlockID(0, -4611686018427387904, 100) // Right child of root
		current := createTestBlockID(0, -9223372036854775808, 102) // Root shard

		shardLastSeqno := map[string]uint32{
			getShardID(parentA): 99,
			getShardID(parentB): 99,
		}

		mockClient.On("GetBlockData", ctx, current).Return(newTestBlock(current, true, false, 101, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, parentA).Return(newTestBlock(parentA, false, false, 99), nil).Once()
		mockClient.On("GetBlockData", ctx, parentB).Return(newTestBlock(parentB, false, false, 99), nil).Once()

		result, err := logCollector.getNotSeenShards(ctx, current, shardLastSeqno)

		require.NoError(t, err)
		require.Len(t, result, 3)
		// Order of parents can be non-deterministic, so check for presence
		assert.Contains(t, result, parentA)
		assert.Contains(t, result, parentB)
		assert.Equal(t, current, result[2]) // Current block is always last
	})

	t.Run("recursive case - shard split", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		parent := createTestBlockID(0, -9223372036854775808, 100)  // Root shard
		current := createTestBlockID(0, -4611686018427387904, 101) // Right child

		shardLastSeqno := map[string]uint32{getShardID(parent): 99}

		mockClient.On("GetBlockData", ctx, current).Return(newTestBlock(current, false, true, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, parent).Return(newTestBlock(parent, false, false, 99), nil).Once()

		result, err := logCollector.getNotSeenShards(ctx, current, shardLastSeqno)

		require.NoError(t, err)
		require.Len(t, result, 2)
		assert.Equal(t, parent, result[0])
		assert.Equal(t, current, result[1])
	})

	t.Run("recursive case - mixed seen and unseen parents", func(t *testing.T) {
		mockClient := mockton.NewAPIClientWrapped(t)
		logCollector := NewLogCollector(mockClient, lggr, pageSize)

		parentA := createTestBlockID(0, 4611686018427387904, 101)  // Unseen parent
		parentB := createTestBlockID(0, -4611686018427387904, 100) // SEEN parent
		current := createTestBlockID(0, -9223372036854775808, 102)

		// parentB is already seen, so recursion should stop there.
		shardLastSeqno := map[string]uint32{
			getShardID(parentA): 99,
			getShardID(parentB): 100,
		}

		mockClient.On("GetBlockData", ctx, current).Return(newTestBlock(current, true, false, 101, 100), nil).Once()
		mockClient.On("GetBlockData", ctx, parentA).Return(newTestBlock(parentA, false, false, 99), nil).Once()
		// No mock for parentB is needed as it should be pruned by the base case check.

		result, err := logCollector.getNotSeenShards(ctx, current, shardLastSeqno)

		require.NoError(t, err)
		require.Len(t, result, 2)
		assert.Equal(t, parentA, result[0])
		assert.Equal(t, current, result[1])
	})
}

func TestGetShardID(t *testing.T) {
	tests := []struct {
		name     string
		shard    *ton.BlockIDExt
		expected string
	}{
		{
			name:     "masterchain",
			shard:    createTestBlockID(-1, -9223372036854775808, 100),
			expected: "-1|-9223372036854775808",
		},
		{
			name:     "basechain shard 0",
			shard:    createTestBlockID(0, 0, 100),
			expected: "0|0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getShardID(tt.shard)
			assert.Equal(t, tt.expected, result)
		})
	}
}
