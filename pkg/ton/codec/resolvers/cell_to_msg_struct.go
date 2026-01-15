package resolvers

import (
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var _ codec.Resolver[*cell.Cell, any] = (*cellToStructResolver)(nil)

// cellToStructResolver resolves a cell to a structured map (expansion)
type cellToStructResolver struct {
	TLBMap tvm.TLBMap // Maps opcodes to types
}

func NewCellToStructResolver(tlbMap tvm.TLBMap) codec.Resolver[*cell.Cell, any] {
	return &cellToStructResolver{TLBMap: tlbMap}
}

// Decode cell to struct using loaded TLB registry
func (r *cellToStructResolver) Resolve(input *cell.Cell) (any, error) {
	structVal, err := codec.DecodeTLBCellToAny(input, r.TLBMap)
	if err != nil {
		if errors.Is(err, codec.ErrUnknownMessage) {
			return nil, codec.NewNonFatalResolverError(err)
		}

		return nil, fmt.Errorf("failed to decode cell to struct: %w", err)
	}

	return structVal, nil
}
