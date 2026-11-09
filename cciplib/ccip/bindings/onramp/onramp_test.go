package onramp

import (
	"hash/crc32"
	"math/big"
	"testing"

	"github.com/block-vision/sui-go-sdk/models"
	"github.com/block-vision/sui-go-sdk/transaction"
	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
)

func TestTopicCRC32Values(t *testing.T) {
	tests := []struct {
		name     string
		topic    string
		expected uint32
	}{
		{
			name:     "TopicCCIPMessageSent",
			topic:    "CCIPMessageSent",
			expected: TopicCCIPMessageSent,
		},
		{
			name:     "TopicDestChainSelectorAdded",
			topic:    "DestChainSelectorAdded",
			expected: TopicDestChainSelectorAdded,
		},
		{
			name:     "TopicDestChainConfigUpdated",
			topic:    "DestChainConfigUpdated",
			expected: TopicDestChainConfigUpdated,
		},
		{
			name:     "TopicConfigSet",
			topic:    "ConfigSet",
			expected: TopicConfigSet,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			computed := crc32.ChecksumIEEE([]byte(tt.topic))
			require.Equal(t, tt.expected, computed, "CRC32 mismatch for %s: expected 0x%08X, got 0x%08X", tt.topic, tt.expected, computed)
		})
	}
}

