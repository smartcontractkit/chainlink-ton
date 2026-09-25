package bindings_test

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	onrampv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/onramp"
	routerv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	version1_6_0 = semver.MustParse("1.6.0")
	version1_6_1 = semver.MustParse("1.6.1")
	version1_6_2 = semver.MustParse("1.6.2")
	version1_6_3 = semver.MustParse("1.6.3")
	versionAfter = semver.MustParse("2.0.0")
)

// TestVersionedOnRampUpdateSendExecutor covers the original regression: OnRamp_UpdateSendExecutor
// (0x82901c45) was removed in c6655369, so the message type disappeared from the registry and a
// durable-pipeline input authored against the older interface could no longer be resolved:
//
//	message type not found in registry for contract=link.chain.ton.ccip.OnRamp opcode=0x82901c45
//
// The frozen v1_6_0 snapshot restores it, while the current bindings keep serving newer versions.
func TestVersionedOnRampUpdateSendExecutor(t *testing.T) {
	const opcode = uint64(0x82901c45)

	t.Run("the old message type resolves for an old interface version", func(t *testing.T) {
		typ, ok, err := bindings.Registry.LookupVersion(bindings.TypeOnRamp, opcode, *version1_6_0)
		require.NoError(t, err)
		require.True(t, ok, "0x82901c45 must resolve at 1.6.0")
		require.IsType(t, onrampv160.UpdateSendExecutorMessage{}, typ)

		// It must still encode to a cell, which is what the resolver ultimately needs.
		_, err = tlb.ToCell(onrampv160.UpdateSendExecutorMessage{
			Code: cell.BeginCell().MustStoreUInt(0xAB, 8).EndCell(),
		})
		require.NoError(t, err)
	})

	t.Run("the message type is genuinely absent from the current interface", func(t *testing.T) {
		_, ok := bindings.Registry.Lookup(bindings.TypeOnRamp, opcode)
		require.False(t, ok, "the current OnRamp interface no longer has 0x82901c45")
	})

	t.Run("the frozen interface is in force up to the release that superseded it", func(t *testing.T) {
		// The old interface was current at 1.6.0..1.6.2 and was replaced in 1.6.3, so every
		// version below 1.6.3 must keep resolving it — including 1.6.2, the release the
		// upgrade pipeline (upgrade-ccip-chainlink-ton-staging-1.6.3-*) is upgrading FROM.
		for _, v := range []semver.Version{*version1_6_0, *version1_6_1, *version1_6_2} {
			typ, ok, err := bindings.Registry.LookupVersion(bindings.TypeOnRamp, opcode, v)
			require.NoError(t, err)
			require.True(t, ok, "0x82901c45 must resolve at %s", v.String())
			require.IsType(t, onrampv160.UpdateSendExecutorMessage{}, typ)
		}
	})

	t.Run("a removed opcode still falls through to the snapshot at later versions", func(t *testing.T) {
		// 0x82901c45 was removed in 1.6.3 and is not reused, so the newer declared version has
		// no type for it and resolution intentionally falls back to the frozen snapshot. This is
		// what keeps a stale pipeline input resolvable instead of hard-failing.
		typ, ok, err := bindings.Registry.LookupVersion(bindings.TypeOnRamp, opcode, *version1_6_3)
		require.NoError(t, err)
		require.True(t, ok)
		require.IsType(t, onrampv160.UpdateSendExecutorMessage{}, typ)
	})

	t.Run("a request predating the snapshot errors instead of falling back", func(t *testing.T) {
		_, _, err := bindings.Registry.LookupVersion(bindings.TypeOnRamp, opcode, *semver.MustParse("0.9.0"))
		require.ErrorIs(t, err, tvm.ErrNoInterfaceVersion)
	})
}

