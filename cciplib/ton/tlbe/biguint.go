package tlbe // tlb extras

import (
	"encoding/json"
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

// --- Fixed-width unsigned integers ---
//
// Uint128/Uint160/Uint192/Uint224/Uint256 are boxed fixed-width unsigned
// integers used to model Tolk's uintN values whose bits are the meaningful part
// (hashes, ids, addresses). For values used as numbers (amounts, prices,
// limits) or as bitmaps read with big.Int bit operations, see [BigUint]. They
// are deliberately NOT aliases of big.Int:
// big.Int is a struct containing a slice, so an alias is neither comparable nor
// usable as a map/dictionary key, and a pointer to it mis-keys (pointer
// identity) and panics when decoded through tonutils' reflection path.
//
// Each type stores its value as big-endian bytes in a fixed-size array,
// which makes it a comparable value type. As a result these can be used directly
// as tlbe.Dict keys (matching Tolk map<uint128|uint160|uint256, T>) and compare
// with == rather than via a helper.
//
// All of them share the same codec (the uintBytes* helpers below); each type
// only declares its width and delegates.

// uintBytesFromBigInt converts v to exactly nbytes big-endian bytes, masking the
// input to bits bits first (so the sign bit is never misread).
func uintBytesFromBigInt(v *big.Int, bits uint, nbytes int) []byte {
	out := make([]byte, nbytes)
	AsUnsigned(v, bits).FillBytes(out) // big-endian, left-padded with zeros

	return out
}

// uintBytesToBigInt converts big-endian bytes to an unsigned big.Int.
func uintBytesToBigInt(b []byte) *big.Int {
	res := new(big.Int).SetBytes(b)
	if res.Sign() == 0 {
		// Return the canonical zero form (abs == nil) so it compares equal to
		// big.NewInt(0).
		return new(big.Int)
	}

	return res
}

// uintBytesToCell stores all bytes sequentially (8 bits each) into a single cell.
func uintBytesToCell(b []byte) (*cell.Cell, error) {
	builder := cell.BeginCell()
	for i, by := range b {
		if err := builder.StoreUInt(uint64(by), 8); err != nil {
			return nil, fmt.Errorf("failed to store byte %d: %w", i, err)
		}
	}

	return builder.EndCell(), nil
}

// uintBytesFromCell loads len(dst) sequential bytes into dst.
func uintBytesFromCell(dst []byte, loader *cell.Slice) error {
	for i := range dst {
		by, err := loader.LoadUInt(8)
		if err != nil {
			return fmt.Errorf("failed to load byte %d: %w", i, err)
		}
		dst[i] = byte(by) //nolint:gosec // G115: LoadUInt(8) always fits in a byte
	}

	return nil
}

// uintBytesMarshalJSON emits the canonical hexadecimal string form.
func uintBytesMarshalJSON(b []byte) ([]byte, error) {
	return []byte(`"0x` + uintBytesToBigInt(b).Text(16) + `"`), nil
}

// parseUintJSON parses a JSON value (hex/decimal string, or number) into an
// unsigned big.Int that fits in bits bits.
func parseUintJSON(data []byte, bits uint) (*big.Int, error) {
	// Try a JSON string first (hex or decimal).
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		return parseUintText(s, bits)
	}

	// Fallback: plain JSON number.
	b := new(big.Int)
	if err := b.UnmarshalJSON(data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal uint%d from JSON: %w", bits, err)
	}
	if !fitsUint(b, bits) {
		return nil, fmt.Errorf("failed to unmarshal uint%d from JSON: out of range", bits)
	}

	return b, nil
}

// parseUintText parses a hex ("0x"-prefixed) or decimal string into an unsigned
// big.Int that fits in bits bits.
func parseUintText(s string, bits uint) (*big.Int, error) {
	digits, base := s, 10
	if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
		digits, base = s[2:], 16
	}
	b, ok := new(big.Int).SetString(digits, base)
	if !ok {
		return nil, fmt.Errorf("failed to parse uint%d string %q", bits, s)
	}
	if !fitsUint(b, bits) {
		return nil, fmt.Errorf("failed to parse uint%d string %q: out of range", bits, s)
	}

	return b, nil
}

// fitsUint reports whether v is a non-negative integer of at most bits bits.
func fitsUint(v *big.Int, bits uint) bool {
	return v.Sign() >= 0 && v.BitLen() <= int(bits)
}

