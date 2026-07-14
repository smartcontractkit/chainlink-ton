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
			execPrice: testMaxUint112(),
			daPrice:   testMaxUint112(),
			// (2^112-1 << 112) | (2^112-1)
			expectedPacked: new(big.Int).Or(new(big.Int).Lsh(testMaxUint112(), 112), testMaxUint112()),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test packing
			packed, err := PackGasPrice(tt.execPrice, tt.daPrice)
			require.NoError(t, err)
			require.Equal(t, tt.expectedPacked, packed, "packed value should match expected")

			// Test unpacking
			unpackedExec, unpackedDA, err := UnpackGasPrice(packed)
			require.NoError(t, err)
			require.True(t, tt.execPrice.Cmp(unpackedExec) == 0, "unpacked exec price should match original: expected %s, got %s", tt.execPrice, unpackedExec) //nolint:testifylint // big.Int requires value comparison not struct comparison
			require.True(t, tt.daPrice.Cmp(unpackedDA) == 0, "unpacked DA price should match original: expected %s, got %s", tt.daPrice, unpackedDA)           //nolint:testifylint // big.Int requires value comparison not struct comparison

			// Verify round-trip
			repacked, err := PackGasPrice(unpackedExec, unpackedDA)
			require.NoError(t, err)
			require.Equal(t, packed, repacked, "repacked value should match original packed value")
		})
	}
}

func TestUnpackGasPrice_Examples(t *testing.T) {
	t.Run("unpack 5192296858534827628530496329220097", func(t *testing.T) {
		// This is the value (1 << 112) | 1
		packed := mustParseBigInt("5192296858534827628530496329220097")
		exec, da, err := UnpackGasPrice(packed)
		require.NoError(t, err)

		require.Equal(t, big.NewInt(1), exec, "exec should be 1")
		require.Equal(t, big.NewInt(1), da, "DA should be 1")
	})

	t.Run("unpack 4919992000 (exec only)", func(t *testing.T) {
		packed := big.NewInt(4919992000)
		exec, da, err := UnpackGasPrice(packed)
		require.NoError(t, err)

		require.Equal(t, big.NewInt(4919992000), exec, "exec should be 4919992000")
		require.Equal(t, big.NewInt(0), da, "DA should be 0")
	})
}

func TestPackGasPrice_Errors(t *testing.T) {
	t.Run("nil execution gas price", func(t *testing.T) {
		_, err := PackGasPrice(nil, big.NewInt(0))
		require.ErrorIs(t, err, ErrNilGasPrice)
	})

	t.Run("nil data availability gas price", func(t *testing.T) {
		_, err := PackGasPrice(big.NewInt(0), nil)
		require.ErrorIs(t, err, ErrNilGasPrice)
	})

	t.Run("negative execution gas price", func(t *testing.T) {
		_, err := PackGasPrice(big.NewInt(-1), big.NewInt(0))
		require.ErrorIs(t, err, ErrNegativeGasPrice)
	})

	t.Run("negative data availability gas price", func(t *testing.T) {
		_, err := PackGasPrice(big.NewInt(0), big.NewInt(-1))
		require.ErrorIs(t, err, ErrNegativeGasPrice)
	})

	t.Run("execution gas price exceeds 112 bits", func(t *testing.T) {
		// 2^112 exceeds 112 bits
		tooBig := new(big.Int).Lsh(big.NewInt(1), 112)
		_, err := PackGasPrice(tooBig, big.NewInt(0))
		require.ErrorIs(t, err, ErrGasPriceExceeds112Bits)
	})

	t.Run("data availability gas price exceeds 112 bits", func(t *testing.T) {
		tooBig := new(big.Int).Lsh(big.NewInt(1), 112)
		_, err := PackGasPrice(big.NewInt(0), tooBig)
		require.ErrorIs(t, err, ErrGasPriceExceeds112Bits)
	})
}

func TestUnpackGasPrice_Errors(t *testing.T) {
	t.Run("nil packed price", func(t *testing.T) {
		_, _, err := UnpackGasPrice(nil)
		require.ErrorIs(t, err, ErrNilPackedPrice)
	})

	t.Run("negative packed price", func(t *testing.T) {
		_, _, err := UnpackGasPrice(big.NewInt(-1))
		require.ErrorIs(t, err, ErrNegativePackedPrice)
	})

	t.Run("packed price exceeds 224 bits", func(t *testing.T) {
		// 2^224 exceeds 224 bits
		tooBig := new(big.Int).Lsh(big.NewInt(1), 224)
		_, _, err := UnpackGasPrice(tooBig)
		require.ErrorIs(t, err, ErrPackedPriceExceeds224Bits)
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

func testMaxUint112() *big.Int {
	// 2^112 - 1
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 112), big.NewInt(1))
}
