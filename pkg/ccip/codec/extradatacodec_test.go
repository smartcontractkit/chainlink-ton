package codec

import (
	"encoding/binary"
	"math/big"
	"testing"

	"github.com/block-vision/sui-go-sdk/models"
	"github.com/block-vision/sui-go-sdk/transaction"
	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

func Test_decodeExtraArgs(t *testing.T) {
	extraDataDecoder := NewExtraDataDecoder()
	t.Run("decode dest exec data into map svm", func(t *testing.T) {
		destGasAmount := uint32(10000)
		encoded := make([]byte, 4)
		binary.BigEndian.PutUint32(encoded, destGasAmount)
		output, err := extraDataDecoder.DecodeDestExecDataToMap(encoded)
		require.NoError(t, err)

		decoded, exist := output[tvmDestExecDataKey]
		require.True(t, exist)
		require.Equal(t, destGasAmount, decoded)
	})

	t.Run("decode extra args into map svm", func(t *testing.T) {
		destGasAmount := uint32(10000)
		bitmap := uint64(5)
		accountList := common.SnakedCell[onramp.Account256]{
			{Value: solana.SystemProgramID.Bytes()},
			{Value: solana.SystemProgramID.Bytes()},
		}
		extraArgs := onramp.SVMExtraArgsV1{
			ComputeUnits:             destGasAmount,
			AccountIsWritableBitmap:  bitmap,
			AllowOutOfOrderExecution: false,
			TokenReceiver:            solana.SystemProgramID.Bytes(),
			Accounts:                 accountList,
		}

		c, err := tlb.ToCell(extraArgs)
		require.NoError(t, err)

		output, err := extraDataDecoder.DecodeExtraArgsToMap(c.ToBOC())
		require.NoError(t, err)
		require.Len(t, output, 5)

		gasLimit, exist := output["ComputeUnits"]
		require.True(t, exist)
		require.Equal(t, destGasAmount, gasLimit)

		writableBitmap, exist := output["AccountIsWritableBitmap"]
		require.True(t, exist)
		require.Equal(t, bitmap, writableBitmap)

		ooe, exist := output["AllowOutOfOrderExecution"]
		require.True(t, exist)
		require.Equal(t, false, ooe)

		tr, exist := output["TokenReceiver"]
		require.True(t, exist)
		var expectedReceiver [32]byte
		copy(expectedReceiver[:], solana.SystemProgramID.Bytes())
		require.Equal(t, expectedReceiver, tr)

		accounts, exist := output["Accounts"]
		require.True(t, exist)
		accountsArr, ok := accounts.([][32]byte)
		require.True(t, ok, "expected [][32]byte, got %T", accounts)
		require.Len(t, accountsArr, 2)
		var expectedAccount [32]byte
		copy(expectedAccount[:], solana.SystemProgramID.Bytes())
		require.Equal(t, expectedAccount, accountsArr[0])
		require.Equal(t, expectedAccount, accountsArr[1])
	})

	t.Run("decode extra args into map evm", func(t *testing.T) {
		extraArgs := onramp.GenericExtraArgsV2{
			GasLimit:                 big.NewInt(5000),
			AllowOutOfOrderExecution: false,
		}

		c, err := tlb.ToCell(extraArgs)
		require.NoError(t, err)

		output, err := extraDataDecoder.DecodeExtraArgsToMap(c.ToBOC())
		require.NoError(t, err)
		require.Len(t, output, 2)

		gasLimit, exist := output["GasLimit"]
		require.True(t, exist)
		require.Equal(t, big.NewInt(5000), gasLimit)

		ooe, exist := output["AllowOutOfOrderExecution"]
		require.True(t, exist)
		require.Equal(t, false, ooe)
	})

	t.Run("decode extra args into map sui", func(t *testing.T) {
		gasLimit := big.NewInt(50000)
		suiAddr1 := models.SuiAddress("0x8bc59c2842f436c1221691a359dc42941c1f25eca13f4bad79f7b00e8df4b968")
		suiAddr1Bytes, err := transaction.ConvertSuiAddressStringToBytes(suiAddr1)
		require.NoError(t, err)

		suiAddr2 := models.SuiAddress("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
		suiAddr2Bytes, err := transaction.ConvertSuiAddressStringToBytes(suiAddr2)
		require.NoError(t, err)

		suiReceiver := models.SuiAddress("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
		suiReceiverBytes, err := transaction.ConvertSuiAddressStringToBytes(suiReceiver)
		require.NoError(t, err)

		receiverObjectIDs := common.SnakedCell[onramp.Account256]{
			{Value: suiAddr1Bytes[:]},
			{Value: suiAddr2Bytes[:]},
		}
		extraArgs := onramp.SuiExtraArgsV1{
			GasLimit:                 gasLimit,
			AllowOutOfOrderExecution: true,
			TokenReceiver:            suiReceiverBytes[:],
			ReceiverObjectIDs:        receiverObjectIDs,
		}

		c, err := tlb.ToCell(extraArgs)
		require.NoError(t, err)

		output, err := extraDataDecoder.DecodeExtraArgsToMap(c.ToBOC())
		require.NoError(t, err)
		require.Len(t, output, 4)

		gl, exist := output["GasLimit"]
		require.True(t, exist)
		require.Equal(t, gasLimit, gl)

		ooe, exist := output["AllowOutOfOrderExecution"]
		require.True(t, exist)
		require.Equal(t, true, ooe)

		tr, exist := output["TokenReceiver"]
		require.True(t, exist)
		require.Equal(t, [32]byte(*suiReceiverBytes), tr)

		roids, exist := output["ReceiverObjectIDs"]
		require.True(t, exist)
		roidsArr, ok := roids.([][32]byte)
		require.True(t, ok, "expected [][32]byte, got %T", roids)
		require.Len(t, roidsArr, 2)
		require.Equal(t, [32]byte(*suiAddr1Bytes), roidsArr[0])
		require.Equal(t, [32]byte(*suiAddr2Bytes), roidsArr[1])
	})
}
