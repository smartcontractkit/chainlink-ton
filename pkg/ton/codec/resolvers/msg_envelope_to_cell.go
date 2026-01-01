package resolvers

import (
	"encoding/json"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	_ codec.Resolver[map[string]any, *cell.Cell] = (*msgEnvelopeToCellResolver)(nil)
	_ codec.ResolverKeyProvider                  = (*msgEnvelopeToCellResolver)(nil)
)

// msgEnvelopeToCellResolver resolves a cell to a structured map (expansion)
type msgEnvelopeToCellResolver struct {
	registry tvm.MessageRegistry
}

func NewMsgEnvelopeToCellResolver(registry tvm.MessageRegistry) codec.Resolver[map[string]any, *cell.Cell] {
	return &msgEnvelopeToCellResolver{registry: registry}
}

func (r *msgEnvelopeToCellResolver) Key() string {
	return "codec.resolvers.msg-envelope-to-cell"
}

// Decode cell to struct using loaded TLB registry
func (r *msgEnvelopeToCellResolver) Resolve(input map[string]any) (*cell.Cell, error) {
	data, ok := input["data"]
	if !ok {
		return nil, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	var e codec.MessageEnvelope[any]
	err = json.Unmarshal(dataBytes, &e)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal 'data' field to MessageEnvelope: %w", err)
	}

	err = e.LoadDecoded(r.registry)
	if err != nil {
		return nil, fmt.Errorf("failed to load decoded data: %w", err)
	}

	return e.ToCell()
}
