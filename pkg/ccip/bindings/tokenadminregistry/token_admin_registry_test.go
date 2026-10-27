package tokenadminregistry

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

func TestTokenInfo_PoolInfoRoundTrip(t *testing.T) {
	token := address.NewAddress(0, 0, make([]byte, 32))

	enabled := TokenInfo{
		QueryID:       7,
		Token:         token,
		MinterAddress: token,
		Version:       1,
		PoolInfo: &PoolInfo{
			TokenPool:         token,
			TransferInitiator: nil,
			Admission: tokenpool.AdmissionBudget{
				LockOrBurn:    tlb.MustFromTON("0.1"),
				ReleaseOrMint: tlb.MustFromTON("0.2"),
			},
		},
	}
	cell, err := tlb.ToCell(enabled)
	require.NoError(t, err)

	var decoded TokenInfo
	require.NoError(t, tlb.LoadFromCell(&decoded, cell.MustBeginParse()))
	require.Equal(t, enabled, decoded)

	disabled := TokenInfo{QueryID: 8, Token: token, MinterAddress: token, Version: 1}
	cell, err = tlb.ToCell(disabled)
	require.NoError(t, err)

	decoded = TokenInfo{}
	require.NoError(t, tlb.LoadFromCell(&decoded, cell.MustBeginParse()))
	require.Nil(t, decoded.PoolInfo)
}
