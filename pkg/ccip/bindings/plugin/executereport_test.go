package plugin

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

func TestTokenAmounts(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)

	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	tokenAmountsCell, err := tlb.ToCell(common.SnakeRef[Any2TVMTokenTransfer]{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		}, {
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
	})
	require.NoError(t, err)
	array := common.SnakeRef[Any2TVMTokenTransfer]{}
	err = tlb.LoadFromCell(&array, tokenAmountsCell.BeginParse())
	require.NoError(t, err)
	require.Len(t, array, 6)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	tokenAmountsSlice := []Any2TVMTokenTransfer{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(30),
		},
	}

	rampMessageSlice := []Any2TVMRampMessage{
		{
			Header: RampMessageHeader{
				MessageID:           make([]byte, 32),
				SourceChainSelector: 1,
				DestChainSelector:   2,
				SequenceNumber:      1,
				Nonce:               0,
			},
			Sender:       onrampAddr,
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
			Sender:       onrampAddr,
			Data:         make([]byte, 1000),
			Receiver:     addr,
			GasLimit:     tlb.MustFromNano(big.NewInt(1000), 1),
			TokenAmounts: tokenAmountsSlice,
		},
	}

	report := ExecuteReport{
		SourceChainSelector: 1,
		Messages:            rampMessageSlice,
		OffChainTokenData:   common.SnakeRef[common.SnakeBytes]{make([]byte, 120), make([]byte, 130)},
		Proofs:              common.SnakeRef[common.SnakeBytes]{make([]byte, 32), make([]byte, 32)},
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
