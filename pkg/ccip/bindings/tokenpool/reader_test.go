package tokenpool

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// Verifies the decoder reads the returned Cell<CrossChainAddress> (a length-prefixed slice)
func TestGetRemoteToken_DecodesLengthPrefixedCell(t *testing.T) {
	want := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	c, err := want.ToCell()
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{c})

	got, err := GetRemoteToken.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, want, got)
}

// Verifies each lisp_list element is decoded as a length-prefixed Cell<CrossChainAddress>
func TestGetRemotePools_DecodesLengthPrefixedCells(t *testing.T) {
	first := common.CrossChainAddress{0x01, 0x02, 0x03}
	second := common.CrossChainAddress{0x0a, 0x0b}
	firstCell, err := first.ToCell()
	require.NoError(t, err)
	secondCell, err := second.ToCell()
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{
		[]any{firstCell, []any{secondCell, nil}},
	})

	got, err := GetRemotePools.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, []common.CrossChainAddress{first, second}, got)
}

// Verifies the decoder reads the outbound and inbound buckets from two separate stack cells
// (the on-chain TokenPool_RateLimiterPair is flattened into two Cell<RateLimiter_TokenBucket>).
func TestGetCurrentRateLimiterState_DecodesTwoCells(t *testing.T) {
	outbound := RateLimiterTokenBucket{
		Tokens:      tlbe.BigUint128{Int: big.NewInt(1)},
		LastUpdated: 1700000000,
		IsEnabled:   true,
		Capacity:    tlbe.BigUint128{Int: big.NewInt(2)},
		Rate:        tlbe.BigUint128{Int: big.NewInt(3)},
	}
	inbound := RateLimiterTokenBucket{
		Tokens:      tlbe.BigUint128{Int: big.NewInt(4)},
		LastUpdated: 1700000001,
		IsEnabled:   false,
		Capacity:    tlbe.BigUint128{Int: big.NewInt(5)},
		Rate:        tlbe.BigUint128{Int: big.NewInt(6)},
	}
	outboundCell, err := tlb.ToCell(outbound)
	require.NoError(t, err)
	inboundCell, err := tlb.ToCell(inbound)
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{outboundCell, inboundCell})

	got, err := GetCurrentRateLimiterState.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, RateLimiterPair{Outbound: outbound, Inbound: inbound}, got)
}

// Verifies the decoder reads the wide nullable TokenPool_TokenTransferFeeConfig?:
// seven scalar fields (slots 0-6) plus a presence discriminator at slot 7.
func TestGetTokenTransferFeeConfig_WideNullable(t *testing.T) {
	t.Run("present", func(t *testing.T) {
		result := ton.NewExecutionResult([]any{
			big.NewInt(21000), // destGasOverhead
			big.NewInt(100),   // destBytesOverhead
			big.NewInt(50),    // finalityFeeUSDCents
			big.NewInt(60),    // fastFinalityFeeUSDCents
			big.NewInt(10),    // finalityTransferFeeBps
			big.NewInt(20),    // fastFinalityTransferFeeBps
			big.NewInt(-1),    // isEnabled
			big.NewInt(-1),    // presence discriminator
		})

		got, err := GetTokenTransferFeeConfig.Decoder.Decode(result)
		require.NoError(t, err)
		require.True(t, got.IsFound)
		require.Equal(t, TokenTransferFeeConfig{
			DestGasOverhead:            21000,
			DestBytesOverhead:          100,
			FinalityFeeUSDCents:        tlb.FromNanoTON(big.NewInt(50)),
			FastFinalityFeeUSDCents:    tlb.FromNanoTON(big.NewInt(60)),
			FinalityTransferFeeBps:     10,
			FastFinalityTransferFeeBps: 20,
			IsEnabled:                  true,
		}, got.Config)
	})

	t.Run("absent", func(t *testing.T) {
		result := ton.NewExecutionResult([]any{
			big.NewInt(0), big.NewInt(0), big.NewInt(0), big.NewInt(0),
			big.NewInt(0), big.NewInt(0), big.NewInt(0),
			big.NewInt(0), // presence discriminator: absent
		})

		got, err := GetTokenTransferFeeConfig.Decoder.Decode(result)
		require.NoError(t, err)
		require.False(t, got.IsFound)
	})
}

