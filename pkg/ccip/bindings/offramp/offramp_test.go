package offramp

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

func TestCommit_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenPriceSlice := []ocr.TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
	}
	require.NoError(t, err)

	gasPriceSlice := []ocr.GasPriceUpdate{
		{
			DestChainSelector: 1,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
		{
			DestChainSelector: 2,
			UsdPerUnitGas:     big.NewInt(2000000),
		},
	}
	require.NoError(t, err)
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	merkleRoots := []ocr.MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       onrampAddr,
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	}
	require.NoError(t, err)

	commitReport := ocr.CommitReport{
		MerkleRoots: merkleRoots,
		PriceUpdates: &ocr.PriceUpdates{
			TokenPriceUpdates: tokenPriceSlice,
			GasPriceUpdates:   gasPriceSlice,
		},
	}

	configDigest := make([]byte, 64) // 512 bits digest
	for i := range configDigest {
		configDigest[i] = byte(i)
	}

	subSig := make([]byte, 96) // 768 bits signature
	for i := range subSig {
		subSig[i] = byte(i)
	}

	Sigs := []ocr.SignatureEd25519{
		{Data: subSig},
		{Data: subSig},
	}

	report := Commit{
		QueryID:          1,
		ConfigDigest:     configDigest,
		CommitReport:     commitReport,
		SignatureEd25519: Sigs,
	}

	// Encode to cell
	c, err := tlb.ToCell(report)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded Commit
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Equal(t, commitReport, decoded.CommitReport)
	require.Equal(t, report.QueryID, decoded.QueryID)
	require.Equal(t, report.ConfigDigest, decoded.ConfigDigest)
	require.Equal(t, report.SignatureEd25519, decoded.SignatureEd25519)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	tokenAmountsSlice := []ocr.Any2TVMTokenTransfer{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     1000,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
	}

	rampMessage := ocr.Any2TVMRampMessage{
		Header: ocr.RampMessageHeader{
			MessageID:           make([]byte, 32),
			SourceChainSelector: 1,
			DestChainSelector:   2,
			SequenceNumber:      1,
			Nonce:               0,
		},
		Sender:       onrampAddr,
		Data:         make([]byte, 1000),
		Receiver:     addr,
		GasLimit:     tlb.MustFromTON("0.0001"),
		TokenAmounts: tokenAmountsSlice,
	}

	report := ocr.ExecuteReport{
		SourceChainSelector: 1,
		Message:             rampMessage,
		OffChainTokenData:   common.SnakeRef[common.SnakeBytes]{make([]byte, 120), make([]byte, 130)},
		Proofs:              common.SnakeData[common.Proof]{{Value: big.NewInt(0)}, {Value: big.NewInt(0)}},
		ProofFlagBits:       big.NewInt(0),
	}

	configDigest := make([]byte, 64) // 512 bits digest
	for i := range configDigest {
		configDigest[i] = byte(i)
	}

	execute := Execute{
		QueryID:       1,
		ConfigDigest:  configDigest,
		ExecuteReport: report,
	}

	// Encode to cell
	c, err := tlb.ToCell(execute)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded Execute
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Len(t, decoded.ExecuteReport.Message.TokenAmounts, 2)
	require.Len(t, decoded.ExecuteReport.Proofs, 2)
	require.Equal(t, execute.QueryID, decoded.QueryID)
	require.Equal(t, execute.ConfigDigest, decoded.ConfigDigest)
}

func TestExecuteReport_WithHardCodedTSBytes(t *testing.T) {
	// hex string from TypeScript
	hexStr := "b5ee9c724101030100820002ca00000000000000000000000000000000000000000000000000000000000000010c9f9284461c852bc09c614ab4cba0de00000000000000010000000000000000801da2d2260e0a008e22f73316ac3b1bd05a63f7f092219dadd6bf925ce90bdf14e7312d000102002a141a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a0000d27b54c4"

	// Convert hex string to bytes
	bytes, err := hex.DecodeString(hexStr)
	require.NoError(t, err)

	// Parse the BOC (Bag of Cells)
	c, err := cell.FromBOC(bytes)
	require.NoError(t, err)

	// Load the message from the cell
	var rampMsg ocr.Any2TVMRampMessage
	err = tlb.LoadFromCell(&rampMsg, c.BeginParse())
	require.NoError(t, err)

	// Convert hex string to bytes
	hexStr = "b5ee9c724101040100af0003500c9f9284461c852b000000000000000000000000000000000000000000000000000000000000000001030302ca00000000000000000000000000000000000000000000000000000000000000010c9f9284461c852bc09c614ab4cba0de00000000000000010000000000000000801da2d2260e0a008e22f73316ac3b1bd05a63f7f092219dadd6bf925ce90bdf14e7312d000203002a141a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a000074bb30ab"
	bytes, err = hex.DecodeString(hexStr)
	require.NoError(t, err)

	// Parse the BOC (Bag of Cells)
	c, err = cell.FromBOC(bytes)
	require.NoError(t, err)

	// Load the message from the cell
	var report ocr.ExecuteReport
	err = tlb.LoadFromCell(&report, c.BeginParse())
	require.NoError(t, err)
}
