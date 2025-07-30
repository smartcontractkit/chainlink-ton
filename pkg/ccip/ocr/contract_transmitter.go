package ocr

import (
	"context"
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	ocrtypes "github.com/smartcontractkit/libocr/offchainreporting2plus/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/txm"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ToEd25519CalldataFunc is a function that takes in the OCR3 report and Ed25519 signature data and processes them.
// It returns the contract name, method name, and arguments for the on-chain contract call.
// The ReportWithInfo bytes field is also decoded according to the implementation of this function,
// the commit and execute plugins have different representations for this data.
// Ed25519 signatures are 96 bytes long (64 bytes signature + 32 bytes public key).
type ToEd25519CalldataFunc func(
	rawReportCtx [2][32]byte,
	report ocr3types.ReportWithInfo[[]byte],
	signatures [][96]byte,
	codec ccipocr3.ExtraDataCodec,
) (contract string, method string, args any, err error)

type RawReportContext3Func func(configDigest [32]byte, seqNr uint64) [2][32]byte

var _ ocr3types.ContractTransmitter[[]byte] = &ccipTransmitter{}

type ccipTransmitter struct {
	txm                 txm.TxManager
	offrampAddress      string
	toEd25519CalldataFn ToEd25519CalldataFunc
	rawReportContextFn  RawReportContext3Func
	extraDataCodec      ccipocr3.ExtraDataCodec
	lggr                logger.Logger
}

func NewCCIPTransmitter(
	txm txm.TxManager,
	lggr logger.Logger,
) (ocr3types.ContractTransmitter[[]byte], error) {
	if txm == nil || lggr == nil {
		return nil, errors.New("invalid transmitter args")
	}

	return &ccipTransmitter{
		txm:  txm,
		lggr: lggr,
	}, nil
}

func (c *ccipTransmitter) FromAccount(context.Context) (ocrtypes.Account, error) {
	w := c.txm.GetClient().Wallet
	return ocrtypes.Account(w.Address().StringRaw()), nil
}

func (c *ccipTransmitter) Transmit(
	ctx context.Context,
	configDigest ocrtypes.ConfigDigest,
	seqNr uint64,
	reportWithInfo ocr3types.ReportWithInfo[[]byte],
	sigs []ocrtypes.AttributedOnchainSignature,
) error {
	if len(sigs) > 32 {
		return errors.New("too many signatures, maximum is 32")
	}

	rawReportCtx := c.rawReportContextFn(configDigest, seqNr)

	signatures := make([][96]byte, 0, len(sigs))
	for _, sig := range sigs {
		if len(sig.Signature) != 96 {
			return fmt.Errorf("invalid ed25519 signature length, expected 96, got %d", len(sig.Signature))
		}
		var fixedSig [96]byte
		copy(fixedSig[:], sig.Signature)
		signatures = append(signatures, fixedSig)
	}

	_, method, args, err := c.toEd25519CalldataFn(rawReportCtx, reportWithInfo, signatures, c.extraDataCodec)
	if err != nil {
		return fmt.Errorf("failed to generate call data: %w", err)
	}

	body, ok := args.(*cell.Cell)
	if !ok {
		return fmt.Errorf("expected args to be *cell.Cell, got %T", args)
	}

	w := c.txm.GetClient().Wallet
	request := txm.Request{
		Mode:            wallet.PayGasSeparately,
		FromWallet:      w,
		ContractAddress: *address.MustParseAddr(c.offrampAddress),
		Body:            body,
		Amount:          tlb.MustFromTON("0.05"),
	}

	c.lggr.Infow("Submitting transaction", "address", c.offrampAddress, "method", method)

	if err := c.txm.Enqueue(request); err != nil {
		return fmt.Errorf("failed to submit transaction via txm: %w", err)
	}

	return nil
}
