package codec

import (
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	// The production values implementation (the legacy
	// chainlink-common/pkg/values module is only a shim that re-exports this one).
	"github.com/smartcontractkit/chainlink-protos/cre/go/values"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
)

// Regression tests for an absent optional gasLimit (audit 2026:09, finding 1).
//
// `GenericExtraArgsV2.gasLimit` is tagged `maybe ## 256`, so an omitted value
// decodes to a typed-nil *big.Int. That typed nil used to reach the LOOP codec
// server, where values.ProtoMap dereferenced it and crashed the process hosting
// the codec. The decoder now rejects it instead, which confines the failure to
// the affected lane.
//
// This file began as the crash reproduction and is now the post-fix regression.

// f1AbsentGasBOC is a GenericExtraArgsV2 BOC (tag 0x181dcf10) with gasLimit: nil
func f1AbsentGasBOC(t *testing.T) []byte {
	t.Helper()
	const preHotfixBOC = "b5ee9c72410101010007000009181dcf1060e9f6fe14"

	c, err := tlb.ToCell(onramp.GenericExtraArgsV2{
		GasLimit:                 nil,
		AllowOutOfOrderExecution: true,
	})
	require.NoError(t, err)

	got := c.ToBOC()
	require.Equal(t, preHotfixBOC, hex.EncodeToString(got),
		"the binding no longer encodes an absent `maybe ## 256` as the pre-hotfix contract did")
	return got
}

// TestF1_absentGasLimit_isRejectedPostFix asserts the decoder fails closed on an
// absent optional gas limit, so the crash cannot be reached through this path.
func TestF1_absentGasLimit_isRejectedPostFix(t *testing.T) {
	decoded, err := NewExtraDataDecoder().DecodeExtraArgsToMap(f1AbsentGasBOC(t))

	require.Error(t, err, "an absent optional gasLimit must be an error, not a typed nil")
	require.Nil(t, decoded, "the LOOP server only skips the marshalling step if the map is nil")
	require.Contains(t, err.Error(), "GasLimit")
	require.Contains(t, err.Error(), "typed-nil")
}

// TestF1_rejectError_precludesLoomMarshal asserts the error keeps the poisoned
// map away from the marshal step. The LOOP server only skips marshalling when the
// map is nil, so returning a partial map alongside the error would re-open the
// crash this guard exists to prevent.
func TestF1_rejectError_precludesLoomMarshal(t *testing.T) {
	decoded, err := NewExtraDataDecoder().DecodeExtraArgsToMap(f1AbsentGasBOC(t))

	require.Error(t, err)
	require.Nil(t, decoded, "no partial map may escape alongside the error")
}

// TestF1_errorIsActionable pins the error contract: the field name comes from the
// caller's "failed to normalize <Field>" wrapper, so the message must not repeat
// it, and the cause must still be explained.
func TestF1_errorIsActionable(t *testing.T) {
	_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(f1AbsentGasBOC(t))

	require.Error(t, err)
	require.Contains(t, err.Error(), "GasLimit")
	require.Contains(t, err.Error(), "typed-nil")
	require.Equal(t, 1, strings.Count(err.Error(), "GasLimit"),
		"field name must appear once (from the caller's wrapper), not be duplicated")
}

// TestF1_presentGasLimit_roundTrips is the control: legitimate extra args still
// decode, and an explicit zero counts as present rather than absent.
func TestF1_presentGasLimit_roundTrips(t *testing.T) {
	for _, gas := range []*big.Int{big.NewInt(0), big.NewInt(500)} {
		t.Run(gas.String(), func(t *testing.T) {
			c, err := tlb.ToCell(onramp.GenericExtraArgsV2{
				GasLimit:                 gas,
				AllowOutOfOrderExecution: true,
			})
			require.NoError(t, err)

			decoded, err := NewExtraDataDecoder().DecodeExtraArgsToMap(c.ToBOC())
			require.NoError(t, err)

			got, ok := decoded["gasLimit"].(*big.Int)
			require.True(t, ok, "expected *big.Int, got %T", decoded["gasLimit"])
			require.NotNil(t, got)
			require.Zero(t, gas.Cmp(got))

			// The map must be marshalable now that no typed nil is present.
			valuesMap, err := values.NewMap(decoded)
			require.NoError(t, err)
			require.NotPanics(t, func() { _ = values.ProtoMap(valuesMap) })
		})
	}
}

// TestF1_nilRepresentationsAtTheBridge shows why only a typed nil is dangerous:
// values.Wrap matches `case *big.Int` before `case nil`, so an untyped nil encodes
// safely while a typed one becomes BigInt{Underlying: nil} and panics on proto().
//
// This is the canary for the upstream defect: if ProtoMap stops panicking,
// chainlink-protos has added a nil guard and the decoder check can be revisited.
func TestF1_nilRepresentationsAtTheBridge(t *testing.T) {
	t.Run("untyped nil marshals safely", func(t *testing.T) {
		vm, err := values.NewMap(map[string]any{"gasLimit": nil})
		require.NoError(t, err)
		require.NotPanics(t, func() { _ = values.ProtoMap(vm) })
	})

	t.Run("typed nil big.Int panics in the protobuf bridge", func(t *testing.T) {
		var typedNil *big.Int
		vm, err := values.NewMap(map[string]any{"gasLimit": typedNil})
		require.NoError(t, err)
		require.Panics(t, func() { _ = values.ProtoMap(vm) })
	})
}
