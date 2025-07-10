package bindings

import (
	"fmt"
	"math"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestCommitReport_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenPriceSlice := []TokenPriceUpdate{
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
	}
	require.NoError(t, err)

	gasPriceSlice := []GasPriceUpdate{
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
	}
	require.NoError(t, err)
	merkleRoots := []MerkleRoot{
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
	}
	require.NoError(t, err)
	signatureCell := []Signature{
		{
			Sig: make([]byte, 64),
		},
	}

	commitReport := CommitReport{
		PriceUpdates: PriceUpdates{
			TokenPriceUpdates: tokenPriceSlice,
			GasPriceUpdates:   gasPriceSlice,
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
	require.Len(t, decoded.PriceUpdates.GasPriceUpdates, 5)
	require.Len(t, decoded.PriceUpdates.TokenPriceUpdates, 5)
}

func getTotalReference(c *cell.Cell) (uint, error) {
	totalRefs := c.RefsNum()
	for i := uint(0); i < c.RefsNum(); i++ {
		if i > uint(math.MaxInt) {
			return 0, fmt.Errorf("reference index %d exceeds math.MaxInt", i)
		}
		ref, err := c.PeekRef(int(i))
		if err == nil && ref != nil {
			subRefs, subErr := getTotalReference(ref)
			if subErr != nil {
				return 0, subErr
			}
			totalRefs += subRefs
		}
	}
	return totalRefs, nil
}
