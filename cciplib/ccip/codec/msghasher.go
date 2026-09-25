package codec

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
)

// 0x0000000000000000000000000000000000000000000000000000000000000000
var LeafDomainSeparator [32]byte

type messageHasherV1 struct {
	lggr           logger.Logger
	extraDataCodec ccipocr3.ExtraDataCodecBundle
}

func NewMessageHasherV1(lg logger.Logger, extraDataCodec ccipocr3.ExtraDataCodecBundle) ccipocr3.MessageHasher {
	return messageHasherV1{
		lggr:           lg,
		extraDataCodec: extraDataCodec,
	}
}

func (m messageHasherV1) Hash(ctx context.Context, msg ccipocr3.Message) (ccipocr3.Bytes32, error) {
	tokenAmounts, err := buildAny2TVMTokenAmounts(msg, msg.Header.SourceChainSelector, m.extraDataCodec)
	if err != nil {
		return [32]byte{}, err
	}

	header := ocr.RampMessageHeader{
		MessageID:           msg.Header.MessageID[:],
		SourceChainSelector: uint64(msg.Header.SourceChainSelector),
		DestChainSelector:   uint64(msg.Header.DestChainSelector),
		SequenceNumber:      uint64(msg.Header.SequenceNumber),
		Nonce:               msg.Header.Nonce,
	}

	receiver := AddressBytesToTONAddressWithBurning(msg.Receiver)
	var gasLimit *big.Int
	var extraArgsDecodeMap map[string]any
	if len(msg.ExtraArgs) == 0 {
		return [32]byte{}, errors.New("cannot hash without extra args")
	}
	extraArgsDecodeMap, err = m.extraDataCodec.DecodeExtraArgs(msg.ExtraArgs, msg.Header.SourceChainSelector)
	if err != nil {
		return [32]byte{}, fmt.Errorf("failed to decode extra args: %w", err)
	}

	gasLimit, err = parseExtraArgsMapAndRetrieveGasLimit(extraArgsDecodeMap)
	if err != nil {
		return [32]byte{}, fmt.Errorf("parse extra args map to get gas limit: %w", err)
	}

	// use the reference from contracts/contracts/ccip/offramp/types.tolk generateMessageId()
	/* Top level cell contains:
	 * - LEAF_DOMAIN_SEPARATOR 256 bits
	 * - MsgHash 256 bits
	 * - Header (ref)
		* - MessageID (256 bits)
		* - Receiver (addr)
		* - SequenceNumber (64 bits)
		* - GasLimit (coins)
		* - Nonce (64 bits)
	 * - Sender (bytes with length prefix - crossChainAddress)
	 * - Data (ref)
	 * - TokenAmounts (ref)
	*/

	metadataHash := cell.BeginCell().
		MustStoreSlice(stringSha256("Any2TVMMessageHashV1"), 256). // type hash
		MustStoreUInt(header.SourceChainSelector, 64).
		MustStoreUInt(header.DestChainSelector, 64).
		MustStoreRef(cell.BeginCell().
			MustStoreSlice([]byte{uint8(len(msg.Header.OnRamp))}, 8). //nolint:gosec // OnRamp address length is always under 256 bytes
			MustStoreSlice(msg.Header.OnRamp, uint(len(msg.Header.OnRamp))*8).EndCell()).
		EndCell().
		Hash()

	data := common.SnakeBytes(msg.Data)
	dataCell, err := data.ToCell()
	if err != nil {
		return [32]byte{}, fmt.Errorf("pack msg data to cell: %w", err)
	}

	var tokenCell *cell.Cell
	if tokenAmounts != nil {
		tokenCell, err = common.SnakedCell[ocr.Any2TVMTokenTransfer](tokenAmounts).ToCell()
		if err != nil {
			return [32]byte{}, fmt.Errorf("pack token amounts to cell: %w", err)
		}
	}

	builder := cell.BeginCell().
		MustStoreSlice(LeafDomainSeparator[:], uint(len(LeafDomainSeparator[:])*8)).
		MustStoreSlice(metadataHash, 256)

	// storing header
	builder.MustStoreRef(
		cell.BeginCell().
			MustStoreSlice(header.MessageID, 256).
			MustStoreAddr(receiver).
			MustStoreUInt(header.SequenceNumber, 64).
			MustStoreBigCoins(gasLimit).
			MustStoreUInt(header.Nonce, 64).
			EndCell())

	sender := common.CrossChainAddress(msg.Sender)
	// storing sender ref
	builder.MustStoreRef(
		cell.BeginCell().
			MustStoreSlice([]byte{uint8(len(sender))}, 8). //nolint:gosec // sender len is always under 256 bytes
			MustStoreSlice(sender, uint(len(sender))*8).
			EndCell())

	builder.
		MustStoreRef(dataCell).
		MustStoreMaybeRef(tokenCell)

	hash := builder.EndCell().Hash()

	return ccipocr3.Bytes32(hash), nil
}

func stringSha256(input string) []byte {
	hash := sha256.Sum256([]byte(input))
	return hash[:]
}
