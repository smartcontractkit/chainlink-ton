package codec

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

// ExecutePluginCodecV1 is a codec for encoding and decoding execute plugin reports.
// Compatible with:
// - "OffRamp 1.6.0-dev"
type executePluginCodecV1 struct {
	addressCodec   ccipocr3.ChainSpecificAddressCodec
	extraDataCodec ccipocr3.ExtraDataCodecBundle
}

var _ ccipocr3.ExecutePluginCodec = &executePluginCodecV1{}

func NewExecutePluginCodecV1(extraDataCodec ccipocr3.ExtraDataCodecBundle) ccipocr3.ExecutePluginCodec {
	return &executePluginCodecV1{
		addressCodec:   NewAddressCodec(),
		extraDataCodec: extraDataCodec,
	}
}

func (e *executePluginCodecV1) Encode(ctx context.Context, report ccipocr3.ExecutePluginReport) ([]byte, error) {
	// support single report and single message for now
	if len(report.ChainReports) == 0 {
		// OCR3 runs in a constant loop and will produce empty reports, so we need to handle this case
		// return an empty report, CCIP will discard it on ShouldAcceptAttestedReport/ShouldTransmitAcceptedReport
		// via validateReport before attempting to decode
		return nil, nil
	}

	// TON supports single report only, so we expect exactly one chain report
	if len(report.ChainReports) != 1 {
		return nil, fmt.Errorf("TON supports single chain only, got %d chain reports", len(report.ChainReports))
	}

	chainReport := report.ChainReports[0]
	// TON supports single chain only, encode single ExecuteReport (not array)
	// Contract expects single message: val message = Any2TVMRampMessage.fromCell(report.messages);
	if len(chainReport.Messages) == 0 {
		return nil, errors.New("no messages to encode")
	}

	if len(chainReport.Messages) > 1 {
		return nil, errors.New("TON supports single message only per report")
	}

	msg := chainReport.Messages[0]
	var offChainTokenData common.SnakeRef[common.SnakeBytes]
	var rampMessage ocr.Any2TVMRampMessage
	tokenAmounts := make([]ocr.Any2TVMTokenTransfer, 0, len(msg.TokenAmounts))
	for _, tokenAmount := range msg.TokenAmounts {
		if tokenAmount.Amount.IsEmpty() {
			return nil, fmt.Errorf("empty amount for token: %s", tokenAmount.DestTokenAddress)
		}

		if tokenAmount.Amount.Sign() < 0 {
			return nil, fmt.Errorf("negative amount for token: %s", tokenAmount.DestTokenAddress)
		}

		if len(tokenAmount.DestTokenAddress) != 36 {
			return nil, fmt.Errorf("invalid destTokenAddress address: %v", tokenAmount.DestTokenAddress)
		}

		destExecDataDecodedMap, err := e.extraDataCodec.DecodeTokenAmountDestExecData(tokenAmount.DestExecData, chainReport.SourceChainSelector)
		if err != nil {
			return nil, fmt.Errorf("failed to decode dest exec data: %w", err)
		}

		destGasAmount, err := extractDestGasAmountFromMap(destExecDataDecodedMap)
		if err != nil {
			return nil, fmt.Errorf("extract dest gas amount: %w", err)
		}

		poolAddrCell := common.CrossChainAddress(tokenAmount.SourcePoolAddress)

		extraData, err := tlb.ToCell(common.SnakeBytes(tokenAmount.ExtraData))
		if err != nil {
			return nil, fmt.Errorf("pack extra data: %w", err)
		}

		if len(tokenAmount.DestTokenAddress) < 36 {
			return nil, fmt.Errorf("invalid dest token address length: %d", len(tokenAmount.DestTokenAddress))
		}

		destTokenAddrStr, err := e.addressCodec.AddressBytesToString(tokenAmount.DestTokenAddress)
		if err != nil {
			return nil, err
		}

		DestPoolTonAddr, err := address.ParseAddr(destTokenAddrStr)
		if err != nil {
			return nil, fmt.Errorf("invalid dest token address %s: %w", destTokenAddrStr, err)
		}

		tokenAmounts = append(tokenAmounts, ocr.Any2TVMTokenTransfer{
			SourcePoolAddress: poolAddrCell,
			ExtraData:         extraData,
			DestPoolAddress:   DestPoolTonAddr,
			Amount:            tokenAmount.Amount.Int,
			DestGasAmount:     destGasAmount,
		})
	}

	tonReceiverAddrStr, err := e.addressCodec.AddressBytesToString(msg.Receiver)
	if err != nil {
		return nil, fmt.Errorf("error convert receiver address: %w", err)
	}

	tonReceiverAddr, err := address.ParseAddr(tonReceiverAddrStr)
	if err != nil {
		return nil, fmt.Errorf("invalid receiver address %s: %w", tonReceiverAddrStr, err)
	}

	header := ocr.RampMessageHeader{
		MessageID:           msg.Header.MessageID[:],
		SourceChainSelector: uint64(msg.Header.SourceChainSelector),
		DestChainSelector:   uint64(msg.Header.DestChainSelector),
		SequenceNumber:      uint64(msg.Header.SequenceNumber),
		Nonce:               msg.Header.Nonce,
	}

	var gasLimitBigInt *big.Int
	var extraArgsDecodeMap map[string]any
	if len(msg.ExtraArgs) > 0 {
		extraArgsDecodeMap, err = e.extraDataCodec.DecodeExtraArgs(msg.ExtraArgs, chainReport.SourceChainSelector)
		if err != nil {
			return nil, fmt.Errorf("failed to decode extra args: %w", err)
		}

		gasLimitBigInt, err = parseExtraArgsMapAndRetrieveGasLimit(extraArgsDecodeMap)
		if err != nil {
			return nil, fmt.Errorf("parse extra args map to get gas limit: %w", err)
		}
	}

	// gas limit can be nil, which means no limit
	var gasLimit tlb.Coins // this is expressed in nanoTONs
	if gasLimitBigInt != nil {
		gasLimit, err = tlb.FromNano(gasLimitBigInt, 0)
		if err != nil {
			return nil, fmt.Errorf("convert gas limit to TON cell: %w", err)
		}
	}

	rampMessage = ocr.Any2TVMRampMessage{
		Header:       header,
		Sender:       common.CrossChainAddress(msg.Sender),
		Data:         common.SnakeBytes(msg.Data),
		Receiver:     tonReceiverAddr,
		GasLimit:     gasLimit,
		TokenAmounts: tokenAmounts,
	}

	if len(chainReport.OffchainTokenData) > 0 {
		tokenDataSlice := make([]common.SnakeBytes, len(chainReport.OffchainTokenData[0]))
		for i, data := range chainReport.OffchainTokenData[0] {
			tokenDataSlice[i] = data
		}
		offChainTokenData = tokenDataSlice
	}

	proofs := make(common.SnakeData[common.Proof], 0, len(chainReport.Proofs))
	for _, proof := range chainReport.Proofs {
		var p common.Proof
		p.Value = new(big.Int).SetBytes(proof[:])
		proofs = append(proofs, p)
	}

	// Take only the first message (contract only processes one message at a time)
	executeReport := ocr.ExecuteReport{
		SourceChainSelector: uint64(chainReport.SourceChainSelector),
		Message:             rampMessage,
		OffChainTokenData:   offChainTokenData,
		Proofs:              proofs,
		ProofFlagBits:       chainReport.ProofFlagBits.Int,
	}

	reportCell, err := tlb.ToCell(executeReport)
	if err != nil {
		return nil, fmt.Errorf("pack execute report: %w", err)
	}

	return reportCell.ToBOC(), nil
}

