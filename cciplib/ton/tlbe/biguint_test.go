package tlbe // tlb extras

import (
	"encoding/json"
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
	Address Uint160 `tlb:"."`
	Root    Uint256 `tlb:"."`
}

// ptrTypedValues covers the pointer-field form still used by the shared struct
// definitions (e.g. *tlbe.Uint256), which must keep working unchanged.
type ptrTypedValues struct {
	Address *Uint160 `tlb:"."`
	Root    *Uint256 `tlb:"."`
}

// uint128SetHolder guards the generic path used by CursedSubjects: a struct
// field with a tlb:"." tag holding a *Dict[Uint128, struct{}].
type uint128SetHolder struct {
	Subjects *Dict[Uint128, struct{}] `tlb:"."`
}

// bigFromHex builds a big.Int from a hex string (helper for readable test cases).
func bigFromHex(t *testing.T, s string) *big.Int {
	t.Helper()
	v, ok := new(big.Int).SetString(s, 16)
	require.True(t, ok)
	return v
}

// TestUintWrappers_WireCompatWithRawStore locks in that the byte-based codec
// produces exactly the same cell as a raw fixed-width store, so on-chain data
// stays bit-identical to the previous BigUint/StoreBigInt path.
func TestUintWrappers_WireCompatWithRawStore(t *testing.T) {
	v := new(big.Int).Add(new(big.Int).Lsh(big.NewInt(9), 200), big.NewInt(1234567))

	cases := []struct {
		name  string
		boxed any
		raw   *cell.Cell
	}{
		{"uint128", *NewUint128(v), cell.BeginCell().MustStoreBigInt(AsUnsigned(v, 128), 128).EndCell()},
		{"uint160", *NewUint160(v), cell.BeginCell().MustStoreBigInt(AsUnsigned(v, 160), 160).EndCell()},
		{"uint256", *NewUint256(v), cell.BeginCell().MustStoreBigInt(AsUnsigned(v, 256), 256).EndCell()},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, err := tlb.ToCell(tc.boxed)
			require.NoError(t, err)
			require.Equal(t, tc.raw.Hash(), c.Hash(),
				"boxed encoding must match the raw fixed-width big-endian store")
		})
	}
}

// TestUint128_Values checks the in-memory layout: big-endian bytes, so a bit set
// at position N lands in the expected word of F.
func TestUint128_Values(t *testing.T) {
	// A value above the 64-bit range exercises multiple bytes.
	v := new(big.Int).Add(new(big.Int).Lsh(big.NewInt(1), 100), big.NewInt(12345))

	u := NewUint128(v)
	require.Equal(t, v, u.ToBigInt())
	require.Equal(t, uint8(0x0), u.F[0])  // high bytes zero
	require.Equal(t, uint8(0x10), u.F[3]) // 2^100 sets bit 4 of byte 3

	// Zero and max round-trip through the bytes.
	require.Equal(t, big.NewInt(0), NewUint128(big.NewInt(0)).ToBigInt())

	maxVal := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
	require.Equal(t, maxVal, NewUint128(maxVal).ToBigInt())
}

// TestUintWrappers_AreComparable locks in the core property: the boxed fixed-width
// uints are value types with == semantics (unlike a big.Int alias), so they can
// be used as Go map / tlbe.Dict keys.
func TestUintWrappers_AreComparable(t *testing.T) {
	v128 := new(big.Int).Lsh(big.NewInt(1), 100)
	a128, b128 := *NewUint128(v128), *NewUint128(v128)
	require.Equal(t, a128, b128, "equal Uint128 values must compare equal")
	require.NotEqual(t, a128, *NewUint128(big.NewInt(1)), "different Uint128 values must compare unequal")

	v160 := new(big.Int).Lsh(big.NewInt(1), 159)
	a160, b160 := *NewUint160(v160), *NewUint160(v160)
	require.Equal(t, a160, b160, "equal Uint160 values must compare equal")
	require.NotEqual(t, a160, *NewUint160(big.NewInt(1)), "different Uint160 values must compare unequal")

	v256 := new(big.Int).Lsh(big.NewInt(1), 255)
	a256, b256 := *NewUint256(v256), *NewUint256(v256)
	require.Equal(t, a256, b256, "equal Uint256 values must compare equal")
	require.NotEqual(t, a256, *NewUint256(big.NewInt(1)), "different Uint256 values must compare unequal")
}

