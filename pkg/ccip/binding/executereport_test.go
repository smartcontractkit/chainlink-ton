package binding

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := NewDummyCell()
	require.NoError(t, err)

	tokenAmountsCell, err := PackArray([]Any2TONTokenTransfer{
		{
			SourcePoolAddress: make([]byte, 32),
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
	})
	rampMessageCell := Any2TONRampMessage{
		Header: RampMessageHeader{
			MessageID:           make([]byte, 32),
			SourceChainSelector: 1,
			DestChainSelector:   2,
			SequenceNumber:      1,
			Nonce:               0,
		},
		Sender:   make([]byte, 64),
		Data:     dummyCell,
		Receiver: addr,
		//GasLimit:     make([]byte, 32),
		TokenAmounts: tokenAmountsCell,
	}
	require.NoError(t, err)

	signatureCell, err := PackArray([]Signature{
		{
			Sig: make([]byte, 64),
		},
	})

	report := ExecuteReport{
		SourceChainSelector: 1,
		Message:             rampMessageCell,
		OffChainTokenData:   dummyCell,
		Proofs:              signatureCell,
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
}

// NewDummyCell returns a cell containing the string "placeholder" in its data.
func NewDummyCell() (*cell.Cell, error) {
	builder := cell.BeginCell()
	payload := []byte("place holder")
	if err := builder.StoreSlice([]byte("placeholder"), uint(len(payload))); err != nil {
		return nil, err
	}
	return builder.EndCell(), nil
}
