package tlbe // tlb extras

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

// AsUnsigned interprets the given big.Int as an unsigned integer of size sz bits.
//
// This is useful for masking sign bits when dealing with fixed-width unsigned integers.
// For example, a 160-bit unsigned integer with the high bit set would be interpreted
// as a negative number in big.Int, so we mask it to get the correct unsigned value.
func AsUnsigned(v *big.Int, sz uint) *big.Int {
	if sz == 0 {
		return new(big.Int)
	}
	mask := new(big.Int).Lsh(big.NewInt(1), sz)
	mask.Sub(mask, big.NewInt(1))

	return new(big.Int).And(v, mask) // interpret as uint sz
}

// BigUint stores an unsigned integer with a fixed bit width for TLB encoding.
type BigUint struct {
	Bits  uint
	Value *big.Int
}

// loadFromCell enforces unsigned semantics for the configured bit width.
func (b *BigUint) loadFromCell(bits uint, loader *cell.Slice) error {
	if b == nil {
		return errors.New("BigUint pointer is nil")
	}
	if loader == nil {
		return errors.New("cell loader is nil")
	}

	width := bits
	if width == 0 {
		width = b.Bits
	}
	if width == 0 {
		return errors.New("bit width must be greater than zero")
	}

	val, err := loader.LoadBigInt(width)
	if err != nil {
		return fmt.Errorf("failed to load bigint: %w", err)
	}

	b.Bits = width
	b.Value = AsUnsigned(val, width)
	return nil
}

// toCell serializes the stored number using unsigned semantics for width bits.
func (b BigUint) toCell(bits uint) (*cell.Cell, error) {
	width := bits
	if width == 0 {
		width = b.Bits
	}
	if width == 0 {
		return nil, errors.New("bit width must be greater than zero")
	}

	val := b.Value
	if val == nil {
		val = new(big.Int)
	}

	unsigned := AsUnsigned(val, width)

	builder := cell.BeginCell()
	if err := builder.StoreBigInt(unsigned, width); err != nil {
		return nil, fmt.Errorf("failed to store bigint: %w", err)
	}

	return builder.EndCell(), nil
}

// Uint128 is a 128-bit unsigned integer that is safe to use as a dictionary key.
//
// Unlike [Uint160]/[Uint256] (which alias big.Int and are therefore neither
// comparable nor usable as map keys), Uint128 is a comparable value type, so it
// can key a tlbe.Dict directly and compares by value rather than pointer
// identity.
//
// The bit width is 128, matching Tolk uint128 (e.g. the cursed-subject map keys:
// map<uint128, ()>).
type Uint128 struct {
	Hi uint64
	Lo uint64
}

// NewUint128 builds a Uint128 from a big.Int, interpreting it as an unsigned
// 128-bit value (the input is masked to 128 bits).
func NewUint128(v *big.Int) Uint128 {
	u := AsUnsigned(v, 128)
	lo := new(big.Int).And(u, maxUint64) // compute before Rsh mutates u in place
	hi := new(big.Int).Rsh(u, 64)

	return Uint128{Hi: hi.Uint64(), Lo: lo.Uint64()}
}

var maxUint64 = new(big.Int).SetUint64(^uint64(0))

func (Uint128) BitsLen() uint {
	return 128
}

// ToBigInt returns the value as a new big.Int.
func (x Uint128) ToBigInt() *big.Int {
	hi := new(big.Int).SetUint64(x.Hi)
	hi.Lsh(hi, 64)
	return hi.Or(hi, new(big.Int).SetUint64(x.Lo))
}

func (x Uint128) String() string {
	return x.ToBigInt().String()
}

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint128) LoadFromCell(loader *cell.Slice) error {
	hi, err := loader.LoadUInt(64)
	if err != nil {
		return fmt.Errorf("failed to load Uint128 high word: %w", err)
	}
	lo, err := loader.LoadUInt(64)
	if err != nil {
		return fmt.Errorf("failed to load Uint128 low word: %w", err)
	}

	x.Hi, x.Lo = hi, lo
	return nil
}

// ToCell implements tlb.Marshaller.
func (x Uint128) ToCell() (*cell.Cell, error) {
	return cell.BeginCell().MustStoreUInt(x.Hi, 64).MustStoreUInt(x.Lo, 64).EndCell(), nil
}

// MarshalJSON implements the [encoding/json.Marshaler] interface, emitting a
// canonical hexadecimal string (matching Uint160/Uint256).
func (x Uint128) MarshalJSON() ([]byte, error) {
	return []byte(`"0x` + x.ToBigInt().Text(16) + `"`), nil
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint128) UnmarshalJSON(data []byte) error {
	// Try a JSON string first (hex or decimal).
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		base := 10
		if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
			base = 16
			s = s[2:]
		}
		b, ok := new(big.Int).SetString(s, base)
		if !ok {
			return fmt.Errorf("failed to parse Uint128 string %q", s)
		}
		if b.Sign() < 0 || b.BitLen() > 128 {
			return errors.New("failed to unmarshal Uint128 from JSON: out of range")
		}
		*x = NewUint128(b)
		return nil
	}

	// Fallback: plain JSON number.
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return fmt.Errorf("failed to unmarshal Uint128 from JSON: %w", err)
	}
	if b.Sign() < 0 || b.BitLen() > 128 {
		return errors.New("failed to unmarshal Uint128 from JSON: out of range")
	}
	*x = NewUint128(b)
	return nil
}