func (e *executePluginCodecV1) Decode(ctx context.Context, data []byte) (ccipocr3.ExecutePluginReport, error) {
	c, err := cell.FromBOC(data)
	if err != nil {
		return ccipocr3.ExecutePluginReport{}, fmt.Errorf("decode BOC: %w", err)
	}

	// TON supports single chain only, decode single ExecuteReport (not array)
	var tonReport ocr.ExecuteReport
	err = tlb.LoadFromCell(&tonReport, c.BeginParse())
	if err != nil {
		return ccipocr3.ExecutePluginReport{}, fmt.Errorf("unpack execute report: %w", err)
	}

	executeReport := ccipocr3.ExecutePluginReport{
		ChainReports: make([]ccipocr3.ExecutePluginReportSingleChain, 0, 1),
	}

	{
		proofs := make([]ccipocr3.Bytes32, 0, len(tonReport.Proofs))
		for _, proof := range tonReport.Proofs {
			proofs = append(proofs, ccipocr3.Bytes32(proof.Value.Bytes()))
		}

		// Message is a single message (not array) - contract only processes one at a time
		messages := make([]ccipocr3.Message, 0, 1)
		msg := tonReport.Message

		tokenAmounts := make([]ccipocr3.RampTokenAmount, 0, len(msg.TokenAmounts))
		for _, tokenAmount := range msg.TokenAmounts {
			var extraData common.SnakeBytes
			err = tlb.LoadFromCell(&extraData, tokenAmount.ExtraData.BeginParse())
			if err != nil {
				return executeReport, fmt.Errorf("unpack extra data: %w", err)
			}

			destTokenAddr, err := e.addressCodec.AddressStringToBytes(tokenAmount.DestPoolAddress.String())
			if err != nil {
				return executeReport, err
			}

			// big endian encoding for dest gas amount
			destGasAmount := make([]byte, 4)
			binary.BigEndian.PutUint32(destGasAmount, tokenAmount.DestGasAmount)

			tokenAmounts = append(tokenAmounts, ccipocr3.RampTokenAmount{
				SourcePoolAddress: ccipocr3.UnknownAddress(tokenAmount.SourcePoolAddress),
				DestTokenAddress:  destTokenAddr,
				ExtraData:         ccipocr3.Bytes(extraData),
				Amount:            ccipocr3.NewBigInt(tokenAmount.Amount), // TODO double check if we need to add range check for BigInt, since TON use 256 bits
				DestExecData:      destGasAmount,
			})
		}

		receiverAddr, err := e.addressCodec.AddressStringToBytes(msg.Receiver.String())
		if err != nil {
			return executeReport, err
		}

		extraArgs := onramp.GenericExtraArgsV2{
			GasLimit:                 msg.GasLimit.Nano(),
			AllowOutOfOrderExecution: true,
		}

		extraArgsCell, err := tlb.ToCell(extraArgs)
		if err != nil {
			return ccipocr3.ExecutePluginReport{}, fmt.Errorf("convert extra args to cell: %w", err)
		}

		messages = append(messages, ccipocr3.Message{
			Header: ccipocr3.RampMessageHeader{
				MessageID:           ccipocr3.Bytes32(msg.Header.MessageID),
				SourceChainSelector: ccipocr3.ChainSelector(msg.Header.SourceChainSelector),
				DestChainSelector:   ccipocr3.ChainSelector(msg.Header.DestChainSelector),
				SequenceNumber:      ccipocr3.SeqNum(msg.Header.SequenceNumber),
				Nonce:               msg.Header.Nonce,
			},
			Sender:       ccipocr3.UnknownAddress(msg.Sender),
			Data:         ccipocr3.Bytes(msg.Data),
			Receiver:     receiverAddr,
			ExtraArgs:    extraArgsCell.ToBOC(),
			TokenAmounts: tokenAmounts,
		})

		offchainTokenData := make([][][]byte, 0)
		if len(tonReport.OffChainTokenData) > 0 {
			tokenDataSlice := make([][]byte, len(tonReport.OffChainTokenData))
			for i, snakeBytes := range tonReport.OffChainTokenData {
				tokenDataSlice[i] = snakeBytes
			}
			offchainTokenData = append(offchainTokenData, tokenDataSlice)
		}

		executeReport.ChainReports = append(executeReport.ChainReports, ccipocr3.ExecutePluginReportSingleChain{
			SourceChainSelector: ccipocr3.ChainSelector(tonReport.SourceChainSelector),
			Messages:            messages,
			OffchainTokenData:   offchainTokenData,
			Proofs:              proofs,
			ProofFlagBits:       ccipocr3.NewBigInt(tonReport.ProofFlagBits),
		})
	}

	return executeReport, nil
}

