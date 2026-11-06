package offramp

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestAddressArray_RoundTrip(t *testing.T) {
	a1 := address.MustParseAddr("EQBPABJHLy9WThhpL5UIiDIrUHWzz6Mjhq96hPP4TuMkGPsk")
	a2 := address.MustParseAddr("EQAsP6MHRFOGtFf2xcx4Kt82AAwQWGEcYsQB7v3-vGd8MR-j")

	for _, tc := range []struct {
		name string
		arr  AddressArray
	}{
		{"empty", AddressArray{}},
		{"single", AddressArray{a1}},
		{"two", AddressArray{a1, a2}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, err := tc.arr.ToCell()
			require.NoError(t, err)

			var decoded AddressArray
			require.NoError(t, decoded.LoadFromCell(c.MustBeginParse()))
			require.Len(t, decoded, len(tc.arr))
			for i := range tc.arr {
				require.True(t, tc.arr[i].Equals(decoded[i]))
			}
		})
	}
}

// Tolk may pack several elements into one chunk; decoding must accept that.
func TestAddressArray_LoadsMultiElementChunk(t *testing.T) {
	a1 := address.MustParseAddr("EQBPABJHLy9WThhpL5UIiDIrUHWzz6Mjhq96hPP4TuMkGPsk")
	a2 := address.MustParseAddr("EQAsP6MHRFOGtFf2xcx4Kt82AAwQWGEcYsQB7v3-vGd8MR-j")
	chunk := cell.BeginCell().MustStoreMaybeRef(nil).MustStoreAddr(a1).MustStoreAddr(a2).EndCell()
	c := cell.BeginCell().MustStoreUInt(2, 8).MustStoreMaybeRef(chunk).EndCell()

	var decoded AddressArray
	require.NoError(t, decoded.LoadFromCell(c.MustBeginParse()))
	require.Len(t, decoded, 2)
	require.True(t, a1.Equals(decoded[0]))
	require.True(t, a2.Equals(decoded[1]))
}

func TestAddressArray_LengthMismatch(t *testing.T) {
	a1 := address.MustParseAddr("EQBPABJHLy9WThhpL5UIiDIrUHWzz6Mjhq96hPP4TuMkGPsk")
	chunk := cell.BeginCell().MustStoreMaybeRef(nil).MustStoreAddr(a1).EndCell()
	c := cell.BeginCell().MustStoreUInt(2, 8).MustStoreMaybeRef(chunk).EndCell()

	var decoded AddressArray
	require.Error(t, decoded.LoadFromCell(c.MustBeginParse()))
}

// CCIPReceiveV2 carries the array inline after the message ref.
func TestCCIPReceiveV2_ReceiverAccountsRoundTrip(t *testing.T) {
	a1 := address.MustParseAddr("EQBPABJHLy9WThhpL5UIiDIrUHWzz6Mjhq96hPP4TuMkGPsk")
	orig := CCIPReceiveV2{
		ExecID:       make([]byte, 24),
		QueryID:      7,
		ConfirmValue: tlb.MustFromTON("0.01"),
		Message: Any2TVMMessage{
			MessageID: make([]byte, 32),
			Data:      cell.BeginCell().EndCell(),
		},
		ReceiverAccounts: AddressArray{a1},
	}
	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded CCIPReceiveV2
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
	require.Len(t, decoded.ReceiverAccounts, 1)
	require.True(t, a1.Equals(decoded.ReceiverAccounts[0]))
	require.Equal(t, uint64(7), decoded.QueryID)
}
