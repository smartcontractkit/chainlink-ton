package logpoller

import (
	"context"
	"errors"
	"testing"
	"time"

	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// mockAPIClient is a minimal mock for ton.APIClientWrapped used in unit tests
type mockAPIClient struct {
	ton.APIClientWrapped // embed to satisfy interface
	masterchainInfo      *ton.BlockIDExt
	masterchainErr       error
	lookupBlockResult    *ton.BlockIDExt
	lookupBlockErr       error
	lookupBlockFunc      func(seqNo uint32) *ton.BlockIDExt // optional: dynamic block lookup
	liteClient           *mockLiteClient
}

func (m *mockAPIClient) CurrentMasterchainInfo(_ context.Context) (*ton.BlockIDExt, error) {
	return m.masterchainInfo, m.masterchainErr
}

func (m *mockAPIClient) LookupBlock(_ context.Context, _ int32, _ int64, seqNo uint32) (*ton.BlockIDExt, error) {
	if m.lookupBlockFunc != nil {
		return m.lookupBlockFunc(seqNo), m.lookupBlockErr
	}
	return m.lookupBlockResult, m.lookupBlockErr
}

func (m *mockAPIClient) Client() ton.LiteClient {
	return m.liteClient
}

func (m *mockAPIClient) WaitForBlock(seqno uint32) ton.APIClientWrapped {
	return m
}

// mockLiteClient mocks the LiteClient interface for testing liteserver queries
type mockLiteClient struct {
	ton.LiteClient
	queryFunc func(ctx context.Context, req, resp tl.Serializable) error
	callCount int
}

func (m *mockLiteClient) QueryLiteserver(ctx context.Context, req tl.Serializable, resp tl.Serializable) error {
	m.callCount++
	if m.queryFunc != nil {
		return m.queryFunc(ctx, req, resp)
	}
	return nil
}

func TestGetMasterchainCurrentBlock_WorkchainValidation(t *testing.T) {
	t.Parallel()

	t.Run("rejects non-masterchain workchain", func(t *testing.T) {
		t.Parallel()
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: 0, SeqNo: 100}, // workchain 0 is base chain, not masterchain
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
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100},
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
				return &mockAPIClient{}, nil
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
}

func TestResolveMCBlockSeqNoWithRetry(t *testing.T) {
	t.Parallel()

	newTestService := func(liteClient *mockLiteClient, maxRetries uint32, baseDelay time.Duration) *service {
		cache, _ := lru.New[string, uint32](100)
		return &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{liteClient: liteClient}, nil
			},
			mcBlockCache:             cache,
			mcBlockResolveMaxRetries: maxRetries,
			mcBlockResolveBaseDelay:  baseDelay,
		}
	}

	shardBlock := &ton.BlockIDExt{Workchain: 0, Shard: -9223372036854775808, SeqNo: 12345}

	t.Run("success on first attempt", func(t *testing.T) {
		t.Parallel()
		liteClient := &mockLiteClient{
			queryFunc: func(_ context.Context, _, resp tl.Serializable) error {
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
		require.Equal(t, 1, liteClient.callCount, "should only call once on success")
	})

	t.Run("success after retries", func(t *testing.T) {
		t.Parallel()
		callCount := 0
		liteClient := &mockLiteClient{
			queryFunc: func(_ context.Context, _, resp tl.Serializable) error {
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
		liteClient := &mockLiteClient{
			queryFunc: func(_ context.Context, _, _ tl.Serializable) error {
				return errors.New("persistent error")
			},
		}

		lp := newTestService(liteClient, 3, 1*time.Millisecond)

		_, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed after 3 attempts")
		require.Equal(t, 3, liteClient.callCount, "should exhaust all retries")
	})

	t.Run("context cancellation stops retries", func(t *testing.T) {
		t.Parallel()
		callCount := 0
		liteClient := &mockLiteClient{
			queryFunc: func(_ context.Context, _, _ tl.Serializable) error {
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
		liteClient := &mockLiteClient{
			queryFunc: func(_ context.Context, _, resp tl.Serializable) error {
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
		require.Equal(t, 1, liteClient.callCount)

		// Second call - should use cache
		seqno2, err := lp.resolveMCBlockSeqNoWithRetry(context.Background(), shardBlock)
		require.NoError(t, err)
		require.Equal(t, uint32(77777), seqno2)
		require.Equal(t, 1, liteClient.callCount, "should not call liteserver again due to cache")
	})
}
