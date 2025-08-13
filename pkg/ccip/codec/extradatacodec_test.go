package codec

import (
	"encoding/binary"
	"math/big"
	"testing"

	"github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

func Test_decodeExtraArgs(t *testing.T) {
	extraDataDecoder := &ExtraDataDecoder{}
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
		extraArgs := onramp.SVMExtraArgsV1{
			ComputeUnits:             destGasAmount,
			AccountIsWritableBitmap:  bitmap,
			AllowOutOfOrderExecution: false,
			TokenReceiver:            solana.SystemProgramID.Bytes(),
			Accounts: common.SnakeRef[common.SnakeBytes]{
				solana.SystemProgramID.Bytes(),
				solana.SystemProgramID.Bytes(),
			},
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
}
