package codec_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

func TestLoadNestedEnvelopes_LoadsConcreteNestedEnvelope(t *testing.T) {
	payloadValue := ownable2step.TransferOwnership{
		QueryID:  42,
		NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
	}
	payloadRaw, err := json.Marshal(payloadValue)
	require.NoError(t, err)

	inner := &codec.MessageEnvelope[ownable2step.TransferOwnership]{
		Metadata: codec.MessageMeta{
			Contract: bindings.TypeOwnable,
			Opcode:   0xf21b7da1,
			TypeName: "TransferOwnership",
		},
		Payload: payloadRaw,
	}
	outer := &router.RMNOwnableMessage[ownable2step.TransferOwnership]{
		Content: inner,
	}

	require.NoError(t, codec.LoadNestedEnvelopes(outer, bindings.Registry))
	require.Equal(t, uint64(42), outer.Content.Value.QueryID)
	require.NotNil(t, outer.Content.Value.NewOwner)
	require.NotNil(t, outer.Content.Cell)
}

type cycleNode struct {
	Next *cycleNode
	Env  *codec.MessageEnvelope[ownable2step.TransferOwnership]
}

func TestLoadNestedEnvelopes_HandlesPointerCycles(t *testing.T) {
	payloadValue := ownable2step.TransferOwnership{
		QueryID:  7,
		NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
	}
	payloadRaw, err := json.Marshal(payloadValue)
	require.NoError(t, err)

	node := &cycleNode{}
	node.Next = node
	node.Env = &codec.MessageEnvelope[ownable2step.TransferOwnership]{
		Metadata: codec.MessageMeta{
			Contract: bindings.TypeOwnable,
			Opcode:   0xf21b7da1,
			TypeName: "TransferOwnership",
		},
		Payload: payloadRaw,
	}

	require.NoError(t, codec.LoadNestedEnvelopes(node, bindings.Registry))
	require.Equal(t, uint64(7), node.Env.Value.QueryID)
	require.NotNil(t, node.Env.Value.NewOwner)
}
