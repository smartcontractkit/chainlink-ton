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

	commitReport := CommitReportLC{
		PriceUpdates: PriceUpdatesLC{
			TokenPriceUpdates: []TokenPriceUpdateLC{
				{
					SourceToken: addr,
					UsdPerToken: big.NewInt(1000000), // Example value
				},
			},
			GasPriceUpdates: []GasPriceUpdateLC{
				{
					DestChainSelector: 1,
					UsdPerUnitGas:     big.NewInt(2000000),
				},
			},
		},
		MerkleRoot: MerkleRootsLC{
			UnblessedMerkleRoots: []MerkleRootLC{
				{
					SourceChainSelector: 1,
					OnRampAddress:       make([]byte, 64),
					MinSeqNr:            100,
					MaxSeqNr:            200,
					MerkleRoot:          make([]byte, 32),
				},
			},
			BlessedMerkleRoots: []MerkleRootLC{
				{
					SourceChainSelector: 1,
					OnRampAddress:       make([]byte, 64),
					MinSeqNr:            100,
					MaxSeqNr:            200,
					MerkleRoot:          make([]byte, 32),
				},
			},
		},
		RMNSignatures: []SignatureLC{
			{
				R: make([]byte, 32),
				S: make([]byte, 32),
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
	decoded := CommitReportLC{}
	err = DeserializeFromLinkedCells(&decoded, newCell)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Equal(t, commitReport, decoded)
}
