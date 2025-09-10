package logpoller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestComputeLookbackWindow(t *testing.T) {
	t.Run("Basic lookback calculation", func(t *testing.T) {
		currentSeqNo := uint32(1000)
		lookbackDuration := 50 * time.Second // Go back 50 seconds
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(50s / 2.5s) = ceil(20) = 20 blocks back, so 1000 - 20 = 980
		expected := uint32(980)
		require.Equal(t, expected, result)
	})

	t.Run("Lookback with ceiling division", func(t *testing.T) {
		currentSeqNo := uint32(1000)
		lookbackDuration := 51 * time.Second // Go back 51 seconds (not evenly divisible)
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(51s / 2.5s) = ceil(20.4) = 21 blocks back, so 1000 - 21 = 979
		expected := uint32(979)
		require.Equal(t, expected, result)
	})

	t.Run("Lookback exceeds chain history", func(t *testing.T) {
		currentSeqNo := uint32(5)
		lookbackDuration := 100 * time.Second // Go back 100 seconds
		blockTime := 2500 * time.Millisecond  // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(100s / 2.5s) = ceil(40) = 40 blocks back, but currentSeqNo (5) < 40, so return 0
		expected := uint32(0)
		require.Equal(t, expected, result, "should return 0 when lookback exceeds chain history")
	})

	t.Run("With default config", func(t *testing.T) {
		currentSeqNo := uint32(50000)
		lookbackDuration := DefaultConfigSet.LogPollerStartingLookback // 24 hours
		blockTime := DefaultConfigSet.BlockTime                        // 2.5 seconds

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(24h / 2.5s) = ceil(86400s / 2.5s) = ceil(34560) = 34560 blocks back, so 50000 - 34560 = 15440
		expected := uint32(15440)
		require.Equal(t, expected, result)
	})
}
