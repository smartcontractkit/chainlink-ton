package ocr

import (
	"context"
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
	ccipcommon "github.com/smartcontractkit/chainlink/v2/core/capabilities/ccip/common"
	"github.com/smartcontractkit/chainlink/v2/core/services/keystore/keys/ocr2key"
	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	ocrtypes "github.com/smartcontractkit/libocr/offchainreporting2plus/types"
	"github.com/smartcontractkit/wsrpc/logger"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
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
	codec ccipcommon.ExtraDataCodec,
) (contract string, method string, args any, err error)

var _ ocr3types.ContractTransmitter[[]byte] = &ccipTransmitter{}

type ccipTransmitter struct {
	txm                 *txm.Txm
	fromWallet          *wallet.Wallet
	offrampAddress      string
	toEd25519CalldataFn ToEd25519CalldataFunc
	extraDataCodec      ccipcommon.ExtraDataCodec
	lggr                logger.Logger
}

func (c *ccipTransmitter) FromAccount(context.Context) (ocrtypes.Account, error) {
	return ocrtypes.Account(c.fromWallet.Address().StringRaw()), nil
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

	// report ctx for OCR3 consists of the following
	// reportContext[0]: ConfigDigest
	// reportContext[1]: 24 byte padding, 8 byte sequence number
	rawReportCtx := ocr2key.RawReportContext3(configDigest, seqNr)

	var contract string
	var method string
	var args any
	var err error

	if c.toEd25519CalldataFn != nil {
		var signatures [][96]byte
		for _, as := range sigs {
			sig := as.Signature
			if len(sig) != 96 {
				return fmt.Errorf("invalid ed25519 signature length, expected 96, got %d", len(sig))
			}
			var sigBytes [96]byte
			copy(sigBytes[:], sig)
			signatures = append(signatures, sigBytes)
		}

		contract, method, args, err = c.toEd25519CalldataFn(rawReportCtx, reportWithInfo, signatures, c.extraDataCodec)
		if err != nil {
			return fmt.Errorf("failed to generate ed25519 call data: %w", err)
		}
	} else {
		return errors.New("no calldata function")
	}

	request := txm.Request{
		Mode:            wallet.PayGasSeparately,
		FromWallet:      *c.fromWallet,
		ContractAddress: *address.MustParseAddr(contract),
		// Body: , fill me
		Amount: tlb.MustFromTON("0.05"),
	}

	c.lggr.Infow("Submitting transaction" /*, "tx", txID*/)
	if err := c.txm.Enqueue(request); err != nil {
		return fmt.Errorf("failed to submit transaction via txm: %w", err)
	}

	return nil
}
