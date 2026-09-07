package jetton_withdrawable

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

func newTestAddress(seed byte) *address.Address {
	data := make([]byte, 32)
	data[0] = seed
	return address.NewAddress(0, 0, data)
}

func newTestTransfer(queryID byte, amount uint64) WithdrawFeeTransfer {
	return WithdrawFeeTransfer{
		Wallet: newTestAddress(queryID),
		Value:  tlb.FromNanoTONU(50_000_000),
		Msg: wallet.AskToTransfer{
			QueryID:           uint64(queryID),
			JettonAmount:      tlb.FromNanoTONU(amount),
			TransferRecipient: newTestAddress(queryID + 1),
			SendExcessesTo:    newTestAddress(queryID + 2),
			ForwardTonAmount:  tlb.FromNanoTONU(10_000_000),
			ForwardPayload:    nil,
		},
	}
}

func TestWithdraw_EncodingAndDecoding(t *testing.T) {
	msg := Withdraw{
		QueryID: 42,
		Transfers: tlbe.Array[WithdrawFeeTransfer]{
			newTestTransfer(1, 1_000_000_000),
			newTestTransfer(2, 2_000_000_000),
			newTestTransfer(3, 3_000_000_000),
		},
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded Withdraw
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))

	require.Equal(t, uint64(42), decoded.QueryID)
	require.Len(t, decoded.Transfers, 3)

	for i, got := range decoded.Transfers {
		want := msg.Transfers[i]
		require.True(t, want.Wallet.Equals(got.Wallet), "transfer %d wallet mismatch", i)
		require.Equal(t, want.Value.Nano().Uint64(), got.Value.Nano().Uint64(), "transfer %d value mismatch", i)
		require.Equal(t, want.Msg.QueryID, got.Msg.QueryID)
		require.Equal(t, want.Msg.JettonAmount.Nano().Uint64(), got.Msg.JettonAmount.Nano().Uint64(), "transfer %d jettonAmount mismatch", i)
		require.True(t, want.Msg.TransferRecipient.Equals(got.Msg.TransferRecipient), "transfer %d recipient mismatch", i)
		require.True(t, want.Msg.SendExcessesTo.Equals(got.Msg.SendExcessesTo), "transfer %d sendExcessesTo mismatch", i)
		require.Equal(t, want.Msg.ForwardTonAmount.Nano().Uint64(), got.Msg.ForwardTonAmount.Nano().Uint64(), "transfer %d forwardTon mismatch", i)
	}
}

func TestWithdraw_EmptyTransfers(t *testing.T) {
	msg := Withdraw{
		QueryID:   9,
		Transfers: tlbe.Array[WithdrawFeeTransfer]{},
	}

	c, err := tlb.ToCell(msg)
	require.NoError(t, err)

	var decoded Withdraw
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, uint64(9), decoded.QueryID)
	require.Empty(t, decoded.Transfers)
}

func TestWithdrawContext_EncodingAndDecoding(t *testing.T) {
	ctx := WithdrawContext{
		Opcode:            WithdrawContextOpcode,
		WithdrawInitiator: newTestAddress(0xaa),
	}
	c, err := tlb.ToCell(ctx)
	require.NoError(t, err)

	var decoded WithdrawContext
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Equal(t, ctx.Opcode, decoded.Opcode)
	require.True(t, ctx.WithdrawInitiator.Equals(decoded.WithdrawInitiator))
}
