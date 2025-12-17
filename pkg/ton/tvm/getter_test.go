package tvm

import (
	"math/big"
	"reflect"
	"testing"

	"github.com/xssnick/tonutils-go/address"
)

type encodeStructCase struct {
	Field1 uint64
	Field2 *big.Int
	Hidden string `tvm:"-"`
	Mixed  [2]uint32
}

func TestEncodeArgsDefault(t *testing.T) {
	addr, err := address.ParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	if err != nil {
		t.Fatalf("unexpected address parse error: %v", err)
	}

	bigVal := big.NewInt(123456789)
	var nilBig *big.Int

	structVal := encodeStructCase{
		Field1: 10,
		Field2: bigVal,
		Hidden: "skip",
		Mixed:  [2]uint32{5, 6},
	}

	tests := map[string]struct {
		input    any
		expected []any
	}{
		"no-args": {
			input:    NoArgs{},
			expected: []any{},
		},
		"nil": {
			input:    nil,
			expected: []any{nil},
		},
		"primitive": {
			input:    uint64(42),
			expected: []any{uint64(42)},
		},
		"big-int-pointer": {
			input:    bigVal,
			expected: []any{bigVal},
		},
		"nil-pointer": {
			input:    nilBig,
			expected: []any{nil},
		},
		"address-pointer": {
			input:    addr,
			expected: []any{addr},
		},
		"struct-flattened": {
			input: structVal,
			expected: []any{
				uint64(10),
				bigVal,
				[2]uint32{5, 6},
			},
		},
		"struct-pointer": {
			input:    &structVal,
			expected: []any{&structVal},
		},
		"slice-uint64": {
			input:    []uint64{1, 2, 3},
			expected: []any{uint64(1), uint64(2), uint64(3)},
		},
		"array-uint64": {
			input:    [2]uint64{7, 8},
			expected: []any{uint64(7), uint64(8)},
		},
		"slice-byte": {
			input:    []byte{0xAA, 0xBB},
			expected: []any{[]byte{0xAA, 0xBB}},
		},
		"array-byte": {
			input:    [3]byte{0x01, 0x02, 0x03},
			expected: []any{[3]byte{0x01, 0x02, 0x03}},
		},
		"interface-non-nil": {
			input:    any(structVal),
			expected: []any{uint64(10), bigVal, [2]uint32{5, 6}},
		},
		"interface-nil": {
			input: func() any {
				var v any
				return v
			}(),
			expected: []any{nil},
		},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := encodeArgsDefault(tc.input)
			if err != nil {
				t.Fatalf("encodeArgsDefault returned error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.expected) {
				t.Fatalf("unexpected result for %s:\nexpected: %#v\n     got: %#v", name, tc.expected, got)
			}
		})
	}
}
