package tokenpool

import (
	"math/big"
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

// TestCursedSubjects_WireFormat verifies that modelling CursedSubjects.Data as
// *tlbe.Dict[tlbe.Uint128, struct{}] (tlb:".") produces the same wire form as a
// raw *cell.Dictionary serialized through the "dict 128" tag: a map<uint128,()>
// with 0-bit unit values, inlined into the enclosing cell.
func TestCursedSubjects_WireFormat(t *testing.T) {
	subjects := tlbe.NewDict[tlbe.Uint128, struct{}](map[tlbe.Uint128]struct{}{
		*tlbe.NewUint128(big.NewInt(1)):  {},
		*tlbe.NewUint128(big.NewInt(42)): {},
	})

	got, err := tlb.ToCell(CursedSubjects{Data: subjects})
	require.NoError(t, err)

	rawDict := cell.NewDict(128)
	for k := range subjects.AsMap() {
		keyCell := cell.BeginCell().MustStoreBigInt(k.ToBigInt(), 128).EndCell()
		unitCell := cell.BeginCell().EndCell() // map<_,()> value: 0 bits, 0 refs
		require.NoError(t, rawDict.Set(keyCell, unitCell))
	}

	want, err := tlb.ToCell(struct {
		Data *cell.Dictionary `tlb:"dict 128"`
	}{Data: rawDict})
	require.NoError(t, err)

	require.Equal(t, want.Hash(), got.Hash(),
		"tlbe.Dict[Uint128, struct{}] encoding must match the raw dict 128 wire form")
}

// TestCursedSubjects_RoundTrip verifies encode/decode via the tlb:"." marshaller.
func TestCursedSubjects_RoundTrip(t *testing.T) {
	subjects := tlbe.NewDict[tlbe.Uint128, struct{}](map[tlbe.Uint128]struct{}{
		*tlbe.NewUint128(big.NewInt(7)): {},
	})

	c, err := tlb.ToCell(CursedSubjects{Data: subjects})
	require.NoError(t, err)

	var decoded CursedSubjects
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))

	_, ok := decoded.Data.Get(*tlbe.NewUint128(big.NewInt(7)))
	require.True(t, ok)
	require.Equal(t, 1, decoded.Data.Len())
}

// TestRemoteChainConfig_RemotePools_Decode is a regression test: RemotePools keys
// used to be *tlbe.Uint256, which panics on decode (pointer keys are not
// tlb.Unmarshaler). Value-typed Uint256 keys must decode, mirroring the
// RemotePools field shape with a plain payload to isolate key behaviour.
func TestRemoteChainConfig_RemotePools_Decode(t *testing.T) {
	type remotePoolsHolder struct {
		RemotePools *tlbe.Dict[tlbe.Uint256, uint64] `tlb:"."`
	}

	cfg := remotePoolsHolder{
		RemotePools: tlbe.NewDict[tlbe.Uint256, uint64](map[tlbe.Uint256]uint64{
			*tlbe.NewUint256(big.NewInt(5)): 123,
		}),
	}

	c, err := tlb.ToCell(cfg)
	require.NoError(t, err)

	var decoded remotePoolsHolder
	require.NoError(t, tlb.LoadFromCell(&decoded, c.BeginParse()))
	require.Len(t, decoded.RemotePools.AsMap(), 1)

	got, ok := decoded.RemotePools.Get(*tlbe.NewUint256(big.NewInt(5)))
	require.True(t, ok)
	require.Equal(t, uint64(123), got)
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
