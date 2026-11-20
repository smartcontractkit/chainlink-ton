package tlbe // tlb extras

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// numericValues covers every way a BigUint appears in a binding: a value field,
// a pointer field and an optional (maybe) pointer field.
type numericValues struct {
	Amount    BigUint256  `tlb:"."`
	Price     BigUint224  `tlb:"."`
	Capacity  *BigUint128 `tlb:"."`
	GasPrice  BigUint112  `tlb:"."`
	Fee       BigUint96   `tlb:"."`
	GasLimit  *BigUint96  `tlb:"maybe ."`
	Remainder uint8       `tlb:"## 8"`
}

// topBit returns 2^(bits-1) + 1: the smallest value a signed load misreads.
func topBit(bits uint) *big.Int {
	return new(big.Int).Add(new(big.Int).Lsh(big.NewInt(1), bits-1), big.NewInt(1))
}

// maxUint returns 2^bits - 1.
func maxUint(bits uint) *big.Int {
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), bits), big.NewInt(1))
}

func TestBigUint_BitsLen(t *testing.T) {
	require.Equal(t, uint(96), BigUint96{}.BitsLen())
	require.Equal(t, uint(112), BigUint112{}.BitsLen())
	require.Equal(t, uint(128), BigUint128{}.BitsLen())
	require.Equal(t, uint(224), BigUint224{}.BitsLen())
	require.Equal(t, uint(256), BigUint256{}.BitsLen())
}

// TestBigUint_WireCompatWithRawStore checks the encoding is a plain unsigned
// fixed-width store, and that values with the top bit set decode as unsigned.
func TestBigUint_WireCompatWithRawStore(t *testing.T) {
	for _, bits := range []uint{96, 112, 128, 224, 256} {
		for _, v := range []*big.Int{big.NewInt(0), big.NewInt(42), topBit(bits), maxUint(bits)} {
			raw := cell.BeginCell().MustStoreBigUInt(v, bits).EndCell()

			var (
				c   *cell.Cell
				err error
				got *big.Int
			)
			switch bits {
			case 96:
				c, err = BigUint96{Int: v}.ToCell()
				var d BigUint96
				require.NoError(t, d.LoadFromCell(raw.MustBeginParse()))
				got = d.Int
			case 112:
				c, err = BigUint112{Int: v}.ToCell()
				var d BigUint112
				require.NoError(t, d.LoadFromCell(raw.MustBeginParse()))
				got = d.Int
			case 128:
				c, err = BigUint128{Int: v}.ToCell()
				var d BigUint128
				require.NoError(t, d.LoadFromCell(raw.MustBeginParse()))
				got = d.Int
			case 224:
				c, err = BigUint224{Int: v}.ToCell()
				var d BigUint224
				require.NoError(t, d.LoadFromCell(raw.MustBeginParse()))
				got = d.Int
			case 256:
				c, err = BigUint256{Int: v}.ToCell()
				var d BigUint256
				require.NoError(t, d.LoadFromCell(raw.MustBeginParse()))
				got = d.Int
			}
			require.NoError(t, err, "uint%d %s", bits, v)
			require.Equal(t, raw.Hash(), c.Hash(), "uint%d %s: encoding must match raw unsigned store", bits, v)
			require.Zero(t, v.Cmp(got), "uint%d: decoded %s, want %s", bits, got, v)
		}
	}
}

// TestBigUint_StructRoundTrip checks the generic type is picked up by tonutils'
// reflection for value, pointer and maybe fields, with top-bit-set values.
func TestBigUint_StructRoundTrip(t *testing.T) {
	original := numericValues{
		Amount:    BigUint256{Int: topBit(256)},
		Price:     BigUint224{Int: maxUint(224)},
		Capacity:  &BigUint128{Int: topBit(128)},
		GasPrice:  BigUint112{Int: topBit(112)},
		Fee:       BigUint96{Int: maxUint(96)},
		GasLimit:  &BigUint96{Int: topBit(96)},
		Remainder: 7,
	}

	c, err := tlb.ToCell(original)
	require.NoError(t, err)
	require.Equal(t, uint(256+224+128+112+96+1+96+8), c.BitsSize())

	var decoded numericValues
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))

	require.Zero(t, original.Amount.Cmp(decoded.Amount.Int))
	require.Zero(t, original.Price.Cmp(decoded.Price.Int))
	require.NotNil(t, decoded.Capacity)
	require.Zero(t, original.Capacity.Cmp(decoded.Capacity.Int))
	require.Zero(t, original.GasPrice.Cmp(decoded.GasPrice.Int))
	require.Zero(t, original.Fee.Cmp(decoded.Fee.Int))
	require.NotNil(t, decoded.GasLimit)
	require.Zero(t, original.GasLimit.Cmp(decoded.GasLimit.Int))
	require.Equal(t, uint8(7), decoded.Remainder)
	require.Positive(t, decoded.Amount.Sign(), "top-bit-set uint256 must decode as positive")
}

