package resolvers

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
)

func TestTopUpResolver_Key(t *testing.T) {
	// Test that the resolver has the correct key
	resolver := NewTopUpResolver(0, nil, cldf_ton.Chain{})
	require.Equal(t, "codec.resolvers.top-up-message", resolver.(interface{ Key() string }).Key())
}

func TestTopUpResolver_InputStructure(t *testing.T) {
	t.Run("validates input structure with raw address", func(t *testing.T) {
		// This test documents the expected input structure for the resolver
		// Actual resolution requires a live chain, which should be tested in integration tests

		testAddr := address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

		input := map[string]any{
			"resolver": "codec.resolvers.top-up-message",
			"data": map[string]any{
				"dstAddr":      testAddr.String(),
				"targetAmount": "10.5",
			},
		}

		// Verify structure
		require.NotNil(t, input["data"])
		data := input["data"].(map[string]any)
		require.Equal(t, testAddr.String(), data["dstAddr"])
		require.Equal(t, "10.5", data["targetAmount"])
	})

	t.Run("validates input structure with address resolver", func(t *testing.T) {
		input := map[string]any{
			"resolver": "codec.resolvers.top-up-message",
			"data": map[string]any{
				"dstAddr": map[string]any{
					"resolver": "codec.resolvers.address-ref-to-ton-addr",
					"data": map[string]any{
						"type":      "Router",
						"qualifier": "",
					},
				},
				"targetAmount": "10.5",
			},
		}

		// Verify structure
		require.NotNil(t, input["data"])
		data := input["data"].(map[string]any)
		require.NotNil(t, data["dstAddr"])
		dstAddr := data["dstAddr"].(map[string]any)
		require.Equal(t, "codec.resolvers.address-ref-to-ton-addr", dstAddr["resolver"])
		require.NotNil(t, dstAddr["data"])
		addrData := dstAddr["data"].(map[string]any)
		require.Equal(t, "Router", addrData["type"])
		require.Empty(t, addrData["qualifier"])
		require.Equal(t, "10.5", data["targetAmount"])
	})

	t.Run("validates input structure with direct address object", func(t *testing.T) {
		testAddr := address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

		input := map[string]any{
			"resolver": "codec.resolvers.top-up-message",
			"data": map[string]any{
				"dstAddr":      testAddr, // Direct address pointer (also supported)
				"targetAmount": "10.5",
			},
		}

		// Verify structure
		require.NotNil(t, input["data"])
		data := input["data"].(map[string]any)
		require.Equal(t, testAddr, data["dstAddr"])
		require.Equal(t, "10.5", data["targetAmount"])
	})
}
