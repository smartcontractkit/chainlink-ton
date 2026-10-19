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

// Verifies the decoder reads the wide nullable TokenPool_TokenTransferFeeConfig?:
// seven scalar fields (slots 0-6) plus a presence discriminator at slot 7.
func TestGetTokenTransferFeeConfig_WideNullable(t *testing.T) {
	t.Run("present", func(t *testing.T) {
		result := ton.NewExecutionResult([]any{
			big.NewInt(21000), // destGasOverhead
			big.NewInt(100),   // destBytesOverhead
			big.NewInt(50),    // finalityFeeUSDCents
			big.NewInt(60),    // fastFinalityFeeUSDCents
			big.NewInt(10),    // finalityTransferFeeBps
			big.NewInt(20),    // fastFinalityTransferFeeBps
			big.NewInt(-1),    // isEnabled
			big.NewInt(-1),    // presence discriminator
		})

		got, err := GetTokenTransferFeeConfig.Decoder.Decode(result)
		require.NoError(t, err)
		require.True(t, got.IsFound)
		require.Equal(t, TokenTransferFeeConfig{
			DestGasOverhead:            21000,
			DestBytesOverhead:          100,
			FinalityFeeUSDCents:        tlb.FromNanoTON(big.NewInt(50)),
			FastFinalityFeeUSDCents:    tlb.FromNanoTON(big.NewInt(60)),
			FinalityTransferFeeBps:     10,
			FastFinalityTransferFeeBps: 20,
			IsEnabled:                  true,
		}, got.Config)
	})

	t.Run("absent", func(t *testing.T) {
		result := ton.NewExecutionResult([]any{
			big.NewInt(0), big.NewInt(0), big.NewInt(0), big.NewInt(0),
			big.NewInt(0), big.NewInt(0), big.NewInt(0),
			big.NewInt(0), // presence discriminator: absent
		})

		got, err := GetTokenTransferFeeConfig.Decoder.Decode(result)
		require.NoError(t, err)
		require.False(t, got.IsFound)
	})
}