// TestUintWrappers_DictKeyRoundTrip is the regression test for the pointer-key
// bug: boxed uint keys of every width must survive
// ToCell -> LoadDict -> NewDictFromDictionary (the previous *Uint256 key form
// mis-keyed and panicked in tonutils' reflection path).
func TestUintWrappers_DictKeyRoundTrip(t *testing.T) {
	t.Run("uint128", func(t *testing.T) {
		d := NewDict[Uint128, struct{}](map[Uint128]struct{}{
			*NewUint128(big.NewInt(5)):                        {},
			*NewUint128(new(big.Int).Lsh(big.NewInt(1), 127)): {},
		})

		c, err := d.ToCell()
		require.NoError(t, err)

		dict, err := c.BeginParse().LoadDict(128)
		require.NoError(t, err)

		restored, err := NewDictFromDictionary[Uint128, struct{}](dict)
		require.NoError(t, err)
		require.Len(t, restored.AsMap(), 2)

		_, ok := restored.Get(*NewUint128(big.NewInt(5)))
		require.True(t, ok)
		_, ok = restored.Get(*NewUint128(new(big.Int).Lsh(big.NewInt(1), 127)))
		require.True(t, ok)
	})

	t.Run("uint160", func(t *testing.T) {
		d := NewDict[Uint160, bool](map[Uint160]bool{
			*NewUint160(big.NewInt(5)):                                             true,
			*NewUint160(new(big.Int).Lsh(big.NewInt(1), 159)):                      false,
			*NewUint160(bigFromHex(t, "ffffffffffffffffffffffffffffffffffffffff")): true,
		})

		c, err := d.ToCell()
		require.NoError(t, err)

		dict, err := c.BeginParse().LoadDict(160)
		require.NoError(t, err)

		restored, err := NewDictFromDictionary[Uint160, bool](dict)
		require.NoError(t, err)
		require.Len(t, restored.AsMap(), 3)

		v, ok := restored.Get(*NewUint160(big.NewInt(5)))
		require.True(t, ok)
		require.True(t, v)

		v, ok = restored.Get(*NewUint160(new(big.Int).Lsh(big.NewInt(1), 159)))
		require.True(t, ok)
		require.False(t, v)
	})

	t.Run("uint256", func(t *testing.T) {
		d := NewDict[Uint256, uint64](map[Uint256]uint64{
			*NewUint256(big.NewInt(7)):                        42,
			*NewUint256(new(big.Int).Lsh(big.NewInt(1), 255)): 99,
		})

		c, err := d.ToCell()
		require.NoError(t, err)

		dict, err := c.BeginParse().LoadDict(256)
		require.NoError(t, err)

		restored, err := NewDictFromDictionary[Uint256, uint64](dict)
		require.NoError(t, err)
		require.Len(t, restored.AsMap(), 2)

		v, ok := restored.Get(*NewUint256(new(big.Int).Lsh(big.NewInt(1), 255)))
		require.True(t, ok)
		require.Equal(t, uint64(99), v)
	})
}

