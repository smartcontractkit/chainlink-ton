package tvm

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// tvm.TLBMap is a map of opcodes to their corresponding TL-B types.
type TLBMap map[uint64]any

// NewTLBMap creates a map of TL-B magic numbers (opcodes) to their corresponding types
// from a set of TL-B annotated struct instances.
func NewTLBMap(types []any) (TLBMap, error) {
	tlbs := make(TLBMap)
	for _, typ := range types {
		opcode, err := ExtractMagicFromValue(typ)
		if err != nil {
			return nil, fmt.Errorf("failed to extract magic from type %T: %w", typ, err)
		}

		tlbs[opcode] = typ
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

// reserved key for storage special opcode
var TLBMapKeyStorage = uint64(hash.CRC32("RESERVED_KEY_Storage"))

func (m TLBMap) WithStorageType(storage any) (TLBMap, error) {
	if _, exists := m[TLBMapKeyStorage]; exists {
		return nil, fmt.Errorf("storage opcode %d already exists in TLB map", TLBMapKeyStorage)
	}
	m[TLBMapKeyStorage] = storage
	return m, nil
}

func (m TLBMap) MustWithStorageType(storage any) TLBMap {
	tlbMap, err := m.WithStorageType(storage)
	if err != nil {
		panic(fmt.Errorf("failed to add storage type to TLB map: %w", err))
	}
	return tlbMap
}

// FullyQualifiedName is an identifier for a contract type following a reverse domain name notation.
//
// (e.g., "link.chain.ton.mcms.RBACTimelock")
type FullyQualifiedName string

// ContractTLBRegistry is a registry of TL-B types for decoding contract storage, messages, and events.
//
// It maps contract types (FullyQualifiedName) to their corresponding TLBMap.
type ContractTLBRegistry map[FullyQualifiedName]TLBMap

// SnapshotTLBMap creates a combined TLBMap from all registered contract types.
// This is useful for decoding messages when the contract type is not known in advance.
// Duplicate opcodes will be overwritten by the last occurrence, order is not guaranteed.
func (r ContractTLBRegistry) Snapshot() TLBMap {
	combined := make(TLBMap)
	for _, tlbMap := range r {
		for opcode, typ := range tlbMap {
			combined[opcode] = typ
		}
	}
	return combined
}

// Lookup retrieves the TL-B type for the given contract and opcode.
func (r ContractTLBRegistry) Lookup(contract FullyQualifiedName, opcode uint64) (any, bool) {
	tlbs, ok := r[contract]
	if !ok {
		return nil, false
	}

	typ, ok := tlbs[opcode]
	return typ, ok
}

// LookupByOpcode retrieves the TL-B type for the given opcode
// across all registered contracts (snapshot).
func (r ContractTLBRegistry) LookupByOpcode(opcode uint64) (any, bool) {
	for _, tlbMap := range r {
		if typ, ok := tlbMap[opcode]; ok {
			return typ, true
		}
	}
	return nil, false
}