// Verifies the flattened TokenPool_Budget stack (lockOrBurn admission and safety, then
// releaseOrMint admission and safety).
func TestGetBudget_DecodesBudget(t *testing.T) {
	result := ton.NewExecutionResult([]any{big.NewInt(1), big.NewInt(2), big.NewInt(3), big.NewInt(4)})

	got, err := GetBudget.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, Budget{
		LockOrBurn:    LockOrBurnBudget{Admission: tlb.FromNanoTONU(1), Safety: tlb.FromNanoTONU(2)},
		ReleaseOrMint: ReleaseOrMintBudget{Admission: tlb.FromNanoTONU(3), Safety: tlb.FromNanoTONU(4)},
	}, got)
}

func testAddress(b byte) *address.Address {
	return address.NewAddress(0, 0, func() []byte {
		data := make([]byte, 32)
		data[31] = b
		return data
	}())
}

func mustDictRoot[K comparable, V any](t *testing.T, dict *tlbe.Dict[K, V]) *cell.Cell {
	t.Helper()
	raw, err := dict.AsDictionary()
	require.NoError(t, err)
	return raw.AsCell()
}

func TestGetAdminConfig_DecodesFlattenedStack(t *testing.T) {
	owner := testAddress(1)
	pendingOwner := testAddress(2)
	router := testAddress(3)
	rateLimitAdmin := testAddress(4)
	feeAdmin := testAddress(5)
	master := testAddress(6)
	hook := testAddress(7)

	walletCode := cell.BeginCell().MustStoreUInt(0xc0de, 16).EndCell()

	ownableCell, err := tlb.ToCell(ownable2step.Storage{Owner: owner, PendingOwner: pendingOwner})
	require.NoError(t, err)
	dynamicCell, err := tlb.ToCell(DynamicConfig{
		Router:         router,
		RateLimitAdmin: rateLimitAdmin,
		FeeAdmin:       feeAdmin,
	})
	require.NoError(t, err)

	namespaces := tlbe.NewDict(map[uint32]struct{}{42: {}})
	namespacesRoot := mustDictRoot(t, namespaces)
	masterSlice := cell.BeginCell().MustStoreAddr(master).ToSlice()
	hookSlice := cell.BeginCell().MustStoreAddr(hook).ToSlice()

	result := ton.NewExecutionResult([]any{
		ownableCell,      // 0: ownable Cell<Ownable2Step>
		dynamicCell,      // 1: dynamicConfig Cell<TokenPool_DynamicConfig>
		namespacesRoot,   // 2: allowedDepositNamespaces map<uint32,()>
		masterSlice,      // 3: jettonClient.masterAddress
		walletCode,       // 4: jettonClient.jettonWalletCode
		big.NewInt(1234), // 5: allowedFinalityConfig
		hookSlice,        // 6: advancedPoolHooks
		nil,              // 7: advancedPoolHooksPrevious
	})

	got, err := GetAdminConfig.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, owner, got.Ownable.Owner)
	require.Equal(t, pendingOwner, got.Ownable.PendingOwner)
	require.Equal(t, router, got.DynamicConfig.Router)
	require.Equal(t, rateLimitAdmin, got.DynamicConfig.RateLimitAdmin)
	require.Equal(t, feeAdmin, got.DynamicConfig.FeeAdmin)
	_, hasNamespace := got.AllowedDepositNamespaces.Get(42)
	require.True(t, hasNamespace)
	require.Equal(t, master, got.JettonClient.MasterAddress)
	require.Equal(t, walletCode.Hash(), got.JettonClient.JettonWalletCode.Hash())
	require.Equal(t, uint32(1234), got.AllowedFinalityConfig)
	require.Equal(t, hook, got.AdvancedPoolHooks)
	require.Nil(t, got.AdvancedPoolHooksPrevious)
}

