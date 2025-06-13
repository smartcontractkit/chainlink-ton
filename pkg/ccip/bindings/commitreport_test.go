package bindings

import (
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
	tokenPriceSlice, err := SliceToDict([]TokenPriceUpdateTLB{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
	})
	require.NoError(t, err)

	gasPriceSlice, err := SliceToDict([]GasPriceUpdateTLB{
		{
			DestChainSelector: 1,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	})
	require.NoError(t, err)
	merkleRoots, err := SliceToDict([]MerkleRootTLB{
		{
			SourceChainSelector: 1,
			OnRampAddress:       make([]byte, 64),
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	})
	require.NoError(t, err)
	signatureSlice, err := SliceToDict([]SignatureTLB{
		{
			Sig: make([]byte, 64),
		},
	})

	commitReport := CommitReportTLB{
		PriceUpdates: PriceUpdatesTLB{
			TokenPriceUpdates: tokenPriceSlice,
			GasPriceUpdates:   gasPriceSlice,
		},
		MerkleRoot: MerkleRootsTLB{
			UnblessedMerkleRoots: merkleRoots,
			BlessedMerkleRoots:   merkleRoots,
		},
		RMNSignatures: signatureSlice,
	}

	// Encode to cell
	c, err := tlb.ToCell(commitReport)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded CommitReportTLB
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
}
