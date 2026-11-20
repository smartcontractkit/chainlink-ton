package logpoller

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/internal/tonmock"
)

func TestGetMasterchainCurrentBlock_WorkchainValidation(t *testing.T) {
	t.Parallel()

	t.Run("rejects non-masterchain workchain", func(t *testing.T) {
		t.Parallel()
		mock := &tonmock.APIClient{
			MasterchainInfo: &ton.BlockIDExt{Workchain: 0, SeqNo: 100}, // workchain 0 is base chain, not masterchain
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		_, err := lp.getMasterchainCurrentBlock(context.Background())
		require.Error(t, err)
		require.Contains(t, err.Error(), "expected masterchain block")
	})

	t.Run("accepts masterchain workchain", func(t *testing.T) {
		t.Parallel()
		mock := &tonmock.APIClient{
			MasterchainInfo: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100},
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		block, err := lp.getMasterchainCurrentBlock(context.Background())
		require.NoError(t, err)
		require.NotNil(t, block)
		require.Equal(t, uint32(100), block.SeqNo)
	})
}

func TestGetBlockRange(t *testing.T) {
	t.Parallel()

	t.Run("returns nil when no new blocks", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &tonmock.APIClient{}, nil
			},
			lastProcessedBlockSeqNo: 100, // same as SeqNo, so no new blocks
		}

		blockRange, err := lp.getBlockRange(context.Background(), currentMasterchainBlock)
		require.NoError(t, err)
		require.Nil(t, blockRange, "no new blocks when seqno matches lastProcessedBlockSeqNo")
	})
}

func TestShardBlockKey(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		block    *ton.BlockIDExt
		expected string
	}{
		{
			name:     "basechain block",
			block:    &ton.BlockIDExt{Workchain: 0, Shard: -9223372036854775808, SeqNo: 12345},
			expected: "0:-9223372036854775808:12345",
		},
		{
			name:     "masterchain block",
			block:    &ton.BlockIDExt{Workchain: -1, Shard: -9223372036854775808, SeqNo: 99999},
			expected: "-1:-9223372036854775808:99999",
		},
		{
			name:     "zero seqno",
			block:    &ton.BlockIDExt{Workchain: 0, Shard: 0, SeqNo: 0},
			expected: "0:0:0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := shardBlockKey(tt.block)
			require.Equal(t, tt.expected, result)
		})
	}
}

func TestBlockCount(t *testing.T) {
	t.Parallel()
	const bt = 2500 * time.Millisecond

	tests := []struct {
		name string
		d    time.Duration
		want uint32
	}{
		{"zero duration is one block", 0, 1},
		{"one nanosecond is one block", 1, 1},
		{"exact multiple", 50 * time.Second, 20},
		{"rounds up", 51 * time.Second, 21},
		{"default 24h", 24 * time.Hour, 34560},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, blockCount(tc.d, bt))
		})
	}

	t.Run("zero duration is one block for any block time", func(t *testing.T) {
		for _, blockTime := range []time.Duration{time.Nanosecond, 2 * time.Nanosecond, bt, time.Hour} {
			require.Equal(t, uint32(1), blockCount(0, blockTime), "blockTime=%s", blockTime)
		}
	})

	t.Run("1ns block time", func(t *testing.T) {
		require.Equal(t, uint32(1), blockCount(1, time.Nanosecond))
		require.Equal(t, uint32(1_000_000_000), blockCount(time.Second, time.Nanosecond))
	})

	t.Run("max uint32 boundary", func(t *testing.T) {
		require.Equal(t, uint32(math.MaxUint32), blockCount(time.Duration(math.MaxUint32), 1))
		require.Equal(t, uint32(math.MaxUint32-1), blockCount(time.Duration(math.MaxUint32-1), 1))
	})

	t.Run("counts beyond uint32 are capped", func(t *testing.T) {
		require.Equal(t, uint32(math.MaxUint32), blockCount(time.Duration(math.MaxUint32)+1, 1))
		require.Equal(t, uint32(math.MaxUint32), blockCount(1200*time.Hour, time.Millisecond))
		require.Equal(t, uint32(math.MaxUint32), blockCount(time.Duration(math.MaxInt64), 1))
	})
}

func TestComputeLookbackWindow(t *testing.T) {
	t.Parallel()

	t.Run("basic lookback calculation", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(1000)
		lookbackDuration := 50 * time.Second // Go back 50 seconds
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(50s / 2.5s) = ceil(20) = 20 blocks back, so 1000 - 20 = 980
		expected := uint32(980)
		require.Equal(t, expected, result)
	})

	t.Run("lookback with ceiling division", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(1000)
		lookbackDuration := 51 * time.Second // Go back 51 seconds (not evenly divisible)
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(51s / 2.5s) = ceil(20.4) = 21 blocks back, so 1000 - 21 = 979
		expected := uint32(979)
		require.Equal(t, expected, result)
	})

	t.Run("lookback exceeds chain history", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(5)
		lookbackDuration := 100 * time.Second // Go back 100 seconds
		blockTime := 2500 * time.Millisecond  // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(100s / 2.5s) = ceil(40) = 40 blocks back, but currentSeqNo (5) < 40, so return 0
		expected := uint32(0)
		require.Equal(t, expected, result, "should return 0 when lookback exceeds chain history")
	})

	t.Run("with default config", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(50000)
		lookbackDuration := DefaultConfigSet.LogPollerStartingLookback.Duration() // 24 hours
		blockTime := DefaultConfigSet.BlockTime.Duration()                        // 2.5 seconds

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(24h / 2.5s) = ceil(86400s / 2.5s) = ceil(34560) = 34560 blocks back, so 50000 - 34560 = 15440
		expected := uint32(15440)
		require.Equal(t, expected, result)
	})

	t.Run("zero lookback with 1ns block time looks back one block", func(t *testing.T) {
		t.Parallel()
		result := computeLookbackWindow(1000, 0, time.Nanosecond)
		require.Equal(t, uint32(999), result, "checkpoint must be behind the head")
	})

	t.Run("block count beyond uint32 looks back to genesis", func(t *testing.T) {
		t.Parallel()
		// 1200h of 1ms blocks is more than MaxUint32 blocks: capped, it still reaches genesis
		// from the highest possible seqno.
		result := computeLookbackWindow(math.MaxUint32, 1200*time.Hour, time.Millisecond)
		require.Equal(t, uint32(0), result)
	})
}

