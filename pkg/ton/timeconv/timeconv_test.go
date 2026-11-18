package timeconv

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnixSeconds32(t *testing.T) {
	got, err := UnixSeconds32(time.Unix(1_700_000_000, 0))
	require.NoError(t, err)
	assert.Equal(t, uint32(1_700_000_000), got)

	got, err = UnixSeconds32(time.Unix(math.MaxUint32, 0))
	require.NoError(t, err)
	assert.Equal(t, uint32(math.MaxUint32), got)

	_, err = UnixSeconds32(time.Unix(math.MaxUint32+1, 0))
	require.Error(t, err)

	_, err = UnixSeconds32(time.Unix(-1, 0))
	require.Error(t, err)

	_, err = UnixSeconds32(time.Time{})
	require.Error(t, err)
}

func TestUnixMillisU64(t *testing.T) {
	got, err := UnixMillisU64(time.UnixMilli(1_700_000_000_123))
	require.NoError(t, err)
	assert.Equal(t, uint64(1_700_000_000_123), got)

	got, err = UnixMillisU64(time.Unix(0, 0))
	require.NoError(t, err)
	assert.Zero(t, got)

	// Largest second count whose milliseconds still fit in a uint64: 18446744073709551 s,
	// with up to 615 ms before the total passes MaxUint64 (18446744073709551615).
	const maxSec = math.MaxUint64 / 1000
	got, err = UnixMillisU64(time.Unix(maxSec, 615*int64(time.Millisecond)))
	require.NoError(t, err)
	assert.Equal(t, uint64(math.MaxUint64), got)

	for name, ts := range map[string]time.Time{
		"one millisecond past uint64":   time.Unix(maxSec, 616*int64(time.Millisecond)),
		"one second past uint64":        time.Unix(maxSec+1, 0),
		"wraps UnixMilli to zero":       time.Unix(1<<61, 0),
		"wraps UnixMilli to a positive": time.Unix(1<<61+1, 0),
		"max int64 seconds":             time.Unix(math.MaxInt64, 0),
		"just before the epoch":         time.UnixMilli(-1),
		"negative wrapping value":       time.Unix(-(1 << 61), 0),
		"zero time":                     {},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := UnixMillisU64(ts)
			require.Error(t, err)
		})
	}
}

func TestBlockCount(t *testing.T) {
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
			got, err := BlockCount(tc.d, bt)
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}

	t.Run("zero duration is one block for any block time", func(t *testing.T) {
		for _, blockTime := range []time.Duration{time.Nanosecond, 2 * time.Nanosecond, bt, time.Hour} {
			got, err := BlockCount(0, blockTime)
			require.NoError(t, err)
			assert.Equal(t, uint32(1), got, "blockTime=%s", blockTime)
		}
	})

	t.Run("1ns block time", func(t *testing.T) {
		got, err := BlockCount(1, time.Nanosecond)
		require.NoError(t, err)
		assert.Equal(t, uint32(1), got)

		got, err = BlockCount(time.Second, time.Nanosecond)
		require.NoError(t, err)
		assert.Equal(t, uint32(1_000_000_000), got)
	})

	t.Run("max uint32 boundary", func(t *testing.T) {
		got, err := BlockCount(time.Duration(math.MaxUint32), 1)
		require.NoError(t, err)
		assert.Equal(t, uint32(math.MaxUint32), got)

		_, err = BlockCount(time.Duration(math.MaxUint32)+1, 1)
		require.Error(t, err)
	})

	t.Run("max duration with small block time overflows", func(t *testing.T) {
		_, err := BlockCount(time.Duration(math.MaxInt64), time.Millisecond)
		require.Error(t, err)
	})

	t.Run("rejects zero block time", func(t *testing.T) {
		_, err := BlockCount(time.Hour, 0)
		require.Error(t, err)
	})

	t.Run("rejects negative inputs", func(t *testing.T) {
		_, err := BlockCount(-time.Second, bt)
		require.Error(t, err)
		_, err = BlockCount(time.Hour, -bt)
		require.Error(t, err)
	})
}
