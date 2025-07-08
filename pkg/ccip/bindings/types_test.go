package bindings

import (
	"math/big"
	"testing"

	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestGenericExtraArgsV2_TLBEncodeDecode(t *testing.T) {
	orig := GenericExtraArgsV2{
		GasLimit:                 big.NewInt(123456789),
		AllowOutOfOrderExecution: true,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded GenericExtraArgsV2
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.GasLimit, decoded.GasLimit)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
}

func TestSVMExtraArgsV1_ToCellAndLoadFromCell(t *testing.T) {
	solanaAddr1, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	solanaAddr2, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	accountList := [][]byte{
		solanaAddr1.PublicKey().Bytes(),
		solanaAddr2.PublicKey().Bytes(),
	}

	orig := SVMExtraArgsV1{
		ComputeUnits:             42,
		AccountIsWritableBitmap:  0xDEADBEEF,
		AllowOutOfOrderExecution: false,
		TokenReceiver:            solanaAddr1.PublicKey().Bytes(),
		Accounts:                 accountList,
	}

	cell, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded SVMExtraArgsV1
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ComputeUnits, decoded.ComputeUnits)
	require.Equal(t, orig.AccountIsWritableBitmap, decoded.AccountIsWritableBitmap)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
	require.Equal(t, orig.TokenReceiver, decoded.TokenReceiver)
	require.Equal(t, len(orig.Accounts), len(decoded.Accounts))
	for i, addr := range orig.Accounts {
		require.Equal(t, addr, decoded.Accounts[i])
	}
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
