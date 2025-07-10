package bindings

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestTokenAmounts(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell1, err := NewDummyCell()
	require.NoError(t, err)
	dummyCell2, err := NewDummyCell()
	require.NoError(t, err)

	tokenAmountsCell, err := packArrayWithRefChaining([]Any2TONTokenTransfer{
		{
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		}, {
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: dummyCell1,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell2,
			Amount:            big.NewInt(10),
		},
	})
	require.NoError(t, err)
	array, err := unPackArrayWithRefChaining[Any2TONTokenTransfer](tokenAmountsCell)
	require.NoError(t, err)
	require.Len(t, array, 6)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := NewDummyCell()
	require.NoError(t, err)

	tokenAmountsSlice := []Any2TONTokenTransfer{
		{
			SourcePoolAddress: dummyCell,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: dummyCell,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
		{
			SourcePoolAddress: dummyCell,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(30),
		},
	}
	require.NoError(t, err)
	rampMessageSlice := []Any2TONRampMessage{
		{
			Header: RampMessageHeader{
				MessageID:           make([]byte, 32),
				SourceChainSelector: 1,
				DestChainSelector:   2,
				SequenceNumber:      1,
				Nonce:               0,
			},
			Sender:       make([]byte, 64),
			Data:         make([]byte, 1000),
			Receiver:     addr,
			GasLimit:     tlb.MustFromNano(big.NewInt(1000), 1),
			TokenAmounts: tokenAmountsSlice,
		},
		{
			Header: RampMessageHeader{
				MessageID:           make([]byte, 32),
				SourceChainSelector: 2,
				DestChainSelector:   3,
				SequenceNumber:      2,
				Nonce:               1,
			},
			Sender:       make([]byte, 64),
			Data:         make([]byte, 1000),
			Receiver:     addr,
			GasLimit:     tlb.MustFromNano(big.NewInt(1000), 1),
			TokenAmounts: tokenAmountsSlice,
		},
	}
	require.NoError(t, err)

	signatureCell := []Signature{
		{
			Sig: make([]byte, 64),
		},
	}
	require.NoError(t, err)

	report := ExecuteReport{
		SourceChainSelector: 1,
		Messages:            rampMessageSlice,
		OffChainTokenData:   [][]byte{{0x1}, {0x2, 0x3}},
		Proofs:              signatureCell,
		ProofFlagBits:       big.NewInt(0),
	}

	// Encode to cell
	c, err := tlb.ToCell(report)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded ExecuteReport
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Len(t, decoded.Messages[0].TokenAmounts, 3)
	require.Len(t, decoded.Proofs, 1)
}
