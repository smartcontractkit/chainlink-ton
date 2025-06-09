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

func TestCommitReport_gobinding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	tokenPriceSlice, err := SliceToDict([]TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
	})
	require.NoError(t, err)

	gasPriceSlice, err := SliceToDict([]GasPriceUpdate{
		{
			DestChainSelector: 1,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	})
	require.NoError(t, err)

	onrampAddr := make([]byte, 256)
	merkleRoots, err := SliceToDict([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       onrampAddr,
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          onrampAddr,
		},
	})
	require.NoError(t, err)
	signatureSlice, err := SliceToDict([]Signature{
		{
			Sig: make([]byte, 64),
		},
	})

	commitReport := CommitReport{
		PriceUpdates: PriceUpdates{
			TokenPriceUpdates: tokenPriceSlice,
			GasPriceUpdates:   gasPriceSlice,
		},
		BlessedMerkleRoots:   merkleRoots,
		UnblessedMerkleRoots: merkleRoots,
		RMNSignatures:        signatureSlice,
	}

	// Encode to cell
	c, err := tlb.ToCell(commitReport)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded CommitReport
	if err := tlb.LoadFromCell(&decoded, newCell.BeginParse()); err != nil {
		fmt.Printf("Error decoding: %v\n", err)
		return
	}

	require.Equal(t, commitReport, decoded)
	require.Equal(t, c.Hash(), newCell.Hash())
}
