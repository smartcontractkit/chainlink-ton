package tokenpool

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// TestGetRemoteToken_DecodesLengthPrefixedCell verifies the decoder reads the
// returned Cell<CrossChainAddress> (a length-prefixed slice) rather than a raw
// slice stack item.
func TestGetRemoteToken_DecodesLengthPrefixedCell(t *testing.T) {
	want := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	c, err := want.ToCell()
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{c})

	got, err := GetRemoteToken.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, want, got)
}

// TestGetRemotePools_DecodesLengthPrefixedCells verifies each lisp_list element
// is decoded as a length-prefixed Cell<CrossChainAddress>.
func TestGetRemotePools_DecodesLengthPrefixedCells(t *testing.T) {
	first := common.CrossChainAddress{0x01, 0x02, 0x03}
	second := common.CrossChainAddress{0x0a, 0x0b}
	firstCell, err := first.ToCell()
	require.NoError(t, err)
	secondCell, err := second.ToCell()
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{
		[]any{firstCell, []any{secondCell, nil}},
	})

	got, err := GetRemotePools.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, []common.CrossChainAddress{first, second}, got)
}
