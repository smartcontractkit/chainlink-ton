package logpoller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services/servicetest"
	"github.com/smartcontractkit/chainlink-common/pkg/utils/tests"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// TestLogPollerServiceLeak runs the real engine ticks, polling loop, pruning ticker, and loader goroutines
// under goleak. After Start, it exercises filter management (Register/Has/Unregister) and Replay so the
// public service surface runs real code beyond Start/Close.
func TestLogPollerServiceLeak(t *testing.T) {
	tests.VerifyNoLeaks(t)

	lggr := logger.Test(t)
	chainID := "leak-lp"
	ctx := context.Background()

	cfg := DefaultConfigSet
	cfg.PollPeriod = commonconfig.MustNewDuration(100 * time.Millisecond)
	cfg.PruningInterval = commonconfig.MustNewDuration(1 * time.Minute)
	cfg.PruningStartDelay = commonconfig.MustNewDuration(0)
	cfg.MCBlockResolveMaxRetries = 1
	cfg.MCBlockResolveBaseDelay = commonconfig.MustNewDuration(time.Millisecond)
	cfg.ApplyDefaults()
	require.NoError(t, cfg.ValidateConfig())

	poll := cfg.PollPeriod.Duration()

	currentMC := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
	lite := &mockLiteClient{
		queryFunc: func(_ context.Context, _ tl.Serializable, resp tl.Serializable) error {
			ptr := resp.(*tl.Serializable)
			*ptr = ton.ShardBlockProof{
				MasterchainID: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50},
			}
			return nil
		},
	}
	mockClient := &mockAPIClient{
		masterchainInfo: currentMC,
		lookupBlockFunc: func(seqNo uint32) *ton.BlockIDExt {
			return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: seqNo, Shard: 1}
		},
		liteClient: lite,
	}

	opts := &ServiceOptions{
		Config:      cfg,
		FilterStore: newMockFilterStore(),
		TxLoader:    &testTxLoader{}, // empty stream; still exercises per-address goroutines in loadTxsForAddresses
		LogStore:    &testLogStore{},
	}

	clientProvider := func(context.Context) (ton.APIClientWrapped, error) {
		return mockClient, nil
	}

	svc, err := NewService(lggr, chainID, clientProvider, opts)
	require.NoError(t, err)

	addr := testAddress(t)
	_, err = svc.RegisterFilter(ctx, models.Filter{
		Name:     "leak-filter",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0xcafebabe,
	})
	require.NoError(t, err)

	servicetest.RunHealthy(t, svc)

	// Wait several poll periods so processBlockRange runs at least once (fans out per-address
	// loader goroutines and the resolveTxsMCBlock goroutine).
	time.Sleep(3 * poll)

	// Exercise additional public service methods while the engine is running.
	exists, err := svc.HasFilter(ctx, "leak-filter")
	require.NoError(t, err)
	require.True(t, exists)

	_, err = svc.RegisterFilter(ctx, models.Filter{
		Name:     "leak-filter-2",
		Address:  testAddress2(t),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0xfeedface,
	})
	require.NoError(t, err)

	require.NoError(t, svc.Replay(ctx, 50))

	require.NoError(t, svc.UnregisterFilter(ctx, "leak-filter"))

	// Give the poller time for more ticks after filter and replay mutations.
	time.Sleep(2 * poll)
}
