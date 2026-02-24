package codec_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

func TestMessageEnvelopeMarshalJSONPrefersCell(t *testing.T) {
	sample := router.ApplyRampUpdates{}

	env, err := codec.WrapMessage(bindings.PkgCCIP+".Router", sample)
	require.NoError(t, err)

	want := `{"contract":"link.chain.ton.ccip.Router","type":"ApplyRampUpdates","opcode":"0x7db6745d","payload":{"QueryID":0,"OnRampUpdates":null,"OffRampAdds":null,"OffRampRemoves":null}}`

	got, err := json.Marshal(env)
	require.NoError(t, err)
	require.Equal(t, want, string(got))

	var decoded codec.MessageEnvelope[*router.ApplyRampUpdates]
	require.NoError(t, json.Unmarshal(got, &decoded))
	require.NoError(t, decoded.LoadDecoded(bindings.Registry))
	require.NotNil(t, decoded.Cell)
	require.NotNil(t, decoded.Value)
}
