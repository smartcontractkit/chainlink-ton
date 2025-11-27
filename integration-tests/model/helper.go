package model

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"
)

// AssertHexMappingRoundTrip checks that a mapper:
// 1) encodes to the expected hex,
// 2) decodes that hex back into an equivalent model, and
// 3) re-encodes to the same hex again.
func AssertHexMappingRoundTrip[B any](
	t *testing.T,
	goldenHex string,
	original model.Mapper[B],
	newEmpty func() model.Mapper[B],
) {
	t.Helper()

	// Step 1) model -> hex
	gotHex, err := model.ToBindingDataHex[B](original)
	require.NoError(t, err)
	require.Equal(t, goldenHex, gotHex)

	// Step 2) hex -> model
	reloaded := newEmpty()
	err = model.FromBindingDataHex[B](reloaded, gotHex)
	require.NoError(t, err)

	// original and reloaded should be equal
	require.Equal(t, original, reloaded)

	// Step 3) model -> hex again
	reHex, err := model.ToBindingDataHex[B](original)
	require.NoError(t, err)
	require.Equal(t, goldenHex, reHex)
}
