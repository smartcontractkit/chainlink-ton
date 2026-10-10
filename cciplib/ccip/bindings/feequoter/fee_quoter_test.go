package feequoter

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

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

// TestMessageValidated_TLBEncodeDecode verifies that MessageValidated round-trips
// through TLB serialization with the destGasOverheads lisp_list and the echoed
// chainFamilySelector the executor relays to the OnRamp.
func TestMessageValidated_TLBEncodeDecode(t *testing.T) {
	msgCell := cell.BeginCell().MustStoreUInt(1, 8).EndCell()
	contextCell := cell.BeginCell().MustStoreUInt(2, 8).EndCell()

	orig := MessageValidated{
		Fee: Fee{
			FeeTokenAmount: ptrCoins(tlb.MustFromTON("0.5")),
			FeeValueJuels:  big.NewInt(123456),
		},
		DestGasOverheads: &common.LispList[common.UInt32]{
			{Value: 90000},
			{Value: 123456},
		},
		ChainFamilySelector: 0x2812d52c,
		Msg:                 msgCell,
		Context:             contextCell,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded MessageValidated
	err = tlb.LoadFromCell(&decoded, c.MustBeginParse())
	require.NoError(t, err)

	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), reencoded.Hash(), "cell hash mismatch after round-trip")

	require.Equal(t, orig.ChainFamilySelector, decoded.ChainFamilySelector)
	require.NotNil(t, decoded.DestGasOverheads)
	require.Len(t, *decoded.DestGasOverheads, 2)
	require.Equal(t, uint32(90000), (*decoded.DestGasOverheads)[0].Value)
	require.Equal(t, uint32(123456), (*decoded.DestGasOverheads)[1].Value)
}

// TestMessageValidated_NilDestGasOverheads covers the messaging-only case: the
// FeeQuoter sends a null destGasOverheads list when the message carries no tokens.
func TestMessageValidated_NilDestGasOverheads(t *testing.T) {
	msgCell := cell.BeginCell().MustStoreUInt(1, 8).EndCell()

	orig := MessageValidated{
		Fee: Fee{
			FeeTokenAmount: ptrCoins(tlb.MustFromTON("0.5")),
			FeeValueJuels:  big.NewInt(1),
		},
		DestGasOverheads:    nil,
		ChainFamilySelector: 0x1e10bdc4,
		Msg:                 msgCell,
		Context:             nil,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded MessageValidated
	err = tlb.LoadFromCell(&decoded, c.MustBeginParse())
	require.NoError(t, err)

	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), reencoded.Hash(), "cell hash mismatch after round-trip")

	require.Nil(t, decoded.DestGasOverheads)
	require.Equal(t, orig.ChainFamilySelector, decoded.ChainFamilySelector)
}

// ptrCoins returns a pointer to the given coins value.
func ptrCoins(c tlb.Coins) *tlb.Coins {
	return &c
}
