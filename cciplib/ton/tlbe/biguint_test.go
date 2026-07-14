package tlbe // tlb extras

import (
	"errors"
	"fmt"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type legacyValues struct {
	Address *big.Int `tlb:"## 160"`
	Root    *big.Int `tlb:"## 256"`
}

type typedValues struct {
	Address *Uint160 `tlb:"."`
	Root    *Uint256 `tlb:"."`
}

func TestUintWrappers_MaskSignBit(t *testing.T) {
	testCases := []struct {
		name          string
		addr          []byte
		root          []byte
		legacyAddrNeg bool
		legacyRootNeg bool
	}{
		{
			name:          "high-bit",
			addr:          leadingBytes(20, 0x80),
			root:          leadingBytes(32, 0x80),
			legacyAddrNeg: true,
			legacyRootNeg: true,
		},
		{
			name:          "low-bit",
			addr:          leadingBytes(20, 0x01),
			root:          leadingBytes(32, 0x01),
			legacyAddrNeg: false,
			legacyRootNeg: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			c, err := encodeFixed(tc.addr, tc.root)
			require.NoError(t, err)

			// Expected big-endian unsigned integers
			expectedAddr := new(big.Int).SetBytes(tc.addr)
			expectedRoot := new(big.Int).SetBytes(tc.root)

			// Testing typed wrappers - should mask sign bit and interpret as unsigned
			var typed typedValues
			err = tlb.LoadFromCell(&typed, c.BeginParse())
			require.NoError(t, err)

			require.NotNil(t, typed.Address.Value(), "address value is nil")
			require.Equal(t, expectedAddr, typed.Address.Value(), "address mismatch")

			require.NotNil(t, typed.Root.Value(), "root value is nil")
			require.Equal(t, expectedRoot, typed.Root.Value(), "root mismatch")

			// Testing legacy big.Int loading - should interpret as signed integers
			var legacy legacyValues
			err = tlb.LoadFromCell(&legacy, c.BeginParse())
			require.NoError(t, err)

			require.Equal(t, tc.legacyAddrNeg, legacy.Address.Sign() < 0, "address sign mismatch")
			require.Equal(t, tc.legacyRootNeg, legacy.Root.Sign() < 0, "root sign mismatch")
		})
	}
}

func TestUintWrappers_RoundTrip(t *testing.T) {
	addr := leadingBytes(20, 0x80)
	root := leadingBytes(32, 0x7f)

	original := typedValues{
		Address: NewUint160(new(big.Int).SetBytes(addr)),
		Root:    NewUint256(new(big.Int).SetBytes(root)),
	}

	cellValue, err := tlb.ToCell(original)
	require.NoError(t, err)

	var decoded typedValues
	err = tlb.LoadFromCell(&decoded, cellValue.BeginParse())
	require.NoError(t, err)

	require.NotNil(t, decoded.Address.Value(), "address value is nil after roundtrip")
	require.Equal(t, new(big.Int).SetBytes(addr), decoded.Address.Value(), "address mismatch after roundtrip")

	require.NotNil(t, decoded.Root.Value(), "root value is nil after roundtrip")
	require.Equal(t, new(big.Int).SetBytes(root), decoded.Root.Value(), "root mismatch after roundtrip")

	var legacy legacyValues
	err = tlb.LoadFromCell(&legacy, cellValue.BeginParse())
	require.NoError(t, err)

	require.Negative(t, legacy.Address.Sign(), "legacy address expected negative sign")
}

func leadingBytes(length int, first byte) []byte {
	if length <= 0 {
		return nil
	}

	out := make([]byte, length)
	out[0] = first
	return out
}

func encodeFixed(addr, root []byte) (*cell.Cell, error) {
	if len(addr) != 20 {
		return nil, errors.New("address must be 20 bytes")
	}
	if len(root) != 32 {
		return nil, errors.New("root must be 32 bytes")
	}

	builder := cell.BeginCell()
	if err := builder.StoreBigInt(new(big.Int).SetBytes(addr), 160); err != nil {
		return nil, fmt.Errorf("failed to store bigint: %w", err)
	}
	if err := builder.StoreBigInt(new(big.Int).SetBytes(root), 256); err != nil {
		return nil, fmt.Errorf("failed to store bigint: %w", err)
	}

	return builder.EndCell(), nil
}
