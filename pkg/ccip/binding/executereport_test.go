package binding

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

	tokenAmountsCell, err := PackArrayWithRefChaining([]Any2TONTokenTransfer{
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

	array, err := UnPackArrayWithRefChaining[Any2TONTokenTransfer](tokenAmountsCell)
	require.NoError(t, err)
	require.Len(t, array, 6)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := NewDummyCell()
	require.NoError(t, err)

	tokenAmountsDict, err := PackArrayWithRefChaining([]Any2TONTokenTransfer{
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
			DestGasAmount:     2000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
		{
			SourcePoolAddress: dummyCell,
			DestPoolAddress:   addr,
			DestGasAmount:     3000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(30),
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
		TokenAmounts: tokenAmountsDict,
	}
	require.NoError(t, err)

	signatureCell, err := PackArrayWithStaticType([]Signature{
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
	token, err := UnPackArrayWithRefChaining[Any2TONTokenTransfer](decoded.Message.TokenAmounts)
	require.NoError(t, err)
	require.Equal(t, 3, len(token))
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
			c, err := Pack2DByteArrayToCell(tt.input)
			require.NoError(t, err)

			output, err := Unpack2DByteArrayFromCell(c)
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
