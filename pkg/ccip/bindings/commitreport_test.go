package bindings

import (
	"fmt"
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

func TestLoadArray_FitSingleUpdateInSingleCell_MerkleRoots(t *testing.T) {
	merkleRoots, err := PackArray([]MerkleRoot{
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
	array, err := UnpackArray[MerkleRoot](merkleRoots)
	require.NoError(t, err)
	require.Len(t, array, 3)

	//For this test, each token update is only 960 bits, so we can fit only 1 of them in a single cell.
	//we only need five cells to store 3 elements
	require.Equal(t, 2, getTotalReference(merkleRoots))
	for i := 0; i < 2; i++ {
		merkleRoots, err = merkleRoots.PeekRef(0)
		require.NoError(t, err)
		require.Equal(t, int(merkleRoots.BitsSize()), 960)
	}
}

func TestLoadArray_AddressTooSmall(t *testing.T) {
	// Note: for OnRampAddress that requires 64 bytes length, if the address bytes is smaller than 64, tlb.toCell() will return error, if bytes array is more than 64 bytes, only first 512 bits will be used.
	_, err := PackArray([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 63),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.EqualError(t, err, "failed to serialize element 0: failed to serialize field OnRampAddress to cell: failed to store bits 512, err: too small slice for this size")

	_, err = PackArray([]MerkleRoot{
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

func TestCommitReport_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenPriceCell, err := PackArray([]TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
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
		{
			DestChainSelector: 2,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
		{
			DestChainSelector: 3,
			UsdPerUnitGas:     big.NewInt(2000000),
		}, {
			DestChainSelector: 4,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
		{
			DestChainSelector: 5,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	})
	require.NoError(t, err)
	merkleRoots, err := PackArray([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 512),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 512),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 512),
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

	gu, err := UnpackArray[GasPriceUpdate](decoded.PriceUpdates.GasPriceUpdates)
	require.NoError(t, err)
	require.Len(t, gu, 5)
	tu, err := UnpackArray[TokenPriceUpdate](decoded.PriceUpdates.TokenPriceUpdates)
	require.NoError(t, err)
	require.Len(t, tu, 5)
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

func addressToCell(addr *address.Address) (*cell.Cell, error) {
	if addr == nil {
		return nil, fmt.Errorf("address cannot be nil")
	}
	builder := cell.BeginCell()
	if err := builder.StoreAddr(addr); err != nil {
		return nil, fmt.Errorf("failed to store address: %w", err)
	}
	return builder.EndCell(), nil
}
