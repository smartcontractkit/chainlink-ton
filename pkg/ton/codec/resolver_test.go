package codec_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

func TestResolverRegistry(t *testing.T) {
	type testCase struct {
		name     string
		registry func() *codec.ResolverRegistry
		input    any
		want     any
	}

	tests := []testCase{
		{
			name: "depth-first maps resolve bottom-up",
			registry: func() *codec.ResolverRegistry {
				return codec.NewResolverRegistry(
					codec.NewTypedResolver(uppercaseResolver{}),
					codec.NewTypedResolver(sumResolver{}),
				)
			},
			input: map[string]any{
				"title": map[string]any{
					"resolver": "upper",
					"value":    "alpha",
				},
				"meta": map[string]any{
					"child": map[string]any{
						"resolver": "upper",
						"value":    "beta",
					},
					"numbers": []any{
						map[string]any{
							"resolver": "sum",
							"a":        40.0,
							"b":        2.0,
						},
						"unchanged",
					},
				},
			},
			want: map[string]any{
				"title": "ALPHA",
				"meta": map[string]any{
					"child":   "BETA",
					"numbers": []any{42.0, "unchanged"},
				},
			},
		},
		{
			name: "nested arrays resolve recursively",
			registry: func() *codec.ResolverRegistry {
				return codec.NewResolverRegistry(
					codec.NewTypedResolver(uppercaseResolver{}),
					codec.NewTypedResolver(sumResolver{}),
				)
			},
			input: []any{
				[]any{
					map[string]any{
						"resolver": "upper",
						"value":    "first",
					},
					map[string]any{
						"resolver": "sum",
						"a":        10.0,
						"b":        5.0,
					},
				},
				[]any{
					plainValue("keep-me"),
					map[string]any{
						"resolver": "upper",
						"value":    "second",
					},
				},
			},
			want: []any{
				[]any{"FIRST", 15.0},
				[]any{plainValue("keep-me"), "SECOND"},
			},
		},
		{
			name: "map contracts to fake cell then expands back",
			registry: func() *codec.ResolverRegistry {
				return codec.NewResolverRegistry(
					codec.NewTypedResolver(metadataToCellResolver{}),
					codec.NewTypedResolver(cellToEnvelopeResolver{}),
				)
			},
			input: map[string]any{
				"payload": map[string]any{
					"resolver": "fake_cell",
					"kind":     "task",
					"value":    "42",
				},
			},
			want: map[string]any{
				"payload": map[string]any{
					"kind":     "task",
					"value":    "42",
					"checksum": 2.0,
				},
			},
		},
		{
			name: "unmatched values remain unchanged",
			registry: func() *codec.ResolverRegistry {
				return codec.NewResolverRegistry(
					codec.NewTypedResolver(uppercaseResolver{}),
				)
			},
			input: map[string]any{
				"text": "plain",
				"data": map[string]any{
					"unknown": true,
				},
			},
			want: map[string]any{
				"text": "plain",
				"data": map[string]any{
					"unknown": true,
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.registry().Resolve(tt.input)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

// --- Test helpers & fake resolvers ---

type plainValue string

type uppercaseResolver struct{}

func (uppercaseResolver) Resolve(in map[string]any) (string, error) {
	val, _ := in["value"].(string)
	return strings.ToUpper(val), nil
}

func (uppercaseResolver) Key() string {
	return "upper"
}

func (r uppercaseResolver) CanResolve(in map[string]any) bool {
	return in["resolver"] == r.Key()
}

type sumResolver struct{}

func (sumResolver) Resolve(in map[string]any) (float64, error) {
	a, _ := in["a"].(float64)
	b, _ := in["b"].(float64)
	return a + b, nil
}

func (sumResolver) Key() string {
	return "sum"
}

func (r sumResolver) CanResolve(in map[string]any) bool {
	return in["resolver"] == r.Key()
}

type fakeCell struct {
	kind  string
	value string
}

type metadataToCellResolver struct{}

func (metadataToCellResolver) Key() string {
	return "fake_cell"
}

func (metadataToCellResolver) Resolve(in map[string]any) (*fakeCell, error) {
	return &fakeCell{
		kind:  fmt.Sprint(in["kind"]),
		value: fmt.Sprint(in["value"]),
	}, nil
}

func (r metadataToCellResolver) CanResolve(in map[string]any) bool {
	return in["resolver"] == r.Key()
}

type cellToEnvelopeResolver struct{}

func (cellToEnvelopeResolver) Resolve(in *fakeCell) (map[string]any, error) {
	return map[string]any{
		"kind":     in.kind,
		"value":    in.value,
		"checksum": float64(len(in.value)),
	}, nil
}

func (cellToEnvelopeResolver) CanResolve(in *fakeCell) bool {
	return in != nil
}