// TestUint128_DictStructFieldRoundTrip guards the generic dict-in-struct path
// used by CursedSubjects.
func TestUint128_DictStructFieldRoundTrip(t *testing.T) {
	original := uint128SetHolder{
		Subjects: NewDict[Uint128, struct{}](map[Uint128]struct{}{
			*NewUint128(big.NewInt(3)): {},
		}),
	}

	c, err := tlb.ToCell(original)
	require.NoError(t, err)

	var decoded uint128SetHolder
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Len(t, decoded.Subjects.AsMap(), 1)
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

			require.Equal(t, expectedAddr, typed.Address.Value(), "address mismatch")
			require.Equal(t, expectedRoot, typed.Root.Value(), "root mismatch")

			// Pointer fields must decode too.
			var ptrTyped ptrTypedValues
			err = tlb.LoadFromCell(&ptrTyped, c.BeginParse())
			require.NoError(t, err)

			require.NotNil(t, ptrTyped.Address, "pointer address is nil")
			require.Equal(t, expectedAddr, ptrTyped.Address.Value(), "pointer address mismatch")
			require.NotNil(t, ptrTyped.Root, "pointer root is nil")
			require.Equal(t, expectedRoot, ptrTyped.Root.Value(), "pointer root mismatch")

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
		Address: *NewUint160(new(big.Int).SetBytes(addr)),
		Root:    *NewUint256(new(big.Int).SetBytes(root)),
	}

	cellValue, err := tlb.ToCell(original)
	require.NoError(t, err)

	var decoded typedValues
	err = tlb.LoadFromCell(&decoded, cellValue.BeginParse())
	require.NoError(t, err)

	require.Equal(t, new(big.Int).SetBytes(addr), decoded.Address.Value(), "address mismatch after roundtrip")
	require.Equal(t, new(big.Int).SetBytes(root), decoded.Root.Value(), "root mismatch after roundtrip")
	require.Equal(t, original, decoded, "value types must be comparable with ==")

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

// TestUintWrappers_CellRoundTripAndWidth checks each type's cell width and value.
func TestUintWrappers_CellRoundTripAndWidth(t *testing.T) {
	testCases := []struct {
		name  string
		build func(*big.Int) (any, uint)
	}{
		{"uint128", func(v *big.Int) (any, uint) { return *NewUint128(v), 128 }},
		{"uint160", func(v *big.Int) (any, uint) { return *NewUint160(v), 160 }},
		{"uint256", func(v *big.Int) (any, uint) { return *NewUint256(v), 256 }},
	}

	value := new(big.Int).Add(new(big.Int).Lsh(big.NewInt(3), 120), big.NewInt(7))

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original, bits := tc.build(value)

			c, err := tlb.ToCell(original)
			require.NoError(t, err)
			require.Equal(t, bits, c.BitsSize())

			switch x := original.(type) {
			case Uint128:
				var decoded Uint128
				require.NoError(t, decoded.LoadFromCell(c.BeginParse()))
				require.Equal(t, x, decoded)
				require.Equal(t, x.ToBigInt(), decoded.ToBigInt())
			case Uint160:
				var decoded Uint160
				require.NoError(t, decoded.LoadFromCell(c.BeginParse()))
				require.Equal(t, x, decoded)
			case Uint256:
				var decoded Uint256
				require.NoError(t, decoded.LoadFromCell(c.BeginParse()))
				require.Equal(t, x, decoded)
			}
		})
	}
}

// TestUintWrappers_JSONHexRoundTrip checks canonical hex JSON for all three types.
func TestUintWrappers_JSONHexRoundTrip(t *testing.T) {
	for _, jsonCase := range []struct {
		value any
		want  string
	}{
		{*NewUint128(big.NewInt(255)), `"0xff"`},
		{*NewUint160(big.NewInt(255)), `"0xff"`},
		{*NewUint256(big.NewInt(255)), `"0xff"`},
	} {
		payload, err := json.Marshal(jsonCase.value)
		require.NoError(t, err)
		require.JSONEq(t, jsonCase.want, string(payload))

		switch x := jsonCase.value.(type) {
		case Uint128:
			var d Uint128
			require.NoError(t, json.Unmarshal(payload, &d))
			require.Equal(t, x, d)
		case Uint160:
			var d Uint160
			require.NoError(t, json.Unmarshal(payload, &d))
			require.Equal(t, x, d)
		case Uint256:
			var d Uint256
			require.NoError(t, json.Unmarshal(payload, &d))
			require.Equal(t, x, d)
		}
	}
}
