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
	cfg                 *Config
}

func NewCCIPTransmitter(
	txm txm.TxManager,
	lggr logger.Logger,
	offrampAddress string,
	toEd25519CalldataFn ToEd25519CalldataFunc,
	cfg *Config,
) (ocr3types.ContractTransmitter[[]byte], error) {
	if txm == nil || lggr == nil || cfg == nil {
		return nil, errors.New("invalid transmitter args")
	}

	return &ccipTransmitter{
		txm:                 txm,
		offrampAddress:      offrampAddress,
		toEd25519CalldataFn: toEd25519CalldataFn,
		lggr:                lggr,
		cfg:                 cfg,
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
	c.lggr.Debugw("OGT Debug Transmit: START",
		"seqNr", seqNr,
		"configDigest", hex.EncodeToString(configDigest[:]),
		"reportLen", len(reportWithInfo.Report),
		"numSigs", len(sigs),
	)

	if len(sigs) > 32 {
		return errors.New("too many signatures, maximum is 32")
	}

	c.lggr.Debugw("OGT Debug Transmit: signatures validated, building raw context")

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

	c.lggr.Debugw("OGT Debug Transmit: calling toEd25519CalldataFn")

	argsCell, err := c.toEd25519CalldataFn(rawContextBytes, reportWithInfo, signatures)
	if err != nil {
		c.lggr.Errorw("OGT Debug Transmit: toEd25519CalldataFn FAILED", "err", err)
		return fmt.Errorf("failed to generate call data: %w", err)
	}

	c.lggr.Debugw("OGT Debug Transmit: toEd25519CalldataFn succeeded, getting client")

	client, err := c.txm.GetClient(ctx)
	if err != nil {
		c.lggr.Errorw("OGT Debug Transmit: GetClient FAILED", "err", err)
		return fmt.Errorf("failed to get client: %w", err)
	}
	w := client.Wallet

	c.lggr.Debugw("OGT Debug Transmit: client obtained, calling getReportTxInfo",
		"walletAddr", w.WalletAddress().String(),
	)

	txID, finalAmount, gasLimit, err := getReportTxInfo(c.lggr, reportWithInfo.Report, seqNr, c.cfg)
	if err != nil {
		c.lggr.Errorw("OGT Debug Transmit: getReportTxInfo FAILED", "err", err)
		return fmt.Errorf("failed to extract report metadata: %w", err)
	}

	c.lggr.Debugw("OGT Debug Transmit: getReportTxInfo succeeded",
		"txID", txID,
		"finalAmount", finalAmount,
		"gasLimit", gasLimit,
	)

	request := txm.Request{
		Mode:            wallet.PayGasSeparately,
		FromWallet:      w,
		ContractAddress: *address.MustParseAddr(c.offrampAddress),
		Body:            argsCell,
		Amount:          *finalAmount,
		ID:              &txID,
	}

	c.lggr.Debugw("OGT Debug Transmit: request built, about to log and enqueue",
		"txID", txID,
		"offrampAddress", c.offrampAddress,
	)

	c.lggr.Infow("Transmitting OCR report",
		"txID", txID,
		"from", w.WalletAddress().String(),
		"to", c.offrampAddress,
		"configDigest", hex.EncodeToString(configDigest[:]),
		"seqNr", seqNr,
		"reportBytes", len(reportWithInfo.Report),
		"signatures", len(sigs),
		"gasLimit", gasLimit,
		"finalAmountTON", finalAmount,
	)

	c.lggr.Debugw("OGT Debug Transmit: calling txm.Enqueue")

	if err := c.txm.Enqueue(request); err != nil {
		c.lggr.Errorw("OGT Debug Transmit: txm.Enqueue FAILED", "err", err, "txID", txID)
		return fmt.Errorf("failed to enqueue transaction (txID=%s, seqNr=%d): %w",
			txID, seqNr, err)
	}

	c.lggr.Debugw("OGT Debug Transmit: SUCCESS - transaction enqueued", "txID", txID)

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

// getReportTxInfo extracts transaction ID, calculates gas cost, and retrieves gas limit
// from a report in a single decode operation to avoid redundant processing.
//
// Returns:
//   - txID: Transaction identifier string (e.g., "seq-{seqNum}-msg-{messageID}" or "seq-{seqNum}")
//   - gasCost: Total cost in TON coins based on report type
//   - gasLimit: Gas limit from execute reports (nil for commit reports)
//   - err: Any error encountered during processing
//
// Tx cost breakdown:
//   - Execute Report: Returns ExecuteCostTON + message gas limit
//   - Commit Report with merkle roots: Returns CommitPriceAndRootCostTON
//   - Commit Report (price-only, no merkle roots): Returns CommitPriceUpdateOnlyCostTON
func getReportTxInfo(lggr logger.Logger, reportBytes []byte, seqNr uint64, cfg *Config) (txID string, gasCost *tlb.Coins, gasLimit *tlb.Coins, err error) {
	lggr.Debugw("OGT Debug getReportTxInfo: START",
		"seqNr", seqNr,
		"reportBytesLen", len(reportBytes),
		"reportBytesHex", hex.EncodeToString(reportBytes[:min(len(reportBytes), 32)]),
	)

	reportCell, err := cell.FromBOC(reportBytes)
	if err != nil {
		lggr.Errorw("OGT Debug getReportTxInfo: FromBOC FAILED", "err", err)
		return fmt.Sprintf("seq-%d", seqNr), nil, nil, fmt.Errorf("failed to decode report BOC: %w", err)
	}

	lggr.Debugw("OGT Debug getReportTxInfo: BOC decoded successfully",
		"cellBits", reportCell.BitsSize(),
		"cellRefs", reportCell.RefsNum(),
	)

	// Check ExecuteReport first
	lggr.Debugw("OGT Debug getReportTxInfo: trying to decode as ExecuteReport")
	var executeReport ocr.ExecuteReport
	if err = tlb.LoadFromCell(&executeReport, reportCell.BeginParse()); err == nil {
		// This is an execute report
		messageIDHex := hex.EncodeToString(executeReport.Message.Header.MessageID)
		txID = fmt.Sprintf("seq-%d-msg-%s", seqNr, messageIDHex)

		lggr.Debugw("OGT Debug getReportTxInfo: SUCCESSFULLY decoded as ExecuteReport",
			"messageID", messageIDHex,
			"txID", txID,
			"gasLimit", executeReport.Message.GasLimit,
		)

		// Calculate cost: ExecuteCostTON + message gas limit
		baseCost := tlb.MustFromTON(fmt.Sprintf("%.6f", cfg.ExecuteCostTON))
		totalCost, err1 := baseCost.Add(&executeReport.Message.GasLimit)
		if err1 != nil {
			lggr.Errorw("OGT Debug getReportTxInfo: failed to add gas limit", "err", err1)
			return txID, nil, &executeReport.Message.GasLimit, fmt.Errorf("failed to add gas limit to execute cost: %w", err1)
		}

		lggr.Debugw("OGT Debug getReportTxInfo: ExecuteReport cost calculated",
			"baseCost", baseCost,
			"gasLimit", executeReport.Message.GasLimit,
			"totalCost", totalCost,
		)

		return txID, totalCost, &executeReport.Message.GasLimit, nil
	}

	lggr.Debugw("OGT Debug getReportTxInfo: NOT an ExecuteReport, error was",
		"err", err,
	)

	// Not an execute report, try to decode as CommitReport
	lggr.Debugw("OGT Debug getReportTxInfo: trying to decode as CommitReport")
	var commitReport ocr.CommitReport
	if err = tlb.LoadFromCell(&commitReport, reportCell.BeginParse()); err != nil {
		lggr.Errorw("OGT Debug getReportTxInfo: CommitReport decode FAILED", "err", err)
		return fmt.Sprintf("seq-%d", seqNr), nil, nil, fmt.Errorf("failed to decode as commit report: %w", err)
	}

	lggr.Debugw("OGT Debug getReportTxInfo: SUCCESSFULLY decoded as CommitReport",
		"numGasPriceUpdates", len(commitReport.PriceUpdates.GasPriceUpdates),
		"numTokenPriceUpdates", len(commitReport.PriceUpdates.TokenPriceUpdates),
		"numMerkleRoots", len(commitReport.MerkleRoots),
	)

	// Log details about the price updates
	lggr.Debugw("OGT Debug getReportTxInfo: CommitReport gas prices",
		"gasPriceUpdates", commitReport.PriceUpdates.GasPriceUpdates,
	)
	lggr.Debugw("OGT Debug getReportTxInfo: CommitReport token prices",
		"tokenPriceUpdates", commitReport.PriceUpdates.TokenPriceUpdates,
	)
	lggr.Debugw("OGT Debug getReportTxInfo: CommitReport merkle roots",
		"merkleRoots", commitReport.MerkleRoots,
	)

	// Commit report
	txID = fmt.Sprintf("seq-%d", seqNr)
	if len(commitReport.MerkleRoots) == 0 {
		lggr.Debugw("OGT Debug getReportTxInfo: CommitReport has NO merkle roots - price update only",
			"costTON", cfg.CommitPriceUpdateOnlyCostTON,
		)
		cost := tlb.MustFromTON(fmt.Sprintf("%.6f", cfg.CommitPriceUpdateOnlyCostTON))
		gasCost = &cost
	} else {
		lggr.Debugw("OGT Debug getReportTxInfo: CommitReport HAS merkle roots",
			"numRoots", len(commitReport.MerkleRoots),
			"costTON", cfg.CommitPriceAndRootCostTON,
		)
		cost := tlb.MustFromTON(fmt.Sprintf("%.6f", cfg.CommitPriceAndRootCostTON))
		gasCost = &cost
	}

	lggr.Debugw("OGT Debug getReportTxInfo: RETURNING CommitReport info",
		"txID", txID,
		"gasCost", gasCost,
		"gasLimit", "nil",
	)

	return txID, gasCost, nil, nil
}
