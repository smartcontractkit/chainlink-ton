package tlbe // tlb extras

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

// --- Numeric unsigned integers ---
//
// BigUint models a Tolk uintN that is used as a number (token amounts, prices,
// gas limits, rate-limiter state) or as a bitmap read with big.Int bit
// operations (proof flags, message states). It wraps a *big.Int so arithmetic,
// bit operations and comparisons work directly on the embedded value, and it
// encodes as an unsigned N-bit integer: values with the top bit set decode as
// large positive numbers, and encoding rejects nil, negative and oversized
// values instead of truncating them. JSON is a decimal number, as for *big.Int.
//
// For uintN values that are opaque identifiers (hashes, ids, addresses), use the
// fixed-width Uint128/.../Uint256 types instead.
//
// Use it with a `tlb:"."` tag, or `tlb:"maybe ."` on a pointer field for an
// optional value:
//
//	Amount   tlbe.BigUint256  `tlb:"."`
//	GasLimit *tlbe.BigUint256 `tlb:"maybe ."`

// Width is the bit width of a [BigUint]. Implementations are zero-size marker
// types such as [W256].
type Width interface {
	Bits() uint
}

// W96 is the [Width] of a Tolk uint96.
type W96 struct{}

// Bits implements [Width].
func (W96) Bits() uint { return 96 }

// W112 is the [Width] of a Tolk uint112.
type W112 struct{}

// Bits implements [Width].
func (W112) Bits() uint { return 112 }

// W128 is the [Width] of a Tolk uint128.
type W128 struct{}

// Bits implements [Width].
func (W128) Bits() uint { return 128 }

// W224 is the [Width] of a Tolk uint224.
type W224 struct{}

// Bits implements [Width].
func (W224) Bits() uint { return 224 }

// W256 is the [Width] of a Tolk uint256.
type W256 struct{}

// Bits implements [Width].
func (W256) Bits() uint { return 256 }

// BigUint is an unsigned integer of W.Bits() bits used as a number. See the
// section note above.
type BigUint[W Width] struct {
	*big.Int
}

type (
	BigUint96  = BigUint[W96]
	BigUint112 = BigUint[W112]
	BigUint128 = BigUint[W128]
	BigUint224 = BigUint[W224]
	BigUint256 = BigUint[W256]
)

// ErrNilBigUint is returned when encoding a BigUint with no value.
var ErrNilBigUint = errors.New("nil BigUint value")

// BitsLen returns the encoded width in bits.
func (BigUint[W]) BitsLen() uint {
	var w W
	return w.Bits()
}

// LoadFromCell implements tlb.Unmarshaler.
func (x *BigUint[W]) LoadFromCell(loader *cell.Slice) error {
	bits := x.BitsLen()
	v, err := loader.LoadBigUInt(bits)
	if err != nil {
		return fmt.Errorf("failed to load uint%d: %w", bits, err)
	}
	x.Int = v

	return nil
}

// ToCell implements tlb.Marshaller.
func (x BigUint[W]) ToCell() (*cell.Cell, error) {
	bits := x.BitsLen()
	if x.Int == nil {
		return nil, fmt.Errorf("failed to store uint%d: %w", bits, ErrNilBigUint)
	}
	b := cell.BeginCell()
	if err := b.StoreBigUInt(x.Int, bits); err != nil {
		return nil, fmt.Errorf("failed to store uint%d %s: %w", bits, x.Int, err)
	}

	return b.EndCell(), nil
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface. It accepts
// a JSON number or a decimal/hex string, and rejects values that do not fit.
func (x *BigUint[W]) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	v, err := parseUintJSON(data, x.BitsLen())
	if err != nil {
		return err
	}
	x.Int = v

	return nil
}

// UnmarshalText implements the [encoding.TextUnmarshaler] interface. It accepts
// a decimal or "0x"-prefixed hex string, and rejects values that do not fit.
func (x *BigUint[W]) UnmarshalText(text []byte) error {
	v, err := parseUintText(string(text), x.BitsLen())
	if err != nil {
		return err
	}
	x.Int = v

	return nil
}
