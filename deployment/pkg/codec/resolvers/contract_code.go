package resolvers // alias: resolversd

import (
	"encoding/json"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

var (
	_ codec.Resolver[map[string]any, *cell.Cell] = (*contractToCodeCellResolver)(nil)
	_ codec.ResolverKeyProvider                  = (*contractToCodeCellResolver)(nil)
)

type contractToCodeCellResolver struct {
	provider ton.ContractCodeProvider
}

func NewContractToCellResolver(provider ton.ContractCodeProvider) codec.Resolver[map[string]any, *cell.Cell] {
	return &contractToCodeCellResolver{provider}
}

func (r contractToCodeCellResolver) Key() string {
	return "codec.resolvers.contract-meta-to-code-cell"
}

func (r contractToCodeCellResolver) Resolve(input map[string]any) (*cell.Cell, error) {
	data, ok := input["data"]
	if !ok {
		return nil, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	var meta ton.ContractMetadata
	err = json.Unmarshal(dataBytes, &meta)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal 'data' field to MessageEnvelope: %w", err)
	}

	contract, err := r.provider.GetContract(meta)
	if err != nil {
		return nil, fmt.Errorf("failed to get contract: %w", err)
	}
	return contract.Code, nil
}
