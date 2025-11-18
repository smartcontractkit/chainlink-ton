package feequoter

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPackUnpackGasPrice(t *testing.T) {
	tests := []struct {
		name           string
		execPrice      *big.Int
		daPrice        *big.Int
		expectedPacked *big.Int
	}{
		{
			name:           "both zero",
			execPrice:      big.NewInt(0),
			daPrice:        big.NewInt(0),
			expectedPacked: big.NewInt(0),
		},
		{
			name:           "exec only",
			execPrice:      big.NewInt(4919992000),
			daPrice:        big.NewInt(0),
			expectedPacked: big.NewInt(4919992000),
		},
		{
			name:           "da only",
			execPrice:      big.NewInt(0),
			daPrice:        big.NewInt(1),
			expectedPacked: new(big.Int).Lsh(big.NewInt(1), 112), // 1 << 112
		},
		{
			name:      "both set to 1",
			execPrice: big.NewInt(1),
			daPrice:   big.NewInt(1),
			// (1 << 112) | 1 = 5192296858534827628530496329220097
			expectedPacked: mustParseBigInt("5192296858534827628530496329220097"),
		},
		{
			name:           "large values",
			execPrice:      big.NewInt(500000),
			daPrice:        big.NewInt(1000000),
			expectedPacked: new(big.Int).Or(new(big.Int).Lsh(big.NewInt(1000000), 112), big.NewInt(500000)),
		},
		{
			name:      "max 112-bit values",
			execPrice: maxUint112(),
			daPrice:   maxUint112(),
			// (2^112-1 << 112) | (2^112-1)
			expectedPacked: new(big.Int).Or(new(big.Int).Lsh(maxUint112(), 112), maxUint112()),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test packing
			packed := PackGasPrice(tt.execPrice, tt.daPrice)
			require.Equal(t, tt.expectedPacked, packed, "packed value should match expected")

			// Test unpacking
			unpackedExec, unpackedDA := UnpackGasPrice(packed)
			require.True(t, tt.execPrice.Cmp(unpackedExec) == 0, "unpacked exec price should match original: expected %s, got %s", tt.execPrice, unpackedExec) //nolint:testifylint // big.Int requires value comparison not struct comparison
			require.True(t, tt.daPrice.Cmp(unpackedDA) == 0, "unpacked DA price should match original: expected %s, got %s", tt.daPrice, unpackedDA)           //nolint:testifylint // big.Int requires value comparison not struct comparison

			// Verify round-trip
			repacked := PackGasPrice(unpackedExec, unpackedDA)
			require.Equal(t, packed, repacked, "repacked value should match original packed value")
		})
	}
}

func TestUnpackGasPrice_Examples(t *testing.T) {
	t.Run("unpack 5192296858534827628530496329220097", func(t *testing.T) {
		// This is the value (1 << 112) | 1
		packed := mustParseBigInt("5192296858534827628530496329220097")
		exec, da := UnpackGasPrice(packed)

		require.Equal(t, big.NewInt(1), exec, "exec should be 1")
		require.Equal(t, big.NewInt(1), da, "DA should be 1")
	})

	t.Run("unpack 4919992000 (exec only)", func(t *testing.T) {
		packed := big.NewInt(4919992000)
		exec, da := UnpackGasPrice(packed)

		require.Equal(t, big.NewInt(4919992000), exec, "exec should be 4919992000")
		require.Equal(t, big.NewInt(0), da, "DA should be 0")
	})
}

// Helper functions
func mustParseBigInt(s string) *big.Int {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		panic("failed to parse big int: " + s)
	}
	return n
}

func maxUint112() *big.Int {
	// 2^112 - 1
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 112), big.NewInt(1))
}