// Uint160 is a 160-bit unsigned integer wrapper.
type Uint160 big.Int

func NewUint160(v *big.Int) *Uint160 {
	return (*Uint160)(AsUnsigned(v, 160))
}

func (*Uint160) BitsLen() uint {
	return 160
}

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint160) LoadFromCell(loader *cell.Slice) error {
	b := new(BigUint)
	err := b.loadFromCell(x.BitsLen(), loader)
	if err != nil {
		return fmt.Errorf("failed to load Uint160 from cell: %w", err)
	}

	*x = Uint160(*b.Value)
	return nil
}

// ToCell implements tlb.Marshaller.
func (x Uint160) ToCell() (*cell.Cell, error) {
	b := BigUint{
		Bits:  x.BitsLen(),
		Value: (*big.Int)(&x),
	}
	return b.toCell(x.BitsLen())
}

func (x *Uint160) MarshalJSON() ([]byte, error) {
	if x == nil {
		return []byte("null"), nil
	}

	// Canonical output: hexadecimal string.
	// Avoids precision/scientific-notation issues in intermediate tooling.
	v := x.Value()
	if v.Sign() < 0 || v.BitLen() > int(x.BitsLen()) {
		return nil, errors.New("failed to marshal Uint160: out of range")
	}

	hex := v.Text(16) // lowercase
	return []byte(`"0x` + hex + `"`), nil
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint160) UnmarshalJSON(data []byte) error {
	// Try JSON string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		base := 10
		if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
			base = 16
			s = s[2:]
		}
		b, ok := new(big.Int).SetString(s, base)
		if !ok {
			return fmt.Errorf("failed to parse Uint160 string %q", s)
		}

		if b.Sign() < 0 || b.BitLen() > int(x.BitsLen()) {
			return errors.New("failed to unmarshal Uint160 from JSON: out of range")
		}
		*x = Uint160(*b)
		return nil
	}

	// Fallback: plain JSON number
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return fmt.Errorf("failed to unmarshal Uint160 from JSON: %w", err)
	}

	if b.Sign() < 0 || b.BitLen() > int(x.BitsLen()) {
		return errors.New("failed to unmarshal Uint160 from JSON: out of range")
	}
	*x = Uint160(*b)
	return nil
}

func (x Uint160) Value() *big.Int {
	return (*big.Int)(&x)
}

func (x Uint160) String() string {
	return x.Value().String()
}

// Uint256 is a 256-bit unsigned integer wrapper.
type Uint256 big.Int

func NewUint256(v *big.Int) *Uint256 {
	return (*Uint256)(AsUnsigned(v, 256))
}

func (*Uint256) BitsLen() uint {
	return 256
}

func (x *Uint256) Cmp(y *Uint256) (r int) {
	return x.Value().Cmp(y.Value())
}

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint256) LoadFromCell(loader *cell.Slice) error {
	b := new(BigUint)
	err := b.loadFromCell(x.BitsLen(), loader)
	if err != nil {
		return fmt.Errorf("failed to load Uint256 from cell: %w", err)
	}

	*x = Uint256(*b.Value)
	return nil
}

// ToCell implements tlb.Marshaller.
func (x Uint256) ToCell() (*cell.Cell, error) {
	b := BigUint{
		Bits:  x.BitsLen(),
		Value: (*big.Int)(&x),
	}
	return b.toCell(x.BitsLen())
}

func (x *Uint256) MarshalJSON() ([]byte, error) {
	if x == nil {
		return []byte("null"), nil
	}

	// Canonical output: hexadecimal string.
	// Avoids precision/scientific-notation issues in intermediate tooling.
	v := x.Value()
	if v.Sign() < 0 || v.BitLen() > int(x.BitsLen()) {
		return nil, errors.New("failed to marshal Uint256: out of range")
	}

	hex := v.Text(16) // lowercase
	return []byte(`"0x` + hex + `"`), nil
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint256) UnmarshalJSON(data []byte) error {
	// Try JSON string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		base := 10
		if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
			base = 16
			s = s[2:]
		}
		b, ok := new(big.Int).SetString(s, base)
		if !ok {
			return fmt.Errorf("failed to parse Uint256 string %q", s)
		}

		if b.Sign() < 0 || b.BitLen() > int(x.BitsLen()) {
			return errors.New("failed to unmarshal Uint256 from JSON: out of range")
		}
		*x = Uint256(*b)
		return nil
	}

	// Fallback: plain JSON number
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return fmt.Errorf("failed to unmarshal Uint256 from JSON: %w", err)
	}

	if b.Sign() < 0 || b.BitLen() > int(x.BitsLen()) {
		return errors.New("failed to unmarshal Uint256 from JSON: out of range")
	}
	*x = Uint256(*b)
	return nil
}

func (x Uint256) Value() *big.Int {
	return (*big.Int)(&x)
}

func (x Uint256) String() string {
	return x.Value().String()
}
