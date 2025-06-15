package bindings

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

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
	c, err := PackArray(slice)
	require.NoError(t, err)

	// For this test, each token update is only 258 bits, so we can fit up to 3 of them in a single cell.
	// we only need two cells to store 5 elements, so c should have 1 ref.
	require.Equal(t, 1, getTotalReference(c))

	// first cell has 3 elements, second cell has 2 elements
	require.Equal(t, int(c.BitsSize()), 258*3)
	ref, err := c.PeekRef(0)
	require.NoError(t, err)
	require.Equal(t, int(ref.BitsSize()), 258*2)

	array, err := UnpackArray[TokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)
}

func TestLoadArray_FitSingleUpdateInSingleCell(t *testing.T) {
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
	c, err := PackArray(slice)
	require.NoError(t, err)

	array, err := UnpackArray[TokenPriceUpdate](c)
	require.NoError(t, err)
	require.Len(t, array, 5)

	// For this test, each token update is only 523 bits, so we can fit only 1 of them in a single cell.
	// we only need five cells to store 5 elements
	require.Equal(t, 4, getTotalReference(c))
	for i := 0; i < 4; i++ {
		c, err = c.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, int(c.BitsSize()), 523)
	}
}

func TestCommitReport_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenPriceCell, err := PackArray([]TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
	})
	require.NoError(t, err)

	gasPriceCell, err := PackArray([]GasPriceUpdate{
		{
			DestChainSelector: 1,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	})
	require.NoError(t, err)
	onRampAddrCell, err := AddressToCell(addr)
	require.NoError(t, err)
	merkleRoots, err := PackArray([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       onRampAddrCell,
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.NoError(t, err)
	signatureCell, err := PackArray([]Signature{
		{
			Sig: make([]byte, 64),
		},
	})

	commitReport := CommitReport{
		PriceUpdates: PriceUpdates{
			TokenPriceUpdates: tokenPriceCell,
			GasPriceUpdates:   gasPriceCell,
		},
		MerkleRoot: MerkleRoots{
			UnblessedMerkleRoots: merkleRoots,
			BlessedMerkleRoots:   merkleRoots,
		},
		RMNSignatures: signatureCell,
	}

	// Encode to cell
	c, err := tlb.ToCell(commitReport)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded CommitReport
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
}

func getTotalReference(c *cell.Cell) int {
	totalRefs := int(c.RefsNum())
	for i := 0; i < int(c.RefsNum()); i++ {
		ref, err := c.PeekRef(i)
		if err == nil && ref != nil {
			totalRefs += getTotalReference(ref)
		}
	}
	return totalRefs
}
