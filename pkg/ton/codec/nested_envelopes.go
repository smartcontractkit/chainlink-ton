package codec

import (
	"fmt"
	"reflect"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// envelopeLoader is an interface that MessageEnvelope implements to load decoded data from registry.
type envelopeLoader interface {
	LoadDecoded(tvm.ContractTLBRegistry) error
}

// LoadNestedEnvelopes recursively traverses value and loads any nested MessageEnvelope instances.
//
// It works for any concrete generic instantiation (for example MessageEnvelope[T], *MessageEnvelope[T],
// MessageEnvelope[any], etc.) by matching the common LoadDecoded method rather than concrete generic type.
// Cycles through pointers are detected and skipped.
func LoadNestedEnvelopes(value any, registry tvm.ContractTLBRegistry) error {
	visited := make(map[uintptr]struct{})
	return loadNestedEnvelopesValue(reflect.ValueOf(value), registry, visited)
}

// loadNestedEnvelopesValue is the recursive implementation of LoadNestedEnvelopes that operates on reflect.Value.
func loadNestedEnvelopesValue(v reflect.Value, registry tvm.ContractTLBRegistry, visited map[uintptr]struct{}) error {
	if !v.IsValid() {
		return nil
	}

	for v.Kind() == reflect.Interface {
		if v.IsNil() {
			return nil
		}
		v = v.Elem()
	}

	if v.Kind() == reflect.Pointer {
		if v.IsNil() {
			return nil
		}

		ptr := v.Pointer()
		if ptr != 0 {
			if _, ok := visited[ptr]; ok {
				return nil
			}
			visited[ptr] = struct{}{}
		}
	}

	if err := tryLoadEnvelope(v, registry); err != nil {
		return err
	}

	switch v.Kind() {
	case reflect.Pointer:
		return loadNestedEnvelopesValue(v.Elem(), registry, visited)
	case reflect.Struct:
		for _, field := range v.Fields() {
			//nolint:staticcheck // skip De Morgan's law
			if !field.CanInterface() && !(field.CanAddr() && field.Addr().CanInterface()) {
				continue
			}
			if err := loadNestedEnvelopesValue(field, registry, visited); err != nil {
				return err
			}
		}
	case reflect.Slice, reflect.Array:
		for i := 0; i < v.Len(); i++ {
			if err := loadNestedEnvelopesValue(v.Index(i), registry, visited); err != nil {
				return err
			}
		}
	case reflect.Map:
		iter := v.MapRange()
		for iter.Next() {
			if err := loadNestedEnvelopesValue(iter.Value(), registry, visited); err != nil {
				return err
			}
		}
	default:
		// No further traversal needed for other kinds
		return nil
	}

	return nil
}

// tryLoadEnvelope attempts to load the envelope if the value implements envelopeLoader,
// checking both value and pointer receivers.
func tryLoadEnvelope(v reflect.Value, registry tvm.ContractTLBRegistry) error {
	if !v.IsValid() {
		return nil
	}

	if v.CanInterface() {
		if loader, ok := v.Interface().(envelopeLoader); ok {
			if err := loader.LoadDecoded(registry); err != nil {
				return fmt.Errorf("failed to decode nested envelope: %w", err)
			}
			return nil
		}
	}

	if v.CanAddr() && v.Addr().CanInterface() {
		if loader, ok := v.Addr().Interface().(envelopeLoader); ok {
			if err := loader.LoadDecoded(registry); err != nil {
				return fmt.Errorf("failed to decode nested envelope: %w", err)
			}
		}
	}

	return nil
}
