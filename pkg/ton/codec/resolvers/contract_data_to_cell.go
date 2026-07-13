package resolvers

import (
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	_ codec.Resolver[map[string]any, *cell.Cell] = (*contractDataToCellResolver)(nil)
	_ codec.ResolverKeyProvider                  = (*contractDataToCellResolver)(nil)
)

// contractDataToCellResolver resolves a storage envelope map data type to *cell.Cell
type contractDataToCellResolver struct {
	registry tvm.ContractTLBRegistry
}

func NewContractDataToCellResolver(registry tvm.ContractTLBRegistry) codec.Resolver[map[string]any, *cell.Cell] {
	return &contractDataToCellResolver{registry}
}

func (r *contractDataToCellResolver) Key() string {
	return "codec.resolvers.contract-data-to-cell"
}

// Decode map data to *cell.Cell using loaded TLB registry
func (r *contractDataToCellResolver) Resolve(input map[string]any) (*cell.Cell, error) {
	data, ok := input["data"]
	if !ok {
		return nil, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	contract, ok := input["contract"]
	if !ok {
		return nil, fmt.Errorf("missing 'contract' field in input: %v", input)
	}

	contractFQN, ok := contract.(tvm.FullyQualifiedName)
	if !ok {
		contractStr, okStr := contract.(string)
		if !okStr {
			return nil, fmt.Errorf("invalid 'contract' field type: %T", contract)
		}
		contractFQN = tvm.FullyQualifiedName(contractStr)
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	typ, ok := r.registry.Lookup(contractFQN, tvm.TLBMapKeyStorage) // special key for storage types, per contract
	if !ok {
		return nil, fmt.Errorf("type not found in registry for contract=%s opcode=0x%08x (storage key)", contractFQN, tvm.TLBMapKeyStorage)
	}

	// Create new instance of the candidate type
	rt := reflect.TypeOf(typ)
	inst := reflect.New(rt).Interface() // pointer to zero value

	if err := json.Unmarshal(dataBytes, inst); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload into type %s: %w", rt.String(), err)
	}

	return tlb.ToCell(inst)
}
