package tokenpool

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// Verifies the decoder reads the returned Cell<CrossChainAddress> (a length-prefixed slice)
func TestGetRemoteToken_DecodesLengthPrefixedCell(t *testing.T) {
	want := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	c, err := want.ToCell()
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{c})

	got, err := GetRemoteToken.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, want, got)
}

// Verifies each lisp_list element is decoded as a length-prefixed Cell<CrossChainAddress>
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

// Verifies the decoder reads the outbound and inbound buckets from two separate stack cells
// (the on-chain TokenPool_RateLimiterPair is flattened into two Cell<RateLimiter_TokenBucket>).
func TestGetCurrentRateLimiterState_DecodesTwoCells(t *testing.T) {
	outbound := RateLimiterTokenBucket{
		Tokens:      big.NewInt(1),
		LastUpdated: 1700000000,
		IsEnabled:   true,
		Capacity:    big.NewInt(2),
		Rate:        big.NewInt(3),
	}
	inbound := RateLimiterTokenBucket{
		Tokens:      big.NewInt(4),
		LastUpdated: 1700000001,
		IsEnabled:   false,
		Capacity:    big.NewInt(5),
		Rate:        big.NewInt(6),
	}
	outboundCell, err := tlb.ToCell(outbound)
	require.NoError(t, err)
	inboundCell, err := tlb.ToCell(inbound)
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{outboundCell, inboundCell})

	got, err := GetCurrentRateLimiterState.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, RateLimiterPair{Outbound: outbound, Inbound: inbound}, got)
}
