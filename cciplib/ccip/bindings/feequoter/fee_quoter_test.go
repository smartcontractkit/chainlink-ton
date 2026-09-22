package feequoter

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// TestUpdateFeeTokens_TLBEncodeDecode verifies that UpdateFeeTokens round-trips
// through TLB serialization when using tlbe.Dict[common.AddressWrap, FeeToken].
// The Add dictionary must carry enough type information to be serialized and
// deserialized without a manual dictionary surrogate.
func TestUpdateFeeTokens_TLBEncodeDecode(t *testing.T) {
	tonAddr, err := address.ParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99")
	require.NoError(t, err)
	linkAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	addEntries := map[common.AddressWrap]FeeToken{
		{Val: tonAddr}:  {PremiumMultiplierWeiPerEth: 1},
		{Val: linkAddr}: {PremiumMultiplierWeiPerEth: 1_000_000},
	}

	orig := UpdateFeeTokens{
		Add:    tlbe.NewDict(addEntries),
		Remove: nil,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded UpdateFeeTokens
	err = tlb.LoadFromCell(&decoded, c.MustBeginParse())
	require.NoError(t, err)

	// Re-encode the decoded value and compare cell hashes for a strict round-trip.
	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), reencoded.Hash(), "cell hash mismatch after round-trip")

	// Verify the Add dictionary contents.
	require.NotNil(t, decoded.Add)
	require.Equal(t, len(addEntries), decoded.Add.Len())

	// Compare by address string since *address.Address uses pointer identity for
	// map key comparison, so decoded keys are new pointer instances.
	expectedByAddr := make(map[string]FeeToken, len(addEntries))
	for key, val := range addEntries {
		expectedByAddr[key.Val.String()] = val
	}
	for key, got := range decoded.Add.AsMap() {
		expected, ok := expectedByAddr[key.Val.String()]
		require.True(t, ok, "unexpected key %s after decode", key.Val)
		require.Equal(t, expected, got)
	}
}

// TestUpdateFeeTokens_EmptyAdd verifies that an UpdateFeeTokens with an empty
// Add dictionary and nil Remove serializes and deserializes correctly.
func TestUpdateFeeTokens_EmptyAdd(t *testing.T) {
	orig := UpdateFeeTokens{
		Add:    tlbe.NewEmptyDict[common.AddressWrap, FeeToken](),
		Remove: nil,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded UpdateFeeTokens
	err = tlb.LoadFromCell(&decoded, c.MustBeginParse())
	require.NoError(t, err)

	require.NotNil(t, decoded.Add)
	require.Equal(t, 0, decoded.Add.Len())

	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), reencoded.Hash(), "cell hash mismatch after round-trip")
}

// TestUpdateFeeTokens_WithRemove verifies that UpdateFeeTokens with a non-empty
// Remove SnakedCell serializes and deserializes correctly.
func TestUpdateFeeTokens_WithRemove(t *testing.T) {
	tonAddr, err := address.ParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99")
	require.NoError(t, err)
	linkAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	orig := UpdateFeeTokens{
		Add: tlbe.NewDict(map[common.AddressWrap]FeeToken{
			{Val: tonAddr}: {PremiumMultiplierWeiPerEth: 1},
		}),
		Remove: common.WrapAddresses([]*address.Address{linkAddr}),
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded UpdateFeeTokens
	err = tlb.LoadFromCell(&decoded, c.MustBeginParse())
	require.NoError(t, err)

	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), reencoded.Hash(), "cell hash mismatch after round-trip")

	require.NotNil(t, decoded.Add)
	require.Equal(t, 1, decoded.Add.Len())
	require.Len(t, decoded.Remove, 1)
}