func TestBigUint_MaybeAbsent(t *testing.T) {
	original := numericValues{
		Amount:   BigUint256{Int: big.NewInt(1)},
		Price:    BigUint224{Int: big.NewInt(2)},
		Capacity: &BigUint128{Int: big.NewInt(3)},
		GasPrice: BigUint112{Int: big.NewInt(4)},
		Fee:      BigUint96{Int: big.NewInt(5)},
	}

	c, err := tlb.ToCell(original)
	require.NoError(t, err)

	var decoded numericValues
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
	require.Nil(t, decoded.GasLimit)
}

func TestBigUint_ToCellRejectsInvalid(t *testing.T) {
	_, err := BigUint128{}.ToCell()
	require.ErrorIs(t, err, ErrNilBigUint)

	_, err = BigUint128{Int: big.NewInt(-1)}.ToCell()
	require.ErrorIs(t, err, cell.ErrNegative)

	_, err = BigUint128{Int: new(big.Int).Lsh(big.NewInt(1), 128)}.ToCell()
	require.ErrorIs(t, err, cell.ErrTooBigValue)

	// The error surfaces through struct encoding as well.
	_, err = tlb.ToCell(numericValues{
		Amount:   BigUint256{Int: big.NewInt(-1)},
		Price:    BigUint224{Int: big.NewInt(0)},
		Capacity: &BigUint128{Int: big.NewInt(0)},
		GasPrice: BigUint112{Int: big.NewInt(0)},
		Fee:      BigUint96{Int: big.NewInt(0)},
	})
	require.ErrorIs(t, err, cell.ErrNegative)
}

func TestBigUint_JSON(t *testing.T) {
	v := maxUint(128)

	payload, err := json.Marshal(BigUint128{Int: v})
	require.NoError(t, err)
	require.Equal(t, v.String(), string(payload), "JSON must be a decimal number")

	payload, err = json.Marshal(struct {
		A BigUint128  `json:"a"`
		B *BigUint128 `json:"b"`
	}{A: BigUint128{Int: big.NewInt(5)}})
	require.NoError(t, err)
	require.JSONEq(t, `{"a":5,"b":null}`, string(payload))

	for _, in := range []string{v.String(), `"` + v.String() + `"`, `"0x` + v.Text(16) + `"`} {
		var d BigUint128
		require.NoError(t, json.Unmarshal([]byte(in), &d), in)
		require.Zero(t, v.Cmp(d.Int), in)
	}

	for _, in := range []string{"-1", `"-1"`, new(big.Int).Lsh(big.NewInt(1), 128).String(), `"abc"`} {
		var d BigUint128
		require.Error(t, json.Unmarshal([]byte(in), &d), in)
	}

	var d BigUint128
	require.NoError(t, json.Unmarshal([]byte("null"), &d))
	require.Nil(t, d.Int)
}

func TestBigUint_UnmarshalText(t *testing.T) {
	var d BigUint96
	require.NoError(t, d.UnmarshalText([]byte("0xff")))
	require.Zero(t, big.NewInt(255).Cmp(d.Int))

	require.NoError(t, d.UnmarshalText([]byte("1000")))
	require.Zero(t, big.NewInt(1000).Cmp(d.Int))

	require.Error(t, d.UnmarshalText([]byte("-1")))
	require.Error(t, d.UnmarshalText([]byte(new(big.Int).Lsh(big.NewInt(1), 96).String())))
}
