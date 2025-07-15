package plugin

import (
	"math/big"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestTokenAmounts(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell1, err := common.NewDummyCell()
	require.NoError(t, err)
	dummyCell2, err := common.NewDummyCell()
	require.NoError(t, err)

	tokenAmountsCell, err := tlb.ToCell(common.SnakeRef[Any2TONTokenTransfer]{
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
	array := common.SnakeRef[Any2TONTokenTransfer]{}
	err = tlb.LoadFromCell(&array, tokenAmountsCell.BeginParse())
	require.NoError(t, err)
	require.Len(t, array, 6)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
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

	signatureCell := []Signature{
		{
			Sig: make([]byte, 32),
		},
	}

	report := ExecuteReport{
		SourceChainSelector: 1,
		Messages:            rampMessageSlice,
		OffChainTokenData:   common.SnakeRef[common.SnakeBytes]{make([]byte, 120), make([]byte, 130)},
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

func TestLoadArray_LoadToArrayFitMultipleInSingleCell(t *testing.T) {
	slice := common.SnakeData[TokenPriceUpdate]{
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
	c, err := tlb.ToCell(slice)
	require.NoError(t, err)

	// For this test, each token update is only 258 bits, so we can fit up to 3 of them in a single cell.
	// we only need two cells to store 5 elements, so c should have 1 ref.
	refNum, err := common.GetTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(1), refNum)

	// first cell has 3 elements, second cell has 2 elements
	require.Equal(t, uint(258*3), c.BitsSize())
	ref, err := c.PeekRef(0)
	require.NoError(t, err)
	require.Equal(t, uint(258*2), ref.BitsSize())

	array := common.SnakeData[TokenPriceUpdate]{}
	err = tlb.LoadFromCell(&array, c.BeginParse())
	require.NoError(t, err)
	require.Len(t, array, 5)
}

func TestLoadArray_FitSingleUpdateInSingleCell_TokenUpdates(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	slice := common.SnakeData[TokenPriceUpdate]{
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
	c, err := tlb.ToCell(slice)
	require.NoError(t, err)
	array := common.SnakeData[TokenPriceUpdate]{}
	err = tlb.LoadFromCell(&array, c.BeginParse())
	require.NoError(t, err)
	require.Len(t, array, 5)

	// For this test, each token update is only 523 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 5 elements
	refNum, err := common.GetTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(4), refNum)
	for i := 0; i < 4; i++ {
		c, err = c.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(523), c.BitsSize())
	}
}

func TestLoadArray_FitSingleUpdateInSingleCell_MerkleRoots(t *testing.T) {
	merkleRoots := common.SnakeData[MerkleRoot]{
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
	}

	c, err := tlb.ToCell(merkleRoots)
	require.NoError(t, err)

	array := common.SnakeData[MerkleRoot]{}
	err = tlb.LoadFromCell(&array, c.BeginParse())
	require.Len(t, array, 3)

	// For this test, each token update is only 960 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 3 elements
	refNum, err := common.GetTotalReference(c)
	require.NoError(t, err)
	require.Equal(t, uint(2), refNum)
	for i := 0; i < 2; i++ {
		c, err = c.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, uint(960), c.BitsSize())
	}
}

func TestLoadArray_AddressTooSmall(t *testing.T) {
	// Note: for OnRampAddress that requires 64 bytes length, if the address bytes is smaller than 64, tlb.toCell() will return error, if bytes array is more than 64 bytes, only first 512 bits will be used.
	_, err := tlb.ToCell(common.SnakeData[MerkleRoot]{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 63),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.EqualError(t, err, "failed to store to cell for github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common, using manual storer, err: failed to serialize element 0: failed to serialize field OnRampAddress to cell: failed to store bits 512, err: too small slice for this size")
	_, err = tlb.ToCell(common.SnakeData[MerkleRoot]{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 31),
		},
	})
	require.EqualError(t, err, "failed to store to cell for github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common, using manual storer, err: failed to serialize element 0: failed to serialize field MerkleRoot to cell: failed to store bits 256, err: too small slice for this size")
}
