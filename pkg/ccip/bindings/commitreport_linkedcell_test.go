package bindings

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestCommitReport_gobinding_arraypacking(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	onrampAddr := make([]byte, 256)
	commitReport := CommitReportLC{
		PriceUpdates: PriceUpdatesLC{
			TokenPriceUpdates: []TokenPriceUpdate{
				{
					SourceToken: addr,
					UsdPerToken: big.NewInt(1000000), // Example value
				},
			},
			GasPriceUpdates: []GasPriceUpdate{
				{
					DestChainSelector: 1,
					UsdPerUnitGas:     big.NewInt(2000000),
				},
			},
		},
		MerkleRoot: MerkleRootsLC{
			UnblessedMerkleRoots: []MerkleRoot{
				{
					SourceChainSelector: 1,
					OnRampAddress:       onrampAddr,
					MinSeqNr:            100,
					MaxSeqNr:            200,
					MerkleRoot:          onrampAddr,
				},
			},
			BlessedMerkleRoots: []MerkleRoot{
				{
					SourceChainSelector: 1,
					OnRampAddress:       onrampAddr,
					MinSeqNr:            100,
					MaxSeqNr:            200,
					MerkleRoot:          onrampAddr,
				},
			},
		},
		RMNSignatures: []Signature{
			{
				Sig: make([]byte, 64),
			},
		},
	}

	// Encode to cell
	c, err := SerializeToLinkedCells(commitReport)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	decoded, err := DeserializeFromLinkedCells[CommitReportLC](newCell)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Equal(t, commitReport, decoded)
}
