package bindings

import (
	"math/big"
	"testing"

	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
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
			cell, err := packByteArrayToCell(tt.input)
			require.NoError(t, err)

			output, err := unloadCellToByteArray(cell)
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
			c, err := pack2DByteArrayToCell(tt.input)
			require.NoError(t, err)

			output, err := unpack2DByteArrayFromCell(c)
			require.NoError(t, err)
			require.Equal(t, tt.input, output)
		})
	}
}

func TestPack2DByteArrayToCell_TooLong(t *testing.T) {
	tooLong := make([]byte, 0x10000+1)
	_, err := pack2DByteArrayToCell([][]byte{tooLong})
	require.Error(t, err)
}

func TestLoadArray_LoadToArrayFitMultipleInSingleCell(t *testing.T) {
	slice := []TokenPriceUpdate{
		{
			UsdPerToken: big.NewInt(1000000),
		},
		{
			UsdPerToken: big.NewInt(2000000),
		},
		{
			UsdPerToken: big.NewInt(3000000),
		},
		{
			UsdPerToken: big.NewInt(4000000),
		},
		{
			UsdPerToken: big.NewInt(5000000),
		},
	}
	c, err := packArrayWithStaticType(slice)
	require.NoError(t, err)

	// For this test, each token update is only 258 bits, so we can fit up to 3 of them in a single cell.
	// we only need two cells to store 5 elements, so c should have 1 ref.
	refNum, err := getTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(1), refNum)

	// first cell has 3 elements, second cell has 2 elements
	require.Equal(t, uint(258*3), c.BitsSize())
	ref, err := c.PeekRef(0)
	require.NoError(t, err)
	require.Equal(t, uint(258*2), ref.BitsSize())

	array, err := unpackArrayWithStaticType[TokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)
}

func TestLoadArray_FitSingleUpdateInSingleCell_TokenUpdates(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	slice := []TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(2000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(3000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(4000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(5000000),
		},
	}
	c, err := packArrayWithStaticType(slice)
	require.NoError(t, err)

	array, err := unpackArrayWithStaticType[TokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)

	// For this test, each token update is only 523 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 5 elements
	refNum, err := getTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(4), refNum)
	for i := 0; i < 4; i++ {
		c, err = c.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(523), c.BitsSize())
	}
}

func TestLoadArray_FitSingleUpdateInSingleCell_MerkleRoots(t *testing.T) {
	merkleRoots, err := packArrayWithStaticType([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.NoError(t, err)
	array, err := unpackArrayWithStaticType[MerkleRoot](merkleRoots)
	require.NoError(t, err)
	require.Len(t, array, 3)

	// For this test, each token update is only 960 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 3 elements
	refNum, err := getTotalReference(merkleRoots)
	require.NoError(t, err)
	require.Equal(t, uint(2), refNum)
	for i := 0; i < 2; i++ {
		merkleRoots, err = merkleRoots.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(960), merkleRoots.BitsSize())
	}
}

func TestLoadArray_AddressTooSmall(t *testing.T) {
	// Note: for OnRampAddress that requires 64 bytes length, if the address bytes is smaller than 64, tlb.toCell() will return error, if bytes array is more than 64 bytes, only first 512 bits will be used.
	_, err := packArrayWithStaticType([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 63),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.EqualError(t, err, "failed to serialize element 0: failed to serialize field OnRampAddress to cell: failed to store bits 512, err: too small slice for this size")

	_, err = packArrayWithStaticType([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 31),
		},
	})
	require.EqualError(t, err, "failed to serialize element 0: failed to serialize field MerkleRoot to cell: failed to store bits 256, err: too small slice for this size")
}
