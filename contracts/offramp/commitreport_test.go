package offramp

import (
	"fmt"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestCommitReport_gobinding(t *testing.T) {
	// Example CommitReport
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	tokenPriceSlice, err := SliceToDictTokenPriceUpdate([]TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000), // Example value
		},
	})
	require.NoError(t, err)

	gasPriceSlice, err := SliceToDictGasPriceUpdate([]GasPriceUpdate{
		{
			DestChainSelector: 1,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	})
	require.NoError(t, err)

	onrampAddr := make([]byte, 256)
	merkleRoots, err := SliceToDictMerkleRoot([]MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       onrampAddr,
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          onrampAddr,
		},
	})
	require.NoError(t, err)

	signatureSlice, err := SliceToDictSignature([]Signature{
		{
			R: big.NewInt(1111111111),
			S: big.NewInt(2222222222),
			V: 27,
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
	if err != nil {
		fmt.Printf("Error encoding: %v\n", err)
		return
	}

	// Decode from cell
	var decoded CommitReport
	if err := tlb.LoadFromCell(&decoded, c.BeginParse()); err != nil {
		fmt.Printf("Error decoding: %v\n", err)
		return
	}

	require.Equal(t, commitReport, decoded)
}
