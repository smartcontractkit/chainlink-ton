package resolvers

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	_ codec.Resolver[map[string]any, json.RawMessage] = (*msgEnvelopeToPayloadResolver)(nil)
	_ codec.ResolverKeyProvider                       = (*msgEnvelopeToPayloadResolver)(nil)
)

// msgEnvelopeToPayloadResolver resolves a message envelope map data to json.RawMessage
type msgEnvelopeToPayloadResolver struct {
	msgEnvelopeResolver codec.Resolver[map[string]any, *codec.MessageEnvelope[any]]
}

func NewMsgEnvelopeToPayloadResolver(registry tvm.ContractTLBRegistry) codec.Resolver[map[string]any, json.RawMessage] {
	return &msgEnvelopeToPayloadResolver{NewMsgEnvelopeResolver(registry)}
}

func (r *msgEnvelopeToPayloadResolver) Key() string {
	return "codec.resolvers.msg-envelope-to-payload"
}

// Resolve decodes the message envelope map into the JSON payload (json.RawMessage)
func (r *msgEnvelopeToPayloadResolver) Resolve(input map[string]any) (json.RawMessage, error) {
	e, err := r.msgEnvelopeResolver.Resolve(input)
	if err != nil {
		if errors.As(err, &codec.NonFatalResolverError{}) {
			return nil, err
		}

		return nil, fmt.Errorf("failed to resolve message envelope: %w", err)
	}

	if e == nil {
		return nil, nil
	}

	return e.Payload, nil
}