func TestGetAdminConfig_AbsentOptionalFields(t *testing.T) {
	owner := testAddress(1)
	router := testAddress(2)
	master := testAddress(3)
	walletCode := cell.BeginCell().EndCell()

	ownableCell, err := tlb.ToCell(ownable2step.Storage{Owner: owner})
	require.NoError(t, err)
	dynamicCell, err := tlb.ToCell(DynamicConfig{Router: router})
	require.NoError(t, err)
	masterSlice := cell.BeginCell().MustStoreAddr(master).ToSlice()

	result := ton.NewExecutionResult([]any{
		ownableCell,
		dynamicCell,
		nil, // empty allowedDepositNamespaces
		masterSlice,
		walletCode,
		big.NewInt(0),
		nil,
		nil,
	})

	got, err := GetAdminConfig.Decoder.Decode(result)
	require.NoError(t, err)
	require.Empty(t, got.AllowedDepositNamespaces.AsMap())
	require.Nil(t, got.AdvancedPoolHooks)
	require.Nil(t, got.AdvancedPoolHooksPrevious)
}

func testRateLimiterPair(tokens uint32) RateLimiterPair {
	n := int64(tokens)
	bucket := RateLimiterTokenBucket{
		Tokens:      tlbe.BigUint128{Int: big.NewInt(n)},
		LastUpdated: tokens,
		IsEnabled:   true,
		Capacity:    tlbe.BigUint128{Int: big.NewInt(n + 1)},
		Rate:        tlbe.BigUint128{Int: big.NewInt(n + 2)},
	}
	return RateLimiterPair{Outbound: bucket, Inbound: bucket}
}

func TestGetRemoteChainConfig_DecodesWideNullable(t *testing.T) {
	remoteToken := common.CrossChainAddress{0x01, 0x02, 0x03}
	remoteTokenCell, err := remoteToken.ToCell()
	require.NoError(t, err)

	poolAddr := common.CrossChainAddress{0x0a, 0x0b}
	key := *tlbe.NewUint256(big.NewInt(7))
	pools := tlbe.NewDict(map[tlbe.Uint256]RemotePoolRef{
		key: {Address: poolAddr},
	})
	poolsRoot := mustDictRoot(t, pools)

	rateLimiters := testRateLimiterPair(11)
	rateLimitersCell, err := tlb.ToCell(rateLimiters)
	require.NoError(t, err)
	fastFinality := testRateLimiterPair(22)
	fastFinalityCell, err := tlb.ToCell(fastFinality)
	require.NoError(t, err)

	result := ton.NewExecutionResult([]any{
		remoteTokenCell,  // 0
		poolsRoot,        // 1
		rateLimitersCell, // 2
		fastFinalityCell, // 3
		big.NewInt(-1),   // 4: presence discriminator
	})

	got, err := GetRemoteChainConfig.Decoder.Decode(result)
	require.NoError(t, err)
	require.True(t, got.IsFound)

	decodedToken, err := got.Config.RemoteTokenAddress.ToValue()
	require.NoError(t, err)
	require.Equal(t, remoteToken, decodedToken)

	poolRef, ok := got.Config.RemotePools.Get(key)
	require.True(t, ok)
	require.Equal(t, poolAddr, poolRef.Address)

	require.Equal(t, rateLimiters, got.Config.RateLimiters)
	require.Equal(t, fastFinality, got.Config.FastFinalityRateLimiters)
}

func TestGetRemoteChainConfig_Absent(t *testing.T) {
	result := ton.NewExecutionResult([]any{
		nil, nil, nil, nil,
		big.NewInt(0), // presence discriminator: absent
	})

	got, err := GetRemoteChainConfig.Decoder.Decode(result)
	require.NoError(t, err)
	require.False(t, got.IsFound)
}

func TestGetFeeAmount_DecodesCoins(t *testing.T) {
	result := ton.NewExecutionResult([]any{big.NewInt(1234)})

	got, err := GetFeeAmount.Decoder.Decode(result)
	require.NoError(t, err)
	require.Equal(t, tlb.FromNanoTONU(1234), got)
}

