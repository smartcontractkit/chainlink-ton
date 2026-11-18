package txm

import (
	"crypto/ed25519"
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

func TestNewTx(t *testing.T) {
	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKeyWithOptions(key, tonconfig.WalletVersion)
	require.NoError(t, err)
	id := "tx-1"
	request := Request{FromWallet: *w, ContractAddress: *w.WalletAddress(), Amount: tlb.MustFromTON("0.1"), Bounce: true, ID: &id}

	t.Run("valid", func(t *testing.T) {
		createdAt := time.Unix(1_700_000_000, 0)
		tx, err := newTx(request, createdAt, 5*time.Minute)
		require.NoError(t, err)
		require.Equal(t, createdAt, tx.CreatedAt)
		require.Equal(t, createdAt.Add(5*time.Minute), tx.Expiration)
		require.Equal(t, *w.Address(), tx.From)
		require.Equal(t, request.ContractAddress, tx.To)
		require.Equal(t, request.Amount, tx.Amount)
		require.True(t, tx.Bounceable)
		require.Equal(t, &id, tx.ID)
	})

	for name, createdAt := range map[string]time.Time{
		"created after uint32 seconds": time.Unix(math.MaxUint32+1, 0),
		"created before the epoch":     time.Unix(-1, 0),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := newTx(request, createdAt, time.Minute)
			require.ErrorContains(t, err, "invalid transaction creation time")
		})
	}

	t.Run("expiration before the epoch", func(t *testing.T) {
		_, err := newTx(request, time.Unix(0, 0), -time.Second)
		require.ErrorContains(t, err, "invalid transaction expiration")
	})
}

func TestValidateUnixSeconds32(t *testing.T) {
	for name, ts := range map[string]time.Time{
		"recent":      time.Unix(1_700_000_000, 0),
		"epoch":       time.Unix(0, 0),
		"max uint32":  time.Unix(math.MaxUint32, 0),
		"sub-second":  time.Unix(math.MaxUint32, 999_999_999),
		"current day": time.Now(),
	} {
		t.Run(name, func(t *testing.T) {
			require.NoError(t, validateUnixSeconds32(ts))
		})
	}

	for name, ts := range map[string]time.Time{
		"one second past uint32": time.Unix(math.MaxUint32+1, 0),
		"just before the epoch":  time.Unix(-1, 0),
		"zero time":              {},
	} {
		t.Run(name, func(t *testing.T) {
			require.Error(t, validateUnixSeconds32(ts))
		})
	}
}

func TestValidateUnixMillis(t *testing.T) {
	// Largest second accepted: its milliseconds, up to 999 ms past it, stay below MaxInt64.
	const maxSec = math.MaxInt64/1000 - 1

	for name, ts := range map[string]time.Time{
		"recent":     time.UnixMilli(1_700_000_000_123),
		"epoch":      time.Unix(0, 0),
		"max second": time.Unix(maxSec, 999*int64(time.Millisecond)),
	} {
		t.Run(name, func(t *testing.T) {
			require.NoError(t, validateUnixMillis(ts))
			require.GreaterOrEqual(t, ts.UnixMilli(), int64(0), "UnixMilli must not overflow")
		})
	}

	for name, ts := range map[string]time.Time{
		"one second past the max":       time.Unix(maxSec+1, 0),
		"wraps UnixMilli to zero":       time.Unix(1<<61, 0),
		"wraps UnixMilli to a positive": time.Unix(1<<61+1, 0),
		"max int64 seconds":             time.Unix(math.MaxInt64, 0),
		"just before the epoch":         time.UnixMilli(-1),
		"negative wrapping value":       time.Unix(-(1 << 61), 0),
		"zero time":                     {},
	} {
		t.Run(name, func(t *testing.T) {
			require.Error(t, validateUnixMillis(ts))
		})
	}
}
