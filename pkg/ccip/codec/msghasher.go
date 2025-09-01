package codec

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

type messageHasherV1 struct {
	lggr           logger.Logger
	addrCodec      addressCodec
	extraDataCodec ccipocr3.ExtraDataCodec
}

func NewMessageHasherV1(lg logger.Logger, extraDataCodec ccipocr3.ExtraDataCodec) ccipocr3.MessageHasher {
	return messageHasherV1{
		lggr:           lg,
		extraDataCodec: extraDataCodec,
	}
}

func (m messageHasherV1) Hash(ctx context.Context, msg ccipocr3.Message) (ccipocr3.Bytes32, error) {
	tokenAmounts := make([]ocr.Any2TVMTokenTransfer, 0, len(msg.TokenAmounts))
	for _, tokenAmount := range msg.TokenAmounts {
		if tokenAmount.Amount.IsEmpty() {
			return [32]byte{}, fmt.Errorf("empty amount for token: %s", tokenAmount.DestTokenAddress)
		}

		if tokenAmount.Amount.Sign() < 0 {
			return [32]byte{}, fmt.Errorf("negative amount for token: %s", tokenAmount.DestTokenAddress)
		}

		if len(tokenAmount.DestTokenAddress) != 36 {
			return [32]byte{}, fmt.Errorf("invalid destTokenAddress address: %v", tokenAmount.DestTokenAddress)
		}

		destExecDataDecodedMap, err := m.extraDataCodec.DecodeTokenAmountDestExecData(tokenAmount.DestExecData, msg.Header.SourceChainSelector)
		if err != nil {
			return [32]byte{}, fmt.Errorf("failed to decode dest exec data: %w", err)
		}

		destGasAmount, err := extractDestGasAmountFromMap(destExecDataDecodedMap)
		if err != nil {
			return [32]byte{}, fmt.Errorf("extract dest gas amount: %w", err)
		}

		poolAddrCell := common.CrossChainAddress(tokenAmount.SourcePoolAddress)

		extraData, err := tlb.ToCell(common.SnakeBytes(tokenAmount.ExtraData))
		if err != nil {
			return [32]byte{}, fmt.Errorf("pack extra data: %w", err)
		}

		if len(tokenAmount.DestTokenAddress) < 36 {
			return [32]byte{}, fmt.Errorf("invalid dest token address length: %d", len(tokenAmount.DestTokenAddress))
		}

		destTokenAddrStr, err := m.addrCodec.AddressBytesToString(tokenAmount.DestTokenAddress)
		if err != nil {
			return [32]byte{}, err
		}

		DestPoolTonAddr, err := address.ParseAddr(destTokenAddrStr)
		if err != nil {
			return [32]byte{}, fmt.Errorf("invalid dest token address %s: %w", destTokenAddrStr, err)
		}

		tokenAmounts = append(tokenAmounts, ocr.Any2TVMTokenTransfer{
			SourcePoolAddress: poolAddrCell,
			ExtraData:         extraData,
			DestPoolAddress:   DestPoolTonAddr,
			Amount:            tokenAmount.Amount.Int,
			DestGasAmount:     destGasAmount,
		})
	}

	header := ocr.RampMessageHeader{
		MessageID:           msg.Header.MessageID[:],
		SourceChainSelector: uint64(msg.Header.SourceChainSelector),
		DestChainSelector:   uint64(msg.Header.DestChainSelector),
		SequenceNumber:      uint64(msg.Header.SequenceNumber),
		Nonce:               msg.Header.Nonce,
	}

	tonReceiverAddrStr, err := m.addrCodec.AddressBytesToString(msg.Receiver)
	if err != nil {
		return [32]byte{}, fmt.Errorf("error convert receiver address: %w", err)
	}

	tonReceiverAddr, err := address.ParseAddr(tonReceiverAddrStr)
	if err != nil {
		return [32]byte{}, fmt.Errorf("invalid receiver address %s: %w", tonReceiverAddrStr, err)
	}

	rampMsg := ocr.Any2TVMRampMessage{
		Header:       header,
		Sender:       common.CrossChainAddress(msg.Sender),
		Data:         common.SnakeBytes(msg.Data),
		Receiver:     tonReceiverAddr,
		TokenAmounts: tokenAmounts,
	}

	rampCell, err := tlb.ToCell(rampMsg)
	if err != nil {
		return [32]byte{}, fmt.Errorf("pack ramp message to cell: %w", err)
	}

	// TODO check if cell hash is enough or we should use a different hashing logic
	return ccipocr3.Bytes32(rampCell.Hash()), nil
}
