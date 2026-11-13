package chainaccessor

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

func TestSnakePayloadBytes(t *testing.T) {
	t.Run("nil cell", func(t *testing.T) {
		got, err := snakePayloadBytes(nil)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("empty cell", func(t *testing.T) {
		got, err := snakePayloadBytes(tvm.EmptyCell)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("single cell payload", func(t *testing.T) {
		payload := make([]byte, 32)
		for i := range payload {
			payload[i] = byte(i)
		}
		c, err := common.SnakeBytes(payload).ToCell()
		require.NoError(t, err)
		require.Equal(t, uint(0), c.RefsNum())

		got, err := snakePayloadBytes(c)
		require.NoError(t, err)
		require.Equal(t, payload, []byte(got))
	})

	t.Run("multi cell snake payload is not truncated", func(t *testing.T) {
		// 300 bytes spans three cells, so the root cell alone holds only 127 of them.
		payload := make([]byte, 300)
		for i := range payload {
			payload[i] = byte(i % 251)
		}
		c, err := common.SnakeBytes(payload).ToCell()
		require.NoError(t, err)
		require.Equal(t, uint(1), c.RefsNum(), "payload must spill into a ref")

		got, err := snakePayloadBytes(c)
		require.NoError(t, err)
		require.Equal(t, payload, []byte(got))
	})

	t.Run("non byte aligned cell is padded by the shared decoder", func(t *testing.T) {
		// common.SnakeBytes pads partial trailing bytes; the OnRamp rejects such
		// payloads via snakedBytesLen before emitting the event, so this is only
		// documenting the shared decoder's behavior.
		c := cell.BeginCell().MustStoreUInt(0xAB, 12).EndCell()

		got, err := snakePayloadBytes(c)
		require.NoError(t, err)
		require.Equal(t, []byte{0x0A, 0xB0}, []byte(got))
	})

	t.Run("branching cell is rejected", func(t *testing.T) {
		c := cell.BeginCell().
			MustStoreSlice([]byte{0x01}, 8).
			MustStoreRef(tvm.EmptyCell).
			MustStoreRef(tvm.EmptyCell).
			EndCell()

		_, err := snakePayloadBytes(c)
		require.ErrorContains(t, err, "expected at most 1")
	})

	t.Run("chain deeper than the TVM limit is rejected", func(t *testing.T) {
		// Build a strict snake chain by hand: the packer refuses to create one this deep.
		curr := cell.BeginCell().MustStoreSlice([]byte{0x01}, 8).EndCell()
		for range common.MaxCellChainDepth {
			curr = cell.BeginCell().MustStoreSlice([]byte{0x01}, 8).MustStoreRef(curr).EndCell()
		}

		_, err := snakePayloadBytes(curr)
		require.ErrorContains(t, err, "exceeds")
	})
}

func TestConvertCCIPMessageSent_PreservesMultiCellExtraData(t *testing.T) {
	sender := address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	feeAmount := tlb.MustFromTON("0.001")

	// destBytesOverhead can be raised above the 32-byte default for specific tokens,
	// so a pool may legitimately return more than one cell of destPoolData.
	extraData := make([]byte, 300)
	for i := range extraData {
		extraData[i] = byte(i % 251)
	}
	extraDataCell, err := common.SnakeBytes(extraData).ToCell()
	require.NoError(t, err)
	require.Equal(t, uint(1), extraDataCell.RefsNum())

	destExecData := []byte{0x00, 0x00, 0x30, 0x39}
	destExecDataCell, err := common.SnakeBytes(destExecData).ToCell()
	require.NoError(t, err)

	event := &onramp.CCIPMessageSent{
		Message: ocr.TVM2AnyRampMessage{
			Header: ocr.RampMessageHeader{
				MessageID:           make([]byte, 32),
				SourceChainSelector: 1,
				DestChainSelector:   2,
				SequenceNumber:      100,
				Nonce:               200,
			},
			Sender: sender,
			Body: ocr.TVM2AnyRampMessageBody{
				Receiver:  common.CrossChainAddress{0x01, 0x02},
				Data:      common.SnakeBytes{0xAA, 0xBB, 0xCC},
				ExtraArgs: tvm.EmptyCell,
				TokenTransfer: common.SnakedCell[ocr.TVM2AnyTokenTransfer]{
					{
						SourcePoolAddress: sender,
						Amount:            big.NewInt(42),
						DestTokenAddress:  common.CrossChainAddress{0x03},
						ExtraData:         extraDataCell,
						DestExecData:      destExecDataCell,
					},
				},
				FeeToken:       sender,
				FeeTokenAmount: &feeAmount,
			},
			FeeValueJuels: big.NewInt(500000),
		},
	}

	accessor := &TONAccessor{chainSelector: ccipocr3.ChainSelector(1)}
	got, err := accessor.convertCCIPMessageSent(event)
	require.NoError(t, err)
	require.Len(t, got.Message.TokenAmounts, 1)

	transfer := got.Message.TokenAmounts[0]
	require.Equal(t, extraData, []byte(transfer.ExtraData))
	require.Equal(t, destExecData, []byte(transfer.DestExecData))
}
