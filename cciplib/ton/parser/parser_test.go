package parser

import (
	"math/big"
	"testing"

	"github.com/samber/lo"
)

func bigIntFromHex(s string) *big.Int {
	bi, _ := new(big.Int).SetString(s, 16)
	return bi
}

func TestParseLispTuple(t *testing.T) {
	// Global curse subject hex from contracts/ccip/rmn_remote/lib.tolk
	const globalCurseHex = "01000000000000000000000000000001"

	tests := []struct {
		name      string
		input     []any
		expectHex []string // use hex strings so we create fresh big.Int for comparison
		expectErr bool
	}{
		{
			name:      "nil input",
			input:     nil,
			expectHex: nil,
		},
		{
			name:      "empty input",
			input:     []any{},
			expectHex: nil,
		},
		{
			name:      "nil first element (empty list)",
			input:     []any{nil},
			expectHex: nil,
		},
		{
			name: "single element",
			input: []any{
				[]any{big.NewInt(42), nil},
			},
			expectHex: []string{"2a"}, // 42 in hex
		},
		{
			name: "multiple elements",
			input: []any{
				[]any{
					big.NewInt(1),
					[]any{
						big.NewInt(2),
						[]any{
							big.NewInt(3),
							nil,
						},
					},
				},
			},
			expectHex: []string{"1", "2", "3"},
		},
		{
			name: "uint128 global curse subject",
			input: []any{
				[]any{bigIntFromHex(globalCurseHex), nil},
			},
			expectHex: []string{globalCurseHex},
		},
		{
			name: "mixed uint64 and uint128 values",
			input: []any{
				[]any{
					big.NewInt(12345),
					[]any{
						bigIntFromHex(globalCurseHex),
						[]any{
							big.NewInt(67890),
							nil,
						},
					},
				},
			},
			expectHex: []string{"3039", globalCurseHex, "10932"}, // 12345, global, 67890 in hex
		},
		{
			name: "large chain selector values",
			input: []any{
				[]any{
					bigIntFromHex("ffffffffffffffff"), // max uint64
					[]any{
						bigIntFromHex("10000000000000000"), // uint64 max + 1
						nil,
					},
				},
			},
			expectHex: []string{"ffffffffffffffff", "10000000000000000"},
		},
		{
			name: "malformed input - non big.Int",
			input: []any{
				[]any{42, nil},
			},
			expectErr: true,
		},
		{
			name: "malformed input - first element not a list",
			input: []any{
				"not a list",
			},
			expectErr: true,
		},
		{
			name: "malformed input - wrong tail type",
			input: []any{
				[]any{big.NewInt(1), "not a list"},
			},
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseLispTuple[*big.Int](tt.input)
			if tt.expectErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if len(got) != len(tt.expectHex) {
				t.Errorf("expected length %d, got %d", len(tt.expectHex), len(got))
				return
			}
			for i := range got {
				// Create fresh big.Int from hex for comparison
				expected := bigIntFromHex(tt.expectHex[i])
				if got[i].Cmp(expected) != 0 {
					t.Errorf("at index %d: expected %s, got %s", i, expected.Text(16), got[i].Text(16))
					break
				}
			}
		})
	}
}

func TestParseLispTupleToUint64(t *testing.T) {
	// This test demonstrates the recommended pattern for converting to uint64
	tests := []struct {
		name      string
		input     []any
		expect    []uint64
		expectErr bool
	}{
		{
			name:   "nil input",
			input:  nil,
			expect: nil,
		},
		{
			name:   "empty input",
			input:  []any{},
			expect: nil,
		},
		{
			name:   "nil first element (empty list)",
			input:  []any{nil},
			expect: nil,
		},
		{
			name: "single element",
			input: []any{
				[]any{big.NewInt(42), nil},
			},
			expect: []uint64{42},
		},
		{
			name: "multiple elements",
			input: []any{
				[]any{
					big.NewInt(1),
					[]any{
						big.NewInt(2),
						[]any{
							big.NewInt(3),
							nil,
						},
					},
				},
			},
			expect: []uint64{1, 2, 3},
		},
		{
			name: "malformed input - wrong value type",
			input: []any{
				[]any{42, nil}, // 42 instead of *big.Int
			},
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Parse as *big.Int first
			bigInts, err := ParseLispTuple[*big.Int](tt.input)
			if tt.expectErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			// Convert to uint64 using lo.Map
			var got []uint64
			if bigInts != nil {
				got = lo.Map(bigInts, func(x *big.Int, _ int) uint64 { return x.Uint64() })
			}

			if len(got) != len(tt.expect) {
				t.Errorf("expected %v, got %v", tt.expect, got)
				return
			}
			for i := range got {
				if got[i] != tt.expect[i] {
					t.Errorf("expected %v, got %v", tt.expect, got)
					break
				}
			}
		})
	}
}
