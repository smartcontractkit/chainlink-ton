package codec_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	routerv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

// TestEnvelopeContractVersionPinsDecode proves the opt-in contractVersion field on a message
// envelope selects the interface used to decode it. Router_RouteMessage is the sharp case: the
// opcode is unchanged across versions, only the layout differs, so decoding with the wrong version
// would silently produce a different cell.
func TestEnvelopeContractVersionPinsDecode(t *testing.T) {
	var v162 = semver.MustParse("1.6.2")

	t.Run("contractVersion round-trips through JSON", func(t *testing.T) {
		env := codec.MustWrapMessage[any](bindings.TypeRouter, routerv160.RouteMessage{})
		env.Metadata.ContractVersion = v162

		b, err := json.Marshal(env)
		require.NoError(t, err)
		require.Contains(t, string(b), `"contractVersion":"1.6.2"`)

		var back codec.MessageEnvelope[any]
		require.NoError(t, json.Unmarshal(b, &back))
		require.NotNil(t, back.Metadata.ContractVersion)
		require.Equal(t, v162.String(), back.Metadata.ContractVersion.String())
	})

	t.Run("an absent contractVersion stays nil", func(t *testing.T) {
		env := codec.MustWrapMessage[any](bindings.TypeRouter, router.RouteMessage{})

		b, err := json.Marshal(env)
		require.NoError(t, err)
		require.NotContains(t, string(b), "contractVersion")
	})
}

// TestEnvelopeContractVersionSelectsDecoder is the end-to-end proof for the dangerous case:
// Router_CCIPReceiveConfirm keeps its opcode but gained a leading QueryID (uint64), so the two
// versions differ only by bit layout. A payload decoded without a version silently yields a
// different cell; the contractVersion field makes the choice explicit.
func TestEnvelopeContractVersionSelectsDecoder(t *testing.T) {
	const (
		opcode  = "0x1e55bbf6"
		payload = `{"ExecID":42}`
	)

	// A 1.6.2-authored envelope (no QueryID field in the payload) plus an explicit version.
	raw := func(version string) []byte {
		v := ""
		if version != "" {
			v = `"contractVersion":` + `"` + version + `",`
		}
		return []byte(`{"contract":"link.chain.ton.ccip.Router","type":"CCIPReceiveConfirm",` +
			v + `"opcode":"` + opcode + `","payload":` + payload + `}`)
	}

	decode := func(t *testing.T, version string) (*cell.Cell, any) {
		t.Helper()

		var env codec.MessageEnvelope[any]
		require.NoError(t, json.Unmarshal(raw(version), &env))
		require.NoError(t, env.LoadDecoded(bindings.Registry))
		require.NotNil(t, env.Value)

		c, err := env.ToCell()
		require.NoError(t, err)

		return c, env.Value
	}

	t.Run("an explicit 1.6.2 pins the frozen interface", func(t *testing.T) {
		_, v := decode(t, "1.6.2")
		require.IsType(t, &routerv160.CCIPReceiveConfirm{}, v)
	})

	t.Run("an explicit 1.6.3 uses the current interface", func(t *testing.T) {
		_, v := decode(t, "1.6.3")
		require.IsType(t, &router.CCIPReceiveConfirm{}, v)
	})

	t.Run("no version defaults to the current interface", func(t *testing.T) {
		_, v := decode(t, "")
		require.IsType(t, &router.CCIPReceiveConfirm{}, v)
	})

	t.Run("the two versions produce different cells from the same payload", func(t *testing.T) {
		old, oldV := decode(t, "1.6.2")
		cur, curV := decode(t, "1.6.3")

		require.NotEqual(t, reflect.TypeOf(oldV), reflect.TypeOf(curV), "precondition: different layouts")
		require.NotEqual(t, old.Hash(), cur.Hash(),
			"same payload must not silently decode to the same cell across interface versions")
	})
}
