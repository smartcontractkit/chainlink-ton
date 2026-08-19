package tokenpool

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// newTestAddress builds a deterministic valid TON address to avoid base64 checksum issues in tests.
func newTestAddress(seed byte) *address.Address {
	data := make([]byte, 32)
	data[0] = seed
	return address.NewAddress(0, 0, data)
}

func TestGetCCVs_EncodingAndDecoding(t *testing.T) {
	localToken := newTestAddress(0x01)
	replyTo := newTestAddress(0x02)
	fwd := cell.BeginCell().MustStoreUInt(99, 8).EndCell()

	msg := GetCCVs{
		QueryID:                 123,
		LocalToken:              localToken,
		RemoteChainSelector:     42,
		Amount:                  tlb.FromNanoTONU(1_250_000_000),
		RequestedFinalityConfig: 0,
		Direction:               0, // Outbound
		ExtraData:               cell.BeginCell().EndCell(),
		ReplyTo:                 replyTo,
		ForwardPayload:          fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded GetCCVs
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.True(t, msg.LocalToken.Equals(decoded.LocalToken))
	require.Equal(t, msg.RemoteChainSelector, decoded.RemoteChainSelector)
	require.Equal(t, msg.Amount, decoded.Amount)
	require.Equal(t, msg.RequestedFinalityConfig, decoded.RequestedFinalityConfig)
	require.Equal(t, msg.Direction, decoded.Direction)
	require.Equal(t, msg.ExtraData.Hash(), decoded.ExtraData.Hash())
	require.True(t, msg.ReplyTo.Equals(decoded.ReplyTo))
	require.Equal(t, msg.ForwardPayload.Hash(), decoded.ForwardPayload.Hash())
}

func TestGetCCVsAndFees_EncodingAndDecoding(t *testing.T) {
	localToken := newTestAddress(0x04)
	fwd := cell.BeginCell().MustStoreUInt(5, 8).EndCell()

	msg := GetCCVsAndFees{
		QueryID:                 88,
		LocalToken:              localToken,
		RemoteChainSelector:     7,
		Amount:                  tlb.FromNanoTONU(1_000),
		RequestedFinalityConfig: 0,
		Direction:               0, // Outbound
		ExtraData:               nil,
		ForwardPayload:          fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded GetCCVsAndFees
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.True(t, msg.LocalToken.Equals(decoded.LocalToken))
	require.Equal(t, msg.RemoteChainSelector, decoded.RemoteChainSelector)
	require.Equal(t, msg.Amount, decoded.Amount)
	require.Equal(t, msg.RequestedFinalityConfig, decoded.RequestedFinalityConfig)
	require.Equal(t, msg.Direction, decoded.Direction)
	require.Nil(t, decoded.ExtraData)
	require.Equal(t, msg.ForwardPayload.Hash(), decoded.ForwardPayload.Hash())
}

func makeFeeContext(t *testing.T) *cell.Cell {
	t.Helper()
	c, err := tlb.ToCell(FeeContext{
		FeeConfig: TokenTransferFeeConfig{
			DestGasOverhead:            500_000,
			DestBytesOverhead:          64,
			FinalityFeeUSDCents:        tlb.FromNanoTONU(2_000),
			FastFinalityFeeUSDCents:    tlb.FromNanoTONU(4_000),
			FinalityTransferFeeBps:     5,
			FastFinalityTransferFeeBps: 8,
			IsEnabled:                  true,
		},
		AmountPostFee: tlb.FromNanoTONU(999_000_000),
		FeesProvided:  true,
	})
	require.NoError(t, err)
	return c
}

func TestCCVs_EncodingAndDecoding(t *testing.T) {
	ccv1 := newTestAddress(0x11)
	ccv2 := newTestAddress(0x12)
	fwd := cell.BeginCell().MustStoreUInt(7, 8).EndCell()

	msg := CCVs{
		QueryID:      7,
		RequiredCCVs: common.WrapAddresses([]*address.Address{ccv1, ccv2}),
		FwdPayload:   fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded CCVs
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.Len(t, decoded.RequiredCCVs, 2)
	require.True(t, decoded.RequiredCCVs[0].Val.Equals(ccv1))
	require.True(t, decoded.RequiredCCVs[1].Val.Equals(ccv2))
	require.Equal(t, msg.FwdPayload.Hash(), decoded.FwdPayload.Hash())
}

func TestCCVsAndFees_EncodingAndDecoding(t *testing.T) {
	ccv1 := newTestAddress(0x11)
	ccv2 := newTestAddress(0x12)
	fwd := cell.BeginCell().MustStoreUInt(7, 8).EndCell()

	fees := makeFeeContext(t)
	msg := CCVsAndFees{
		QueryID:      7,
		RequiredCCVs: common.WrapAddresses([]*address.Address{ccv1, ccv2}),
		Fees:         fees,
		FwdPayload:   fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded CCVsAndFees
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.Len(t, decoded.RequiredCCVs, 2)
	require.True(t, decoded.RequiredCCVs[0].Val.Equals(ccv1))
	require.True(t, decoded.RequiredCCVs[1].Val.Equals(ccv2))
	require.Equal(t, msg.Fees.Hash(), decoded.Fees.Hash())
	require.Equal(t, msg.FwdPayload.Hash(), decoded.FwdPayload.Hash())

	// Round-trip the fee context itself.
	var decodedFees FeeContext
	require.NoError(t, tlb.LoadFromCell(&decodedFees, decoded.Fees.BeginParse()))
	require.Equal(t, int64(500_000), int64(decodedFees.FeeConfig.DestGasOverhead))
	require.True(t, decodedFees.FeeConfig.IsEnabled)
	require.Equal(t, tlb.FromNanoTONU(999_000_000), decodedFees.AmountPostFee)
	require.True(t, decodedFees.FeesProvided)
}

func TestGetCCVsFailed_EncodingAndDecoding(t *testing.T) {
	fwd := cell.BeginCell().MustStoreUInt(3, 8).EndCell()

	msg := GetCCVsFailed{
		QueryID:    88,
		ErrorCode:  14900,
		FwdPayload: fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded GetCCVsFailed
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.Equal(t, msg.ErrorCode, decoded.ErrorCode)
	require.Equal(t, msg.FwdPayload.Hash(), decoded.FwdPayload.Hash())
}

func TestQueryCCVsReply_EncodingAndDecoding(t *testing.T) {
	ccv := newTestAddress(0x99)
	fwd := cell.BeginCell().MustStoreUInt(5, 8).EndCell()

	msg := QueryCCVsReply{
		QueryID:      5,
		RequiredCCVs: common.WrapAddresses([]*address.Address{ccv}),
		ReplyPayload: fwd,
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded QueryCCVsReply
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, msg.QueryID, decoded.QueryID)
	require.Len(t, decoded.RequiredCCVs, 1)
	require.True(t, decoded.RequiredCCVs[0].Val.Equals(ccv))
	require.Equal(t, msg.ReplyPayload.Hash(), decoded.ReplyPayload.Hash())
}

func TestGetCCVsContext_EncodingAndDecoding(t *testing.T) {
	replyTo := newTestAddress(0xab)
	fwd := cell.BeginCell().MustStoreUInt(1, 8).EndCell()

	msg := GetCCVsContext{
		ReplyTo:        replyTo,
		ForwardPayload: fwd,
		Fees:           makeFeeContext(t),
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded GetCCVsContext
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.True(t, msg.ReplyTo.Equals(decoded.ReplyTo))
	require.Equal(t, msg.ForwardPayload.Hash(), decoded.ForwardPayload.Hash())
	require.Equal(t, msg.Fees.Hash(), decoded.Fees.Hash())
}

func TestGetCCVsContext_NilFees(t *testing.T) {
	replyTo := newTestAddress(0xcd)

	msg := GetCCVsContext{
		ReplyTo:        replyTo,
		ForwardPayload: nil,
		Fees:           nil, // CCVs-only request
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded GetCCVsContext
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.True(t, msg.ReplyTo.Equals(decoded.ReplyTo))
	require.Nil(t, decoded.ForwardPayload)
	require.Nil(t, decoded.Fees)
}
