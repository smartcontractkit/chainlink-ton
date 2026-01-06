package resolvers

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	_ codec.Resolver[map[string]any, *cell.Cell] = (*storageEnvelopeToCellResolver)(nil)
	_ codec.ResolverKeyProvider                  = (*storageEnvelopeToCellResolver)(nil)
)

// storageEnvelopeToCellResolver resolves a storage envelope map data type to *cell.Cell
type storageEnvelopeToCellResolver struct {
	msgEnvelopeResolver codec.Resolver[map[string]any, codec.MessageEnvelope[any]]
}

func NewStorageEnvelopeToCellResolver(registry tvm.ContractTLBRegistry) codec.Resolver[map[string]any, *cell.Cell] {
	return &storageEnvelopeToCellResolver{NewMsgEnvelopeResolver(registry)}
}

func (r *storageEnvelopeToCellResolver) Key() string {
	return "codec.resolvers.storage-envelope-to-cell"
}

// Decode map data to *cell.Cell using loaded TLB registry
func (r *storageEnvelopeToCellResolver) Resolve(input map[string]any) (*cell.Cell, error) {
	return nil, fmt.Errorf("not implemented")
}