func TestGetFeeAmount_Encoder(t *testing.T) {
	receiver := common.CrossChainAddress{0x09, 0x08}
	receiverCell, err := receiver.ToCell()
	require.NoError(t, err)

	details := LockOrBurnTransferDetails{
		Receiver:            receiverCell,
		RemoteChainSelector: 123,
		OriginalSender:      testAddress(1),
		Amount:              tlb.FromNanoTONU(456),
		LocalToken:          testAddress(2),
	}

	params, err := GetFeeAmount.Encoder.Encode(GetFeeAmountArgs{
		Transfer:                details,
		RequestedFinalityConfig: 99,
	})
	require.NoError(t, err)
	require.Len(t, params, 2)

	transferCell, ok := params[0].(*cell.Cell)
	require.True(t, ok)
	require.Equal(t, uint32(99), params[1])

	var decoded LockOrBurnTransferDetails
	require.NoError(t, tlb.LoadFromCell(&decoded, transferCell.MustBeginParse()))
	require.Equal(t, details.RemoteChainSelector, decoded.RemoteChainSelector)
	require.Equal(t, details.OriginalSender, decoded.OriginalSender)
	require.Equal(t, details.Amount, decoded.Amount)
	require.Equal(t, details.LocalToken, decoded.LocalToken)
}

func TestGetters_ArgumentEncoders(t *testing.T) {
	t.Run("isRemotePool", func(t *testing.T) {
		addr := common.CrossChainAddress{0x01, 0x02, 0x03}
		params, err := GetIsRemotePool.Encoder.Encode(IsRemotePoolArgs{
			RemoteChainSelector: 5,
			RemotePoolAddress:   addr,
		})
		require.NoError(t, err)
		require.Len(t, params, 2)
		require.Equal(t, uint64(5), params[0])

		poolCell, ok := params[1].(*cell.Cell)
		require.True(t, ok)
		got, err := loadCrossChainAddressFromCell(poolCell)
		require.NoError(t, err)
		require.Equal(t, addr, got)

		stack := tlb.Stack{}
		stack.Push(params[1])
		stack.Push(params[0])
		_, err = stack.ToCell()
		require.NoError(t, err)
	})

	t.Run("getCurrentRateLimiterState", func(t *testing.T) {
		params, err := GetCurrentRateLimiterState.Encoder.Encode(GetCurrentRateLimiterStateArgs{
			RemoteChainSelector: 5,
			FastFinality:        true,
		})
		require.NoError(t, err)
		require.Equal(t, []any{uint64(5), int64(-1)}, params)

		params, err = GetCurrentRateLimiterState.Encoder.Encode(GetCurrentRateLimiterStateArgs{
			RemoteChainSelector: 5,
			FastFinality:        false,
		})
		require.NoError(t, err)
		require.Equal(t, []any{uint64(5), int64(0)}, params)

		stack := tlb.Stack{}
		for i := len(params) - 1; i >= 0; i-- {
			stack.Push(params[i])
		}
		_, err = stack.ToCell()
		require.NoError(t, err)
	})
}

func TestFacilityMetadataGetters(t *testing.T) {
	facilityID, err := GetFacilityID.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(450)}))
	require.NoError(t, err)
	require.Equal(t, uint16(450), facilityID)

	errorCode, err := GetErrorCode.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(45001)}))
	require.NoError(t, err)
	require.Equal(t, uint16(45001), errorCode)

	params, err := tvm.DefaultArgsEncoder[uint16]().Encode(uint16(7))
	require.NoError(t, err)
	require.Equal(t, []any{uint16(7)}, params)
}

func TestGetIsSupportedToken_DecodesBool(t *testing.T) {
	got, err := GetIsSupportedToken.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(-1)}))
	require.NoError(t, err)
	require.True(t, got)

	got, err = GetIsSupportedToken.Decoder.Decode(ton.NewExecutionResult([]any{big.NewInt(0)}))
	require.NoError(t, err)
	require.False(t, got)
}