// Uint128 is a 128-bit unsigned integer (Tolk uint128, e.g. cursed-subject map
// keys: map<uint128, ()>). See the fixed-width section note above.
type Uint128 struct {
	F [16]byte
}

// NewUint128 builds a Uint128 from a big.Int, masking the input to 128 bits.
func NewUint128(v *big.Int) *Uint128 {
	var a [16]byte
	copy(a[:], uintBytesFromBigInt(v, 128, 16))

	return &Uint128{F: a}
}

func (Uint128) BitsLen() uint { return 128 }

// ToBigInt returns the value as a new big.Int.
func (x Uint128) ToBigInt() *big.Int { return uintBytesToBigInt(x.F[:]) }

// Value is an alias for [Uint128.ToBigInt].
func (x Uint128) Value() *big.Int { return x.ToBigInt() }

func (x Uint128) String() string { return x.ToBigInt().String() }

// Cmp compares x and y and returns -1, 0 or +1.
func (x Uint128) Cmp(y Uint128) int { return x.ToBigInt().Cmp(y.ToBigInt()) }

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint128) LoadFromCell(loader *cell.Slice) error { return uintBytesFromCell(x.F[:], loader) }

// ToCell implements tlb.Marshaller.
func (x Uint128) ToCell() (*cell.Cell, error) { return uintBytesToCell(x.F[:]) }

// MarshalJSON implements the [encoding/json.Marshaler] interface.
func (x Uint128) MarshalJSON() ([]byte, error) { return uintBytesMarshalJSON(x.F[:]) }

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint128) UnmarshalJSON(data []byte) error {
	v, err := parseUintJSON(data, 128)
	if err != nil {
		return err
	}
	copy(x.F[:], uintBytesFromBigInt(v, 128, 16))

	return nil
}

// Uint160 is a 160-bit unsigned integer (Tolk uint160, e.g. a 20-byte EVM
// address). See the fixed-width section note above.
type Uint160 struct {
	F [20]byte
}

// NewUint160 builds a Uint160 from a big.Int, masking the input to 160 bits.
func NewUint160(v *big.Int) *Uint160 {
	var a [20]byte
	copy(a[:], uintBytesFromBigInt(v, 160, 20))

	return &Uint160{F: a}
}

func (Uint160) BitsLen() uint { return 160 }

// ToBigInt returns the value as a new big.Int.
func (x Uint160) ToBigInt() *big.Int { return uintBytesToBigInt(x.F[:]) }

// Value is an alias for [Uint160.ToBigInt].
func (x Uint160) Value() *big.Int { return x.ToBigInt() }

func (x Uint160) String() string { return x.ToBigInt().String() }

// Cmp compares x and y and returns -1, 0 or +1.
func (x Uint160) Cmp(y Uint160) int { return x.ToBigInt().Cmp(y.ToBigInt()) }

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint160) LoadFromCell(loader *cell.Slice) error { return uintBytesFromCell(x.F[:], loader) }

// ToCell implements tlb.Marshaller.
func (x Uint160) ToCell() (*cell.Cell, error) { return uintBytesToCell(x.F[:]) }

// MarshalJSON implements the [encoding/json.Marshaler] interface.
func (x Uint160) MarshalJSON() ([]byte, error) { return uintBytesMarshalJSON(x.F[:]) }

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint160) UnmarshalJSON(data []byte) error {
	v, err := parseUintJSON(data, 160)
	if err != nil {
		return err
	}
	copy(x.F[:], uintBytesFromBigInt(v, 160, 20))

	return nil
}

// Uint192 is a 192-bit unsigned integer (Tolk uint192, e.g. the router's
// ReceiveExecutionID). See the fixed-width section note above.
type Uint192 struct {
	F [24]byte
}

// NewUint192 builds a Uint192 from a big.Int, masking the input to 192 bits.
func NewUint192(v *big.Int) *Uint192 {
	var a [24]byte
	copy(a[:], uintBytesFromBigInt(v, 192, 24))

	return &Uint192{F: a}
}

func (Uint192) BitsLen() uint { return 192 }

// ToBigInt returns the value as a new big.Int.
func (x Uint192) ToBigInt() *big.Int { return uintBytesToBigInt(x.F[:]) }

// Value is an alias for [Uint192.ToBigInt].
func (x Uint192) Value() *big.Int { return x.ToBigInt() }

func (x Uint192) String() string { return x.ToBigInt().String() }

