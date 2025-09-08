package logpoller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestComputeLookbackSeqNo(t *testing.T) {
	t.Run("Basic lookback calculation", func(t *testing.T) {
		currentSeqNo := uint32(1000)
		lookbackDuration := 50 * time.Second // Go back 50 seconds
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackSeqNo(currentSeqNo, lookbackDuration, blockTime)

		// Expected: 50s / 2.5s = 20 blocks back, so 1000 - 20 = 980
		expected := uint32(980)
		require.Equal(t, expected, result)
	})

	t.Run("Lookback exceeds chain history", func(t *testing.T) {
		currentSeqNo := uint32(5)
		lookbackDuration := 100 * time.Second // Go back 100 seconds
		blockTime := 2500 * time.Millisecond  // 2.5 second block time

		result := computeLookbackSeqNo(currentSeqNo, lookbackDuration, blockTime)

		// Expected: 100s / 2.5s = 40 blocks back, but currentSeqNo (5) < 40, so return 0
		expected := uint32(0)
		require.Equal(t, expected, result, "should return 0 when lookback exceeds chain history")
	})

	t.Run("With default config", func(t *testing.T) {
		currentSeqNo := uint32(50000)
		lookbackDuration := DefaultConfigSet.LogPollerStartingLookback // 24 hours
		blockTime := DefaultConfigSet.BlockTime                        // 2.5 seconds

		result := computeLookbackSeqNo(currentSeqNo, lookbackDuration, blockTime)

		// Expected: 24h = 86400s, 86400s / 2.5s = 34560 blocks back, so 50000 - 34560 = 15440
		expected := uint32(15440)
		require.Equal(t, expected, result)
	})
}
