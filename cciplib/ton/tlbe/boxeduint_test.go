package tlbe // tlb extras

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// bigFromHex builds a big.Int from a hex string (helper for readable test cases).
// TestBoxedUints_WireCompatWithRawStore locks in that the new byte-based codec
// produces exactly the same cell as the previous BigUint/StoreBigInt path (and as
// a raw fixed-width store), so on-chain data stays bit-identical.
func TestBoxedUints_WireCompatWithRawStore(t *testing.T) {
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

func bigFromHex(t *testing.T, s string) *big.Int {
	t.Helper()
	v, ok := new(big.Int).SetString(s, 16)
	require.True(t, ok)
	return v
}

// TestBoxedUints_AreComparable locks in the core property: the boxed fixed-width
// uints are value types with == semantics (unlike a big.Int alias), so they can
// be used as Go map / tlbe.Dict keys.
func TestBoxedUints_AreComparable(t *testing.T) {
	v128 := new(big.Int).Lsh(big.NewInt(1), 100)
	require.Equal(t, *NewUint128(v128), *NewUint128(v128))
	require.NotEqual(t, *NewUint128(v128), *NewUint128(big.NewInt(1)))

	v160 := new(big.Int).Lsh(big.NewInt(1), 159)
	require.Equal(t, *NewUint160(v160), *NewUint160(v160))
	require.NotEqual(t, *NewUint160(v160), *NewUint160(big.NewInt(1)))

	v256 := new(big.Int).Lsh(big.NewInt(1), 255)
	require.Equal(t, *NewUint256(v256), *NewUint256(v256))
	require.NotEqual(t, *NewUint256(v256), *NewUint256(big.NewInt(1)))
}

// TestBoxedUints_DictKeyRoundTrip is the regression test for the pointer-key bug:
// Uint160/Uint256 keys must survive ToCell -> LoadDict -> NewDictFromDictionary
// (the previous *Uint256 key form panicked in tonutils' reflection path).
func TestBoxedUints_DictKeyRoundTrip(t *testing.T) {
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

// TestBoxedUints_CellRoundTripAndWidth checks each type's cell width and value.
func TestBoxedUints_CellRoundTripAndWidth(t *testing.T) {
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

// TestBoxedUints_JSONHexRoundTrip checks canonical hex JSON for all three types.
func TestBoxedUints_JSONHexRoundTrip(t *testing.T) {
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
