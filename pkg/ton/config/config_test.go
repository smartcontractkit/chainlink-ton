package config

import (
	"context"
	"crypto/ed25519"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestMessageBuilderQueryIDStaysBelowMax(t *testing.T) {
	// Exhaust the full 23-bit space: every id the builder can ever emit must
	// be accepted by tonutils' SpecHighloadV3.BuildMessage (queryID < 1<<23).
	seen := make(map[uint32]struct{}, maxQueryID)
	for i := range uint64(maxQueryID) {
		id, createdAt, err := WalletVersion.MessageBuilder(context.Background(), 0)
		if err != nil {
			t.Fatalf("iteration %d: unexpected error: %v", i, err)
		}
		if id >= maxQueryID {
			t.Fatalf("iteration %d: query id %d exceeds bound %d", i, id, maxQueryID)
		}
		if createdAt <= 0 {
			t.Fatalf("iteration %d: createdAt %d must be positive", i, createdAt)
		}
		seen[id] = struct{}{}
	}
	if len(seen) != maxQueryID {
		t.Fatalf("expected %d distinct ids over a full cycle, got %d", maxQueryID, len(seen))
	}
}

func TestMessageBuilderConcurrentIDsAreDistinct(t *testing.T) {
	// Two sends within the same second must not collide: the counter, not the
	// clock, distinguishes ids. Run enough calls in parallel to exercise the
	// atomic increment under contention.
	const n = 10000
	var wg sync.WaitGroup
	ids := make(chan uint32, n)
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, _, err := WalletVersion.MessageBuilder(context.Background(), 0)
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			ids <- id
		}()
	}
	wg.Wait()
	close(ids)

	seen := make(map[uint32]struct{}, n)
	for id := range ids {
		if id >= maxQueryID {
			t.Fatalf("query id %d exceeds bound %d", id, maxQueryID)
		}
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate query id %d under concurrency", id)
		}
		seen[id] = struct{}{}
	}
}

func TestHighloadV3MessageWindow(t *testing.T) {
	t.Parallel()
	const createdAt int64 = 1_700_000_000
	const ttl = 77

	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKeyWithOptions(key, wallet.ConfigHighloadV3{
		MessageTTL: ttl,
		MessageBuilder: func(context.Context, uint32) (uint32, int64, error) {
			return 42, createdAt, nil
		},
	})
	require.NoError(t, err)
	msg := &wallet.Message{
		Mode:            wallet.PayGasSeparately,
		InternalMessage: &tlb.InternalMessage{DstAddr: w.WalletAddress(), Amount: tlb.MustFromTON("0.1")},
	}

	for _, withStateInit := range []bool{false, true} {
		ext, prepareErr := w.PrepareExternalMessageForMany(t.Context(), withStateInit, []*wallet.Message{msg})
		require.NoError(t, prepareErr)

		gotCreatedAt, gotExpiresAt, windowErr := HighloadV3MessageWindow(ext)
		require.NoError(t, windowErr)
		require.Equal(t, time.Unix(createdAt, 0), gotCreatedAt)
		require.Equal(t, time.Unix(createdAt+ttl, 0), gotExpiresAt)
	}

	_, _, err = HighloadV3MessageWindow(&tlb.ExternalMessage{Body: cell.BeginCell().EndCell()})
	require.Error(t, err)
}
