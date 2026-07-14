package resolvers

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	_ codec.Resolver[map[string]any, *codec.MessageEnvelope[any]] = (*msgEnvelopeResolver)(nil)
	_ codec.ResolverKeyProvider                                   = (*msgEnvelopeResolver)(nil)
)

// msgEnvelopeResolver resolves a message envelope map data to codec.MessageEnvelope[any] struct
type msgEnvelopeResolver struct {
	registry tvm.ContractTLBRegistry
}

func NewMsgEnvelopeResolver(registry tvm.ContractTLBRegistry) codec.Resolver[map[string]any, *codec.MessageEnvelope[any]] {
	return &msgEnvelopeResolver{registry: registry}
}

func (r *msgEnvelopeResolver) Key() string {
	return "codec.resolvers.msg-envelope"
}

// Decode map data to struct using loaded TLB registry
func (r *msgEnvelopeResolver) Resolve(input map[string]any) (*codec.MessageEnvelope[any], error) {
	if input == nil {
		return nil, errors.New("cannot resolve nil input")
	}

	data, ok := input["data"]
	if !ok {
		return nil, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	// Return nil if data is explicitly nil
	if data == nil {
		return nil, nil
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	var e *codec.MessageEnvelope[any]
	err = json.Unmarshal(dataBytes, &e)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal 'data' field to MessageEnvelope: %w", err)
	}

	err = e.LoadDecoded(r.registry)
	if err != nil {
		if errors.Is(err, codec.ErrUnknownMessage) {
			return nil, codec.NewNonFatalResolverError(err)
		}

		return nil, fmt.Errorf("failed to load decoded data: %w", err)
	}

	return e, nil
}
