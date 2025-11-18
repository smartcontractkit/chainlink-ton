package codec

import (
	"bytes"
	"context"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

// CommitPluginCodecV1 is a codec for encoding and decoding commit plugin reports.
// Compatible with:
// - "OffRamp 1.6.0-dev"
type commitPluginCodecV1 struct{}

var _ cciptypes.CommitPluginCodec = &commitPluginCodecV1{}

func NewCommitPluginCodecV1() cciptypes.CommitPluginCodec {
	return &commitPluginCodecV1{}
}

func (cr *commitPluginCodecV1) Encode(ctx context.Context, report cciptypes.CommitPluginReport) ([]byte, error) {
	// create logger here to log unpacking process
	lggr, err := logger.New()
	if err != nil {
		return nil, fmt.Errorf("cannot create logger: %w", err)
	}

	lggr.Debugw("OGT commitcodec.Encode START",
		"numTokenPriceUpdates", len(report.PriceUpdates.TokenPriceUpdates),
		"numGasPriceUpdates", len(report.PriceUpdates.GasPriceUpdates),
		"numBlessedMerkleRoots", len(report.BlessedMerkleRoots),
		"numUnblessedMerkleRoots", len(report.UnblessedMerkleRoots))

	tpuSlice := make([]ocr.TokenPriceUpdate, len(report.PriceUpdates.TokenPriceUpdates))
	for i, tpu := range report.PriceUpdates.TokenPriceUpdates {
		addr, err := address.ParseAddr(string(tpu.TokenID))
		if err != nil {
			return nil, fmt.Errorf("cannot parse token address %s: %w", tpu.TokenID, err)
		}

		if tpu.Price.IsEmpty() {
			return nil, fmt.Errorf("empty token price for token %s", tpu.TokenID)
		}
		tpuSlice[i] = ocr.TokenPriceUpdate{
			SourceToken: addr,
			UsdPerToken: tpu.Price.Int,
		}
	}

	gpuSlice := make([]ocr.GasPriceUpdate, len(report.PriceUpdates.GasPriceUpdates))
	for i, gpu := range report.PriceUpdates.GasPriceUpdates {
		if gpu.GasPrice.IsEmpty() {
			return nil, fmt.Errorf("empty gas price for chain selector %d", gpu.ChainSel)
		}

		lggr.Debugw("OGT commitcodec.Encode unpacking gas price",
			"index", i,
			"chainSel", gpu.ChainSel,
			"packedGasPrice", gpu.GasPrice.Int.String())

		// The GasPrice is packed as: (DA << 112) | Exec by the plugin.
		// We need to unpack it into two separate 112-bit fields for the TON onchain struct.
		execFee, daFee := feequoter.UnpackGasPrice(gpu.GasPrice.Int)

		lggr.Debugw("OGT commitcodec.Encode unpacked gas price",
			"index", i,
			"chainSel", gpu.ChainSel,
			"execFee", execFee.String(),
			"daFee", daFee.String())

		gpuSlice[i] = ocr.GasPriceUpdate{
			DestChainSelector:        uint64(gpu.ChainSel),
			ExecutionGasPrice:        execFee,
			DataAvailabilityGasPrice: daFee,
		}

		lggr.Debugw("OGT commitcodec.Encode created GasPriceUpdate struct",
			"index", i,
			"chainSel", gpuSlice[i].DestChainSelector,
			"ExecutionGasPrice_field", gpuSlice[i].ExecutionGasPrice.String(),
			"DataAvailabilityGasPrice_field", gpuSlice[i].DataAvailabilityGasPrice.String())
	}

	mkSlice := make([]ocr.MerkleRoot, len(report.BlessedMerkleRoots))
	for i, mr := range report.BlessedMerkleRoots {
		mkSlice[i] = ocr.MerkleRoot{
			SourceChainSelector: uint64(mr.ChainSel),
			OnRampAddress:       common.CrossChainAddress(mr.OnRampAddress),
			MinSeqNr:            uint64(mr.SeqNumsRange.Start()),
			MaxSeqNr:            uint64(mr.SeqNumsRange.End()),
			MerkleRoot:          bytes.Clone(mr.MerkleRoot[:]),
		}
	}

	unblessedMkSlice := make([]ocr.MerkleRoot, len(report.UnblessedMerkleRoots))
	for i, mr := range report.UnblessedMerkleRoots {
		unblessedMkSlice[i] = ocr.MerkleRoot{
			SourceChainSelector: uint64(mr.ChainSel),
			OnRampAddress:       common.CrossChainAddress(mr.OnRampAddress),
			MinSeqNr:            uint64(mr.SeqNumsRange.Start()),
			MaxSeqNr:            uint64(mr.SeqNumsRange.End()),
			MerkleRoot:          bytes.Clone(mr.MerkleRoot[:]),
		}
	}

	cellReport := ocr.CommitReport{
		PriceUpdates: &ocr.PriceUpdates{
			TokenPriceUpdates: tpuSlice,
			GasPriceUpdates:   gpuSlice,
		},
		MerkleRoots: append(mkSlice, unblessedMkSlice...),
	}

	lggr.Debugw("OGT commitcodec.Encode about to call tlb.ToCell",
		"numGasPriceUpdates", len(cellReport.PriceUpdates.GasPriceUpdates))

	c, err := tlb.ToCell(cellReport)
	if err != nil {
		lggr.Errorw("OGT commitcodec.Encode tlb.ToCell FAILED", "err", err)
		return nil, fmt.Errorf("cannot encode commit report to cell: %w", err)
	}

	lggr.Debugw("OGT commitcodec.Encode tlb.ToCell succeeded",
		"cellBits", c.BitsSize(),
		"cellRefs", c.RefsNum())

	// Serialize the cell to bytes
	boc := c.ToBOC()
	
	lggr.Debugw("OGT commitcodec.Encode completed",
		"bocLength", len(boc))
	
	return boc, nil
}

func (cr *commitPluginCodecV1) Decode(ctx context.Context, bytes []byte) (cciptypes.CommitPluginReport, error) {
	lggr, err := logger.New()
	if err != nil {
		return cciptypes.CommitPluginReport{}, fmt.Errorf("cannot create logger: %w", err)
	}

	lggr.Debugw("OGT commitcodec.Decode START",
		"bocLength", len(bytes))

	c, err := cell.FromBOC(bytes)
	if err != nil {
		lggr.Errorw("OGT commitcodec.Decode cell.FromBOC FAILED", "err", err)
		return cciptypes.CommitPluginReport{}, fmt.Errorf("cannot decode BOC: %w", err)
	}

	lggr.Debugw("OGT commitcodec.Decode cell.FromBOC succeeded",
		"cellBits", c.BitsSize(),
		"cellRefs", c.RefsNum())

	var report ocr.CommitReport
	if err := tlb.LoadFromCell(&report, c.BeginParse()); err != nil {
		lggr.Errorw("OGT commitcodec.Decode tlb.LoadFromCell FAILED", "err", err)
		return cciptypes.CommitPluginReport{}, fmt.Errorf("cannot decode commit report from cell: %w", err)
	}

	lggr.Debugw("OGT commitcodec.Decode tlb.LoadFromCell succeeded",
		"numTokenPriceUpdates", len(report.PriceUpdates.TokenPriceUpdates),
		"numGasPriceUpdates", len(report.PriceUpdates.GasPriceUpdates),
		"numMerkleRoots", len(report.MerkleRoots))

	priceUpdate := report.PriceUpdates
	var tpuSlice []cciptypes.TokenPrice
	if len(priceUpdate.TokenPriceUpdates) > 0 {
		tpuSlice = make([]cciptypes.TokenPrice, len(priceUpdate.TokenPriceUpdates))
		for i, update := range priceUpdate.TokenPriceUpdates {
			var tokenPrice *big.Int
			if update.UsdPerToken != nil && update.UsdPerToken.Sign() != 0 {
				tokenPrice = update.UsdPerToken
			} else if update.UsdPerToken != nil {
				tokenPrice = big.NewInt(0)
			}
			tpuSlice[i] = cciptypes.TokenPrice{
				TokenID: cciptypes.UnknownEncodedAddress(update.SourceToken.String()),
				Price:   cciptypes.NewBigInt(tokenPrice),
			}
		}
	}

	var gpuSlice []cciptypes.GasPriceChain
	if len(priceUpdate.GasPriceUpdates) > 0 {
		gpuSlice = make([]cciptypes.GasPriceChain, len(priceUpdate.GasPriceUpdates))
		for i, update := range priceUpdate.GasPriceUpdates {
			lggr.Debugw("OGT commitcodec.Decode processing gas price update from TLB",
				"index", i,
				"chainSel", update.DestChainSelector,
				"ExecutionGasPrice_field", update.ExecutionGasPrice.String(),
				"DataAvailabilityGasPrice_field", update.DataAvailabilityGasPrice.String())

			// Pack the two 112-bit fields back into a single 224-bit value
			// Packed format: (DA << 112) | Exec
			var packedPrice *big.Int
			if (update.ExecutionGasPrice != nil && update.ExecutionGasPrice.Sign() != 0) ||
				(update.DataAvailabilityGasPrice != nil && update.DataAvailabilityGasPrice.Sign() != 0) {
				execFee := update.ExecutionGasPrice
				if execFee == nil {
					execFee = big.NewInt(0)
				}
				daFee := update.DataAvailabilityGasPrice
				if daFee == nil {
					daFee = big.NewInt(0)
				}

				lggr.Debugw("OGT commitcodec.Decode packing gas price",
					"index", i,
					"execFee", execFee.String(),
					"daFee", daFee.String())

				packedPrice = feequoter.PackGasPrice(execFee, daFee)

				lggr.Debugw("OGT commitcodec.Decode packed gas price",
					"index", i,
					"packedPrice", packedPrice.String())
			} else {
				packedPrice = big.NewInt(0)
				lggr.Debugw("OGT commitcodec.Decode gas price is zero",
					"index", i)
			}

			gpuSlice[i] = cciptypes.GasPriceChain{
				ChainSel: cciptypes.ChainSelector(update.DestChainSelector),
				GasPrice: cciptypes.NewBigInt(packedPrice),
			}
		}
	}

	mr := report.MerkleRoots
	var merkleRoots []cciptypes.MerkleRootChain
	if len(mr) > 0 {
		merkleRoots = make([]cciptypes.MerkleRootChain, len(mr))
		for i, mr := range mr {
			merkleRoots[i] = cciptypes.MerkleRootChain{
				ChainSel:      cciptypes.ChainSelector(mr.SourceChainSelector),
				OnRampAddress: cciptypes.UnknownAddress(mr.OnRampAddress),
				SeqNumsRange:  cciptypes.NewSeqNumRange(cciptypes.SeqNum(mr.MinSeqNr), cciptypes.SeqNum(mr.MaxSeqNr)),
				MerkleRoot:    cciptypes.Bytes32(mr.MerkleRoot),
			}
		}
	}

	result := cciptypes.CommitPluginReport{
		PriceUpdates: cciptypes.PriceUpdates{
			TokenPriceUpdates: tpuSlice,
			GasPriceUpdates:   gpuSlice,
		},
		BlessedMerkleRoots:   nil,
		UnblessedMerkleRoots: merkleRoots,
		RMNSignatures:        nil,
	}

	lggr.Debugw("OGT commitcodec.Decode completed",
		"numTokenPriceUpdates", len(result.PriceUpdates.TokenPriceUpdates),
		"numGasPriceUpdates", len(result.PriceUpdates.GasPriceUpdates),
		"numMerkleRoots", len(result.UnblessedMerkleRoots))

	return result, nil
}
