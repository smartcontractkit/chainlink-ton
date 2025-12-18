package tlbe // tlb extras

import (
	"errors"
	"fmt"
	"math/big"

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

// Uint160 is a 160-bit unsigned integer wrapper.
type Uint160 big.Int

func NewUint160(v *big.Int) *Uint160 {
	return (*Uint160)(AsUnsigned(v, 160))
}

// LoadFromCell implements tlb.Unmarshaler.
func (u *Uint160) LoadFromCell(loader *cell.Slice) error {
	b := new(BigUint)
	err := b.loadFromCell(160, loader)
	if err != nil {
		return fmt.Errorf("failed to load Uint160 from cell: %w", err)
	}

	*u = Uint160(*b.Value)
	return nil
}

// ToCell implements tlb.Marshaller.
func (u Uint160) ToCell() (*cell.Cell, error) {
	b := BigUint{
		Bits:  160,
		Value: (*big.Int)(&u),
	}
	return b.toCell(160)
}

func (u *Uint160) MarshalJSON() ([]byte, error) {
	if u == nil {
		return []byte("null"), nil
	}

	return u.Value().MarshalJSON()
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (u *Uint160) UnmarshalJSON(data []byte) error {
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return fmt.Errorf("failed to unmarshal Uint160 from JSON: %w", err)
	}

	unsigned := AsUnsigned(b, 160)
	*u = Uint160(*unsigned)
	return nil
}

func (u Uint160) Value() *big.Int {
	return (*big.Int)(&u)
}

func (u Uint160) String() string {
	return u.Value().String()
}

// Uint256 is a 256-bit unsigned integer wrapper.
type Uint256 big.Int

func NewUint256(v *big.Int) *Uint256 {
	return (*Uint256)(AsUnsigned(v, 256))
}

// LoadFromCell implements tlb.Unmarshaler.
func (u *Uint256) LoadFromCell(loader *cell.Slice) error {
	b := new(BigUint)
	err := b.loadFromCell(256, loader)
	if err != nil {
		return fmt.Errorf("failed to load Uint256 from cell: %w", err)
	}

	*u = Uint256(*b.Value)
	return nil
}

// ToCell implements tlb.Marshaller.
func (u Uint256) ToCell() (*cell.Cell, error) {
	b := BigUint{
		Bits:  256,
		Value: (*big.Int)(&u),
	}
	return b.toCell(256)
}

func (u *Uint256) MarshalJSON() ([]byte, error) {
	if u == nil {
		return []byte("null"), nil
	}

	return u.Value().MarshalJSON()
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (u *Uint256) UnmarshalJSON(data []byte) error {
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return fmt.Errorf("failed to unmarshal Uint256 from JSON: %w", err)
	}

	unsigned := AsUnsigned(b, 256)
	*u = Uint256(*unsigned)
	return nil
}

func (u Uint256) Value() *big.Int {
	return (*big.Int)(&u)
}

func (u Uint256) String() string {
	return u.Value().String()
}