// TestVersionedRouterRouteMessage covers a second interface change from the same commit: a leading
// `queryId` was added to Router_RouteMessage, shifting every following field while keeping the same
// opcode. Encoding a 1.6.0 message with the current bindings would produce a wrong cell silently.
func TestVersionedRouterRouteMessage(t *testing.T) {
	require.Equal(t, router.OpcodeRouteMessage, routerv160.OpcodeRouteMessage,
		"precondition: same opcode, different layout")

	t.Run("each version resolves to its own distinct type", func(t *testing.T) {
		// Router_RouteMessage keeps the same opcode but gained a leading `queryId`, so the
		// only safe way to tell the versions apart is the concrete Go type.
		for _, v := range []semver.Version{*version1_6_0, *version1_6_1, *version1_6_2} {
			old, ok, err := bindings.Registry.LookupVersion(bindings.TypeRouter, router.OpcodeRouteMessage, v)
			require.NoError(t, err)
			require.True(t, ok)
			require.IsType(t, routerv160.RouteMessage{}, old, "router@%s must use the 1.6.2 interface", v.String())
		}

		current, ok, err := bindings.Registry.LookupVersion(bindings.TypeRouter, router.OpcodeRouteMessage, *version1_6_3)
		require.NoError(t, err)
		require.True(t, ok)
		require.IsType(t, router.RouteMessage{}, current)
	})

	t.Run("the frozen 1.6.0 message round-trips", func(t *testing.T) {
		msg := routerv160.RouteMessage{
			Message: offramp.Any2TVMMessage{
				MessageID:           make([]byte, 32),
				SourceChainSelector: 7,
				Data:                cell.BeginCell().EndCell(),
			},
			ExecID:   big.NewInt(42),
			Receiver: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
			GasLimit: tlb.MustFromTON("0.1"),
		}

		c, err := tlb.ToCell(msg)
		require.NoError(t, err)

		slice, err := c.BeginParse()
		require.NoError(t, err)

		var back routerv160.RouteMessage
		require.NoError(t, tlb.LoadFromCell(&back, slice))
		require.Equal(t, big.NewInt(42), back.ExecID)
	})
}

// TestForVersionPinsRegistry shows the escape hatch for version-unaware consumers: a registry pinned
// to one version is an ordinary ContractTLBRegistry, so LoadDecoded works without a signature change.
func TestForVersionPinsRegistry(t *testing.T) {
	t.Run("a pinned registry resolves the old interface through Lookup", func(t *testing.T) {
		pinned, err := bindings.Registry.ForVersion(*version1_6_0)
		require.NoError(t, err)

		typ, ok := pinned.Lookup(bindings.TypeOnRamp, 0x82901c45)
		require.True(t, ok, "pinned registry must resolve 0x82901c45")
		require.IsType(t, onrampv160.UpdateSendExecutorMessage{}, typ)
	})

	t.Run("the default registry resolves the current interface", func(t *testing.T) {
		_, ok := bindings.Registry.Lookup(bindings.TypeOnRamp, 0x82901c45)
		require.False(t, ok)
	})

	t.Run("unchanged contracts are carried over into the pinned registry", func(t *testing.T) {
		pinned, err := bindings.Registry.ForVersion(*version1_6_0)
		require.NoError(t, err)

		// FeeQuoter never changed, so it must still be present and identical.
		require.Equal(t, bindings.Registry[bindings.TypeFeeQuoter], pinned[bindings.TypeFeeQuoter])
	})
}

// TestVersionedEnvelopeRoundTrip proves the end-to-end path the durable-pipeline resolver uses:
// a JSON message envelope for an old interface encodes correctly via a version-pinned registry,
// while the default registry rejects the opcode.
func TestVersionedEnvelopeRoundTrip(t *testing.T) {
	const raw = `{"contract":"link.chain.ton.ccip.OnRamp","type":"UpdateSendExecutorMessage","opcode":"0x82901c45","payload":{"Code":"te6ccgEBAQEAAgAAAA=="}}`

	pinned, err := bindings.Registry.ForVersion(*version1_6_0)
	require.NoError(t, err)

	var env codec.MessageEnvelope[*onrampv160.UpdateSendExecutorMessage]
	require.NoError(t, json.Unmarshal([]byte(raw), &env))
	require.NoError(t, env.LoadDecoded(pinned))
	require.NotNil(t, env.Value)

	cellOut, err := env.ToCell()
	require.NoError(t, err)
	require.NotNil(t, cellOut)

	// The same envelope must NOT resolve against the current-only registry.
	var current codec.MessageEnvelope[*onrampv160.UpdateSendExecutorMessage]
	require.NoError(t, json.Unmarshal([]byte(raw), &current))
	require.Error(t, current.LoadDecoded(bindings.Registry))
}
