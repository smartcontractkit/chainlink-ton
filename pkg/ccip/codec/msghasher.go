package codec

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

const LEAF_DOMAIN_SEPARATOR = "0000000000000000000000000000000000000000000000000000000000000000"

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
		OnrampAddr:          common.CrossChainAddress(msg.Header.OnRamp),
	}

	tonReceiverAddrStr, err := m.addrCodec.AddressBytesToString(msg.Receiver)
	if err != nil {
		return [32]byte{}, fmt.Errorf("error convert receiver address: %w", err)
	}

	tonReceiverAddr, err := address.ParseAddr(tonReceiverAddrStr)
	if err != nil {
		return [32]byte{}, fmt.Errorf("invalid receiver address %s: %w", tonReceiverAddrStr, err)
	}

	var gasLimitBigInt *big.Int
	var extraArgsDecodeMap map[string]any
	if len(msg.ExtraArgs) > 0 {
		extraArgsDecodeMap, err = m.extraDataCodec.DecodeExtraArgs(msg.ExtraArgs, msg.Header.SourceChainSelector)
		if err != nil {
			return [32]byte{}, fmt.Errorf("failed to decode extra args: %w", err)
		}

		gasLimitBigInt, err = parseExtraArgsMap(extraArgsDecodeMap)
		if err != nil {
			return [32]byte{}, fmt.Errorf("parse extra args map to get gas limit: %w", err)
		}
	}

	// gas limit can be nil, which means no limit
	var gasLimit tlb.Coins
	if gasLimitBigInt != nil {
		gasLimit, err = tlb.FromNano(gasLimitBigInt, 0)
		if err != nil {
			return [32]byte{}, fmt.Errorf("convert gas limit to TON cell: %w", err)
		}
	}

	// not converting rampMsg to cell here, use as a parameter
	rampMsg := ocr.Any2TVMRampMessage{
		Header:       header,
		Sender:       common.CrossChainAddress(msg.Sender),
		Data:         common.SnakeBytes(msg.Data),
		Receiver:     tonReceiverAddr,
		GasLimit:     gasLimit,
		TokenAmounts: tokenAmounts,
	}

	hash, err := buildAny2TVMRampMessageHash(rampMsg)
	if err != nil {
		return [32]byte{}, fmt.Errorf("build ramp message hash: %w", err)
	}
	return ccipocr3.Bytes32(hash), nil
}

func buildAny2TVMRampMessageHash(msg ocr.Any2TVMRampMessage) ([]byte, error) {
	// use the reference from contracts/contracts/ccip/types.tolk generateMessageId()
	/* Top level cell contains:
	 * - LEAF_DOMAIN_SEPARATOR 256 bits
	 * - MsgHash 256 bits
	 * - Header (ref)
		* - MessageID (256 bits)
		* - Receiver (addr)
		* - SequenceNumber (64 bits)
		* - Nonce (64 bits)
	 * - Sender (bytes with length prefix - crossChainAddress)
	 * - Receiver (bytes with length prefix - crossChainAddress)
	 * - Data (ref)
	 * - TokenAmounts (ref)
	*/

	topLevelBuilder := cell.BeginCell()
	// storing the domain separator
	leafSeparatorBytes, err := hex.DecodeString(LEAF_DOMAIN_SEPARATOR)
	if err != nil {
		return nil, fmt.Errorf("decode leaf domain separator: %w", err)
	}
	topLevelBuilder.MustStoreSlice(leafSeparatorBytes, uint(len(leafSeparatorBytes)*8))

	// preparing MsgHash
	metadataHashBuilder := cell.BeginCell()
	metadataHashBuilder.
		MustStoreUInt(msg.Header.SourceChainSelector, 64).
		MustStoreUInt(msg.Header.DestChainSelector, 64).
		MustStoreSlice([]byte{uint8(len(msg.Header.OnrampAddr))}, 8).
		MustStoreSlice(msg.Header.OnrampAddr, uint(len(msg.Header.OnrampAddr))*8)

	// storing metadata hash
	topLevelBuilder.MustStoreSlice(metadataHashBuilder.EndCell().Hash(), 256)

	// preparing header
	headerBuilder := cell.BeginCell()
	headerBuilder.MustStoreSlice(msg.Header.MessageID, 256).
		MustStoreAddr(msg.Receiver).
		MustStoreUInt(msg.Header.SequenceNumber, 64).
		MustStoreUInt(msg.Header.Nonce, 64)

	// storing header
	topLevelBuilder.MustStoreRef(headerBuilder.EndCell())

	// preparing sender, data and token refs
	senderRefCell := cell.BeginCell().MustStoreSlice([]byte{uint8(len(msg.Sender))}, 8).
		MustStoreSlice(msg.Sender, uint(len(msg.Sender))*8).EndCell()

	// preparing
	dataCell, err := msg.Data.ToCell()
	if err != nil {
		return nil, fmt.Errorf("pack msg data to cell: %w", err)
	}
	tokenCell, err := msg.TokenAmounts.ToCell()
	if err != nil {
		return nil, fmt.Errorf("pack token amounts to cell: %w", err)
	}

	// storing sender, data and token refs
	topLevelBuilder.MustStoreRef(senderRefCell)
	topLevelBuilder.MustStoreRef(dataCell)
	err = topLevelBuilder.StoreMaybeRef(tokenCell)
	if err != nil {
		return nil, fmt.Errorf("store maybe ref for tokenAmounts: %w", err)
	}

	return topLevelBuilder.EndCell().Hash(), nil
}
