package onramp

import (
	"math/big"
	"testing"

	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

func TestGenericExtraArgsV2_TLBEncodeDecode(t *testing.T) {
	orig := GenericExtraArgsV2{
		GasLimit:                 big.NewInt(123456789),
		AllowOutOfOrderExecution: true,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded GenericExtraArgsV2
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.GasLimit, decoded.GasLimit)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
}

func TestSVMExtraArgsV1_ToCellAndLoadFromCell(t *testing.T) {
	solanaAddr1, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	solanaAddr2, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	accountList := common.SnakeRef[common.SnakeBytes]{
		solanaAddr1.PublicKey().Bytes(),
		solanaAddr2.PublicKey().Bytes(),
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
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ComputeUnits, decoded.ComputeUnits)
	require.Equal(t, orig.AccountIsWritableBitmap, decoded.AccountIsWritableBitmap)
	require.Equal(t, orig.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
	require.Equal(t, orig.TokenReceiver, decoded.TokenReceiver)
	require.Len(t, orig.Accounts, len(decoded.Accounts))
	for i, addr := range orig.Accounts {
		require.Equal(t, addr, decoded.Accounts[i])
	}
}

func TestOwnable2Step(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// case 1 with no pending owner
	orig := Ownable2Step{
		Owner:        addr,
		PendingOwner: nil,
	}
	cell, err := tlb.ToCell(orig)
	require.NoError(t, err)
	var decoded Ownable2Step
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.Owner, decoded.Owner)
	require.Equal(t, orig.PendingOwner, decoded.PendingOwner)

	// case 2 with pending owner
	orig2 := Ownable2Step{
		Owner:        addr,
		PendingOwner: addr,
	}
	cell, err = tlb.ToCell(orig2)
	require.NoError(t, err)
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
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
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
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
		Ownable: Ownable2Step{
			Owner: dummyAddr,
		},
		ChainSelector: 42,
		Config: common.SnakeData[DynamicConfig]{
			{
				FeeAggregator:  dummyAddr,
				FeeQuoter:      dummyAddr,
				AllowListAdmin: dummyAddr,
			},
			{
				FeeAggregator:  dummyAddr,
				FeeQuoter:      dummyAddr,
				AllowListAdmin: dummyAddr,
			},
		},
		DestChainConfigs: destConfigMap,
	}

	c, err = tlb.ToCell(s)
	require.NoError(t, err)
	var decoded Storage
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, s.Ownable.Owner, decoded.Ownable.Owner)
	require.Equal(t, s.ChainSelector, decoded.ChainSelector)
	require.Len(t, s.Config, len(decoded.Config))
	for i := range s.Config {
		require.Equal(t, s.Config[i].FeeAggregator, decoded.Config[i].FeeAggregator)
		require.Equal(t, s.Config[i].FeeQuoter, decoded.Config[i].FeeQuoter)
		require.Equal(t, s.Config[i].AllowListAdmin, decoded.Config[i].AllowListAdmin)
	}
	require.NotNil(t, decoded.DestChainConfigs)
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
