package view

import (
	"math/big"
	"testing"
)

func TestParseExecutionResultForDestChainSelectors(t *testing.T) {
	tests := []struct {
		name   string
		input  []any
		expect []uint64
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
			name: "malformed input",
			input: []any{
				[]any{42, nil},
			},
			expect: []uint64{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseExecutionResultForDestChainSelectors(tt.input)
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
