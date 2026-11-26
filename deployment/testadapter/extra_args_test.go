package testadapter

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ccip/deployment/common/extraargs"
	"github.com/smartcontractkit/chainlink-ccip/deployment/testadapters"

	cciplibonramp "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
)

// genericExtraArgsV2BOC builds the TL-B by hand, independently of the bindings:
// #181dcf10 gasLimit:(Maybe uint256) allowOutOfOrderExecution:Bool.
func genericExtraArgsV2BOC(t *testing.T, gasLimit *big.Int, allowOOO bool) []byte {
	t.Helper()
	b := cell.BeginCell()
	require.NoError(t, b.StoreUInt(0x181dcf10, 32))
	require.NoError(t, b.StoreBoolBit(gasLimit != nil))
	if gasLimit != nil {
		require.NoError(t, b.StoreBigUInt(gasLimit, 256))
	}
	require.NoError(t, b.StoreBoolBit(allowOOO))
	return b.EndCell().ToBOC()
}

func loadBOC(t *testing.T, boc []byte, v any) {
	t.Helper()
	c, err := cell.FromBOC(boc)
	require.NoError(t, err)
	slice, err := c.BeginParse()
	require.NoError(t, err)
	require.NoError(t, tlb.LoadFromCell(v, slice))
}

func TestTONAdapterExtraArgsData(t *testing.T) {
	a := &TONAdapter{}

	t.Run("defaults", func(t *testing.T) {
		data, err := a.ExtraArgsData(nil)
		require.NoError(t, err)
		assert.Equal(t, testadapters.EVMExtraArgsV2Data{GasLimit: big.NewInt(100_000_000), AllowOutOfOrderExecution: true}, data)
	})

	t.Run("overrides", func(t *testing.T) {
		data, err := a.ExtraArgsData(nil,
			testadapters.NewGasLimitExtraArg(big.NewInt(1)),
			testadapters.NewOutOfOrderExtraArg(false),
			testadapters.NewFinalityExtraArg(1), // not used by TON destinations
		)
		require.NoError(t, err)
		assert.Equal(t, testadapters.EVMExtraArgsV2Data{GasLimit: big.NewInt(1), AllowOutOfOrderExecution: false}, data)
	})

	t.Run("nil gas limit", func(t *testing.T) {
		_, err := a.ExtraArgsData(nil, testadapters.NewGasLimitExtraArg(nil))
		require.ErrorContains(t, err, "gas limit must not be nil")
	})
}

func TestTONAdapterBuildEVMExtraArgsV2(t *testing.T) {
	a := &TONAdapter{}

	for _, tc := range []struct {
		name     string
		gasLimit *big.Int
		allowOOO bool
	}{
		{"gas limit and OOO", big.NewInt(100_000), true},
		{"OOO false", big.NewInt(100_000), false},
		{"max uint256 gas limit", new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1)), true},
		{"no gas limit", nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := a.BuildEVMExtraArgsV2(testadapters.EVMExtraArgsV2Data{GasLimit: tc.gasLimit, AllowOutOfOrderExecution: tc.allowOOO})
			require.NoError(t, err)
			assert.Equal(t, genericExtraArgsV2BOC(t, tc.gasLimit, tc.allowOOO), got)

			var decoded cciplibonramp.GenericExtraArgsV2
			loadBOC(t, got, &decoded)
			assert.Equal(t, tc.allowOOO, decoded.AllowOutOfOrderExecution)
			if tc.gasLimit == nil {
				assert.Nil(t, decoded.GasLimit)
			} else {
				require.NotNil(t, decoded.GasLimit)
				assert.Zero(t, tc.gasLimit.Cmp(decoded.GasLimit.Int))
			}
		})
	}

	t.Run("gas limit larger than uint256", func(t *testing.T) {
		_, err := a.BuildEVMExtraArgsV2(testadapters.EVMExtraArgsV2Data{GasLimit: new(big.Int).Lsh(big.NewInt(1), 256)})
		require.Error(t, err)
	})

	t.Run("wrong data type", func(t *testing.T) {
		_, err := a.BuildEVMExtraArgsV2(testadapters.SVMExtraArgsV1Data{})
		require.ErrorContains(t, err, "provider is not a EVMExtraArgsV2Data")
	})
}