func TestResolveMCBlockSeqNoWithRetry(t *testing.T) {
	t.Parallel()

	newTestService := func(liteClient *tonmock.LiteClient, maxRetries uint32, baseDelay time.Duration) *service {
		cache, _ := lru.New[string, uint32](100)
		return &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &tonmock.APIClient{LiteClient: liteClient}, nil
			},
			mcBlockCache:             cache,
			mcBlockResolveMaxRetries: maxRetries,
			mcBlockResolveBaseDelay:  baseDelay,
		}
	}

	shardBlock := &ton.BlockIDExt{Workchain: 0, Shard: -9223372036854775808, SeqNo: 12345}

	t.Run("success on first attempt", func(t *testing.T) {
		t.Parallel()
		liteClient := &tonmock.LiteClient{
			QueryFunc: func(_ context.Context, _, resp tl.Serializable) error {
				// Set response to successful ShardBlockProof
				ptr := resp.(*tl.Serializable)
				*ptr = ton.ShardBlockProof{
					MasterchainID: &ton.BlockIDExt{SeqNo: 99999},
				}
				return nil
			},
		}

		lp := newTestService(liteClient, 3, 1*time.Millisecond)

		seqno, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.NoError(t, err)
		require.Equal(t, uint32(99999), seqno)
		require.Equal(t, 1, liteClient.CallCount, "should only call once on success")
	})

	t.Run("success after retries", func(t *testing.T) {
		t.Parallel()
		callCount := 0
		liteClient := &tonmock.LiteClient{
			QueryFunc: func(_ context.Context, _, resp tl.Serializable) error {
				callCount++
				if callCount < 3 {
					return errors.New("transient error")
				}
				// Succeed on 3rd attempt
				ptr := resp.(*tl.Serializable)
				*ptr = ton.ShardBlockProof{
					MasterchainID: &ton.BlockIDExt{SeqNo: 88888},
				}
				return nil
			},
		}

		lp := newTestService(liteClient, 3, 1*time.Millisecond)

		seqno, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.NoError(t, err)
		require.Equal(t, uint32(88888), seqno)
		require.Equal(t, 3, callCount, "should retry until success")
	})

	t.Run("failure after all retries exhausted", func(t *testing.T) {
		t.Parallel()
		liteClient := &tonmock.LiteClient{
			QueryFunc: func(_ context.Context, _, _ tl.Serializable) error {
				return errors.New("persistent error")
			},
		}

		lp := newTestService(liteClient, 3, 1*time.Millisecond)

		_, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed after 3 attempts")
		require.Equal(t, 3, liteClient.CallCount, "should exhaust all retries")
	})

	t.Run("context cancellation stops retries", func(t *testing.T) {
		t.Parallel()
		callCount := 0
		liteClient := &tonmock.LiteClient{
			QueryFunc: func(_ context.Context, _, _ tl.Serializable) error {
				callCount++
				return errors.New("transient error")
			},
		}

		lp := newTestService(liteClient, 5, 50*time.Millisecond)

		ctx, cancel := context.WithCancel(context.Background())
		// Cancel after a short delay to allow first attempt
		go func() {
			time.Sleep(10 * time.Millisecond)
			cancel()
		}()

		_, err := lp.resolveMCBlockSeqNoWithRetry(ctx, shardBlock)
		require.Error(t, err)
		require.ErrorIs(t, err, context.Canceled, "should return context.Canceled")
		require.Less(t, callCount, 5, "should stop before exhausting all retries")
	})

	t.Run("uses cache on subsequent calls", func(t *testing.T) {
		t.Parallel()
		liteClient := &tonmock.LiteClient{
			QueryFunc: func(_ context.Context, _, resp tl.Serializable) error {
				ptr := resp.(*tl.Serializable)
				*ptr = ton.ShardBlockProof{
					MasterchainID: &ton.BlockIDExt{SeqNo: 77777},
				}
				return nil
			},
		}

		lp := newTestService(liteClient, 3, 1*time.Millisecond)

		// First call
		seqno1, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.NoError(t, err)
		require.Equal(t, uint32(77777), seqno1)
		require.Equal(t, 1, liteClient.CallCount)

		// Second call - should use cache
		seqno2, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.NoError(t, err)
		require.Equal(t, uint32(77777), seqno2)
		require.Equal(t, 1, liteClient.CallCount, "should not call liteserver again due to cache")
	})
}
