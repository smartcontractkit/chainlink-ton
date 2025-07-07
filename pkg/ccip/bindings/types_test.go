package bindings

import (
	"math/big"
	"testing"

	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
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

	accountList := [][]byte{
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
	require.Equal(t, len(orig.Accounts), len(decoded.Accounts))
	for i, addr := range orig.Accounts {
		require.Equal(t, addr, decoded.Accounts[i])
	}
}