// Cmp compares x and y and returns -1, 0 or +1.
func (x Uint192) Cmp(y Uint192) int { return x.ToBigInt().Cmp(y.ToBigInt()) }

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint192) LoadFromCell(loader *cell.Slice) error { return uintBytesFromCell(x.F[:], loader) }

// ToCell implements tlb.Marshaller.
func (x Uint192) ToCell() (*cell.Cell, error) { return uintBytesToCell(x.F[:]) }

// MarshalJSON implements the [encoding/json.Marshaler] interface.
func (x Uint192) MarshalJSON() ([]byte, error) { return uintBytesMarshalJSON(x.F[:]) }

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint192) UnmarshalJSON(data []byte) error {
	v, err := parseUintJSON(data, 192)
	if err != nil {
		return err
	}
	copy(x.F[:], uintBytesFromBigInt(v, 192, 24))

	return nil
}

// Uint224 is a 224-bit unsigned integer (Tolk uint224, e.g. the onramp's
// CCIPSendExecutorId). See the fixed-width section note above.
type Uint224 struct {
	F [28]byte
}

// NewUint224 builds a Uint224 from a big.Int, masking the input to 224 bits.
func NewUint224(v *big.Int) *Uint224 {
	var a [28]byte
	copy(a[:], uintBytesFromBigInt(v, 224, 28))

	return &Uint224{F: a}
}

func (Uint224) BitsLen() uint { return 224 }

// ToBigInt returns the value as a new big.Int.
func (x Uint224) ToBigInt() *big.Int { return uintBytesToBigInt(x.F[:]) }

// Value is an alias for [Uint224.ToBigInt].
func (x Uint224) Value() *big.Int { return x.ToBigInt() }

func (x Uint224) String() string { return x.ToBigInt().String() }

// Cmp compares x and y and returns -1, 0 or +1.
func (x Uint224) Cmp(y Uint224) int { return x.ToBigInt().Cmp(y.ToBigInt()) }

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint224) LoadFromCell(loader *cell.Slice) error { return uintBytesFromCell(x.F[:], loader) }

// ToCell implements tlb.Marshaller.
func (x Uint224) ToCell() (*cell.Cell, error) { return uintBytesToCell(x.F[:]) }

// MarshalJSON implements the [encoding/json.Marshaler] interface.
func (x Uint224) MarshalJSON() ([]byte, error) { return uintBytesMarshalJSON(x.F[:]) }

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint224) UnmarshalJSON(data []byte) error {
	v, err := parseUintJSON(data, 224)
	if err != nil {
		return err
	}
	copy(x.F[:], uintBytesFromBigInt(v, 224, 28))

	return nil
}

// Uint256 is a 256-bit unsigned integer (Tolk uint256, e.g. a merkle root or
// operation id). See the fixed-width section note above.
type Uint256 struct {
	F [32]byte
}

// NewUint256 builds a Uint256 from a big.Int, masking the input to 256 bits.
func NewUint256(v *big.Int) *Uint256 {
	var a [32]byte
	copy(a[:], uintBytesFromBigInt(v, 256, 32))

	return &Uint256{F: a}
}

func (Uint256) BitsLen() uint { return 256 }

// ToBigInt returns the value as a new big.Int.
func (x Uint256) ToBigInt() *big.Int { return uintBytesToBigInt(x.F[:]) }

// Value is an alias for [Uint256.ToBigInt].
func (x Uint256) Value() *big.Int { return x.ToBigInt() }

func (x Uint256) String() string { return x.ToBigInt().String() }

// Cmp compares x and y and returns -1, 0 or +1.
func (x Uint256) Cmp(y Uint256) int { return x.ToBigInt().Cmp(y.ToBigInt()) }

// LoadFromCell implements tlb.Unmarshaler.
func (x *Uint256) LoadFromCell(loader *cell.Slice) error { return uintBytesFromCell(x.F[:], loader) }

// ToCell implements tlb.Marshaller.
func (x Uint256) ToCell() (*cell.Cell, error) { return uintBytesToCell(x.F[:]) }

// MarshalJSON implements the [encoding/json.Marshaler] interface.
func (x Uint256) MarshalJSON() ([]byte, error) { return uintBytesMarshalJSON(x.F[:]) }

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface.
func (x *Uint256) UnmarshalJSON(data []byte) error {
	v, err := parseUintJSON(data, 256)
	if err != nil {
		return err
	}
	copy(x.F[:], uintBytesFromBigInt(v, 256, 32))

	return nil
}