func TestGenericExtraArgsV2_TLBEncodeDecode(t *testing.T) {
	orig := GenericExtraArgsV2{
		GasLimit:                 big.NewInt(123456789),
		AllowOutOfOrderExecution: true,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded GenericExtraArgsV2
	err = tlb.Parse(&decoded, c)
	require.NoError(t, err)
	require.Equal(t, orig.GasLimit, decoded.GasLimit)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
}

func TestSVMExtraArgsV1_ToCellAndLoadFromCell(t *testing.T) {
	solanaAddr1, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	solanaAddr2, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	// Solana public keys are 32 bytes, matching Account256's 256-bit expectation
	accountList := common.SnakedCell[Account256]{
		{Value: solanaAddr1.PublicKey().Bytes()},
		{Value: solanaAddr2.PublicKey().Bytes()},
	}

	orig := SVMExtraArgsV1{
		ComputeUnits:             42,
		AccountIsWritableBitmap:  0xDEADBEEF,
		AllowOutOfOrderExecution: false,
		TokenReceiver:            solanaAddr1.PublicKey().Bytes(),
		Accounts:                 accountList,
	}

	cell, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded SVMExtraArgsV1
	err = tlb.Parse(&decoded, cell)
	require.NoError(t, err)
	require.Equal(t, orig.ComputeUnits, decoded.ComputeUnits)
	require.Equal(t, orig.AccountIsWritableBitmap, decoded.AccountIsWritableBitmap)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
	require.Equal(t, orig.TokenReceiver, decoded.TokenReceiver)
	require.Len(t, orig.Accounts, len(decoded.Accounts))
	for i, acc := range orig.Accounts {
		require.Equal(t, acc.Value, decoded.Accounts[i].Value)
	}
}

func TestSuiExtraArgsV1_ToCellAndLoadFromCell(t *testing.T) {
	// Sui object IDs are 32 bytes, matching Account256's 256-bit expectation
	suiAddr1 := models.SuiAddress("0x8bc59c2842f436c1221691a359dc42941c1f25eca13f4bad79f7b00e8df4b968")
	suiAddr1Bytes, err := transaction.ConvertSuiAddressStringToBytes(suiAddr1)
	require.NoError(t, err)

	suiAddr2 := models.SuiAddress("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
	suiAddr2Bytes, err := transaction.ConvertSuiAddressStringToBytes(suiAddr2)
	require.NoError(t, err)

	receiverObjectIDs := common.SnakedCell[Account256]{
		{Value: suiAddr1Bytes[:]},
		{Value: suiAddr2Bytes[:]},
	}

	orig := SuiExtraArgsV1{
		GasLimit:                 big.NewInt(50000),
		AllowOutOfOrderExecution: true,
		TokenReceiver:            suiAddr1Bytes[:],
		ReceiverObjectIDs:        receiverObjectIDs,
	}

	cell, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded SuiExtraArgsV1
	err = tlb.Parse(&decoded, cell)
	require.NoError(t, err)
	require.Equal(t, orig.GasLimit, decoded.GasLimit)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
	require.Equal(t, orig.TokenReceiver, decoded.TokenReceiver)
	require.Len(t, orig.ReceiverObjectIDs, len(decoded.ReceiverObjectIDs))
	for i, objID := range orig.ReceiverObjectIDs {
		require.Equal(t, objID.Value, decoded.ReceiverObjectIDs[i].Value)
	}
}

func TestOwnable2Step(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// case 1 with no pending owner
	orig := ownable2step.Storage{
		Owner:        addr,
		PendingOwner: address.NewAddressNone(),
	}
	cell, err := tlb.ToCell(orig)
	require.NoError(t, err)
	var decoded ownable2step.Storage
	err = tlb.Parse(&decoded, cell)
	require.NoError(t, err)
	require.Equal(t, orig.Owner, decoded.Owner)
	require.Equal(t, orig.PendingOwner, decoded.PendingOwner)

	// case 2 with pending owner
	orig2 := ownable2step.Storage{
		Owner:        addr,
		PendingOwner: addr,
	}
	cell, err = tlb.ToCell(orig2)
	require.NoError(t, err)
	err = tlb.Parse(&decoded, cell)
	require.NoError(t, err)
	require.Equal(t, orig2.Owner, decoded.Owner)
	require.Equal(t, orig2.PendingOwner, decoded.PendingOwner)
}

func TestDestChainConfig(t *testing.T) {
	routerAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Create a dictionary for AllowedSender
	configDict := cell.NewDict(267)
	k := cell.BeginCell()
	require.NoError(t, k.StoreAddr(routerAddr))
	v := cell.BeginCell()
	require.NoError(t, v.StoreBoolBit(true))
	err = configDict.Set(k.EndCell(), v.EndCell())
	require.NoError(t, err)

	dc := DestChainConfig{
		Router:           routerAddr,
		SequenceNumber:   123456789,
		AllowListEnabled: true,
		AllowedSender:    configDict,
	}

	c, err := tlb.ToCell(dc)
	require.NoError(t, err)
	var decoded DestChainConfig
	err = tlb.Parse(&decoded, c)
	require.NoError(t, err)
	require.Equal(t, dc.Router, decoded.Router)
	require.Equal(t, dc.SequenceNumber, decoded.SequenceNumber)
	require.Equal(t, dc.AllowListEnabled, decoded.AllowListEnabled)
	kv, err := dc.AllowedSender.LoadAll()
	require.NoError(t, err)

	loadedKV, err := decoded.AllowedSender.LoadAll()
	require.NoError(t, err)
	require.Len(t, kv, len(loadedKV))
	for k, v := range kv {
		loadedV := loadedKV[k]
		require.Equal(t, v, loadedV, "Value for key %s does not match", k)
	}
}

func TestStorage(t *testing.T) {
	dummyAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Create a dictionary for AllowedSender
	configDict := cell.NewDict(267)
	k := cell.BeginCell()
	require.NoError(t, k.StoreAddr(dummyAddr))
	v := cell.BeginCell()
	require.NoError(t, v.StoreBoolBit(true))
	err = configDict.Set(k.EndCell(), v.EndCell())
	require.NoError(t, err)
	dc := DestChainConfig{
		Router:           dummyAddr,
		SequenceNumber:   123456789,
		AllowListEnabled: true,
		AllowedSender:    configDict,
	}

	destConfigMap := cell.NewDict(64)
	c, err := tlb.ToCell(dc)
	require.NoError(t, err)
	k = cell.BeginCell()
	require.NoError(t, k.StoreUInt(uint64(10), 64)) // Example chain selector
	err = destConfigMap.Set(k.EndCell(), c)
	require.NoError(t, err)

	s := Storage{
		ID: 43,
		Ownable: ownable2step.Storage{
			Owner: dummyAddr,
		},
		StaticConfig: StaticConfig{
			ChainSelector:      42,
			TokenAdminRegistry: dummyAddr,
		},
		Config: DynamicConfig{
			FeeAggregator:  dummyAddr,
			FeeQuoter:      dummyAddr,
			AllowListAdmin: dummyAddr,
			Reserve:        tlb.MustFromTON("0.05"),
		},
		DestChainConfigs:       destConfigMap,
		PendingFeeReservations: tlb.MustFromTON("0.01"),
	}

	c, err = tlb.ToCell(s)
	require.NoError(t, err)
	var decoded Storage
	err = tlb.Parse(&decoded, c)
	require.NoError(t, err)
	require.Equal(t, s.ID, decoded.ID)
	require.Equal(t, s.Ownable.Owner, decoded.Ownable.Owner)
	require.Equal(t, s.StaticConfig.ChainSelector, decoded.StaticConfig.ChainSelector)
	require.Equal(t, s.Config, decoded.Config)
	require.Equal(t, dummyAddr, decoded.StaticConfig.TokenAdminRegistry)
	require.NotNil(t, decoded.DestChainConfigs)
	require.NotNil(t, decoded.PendingFeeReservations)
	require.Equal(t, s.PendingFeeReservations, decoded.PendingFeeReservations)

	destConfigDecodedMap, err := decoded.DestChainConfigs.LoadAll()
	require.NoError(t, err)
	require.Len(t, destConfigDecodedMap, 1)
	for _, v := range destConfigDecodedMap {
		var destConfig DestChainConfig
		err = tlb.LoadFromCell(&destConfig, v.Value)
		require.NoError(t, err)
		require.Equal(t, dc.Router, destConfig.Router)
		require.Equal(t, dc.SequenceNumber, destConfig.SequenceNumber)
		require.Equal(t, dc.AllowListEnabled, destConfig.AllowListEnabled)

		allowedSenderMap, err := destConfig.AllowedSender.LoadAll()
		require.NoError(t, err)
		require.Len(t, allowedSenderMap, 1)
		for _, v := range allowedSenderMap {
			loadedAddr, err := v.Key.LoadAddr()
			require.NoError(t, err)
			require.Equal(t, dummyAddr.String(), loadedAddr.String())
			b, err := v.Value.LoadBoolBit()
			require.NoError(t, err)
			require.True(t, b)
		}
	}
}

// TestExecutorTokenTransferAddrNone covers the no-token-transfer case: the contract
// stores OnRamp_ExecutorTokenTransfer.sourcePoolAddress as an optional address, so the
// wire value is addr_none and must decode without error.
func TestExecutorTokenTransferAddrNone(t *testing.T) {
	emptyCrossChainAddress := cell.BeginCell().MustStoreUInt(0, 8).EndCell()
	lockOrBurnOut := cell.BeginCell().
		MustStoreRef(emptyCrossChainAddress).
		MustStoreRef(cell.BeginCell().EndCell()).
		EndCell()
	packed := cell.BeginCell().
		MustStoreAddr(nil). // addr_none
		MustStoreBigUInt(big.NewInt(0), 256).
		MustStoreRef(lockOrBurnOut).
		MustStoreRef(cell.BeginCell().EndCell()).
		EndCell()

	var decoded ExecutorTokenTransfer
	require.NoError(t, tlb.Parse(&decoded, packed))
	require.True(t, decoded.SourcePoolAddress == nil || decoded.SourcePoolAddress.IsAddrNone())
	require.Equal(t, 0, decoded.Amount.Sign())

	// And it round-trips back to the same cell.
	reencoded, err := tlb.ToCell(decoded)
	require.NoError(t, err)
	require.Equal(t, packed.Hash(), reencoded.Hash())
}

// TestExecutorFinishedWithErrorLayout decodes a body laid out as the contract's
// OnRamp_ExecutorFinishedWithError: queryID, executorID, destChainSelector, sender,
// errorCode (int32) and refund (Cell<coins>?).
func TestExecutorFinishedWithErrorLayout(t *testing.T) {
	sender := address.MustParseAddr("EQBkzHu36ZPPQz59NtCSeeani2ltUPLRhq8suIQxpPYdaZ9M")
	build := func(refund *cell.Cell) *cell.Cell {
		return cell.BeginCell().
			MustStoreUInt(OpcodeOnRampExecutorFinishedWithError, 32).
			MustStoreUInt(7, 64).
			MustStoreBigUInt(big.NewInt(42), 224).
			MustStoreUInt(5009297550715157269, 64).
			MustStoreAddr(sender).
			MustStoreInt(-14, 32). // negative TVM exit code
			MustStoreMaybeRef(refund).
			EndCell()
	}

	t.Run("with refund", func(t *testing.T) {
		packed := build(cell.BeginCell().MustStoreCoins(1_000_000).EndCell())

		var decoded ExecutorFinishedWithError
		require.NoError(t, tlb.Parse(&decoded, packed))
		require.Equal(t, uint64(7), decoded.QueryID)
		require.Equal(t, int64(42), decoded.ExecutorID.Int64())
		require.Equal(t, uint64(5009297550715157269), decoded.DestChainSelector)
		require.True(t, decoded.Sender.Equals(sender))
		require.Equal(t, int32(-14), decoded.ErrorCode)
		require.NotNil(t, decoded.Refund)
		require.Equal(t, uint64(1_000_000), decoded.Refund.Nano().Uint64())

		reencoded, err := tlb.ToCell(decoded)
		require.NoError(t, err)
		require.Equal(t, packed.Hash(), reencoded.Hash())
	})

	t.Run("without refund", func(t *testing.T) {
		packed := build(nil)

		var decoded ExecutorFinishedWithError
		require.NoError(t, tlb.Parse(&decoded, packed))
		require.Nil(t, decoded.Refund)

		reencoded, err := tlb.ToCell(decoded)
		require.NoError(t, err)
		require.Equal(t, packed.Hash(), reencoded.Hash())
	})
}

// TestExecutorFinishedSuccessfullyLayout decodes a body laid out as the contract's
// OnRamp_ExecutorFinishedSuccessfully: executorID, fee {coins, uint96}, msg ref,
// metadata {sender, value} and tokenTransfer (Cell<OnRamp_ExecutorTokenTransfer>?).
func TestExecutorFinishedSuccessfullyLayout(t *testing.T) {
	sender := address.MustParseAddr("EQBkzHu36ZPPQz59NtCSeeani2ltUPLRhq8suIQxpPYdaZ9M")
	pool := address.MustParseAddr("EQAvDfWFG0oYX19jwNDNBBL1rKNT9XfaGP9HyTb5nb2Eml6y")
	ccipSend := cell.BeginCell().MustStoreUInt(0xdead, 16).EndCell()
	destTokenAddress := cell.BeginCell().MustStoreUInt(20, 8).MustStoreSlice(make([]byte, 20), 160).EndCell()
	tokenTransfer := cell.BeginCell().
		MustStoreAddr(pool).
		MustStoreBigUInt(big.NewInt(1234), 256).
		MustStoreRef(cell.BeginCell().
			MustStoreRef(destTokenAddress).
			MustStoreRef(cell.BeginCell().MustStoreUInt(1, 8).EndCell()).
			EndCell()).
		MustStoreRef(cell.BeginCell().MustStoreUInt(90_000, 32).EndCell()).
		EndCell()
	build := func(tokenTransfer *cell.Cell) *cell.Cell {
		return cell.BeginCell().
			MustStoreUInt(OpcodeOnRampExecutorFinishedSuccessfully, 32).
			MustStoreBigUInt(big.NewInt(42), 224).
			MustStoreCoins(5_000).
			MustStoreBigUInt(big.NewInt(6_000), 96).
			MustStoreRef(ccipSend).
			MustStoreAddr(sender).
			MustStoreCoins(7_000).
			MustStoreMaybeRef(tokenTransfer).
			EndCell()
	}

	t.Run("with token transfer", func(t *testing.T) {
		packed := build(tokenTransfer)

		var decoded ExecutorFinishedSuccessfully
		require.NoError(t, tlb.Parse(&decoded, packed))
		require.Equal(t, int64(42), decoded.ExecutorID.Int64())
		require.Equal(t, uint64(5_000), decoded.Fee.FeeTokenAmount.Nano().Uint64())
		require.Equal(t, int64(6_000), decoded.Fee.FeeValueJuels.Int64())
		require.Equal(t, ccipSend.Hash(), decoded.Msg.Hash())
		require.True(t, decoded.Metadata.Sender.Equals(sender))
		require.Equal(t, uint64(7_000), decoded.Metadata.Value.Nano().Uint64())
		require.NotNil(t, decoded.TokenTransfer)
		require.True(t, decoded.TokenTransfer.SourcePoolAddress.Equals(pool))
		require.Equal(t, int64(1234), decoded.TokenTransfer.Amount.Int64())

		reencoded, err := tlb.ToCell(decoded)
		require.NoError(t, err)
		require.Equal(t, packed.Hash(), reencoded.Hash())
	})

	t.Run("without token transfer", func(t *testing.T) {
		packed := build(nil)

		var decoded ExecutorFinishedSuccessfully
		require.NoError(t, tlb.Parse(&decoded, packed))
		require.Nil(t, decoded.TokenTransfer)

		reencoded, err := tlb.ToCell(decoded)
		require.NoError(t, err)
		require.Equal(t, packed.Hash(), reencoded.Hash())
	})
}
