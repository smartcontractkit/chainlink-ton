package tlbe // tlb extras

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestUint128_Values(t *testing.T) {
	// A value above the 64-bit range exercises multiple bytes.
	v := new(big.Int).Add(new(big.Int).Lsh(big.NewInt(1), 100), big.NewInt(12345))

	u := NewUint128(v)
	require.Equal(t, v, u.ToBigInt())
	require.Equal(t, uint8(0x0), u.F[0])  // high bytes zero
	require.Equal(t, uint8(0x10), u.F[3]) // 2^100 sets bit 4 of byte 3

	// Zero and max round-trip through the bytes.
	require.Equal(t, big.NewInt(0), NewUint128(big.NewInt(0)).ToBigInt())

	max := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
	require.Equal(t, max, NewUint128(max).ToBigInt())
}

func TestUint128_CellRoundTrip(t *testing.T) {
	v := new(big.Int).Add(new(big.Int).Lsh(big.NewInt(7), 90), big.NewInt(42))
	original := NewUint128(v)

	c, err := original.ToCell()
	require.NoError(t, err)
	require.Equal(t, uint(128), c.BitsSize())

	var decoded Uint128
	require.NoError(t, decoded.LoadFromCell(c.BeginParse()))
	require.Equal(t, *original, decoded)
	require.Equal(t, v, decoded.ToBigInt())
}

func TestUint128_UsableAsDictKey(t *testing.T) {
	// The whole point: Uint128 is comparable, so it keys a Dict by value and the
	// key decodes correctly via NewDictFromDictionary (unlike *Uint256 keys).
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
}

func TestUint128_JSONRoundTrip(t *testing.T) {
	u := NewUint128(new(big.Int).SetUint64(255))

	payload, err := json.Marshal(u)
	require.NoError(t, err)
	require.JSONEq(t, `"0xff"`, string(payload))

	var decoded Uint128
	require.NoError(t, json.Unmarshal(payload, &decoded))
	require.Equal(t, *u, decoded)
}

// Guards the generic path used by CursedSubjects: a struct field with a
// tlb:"." tag holding a *Dict[Uint128, struct{}].
type uint128SetHolder struct {
	Subjects *Dict[Uint128, struct{}] `tlb:"."`
}

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
