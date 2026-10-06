package tokenpool

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool/lockbox"
)

func TestInsufficientMessageValueExitCode(t *testing.T) {
	decoded, err := ErrorInsufficientMessageValue.NewFrom(51726)
	require.NoError(t, err)
	require.Equal(t, ErrorInsufficientMessageValue, decoded)
	require.Equal(t, "ErrorInsufficientMessageValue", decoded.String())
}

func TestLockboxDepositFailed_WireFormat(t *testing.T) {
	token := address.NewAddress(0, 0, make([]byte, 32))
	payload := cell.BeginCell().MustStoreUInt(301, 64).EndCell()
	context := &lockbox.Deposit{
		QueryID: 301, Token: token, RemoteChainSelector: 123,
		Amount: tlb.MustFromTON("9"), Context: payload,
	}
	contextCell, err := tlb.ToCell(context)
	require.NoError(t, err)
	for name, attempted := range map[string]bool{"skipped": false, "queued": true} {
		t.Run(name, func(t *testing.T) {
			message := lockbox.DepositFailed{
				QueryID: 301, Token: token, Depositor: token, Amount: tlb.MustFromTON("9"),
				Context: context, ErrorCode: 47400, ReturnAttempted: attempted,
			}
			encoded, err := tlb.ToCell(message)
			require.NoError(t, err)
			expected := cell.BeginCell().MustStoreUInt(0x5e28ebd8, 32).MustStoreUInt(301, 64).
				MustStoreAddr(token).MustStoreAddr(token).MustStoreCoins(9000000000).
				MustStoreMaybeRef(contextCell).MustStoreUInt(47400, 16).MustStoreBoolBit(attempted).EndCell()
			require.Equal(t, expected.Hash(), encoded.Hash())
			var decoded lockbox.DepositFailed
			require.NoError(t, tlb.LoadFromCell(&decoded, encoded.MustBeginParse()))
			require.Equal(t, message.QueryID, decoded.QueryID)
			require.Equal(t, message.ErrorCode, decoded.ErrorCode)
			require.Equal(t, attempted, decoded.ReturnAttempted)
			decodedContext, err := tlb.ToCell(decoded.Context)
			require.NoError(t, err)
			require.Equal(t, contextCell.Hash(), decodedContext.Hash())
			require.Equal(t, payload.Hash(), decoded.Context.Context.Hash())
		})
	}
}

func TestLockboxWithdrawFailed_WireFormat(test *testing.T) {
	token := address.NewAddress(0, 0, make([]byte, 32))
	payload := cell.BeginCell().MustStoreUInt(301, 64).EndCell()
	for _, withExtra := range []bool{false, true} {
		context := &lockbox.Withdraw{
			QueryID: 301, Token: token, RemoteChainSelector: 123,
			Amount: tlb.MustFromTON("9"), RecipientWallet: token,
		}
		if withExtra {
			context.Extra = &lockbox.WithdrawExtra{SendExcessesTo: token, ForwardPayload: payload}
		}
		message := lockbox.WithdrawFailed{
			QueryID: 301, Token: token, Context: context,
		}
		contextCell, err := tlb.ToCell(context)
		require.NoError(test, err)
		encoded, err := tlb.ToCell(message)
		require.NoError(test, err)
		expected := cell.BeginCell().MustStoreUInt(0x60bae556, 32).MustStoreUInt(301, 64).
			MustStoreAddr(token).MustStoreMaybeRef(contextCell).EndCell()
		require.Equal(test, expected.Hash(), encoded.Hash())
		var decoded lockbox.WithdrawFailed
		require.NoError(test, tlb.LoadFromCell(&decoded, encoded.MustBeginParse()))
		decodedContext, err := tlb.ToCell(decoded.Context)
		require.NoError(test, err)
		require.Equal(test, contextCell.Hash(), decodedContext.Hash())
		if withExtra {
			require.Equal(test, payload.Hash(), decoded.Context.Extra.ForwardPayload.Hash())
		} else {
			require.Nil(test, decoded.Context.Extra)
		}
	}
}

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
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))

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
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
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
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
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
	require.NoError(t, tlb.LoadFromCell(&decodedEmpty, emptyCell.MustBeginParse()))
	require.Empty(t, decodedEmpty.AllowedDepositNamespaces.AsMap())
}