func TestTONAdapterBuildSVMExtraArgsV1(t *testing.T) {
	a := &TONAdapter{}
	data := testadapters.SVMExtraArgsV1Data{
		ComputeUnits:             100_000,
		AccountIsWritableBitmap:  0b11,
		AllowOutOfOrderExecution: true,
		TokenReceiver:            [32]byte{1},
		Accounts:                 [][32]byte{{2}, {3}, {4}},
	}

	got, err := a.BuildSVMExtraArgsV1(data)
	require.NoError(t, err)

	var decoded cciplibonramp.SVMExtraArgsV1
	loadBOC(t, got, &decoded)
	assert.Equal(t, data.ComputeUnits, decoded.ComputeUnits)
	assert.Equal(t, data.AccountIsWritableBitmap, decoded.AccountIsWritableBitmap)
	assert.Equal(t, data.AllowOutOfOrderExecution, decoded.AllowOutOfOrderExecution)
	assert.Equal(t, data.TokenReceiver[:], decoded.TokenReceiver)
	require.Len(t, decoded.Accounts, len(data.Accounts))
	for i, acc := range data.Accounts {
		assert.Equal(t, acc[:], decoded.Accounts[i].Value)
	}

	_, err = a.BuildSVMExtraArgsV1(testadapters.EVMExtraArgsV2Data{})
	require.ErrorContains(t, err, "provider is not a SVMExtraArgsV1Data")
}

func TestTONAdapterGetExtraArgs(t *testing.T) {
	a := &TONAdapter{}

	t.Run("EVM source", func(t *testing.T) {
		got, err := a.GetExtraArgs(nil, chain_selectors.FamilyEVM)
		require.NoError(t, err)
		want, err := extraargs.SerializeClientGenericExtraArgsV2(extraargs.ClientGenericExtraArgsV2{
			GasLimit:                 big.NewInt(100_000_000),
			AllowOutOfOrderExecution: true,
		})
		require.NoError(t, err)
		assert.Equal(t, want, got)
	})

	t.Run("TON source", func(t *testing.T) {
		got, err := a.GetExtraArgs(nil, chain_selectors.FamilyTon)
		require.NoError(t, err)
		assert.Equal(t, genericExtraArgsV2BOC(t, big.NewInt(100_000_000), true), got)
	})

	t.Run("Solana source", func(t *testing.T) {
		got, err := a.GetExtraArgs(nil, chain_selectors.FamilySolana, testadapters.NewOutOfOrderExtraArg(false))
		require.NoError(t, err)
		// tag || borsh(uint128 LE 100_000_000, bool false)
		assert.Equal(t, "181dcf10"+"00e1f505000000000000000000000000"+"00", hex.EncodeToString(got))
	})

	t.Run("Solana source with gas limit over uint64", func(t *testing.T) {
		_, err := a.GetExtraArgs(nil, chain_selectors.FamilySolana, testadapters.NewGasLimitExtraArg(new(big.Int).Lsh(big.NewInt(1), 64)))
		require.ErrorContains(t, err, "does not fit in uint64")
	})

	for _, family := range []string{chain_selectors.FamilyEVM, chain_selectors.FamilyTon, chain_selectors.FamilySolana} {
		t.Run(family+" source with nil gas limit", func(t *testing.T) {
			_, err := a.GetExtraArgs(nil, family, testadapters.NewGasLimitExtraArg(nil))
			require.ErrorContains(t, err, "gas limit must not be nil")
		})
	}

	t.Run("unsupported source", func(t *testing.T) {
		_, err := a.GetExtraArgs(nil, chain_selectors.FamilyAptos)
		require.ErrorContains(t, err, "unsupported source family")
	})
}

func TestTONToTONExtraArgs(t *testing.T) {
	src, dest := &TONAdapter{}, &TONAdapter{}
	got, err := testadapters.BuildExtraArgs(src, dest, nil)
	require.NoError(t, err)
	assert.Equal(t, genericExtraArgsV2BOC(t, big.NewInt(100_000_000), true), got)
}
