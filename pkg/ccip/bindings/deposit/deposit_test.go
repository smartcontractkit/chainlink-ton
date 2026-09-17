package deposit

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// newTestAddress builds a deterministic valid TON address to avoid base64 checksum issues in tests.
func newTestAddress(seed byte) *address.Address {
	data := make([]byte, 32)
	data[0] = seed
	return address.NewAddress(0, 0, data)
}

func TestData_EncodingAndDecoding(t *testing.T) {
	owner := newTestAddress(0x01)
	proxy := newTestAddress(0x02)
	beneficiary := newTestAddress(0x03)

	data := Data{
		Owner: owner,
		Proxy: proxy,
		Beneficiaries: tlbe.NewDict[common.AddressWrap, struct{}](map[common.AddressWrap]struct{}{
			{Val: beneficiary}: {},
		}),
	}

	c, err := tlb.ToCell(data)
	require.NoError(t, err)

	var decoded Data
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)

	require.Equal(t, data.Owner, decoded.Owner)
	require.Equal(t, data.Proxy, decoded.Proxy)
	require.Len(t, decoded.Beneficiaries.AsMap(), 1)

	// Compare the decoded beneficiary address by value (AddressWrap keys hold pointers, so
	// map-key equality would otherwise compare pointer identity).
	var decodedBeneficiary *address.Address
	for k := range decoded.Beneficiaries.AsMap() {
		decodedBeneficiary = k.Val
	}
	require.NotNil(t, decodedBeneficiary)
	require.True(t, beneficiary.Equals(decodedBeneficiary))
}

func TestMessages_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Init
	initMsg := Init{
		QueryID:        123,
		ForwardPayload: cell.BeginCell().EndCell(),
	}
	c, err := tlb.ToCell(initMsg)
	require.NoError(t, err)
	var decodedInit Init
	require.NoError(t, tlb.LoadFromCell(&decodedInit, c.BeginParse()))
	require.Equal(t, initMsg.QueryID, decodedInit.QueryID)
	require.NotNil(t, decodedInit.ForwardPayload)

	// Withdraw (ask is boxed Cell<AskToTransfer>)
	ask := AskToTransfer{
		QueryID:           10,
		JettonAmount:      tlb.FromNanoTONU(1_000_000_000),
		TransferRecipient: addr,
		SendExcessesTo:    addr,
		ForwardTonAmount:  tlb.FromNanoTONU(50_000_000),
		ForwardPayload:    cell.BeginCell().EndCell(),
	}
	askCell, err := tlb.ToCell(ask)
	require.NoError(t, err)
	withdraw := Withdraw{
		QueryID:       7,
		WalletAddress: addr,
		Ask:           askCell,
	}
	c, err = tlb.ToCell(withdraw)
	require.NoError(t, err)
	var decodedWithdraw Withdraw
	require.NoError(t, tlb.LoadFromCell(&decodedWithdraw, c.BeginParse()))
	require.Equal(t, withdraw.QueryID, decodedWithdraw.QueryID)
	require.Equal(t, withdraw.WalletAddress, decodedWithdraw.WalletAddress)
	require.Equal(t, askCell.Hash(), decodedWithdraw.Ask.Hash())

	// Reply
	reply := Reply{QueryID: 5, ForwardPayload: nil}
	c, err = tlb.ToCell(reply)
	require.NoError(t, err)
	var decodedReply Reply
	require.NoError(t, tlb.LoadFromCell(&decodedReply, c.BeginParse()))
	require.Equal(t, reply.QueryID, decodedReply.QueryID)
	require.Nil(t, decodedReply.ForwardPayload)
}
