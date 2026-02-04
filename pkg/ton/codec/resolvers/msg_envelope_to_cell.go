package resolvers

import (
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	_ codec.Resolver[map[string]any, *cell.Cell] = (*msgEnvelopeToCellResolver)(nil)
	_ codec.ResolverKeyProvider                  = (*msgEnvelopeToCellResolver)(nil)
)

// msgEnvelopeToCellResolver resolves a message envelope map data to *cell.Cell
type msgEnvelopeToCellResolver struct {
	msgEnvelopeResolver codec.Resolver[map[string]any, *codec.MessageEnvelope[any]]
}

func NewMsgEnvelopeToCellResolver(registry tvm.ContractTLBRegistry) codec.Resolver[map[string]any, *cell.Cell] {
	return &msgEnvelopeToCellResolver{NewMsgEnvelopeResolver(registry)}
}

func (r *msgEnvelopeToCellResolver) Key() string {
	return "codec.resolvers.msg-envelope-to-cell"
}

// Decode map data to *cell.Cell using loaded TLB registry
func (r *msgEnvelopeToCellResolver) Resolve(input map[string]any) (*cell.Cell, error) {
	e, err := r.msgEnvelopeResolver.Resolve(input)
	if err != nil {
		if errors.Is(err, codec.NonFatalResolverError{}) {
			return nil, err
		}

		return nil, fmt.Errorf("failed to resolve message envelope: %w", err)
	}

	if e == nil {
		return nil, nil
	}

	return e.ToCell()
}
