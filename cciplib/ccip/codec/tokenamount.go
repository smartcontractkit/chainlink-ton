package codec

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
)

// buildAny2TVMTokenTransfer converts a ccipocr3.RampTokenAmount into the on-chain
// ocr.Any2TVMTokenTransfer layout. It is the SINGLE source of truth shared by the
// message hasher (commit plugin) and the execute report encoder (execute plugin),
// so both sides structurally cannot disagree on the leaf encoding.
//
// empty ExtraData is always packed as nil.
func buildAny2TVMTokenTransfer(
	tokenAmount ccipocr3.RampTokenAmount,
	sourceChainSelector ccipocr3.ChainSelector,
	extraDataCodec ccipocr3.ExtraDataCodecBundle,
) (ocr.Any2TVMTokenTransfer, error) {
	if tokenAmount.Amount.IsEmpty() {
		return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("empty amount for token: %s", tokenAmount.DestTokenAddress)
	}

	if tokenAmount.Amount.Sign() < 0 {
		return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("negative amount for token: %s", tokenAmount.DestTokenAddress)
	}

	if len(tokenAmount.DestTokenAddress) != 36 {
		return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("invalid destTokenAddress address: %v", tokenAmount.DestTokenAddress)
	}

	destExecDataDecodedMap, err := extraDataCodec.DecodeTokenAmountDestExecData(tokenAmount.DestExecData, sourceChainSelector)
	if err != nil {
		return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("failed to decode dest exec data: %w", err)
	}

	destGasAmount, err := extractDestGasAmountFromMap(destExecDataDecodedMap)
	if err != nil {
		return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("extract dest gas amount: %w", err)
	}

	poolAddrCell := common.CrossChainAddress(tokenAmount.SourcePoolAddress)

	// Always pack, even for an empty byte slice: SnakeBytes.ToCell returns a
	// non-nil empty cell, which serializes as a mandatory ref to an empty cell.
	var extraData *cell.Cell
	if len(tokenAmount.ExtraData) > 0 {
		extraData, err = tlb.ToCell(common.SnakeBytes(tokenAmount.ExtraData))
		if err != nil {
			return ocr.Any2TVMTokenTransfer{}, fmt.Errorf("pack extra data: %w", err)
		}
	}

	destPoolTonAddr := AddressBytesToTONAddressWithBurning(tokenAmount.DestTokenAddress)
	return ocr.Any2TVMTokenTransfer{
		SourcePoolAddress: poolAddrCell,
		ExtraData:         extraData,
		DestPoolAddress:   destPoolTonAddr,
		Amount:            tokenAmount.Amount.Int,
		DestGasAmount:     destGasAmount,
	}, nil
}

// Shared conversion with the execute codec: both sides must serialize
// Any2TVMTokenTransfer identically or the committed leaf never matches the
// on-chain recomputation.
// buildAny2TVMTokenAmounts converts all token amounts of a message. It returns nil
// when the message carries no token amounts: nil serializes the tokenAmounts
// Maybe-ref as absent (Maybe 0), which both the hasher and the encoder must agree on.
func buildAny2TVMTokenAmounts(
	msg ccipocr3.Message,
	sourceChainSelector ccipocr3.ChainSelector,
	extraDataCodec ccipocr3.ExtraDataCodecBundle,
) ([]ocr.Any2TVMTokenTransfer, error) {
	if len(msg.TokenAmounts) == 0 {
		return nil, nil
	}
	tokenAmounts := make([]ocr.Any2TVMTokenTransfer, 0, len(msg.TokenAmounts))
	for _, tokenAmount := range msg.TokenAmounts {
		transfer, err := buildAny2TVMTokenTransfer(tokenAmount, sourceChainSelector, extraDataCodec)
		if err != nil {
			return nil, err
		}
		tokenAmounts = append(tokenAmounts, transfer)
	}
	return tokenAmounts, nil
}
