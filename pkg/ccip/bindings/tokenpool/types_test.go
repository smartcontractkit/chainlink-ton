package tokenpool

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// TestDynamicConfig_AllowedDepositNamespaces_WireFormat verifies that modelling
// AllowedDepositNamespaces as *tlbe.Dict[uint32, struct{}] (tlb:".") produces
// exactly the same wire form as a raw *cell.Dictionary serialized through the
// "dict 32" tag: a map<uint32,()> whose unit values are 0-bit inline leaves.
func TestDynamicConfig_AllowedDepositNamespaces_WireFormat(t *testing.T) {
	namespaces := tlbe.NewDict[uint32, struct{}](map[uint32]struct{}{
		1:  {},
		42: {},
	})

	cfg := DynamicConfig{
		AllowedDepositNamespaces: namespaces,
	}

	cfgCell, err := tlb.ToCell(cfg)
	require.NoError(t, err)

	// Same layout, but the dict is a raw *cell.Dictionary through the "dict 32"
	// tag path (the encoding used before this change).
	rawDict := cell.NewDict(32)
	for k := range namespaces.AsMap() {
		keyCell := cell.BeginCell().MustStoreUInt(uint64(k), 32).EndCell()
		unitCell := cell.BeginCell().EndCell() // map<_,()> value: 0 bits, 0 refs
		require.NoError(t, rawDict.Set(keyCell, unitCell))
	}

	rawStruct := struct {
		Router                   *address.Address `tlb:"addr"`
		RateLimitAdmin           *address.Address `tlb:"addr"`
		FeeAdmin                 *address.Address `tlb:"addr"`
		AllowedDepositNamespaces *cell.Dictionary `tlb:"dict 32"`
	}{AllowedDepositNamespaces: rawDict}
	rawCell, err := tlb.ToCell(rawStruct)
	require.NoError(t, err)

	require.Equal(t, rawCell.Hash(), cfgCell.Hash(),
		"tlbe.Dict struct{} encoding must match the raw dict 32 wire form")
}

// TestDynamicConfig_AllowedDepositNamespaces_RoundTrip verifies encode/decode
// through tonutils-go's tlb loader (using the tlb:"." marshaller path).
func TestDynamicConfig_AllowedDepositNamespaces_RoundTrip(t *testing.T) {
	namespaces := tlbe.NewDict[uint32, struct{}](map[uint32]struct{}{
		7:  {},
		13: {},
	})

	cfg := DynamicConfig{AllowedDepositNamespaces: namespaces}

	c, err := tlb.ToCell(cfg)
	require.NoError(t, err)

	var decoded DynamicConfig
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Len(t, decoded.AllowedDepositNamespaces.AsMap(), 2)
	_, ok := decoded.AllowedDepositNamespaces.Get(7)
	require.True(t, ok)
	_, ok = decoded.AllowedDepositNamespaces.Get(13)
	require.True(t, ok)

	// Empty set round-trips as an empty map.
	empty := DynamicConfig{AllowedDepositNamespaces: tlbe.NewEmptyDict[uint32, struct{}]()}
	emptyCell, err := tlb.ToCell(empty)
	require.NoError(t, err)

	var decodedEmpty DynamicConfig
	require.NoError(t, tlb.LoadFromCell(&decodedEmpty, emptyCell.BeginParse()))
	require.Empty(t, decodedEmpty.AllowedDepositNamespaces.AsMap())
}