// Duplicate with ccipevm, consider moving to common package
func extractDestGasAmountFromMap(input map[string]any) (uint32, error) {
	// Iterate through the expected fields in the struct
	for fieldName, fieldValue := range input {
		lowercase := strings.ToLower(fieldName)
		switch lowercase {
		case "destgasamount":
			// Expect uint32
			if val, ok := fieldValue.(uint32); ok {
				return val, nil
			}
			return 0, errors.New("invalid type for destgasamount, expected uint32")
		default:
		}
	}

	return 0, errors.New("invalid token message, dest gas amount not found in the DestExecDataDecoded map")
}

func parseExtraArgsMapAndRetrieveGasLimit(input map[string]any) (*big.Int, error) {
	var outputGas *big.Int
	for fieldName, fieldValue := range input {
		lowercase := strings.ToLower(fieldName)
		switch lowercase {
		case "gaslimit":
			if val, ok := fieldValue.(*big.Int); ok {
				outputGas = val
				return outputGas, nil
			}
			return nil, fmt.Errorf("unexpected type for gas limit: %T", fieldValue)
		default:
			// no error here, as we only need the keys to gasLimit, other keys can be skipped without like AllowOutOfOrderExecution	etc.
		}
	}
	return outputGas, errors.New("gas limit not found in extra data map")
}
