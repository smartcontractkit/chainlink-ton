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
			SourcePoolAddress: dummyCell,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
	})
	require.NoError(t, err)
	rampMessageCell := Any2TONRampMessage{
		Header: RampMessageHeader{
			MessageID:           make([]byte, 32),
			SourceChainSelector: 1,
			DestChainSelector:   2,
			SequenceNumber:      1,
			Nonce:               0,
		},
		Sender:       dummyCell,
		Data:         dummyCell,
		Receiver:     addr,
		GasLimit:     make([]byte, 32),
		TokenAmounts: tokenAmountsCell,
	}
	require.NoError(t, err)

	signatureCell, err := PackArray([]Signature{
		{
			Sig: make([]byte, 64),
		},
	})
	require.NoError(t, err)

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

func TestPackAndUnpack2DByteArrayToCell(t *testing.T) {
	tests := []struct {
		name  string
		input [][]byte
	}{
		{"empty", [][]byte{}},
		{"single empty", [][]byte{{}}},
		{"single short", [][]byte{[]byte("abc")}},
		{"multiple short", [][]byte{[]byte("abc"), []byte("defg")}},
		{"long array", [][]byte{make([]byte, 1000)}},
		{"multiple long", [][]byte{make([]byte, 500), make([]byte, 800)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cell, err := Pack2DByteArrayToCell(tt.input)
			require.NoError(t, err)

			output, err := Unpack2DByteArrayFromCell(cell)
			require.NoError(t, err)
			require.Equal(t, tt.input, output)
		})
	}
}

func TestPack2DByteArrayToCell_TooLong(t *testing.T) {
	tooLong := make([]byte, 0x10000+1)
	_, err := Pack2DByteArrayToCell([][]byte{tooLong})
	require.Error(t, err)
}

func TestPackAndUnloadCellToByteArray(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
	}{
		{"empty", []byte{}},
		{"short", []byte("hello")},
		{"long", make([]byte, 1024)},
		{"very long", make([]byte, 100_000)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cell, err := PackByteArrayToCell(tt.input)
			require.NoError(t, err)

			output, err := UnloadCellToByteArray(cell)
			require.NoError(t, err)
			require.Equal(t, tt.input, output)
		})
	}
}

// NewDummyCell returns a cell containing the string "placeholder" in its data.
func NewDummyCell() (*cell.Cell, error) {
	builder := cell.BeginCell()
	payload := []byte("place holder")
	if err := builder.StoreSlice(payload, uint(len(payload))); err != nil {
		return nil, err
	}
	return builder.EndCell(), nil
}
