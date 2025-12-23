package tvm

import (
	"fmt"
)

// tvm.TLBMap is a map of opcodes to their corresponding TL-B types.
type TLBMap map[uint32]any

// NewTLBMap creates a map of TL-B magic numbers (opcodes) to their corresponding types
// from a set of TL-B annotated struct instances.
func NewTLBMap(types []any) (TLBMap, error) {
	tlbs := make(TLBMap)
	for _, typ := range types {
		magic, err := ExtractMagicFromValue(typ)
		if err != nil {
			return nil, fmt.Errorf("failed to extract magic from type %T: %w", typ, err)
		}

		tlbs[magic] = typ
	}
	return tlbs, nil
}

func MustNewTLBMap(types []any) TLBMap {
	tlbs, err := NewTLBMap(types)
	if err != nil {
		panic(fmt.Errorf("failed to create TLB map: %w", err))
	}
	return tlbs
}

// MessageRegistry is a registry of TL-B types for decoding messages and events.
//
// It maps contract types (string) to their corresponding TLBMap.
type MessageRegistry map[string]TLBMap

// SnapshotTLBMap creates a combined TLBMap from all registered contract types.
// This is useful for decoding messages when the contract type is not known in advance.
// Duplicate opcodes will be overwritten by the last occurrence, order is not guaranteed.
func (r MessageRegistry) Snapshot() TLBMap {
	combined := make(TLBMap)
	for _, tlbMap := range r {
		for opcode, typ := range tlbMap {
			combined[opcode] = typ
		}
	}
	return combined
}

// Lookup retrieves the TL-B type for the given contract and opcode.
func (r MessageRegistry) Lookup(contract string, opcode uint32) (any, bool) {
	tlbs, ok := r[contract]
	if !ok {
		return nil, false
	}

	typ, ok := tlbs[opcode]
	return typ, ok
}

// LookupByOpcode retrieves the TL-B type for the given opcode
// across all registered contracts (snapshot).
func (r MessageRegistry) LookupByOpcode(opcode uint32) (any, bool) {
	for _, tlbMap := range r {
		if typ, ok := tlbMap[opcode]; ok {
			return typ, true
		}
	}
	return nil, false
}
