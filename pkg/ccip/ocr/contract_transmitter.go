package ocr

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/libocr/offchainreporting2/types"
	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	ocrtypes "github.com/smartcontractkit/libocr/offchainreporting2plus/types"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

type ToEd25519CalldataFunc func(
	rawReportCtxBytes [64]byte,
	report ocr3types.ReportWithInfo[[]byte],
	signatures [][96]byte,
) (cell *cell.Cell, err error)

var _ ocr3types.ContractTransmitter[[]byte] = &ccipTransmitter{}

type ccipTransmitter struct {
	txm                 txm.TxManager
	offrampAddress      string
	toEd25519CalldataFn ToEd25519CalldataFunc
	lggr                logger.Logger
}

func NewCCIPTransmitter(
	txm txm.TxManager,
	lggr logger.Logger,
	offrampAddress string,
	toEd25519CalldataFn ToEd25519CalldataFunc,
) (ocr3types.ContractTransmitter[[]byte], error) {
	if txm == nil || lggr == nil {
		return nil, errors.New("invalid transmitter args")
	}

	return &ccipTransmitter{
		txm:                 txm,
		offrampAddress:      offrampAddress,
		toEd25519CalldataFn: toEd25519CalldataFn,
		lggr:                lggr,
	}, nil
}

func (c *ccipTransmitter) FromAccount(ctx context.Context) (ocrtypes.Account, error) {
	client, err := c.txm.GetClient(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get client: %w", err)
	}
	w := client.Wallet
	rawAddr := codec.ToRawAddr(w.WalletAddress())
	return ocrtypes.Account(hex.EncodeToString(rawAddr[:])), nil
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

	rawContextBytes := rawReportContext(configDigest, seqNr)
	signatures := make([][96]byte, 0, len(sigs))
	for _, sig := range sigs {
		if len(sig.Signature) != 96 {
			return fmt.Errorf("invalid ed25519 signature length, expected 96, got %d", len(sig.Signature))
		}
		var fixedSig [96]byte
		copy(fixedSig[:], sig.Signature)
		signatures = append(signatures, fixedSig)
	}

	argsCell, err := c.toEd25519CalldataFn(rawContextBytes, reportWithInfo, signatures)
	if err != nil {
		return fmt.Errorf("failed to generate call data: %w", err)
	}

	client, err := c.txm.GetClient(ctx)
	if err != nil {
		return fmt.Errorf("failed to get client: %w", err)
	}
	w := client.Wallet

	// extract CCIP-specific txID for enhanced tracking (includes messageID if execute report)
	// falls back to seq-only format for commit reports or decode failures
	txID := extractCCIPTxID(reportWithInfo.Report, seqNr)

	request := txm.Request{
		Mode:            wallet.PayGasSeparately,
		FromWallet:      w,
		ContractAddress: *address.MustParseAddr(c.offrampAddress),
		Body:            argsCell,
		Amount:          tlb.MustFromTON("0.05"), // TODO: make this configurable
		ID:              &txID,
	}

	c.lggr.Infow("Transmitting OCR report",
		"txID", txID,
		"from", w.Address().String(),
		"to", c.offrampAddress,
		"configDigest", hex.EncodeToString(configDigest[:]),
		"seqNr", seqNr,
		"reportBytes", len(reportWithInfo.Report),
		"signatures", len(sigs))
	if err := c.txm.Enqueue(request); err != nil {
		return fmt.Errorf("failed to enqueue transaction (txID=%s, seqNr=%d): %w",
			txID, seqNr, err)
	}

	return nil
}

// CommitCallData creates the call data for the OffRamp_Commit method
var CommitCallData = func(
	rawReportCtx [64]byte,
	report ocr3types.ReportWithInfo[[]byte],
	signatures [][96]byte,
) (*cell.Cell, error) {
	reportCell, err := cell.FromBOC(report.Report)
	if err != nil {
		return nil, err
	}

	var commitReport ocr.CommitReport
	if err = tlb.LoadFromCell(&commitReport, reportCell.BeginParse()); err != nil {
		return nil, fmt.Errorf("cannot decode commit report from cell: %w", err)
	}

	sigs := make(common.SnakeData[ocr.SignatureEd25519], len(signatures))
	for i, sig := range signatures {
		sigs[i] = ocr.SignatureEd25519{Data: sig[:]}
	}

	commit := offramp.Commit{
		QueryID:          0,
		ConfigDigest:     rawReportCtx[:],
		CommitReport:     commitReport,
		SignatureEd25519: sigs,
	}

	commitCell, err := tlb.ToCell(commit)
	if err != nil {
		return nil, fmt.Errorf("failed to encode commit to cell: %w", err)
	}

	return commitCell, nil
}

// ExecuteCallData creates the call data for the OffRamp_Execute method
var ExecuteCallData = func(
	rawReportCtx [64]byte,
	report ocr3types.ReportWithInfo[[]byte],
	signatures [][96]byte,
) (*cell.Cell, error) {
	reportCell, err := cell.FromBOC(report.Report)
	if err != nil {
		return nil, fmt.Errorf("failed to decode BOC (len=%d, hex=%x): %w", len(report.Report), report.Report, err)
	}

	// Decode as single ExecuteReport (not array) since TON supports single chain only
	var executeReport ocr.ExecuteReport
	if err = tlb.LoadFromCell(&executeReport, reportCell.BeginParse()); err != nil {
		return nil, fmt.Errorf("cannot decode execute report from cell (reportLen=%d, cellBits=%d, cellRefs=%d): %w",
			len(report.Report), reportCell.BitsSize(), reportCell.RefsNum(), err)
	}

	execute := offramp.Execute{
		QueryID:       0,
		ConfigDigest:  rawReportCtx[:],
		ExecuteReport: executeReport,
	}

	executeCell, err := tlb.ToCell(execute)
	if err != nil {
		return nil, fmt.Errorf("failed to encode execute to cell: %w", err)
	}

	return executeCell, nil
}

// rawReportContext converts the config digest and sequence number into a 64-byte array
func rawReportContext(digest types.ConfigDigest, seqNr uint64) [64]byte {
	var result [64]byte
	// Copy digest (first 32 bytes)
	copy(result[:32], digest[:])
	// Leave 24 bytes of padding (zeros)
	// Write seqNr in the last 8 bytes
	binary.BigEndian.PutUint64(result[56:], seqNr)
	return result
}

// extractCCIPTxID is a CCIP-specific helper that attempts to extract messageID from execute reports
// for better debugging and transaction tracking. This is NOT used by the generic transmitter,
// but can be useful for logging and debugging in CCIP-specific code.
//
// Returns:
//   - For execute reports: "seq-{seqNum}-msg-{messageID}"
//   - For commit reports or decode failures: "seq-{seqNum}"
//
// Note: This is a "hacky" convenience function that makes assumptions about report structure.
func extractCCIPTxID(reportBytes []byte, seqNr uint64) string {
	reportCell, err := cell.FromBOC(reportBytes)
	if err != nil {
		return fmt.Sprintf("seq-%d", seqNr)
	}

	var executeReport ocr.ExecuteReport
	if err = tlb.LoadFromCell(&executeReport, reportCell.BeginParse()); err != nil {
		// Not an execute report (likely commit report)
		return fmt.Sprintf("seq-%d", seqNr)
	}

	messageIDHex := hex.EncodeToString(executeReport.Messages.Header.MessageID)
	return fmt.Sprintf("seq-%d-msg-%s", executeReport.Messages.Header.SequenceNumber, messageIDHex)
}
