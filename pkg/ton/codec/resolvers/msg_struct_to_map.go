package resolvers

import (
	"errors"
	"fmt"
	"reflect"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	_ codec.Resolver[any, map[string]any] = (*structToMapResolver)(nil)
	_ codec.ResolverChecker[any]          = (*structToMapResolver)(nil)
)

// structToMapResolver resolves a structs to a map[string]any
type structToMapResolver struct {
	TLBMap tvm.TLBMap // Maps opcodes to types
}

func NewStructToMapResolver(tlbMap tvm.TLBMap) codec.Resolver[any, map[string]any] {
	return &structToMapResolver{TLBMap: tlbMap}
}

func (r *structToMapResolver) Resolve(input any) (map[string]any, error) {
	_, out, err := codec.DecodeTLBStructToJSON(input, r.TLBMap)
	if err != nil {
		if errors.Is(err, codec.ErrUnknownMessage) {
			return nil, codec.NewNonFatalResolverError(err)
		}

		return nil, fmt.Errorf("failed to decode struct to map: %w", err)
	}
	return out, nil
}

// canResolve checks if the provided value is a struct or pointer to struct
func (r *structToMapResolver) CanResolve(input any) bool {
	// Check if any is struct or pointer to struct
	if input == nil {
		return false
	}

	// Dereference pointer if necessary
	rv := reflect.ValueOf(input)
	for rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return false
		}
		rv = rv.Elem()
	}

	if rv.Kind() != reflect.Struct {
		return false
	}

	shouldResolve := false
	// Check if it's a known TLB struct by comparing type names
	rt := rv.Type()

	for _, tlbType := range r.TLBMap {
		tlbType := reflect.TypeOf(tlbType)
		// Dereference pointer if necessary
		if tlbType.Kind() == reflect.Pointer {
			tlbType = tlbType.Elem()
		}

		if rt == tlbType {
			shouldResolve = true
			break
		}
	}

	return shouldResolve
}
