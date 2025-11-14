package ocr

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

func TestGetReportTxInfo(t *testing.T) {
	cfg := &Config{
		CommitPriceUpdateOnlyCostTON: 0.05,
		CommitPriceAndRootCostTON:    0.08,
		ExecuteCostTON:               0.1,
	}

	t.Run("execute report with gas limit", func(t *testing.T) {
		// Create an execute report with 0.5 TON gas limit
		gasLimit := tlb.MustFromTON("0.5")
		onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		executeReport := ocr.ExecuteReport{
			SourceChainSelector: 123,
			Message: ocr.Any2TVMRampMessage{
				Header: ocr.RampMessageHeader{
					MessageID:           make([]byte, 32),
					SourceChainSelector: 123,
					DestChainSelector:   456,
					SequenceNumber:      1,
					Nonce:               1,
				},
				Sender:       onrampAddr,
				Data:         []byte("test data"),
				Receiver:     address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
				GasLimit:     gasLimit,
				TokenAmounts: nil,
			},
			OffChainTokenData: common.SnakeRef[common.SnakeBytes]{},
			Proofs:            common.SnakeData[common.Proof]{},
			ProofFlagBits:     big.NewInt(0),
		}

		reportCell, err := tlb.ToCell(executeReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: ExecuteCostTON (0.1) + gasLimit (0.5) = 0.6 TON
		txID, cost, returnedGasLimit, err := getReportTxInfo(reportBytes, 1, cfg)
		require.NoError(t, err)

		// Verify txID format for execute report
		assert.Contains(t, txID, "seq-1-msg-")

		// Verify gas limit is returned
		require.NotNil(t, returnedGasLimit)
		assert.Equal(t, gasLimit.Nano(), returnedGasLimit.Nano(),
			"expected gas limit %s, got %s", gasLimit.String(), returnedGasLimit.String())

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.6")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("execute report with large gas limit", func(t *testing.T) {
		gasLimit := tlb.MustFromTON("1.25")
		onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		executeReport := ocr.ExecuteReport{
			SourceChainSelector: 123,
			Message: ocr.Any2TVMRampMessage{
				Header: ocr.RampMessageHeader{
					MessageID:           make([]byte, 32),
					SourceChainSelector: 123,
					DestChainSelector:   456,
					SequenceNumber:      1,
					Nonce:               1,
				},
				Sender:       onrampAddr,
				Data:         []byte("test data"),
				Receiver:     address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
				GasLimit:     gasLimit,
				TokenAmounts: nil,
			},
			OffChainTokenData: common.SnakeRef[common.SnakeBytes]{},
			Proofs:            common.SnakeData[common.Proof]{},
			ProofFlagBits:     big.NewInt(0),
		}

		reportCell, err := tlb.ToCell(executeReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: ExecuteCostTON (0.1) + gasLimit (1.25) = 1.35 TON
		txID, cost, returnedGasLimit, err := getReportTxInfo(reportBytes, 2, cfg)
		require.NoError(t, err)

		// Verify txID format for execute report
		assert.Contains(t, txID, "seq-2-msg-")

		// Verify gas limit is returned
		require.NotNil(t, returnedGasLimit)
		assert.Equal(t, gasLimit.Nano(), returnedGasLimit.Nano(),
			"expected gas limit %s, got %s", gasLimit.String(), returnedGasLimit.String())

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("1.35")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report price only (no merkle roots)", func(t *testing.T) {
		commitReport := ocr.CommitReport{
			PriceUpdates: &ocr.PriceUpdates{
				TokenPriceUpdates: common.SnakeData[ocr.TokenPriceUpdate]{
					{
						SourceToken: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
						UsdPerToken: big.NewInt(1000000),
					},
				},
				GasPriceUpdates: common.SnakeData[ocr.GasPriceUpdate]{
					{
						DestChainSelector: 456,
						UsdPerUnitGas:     big.NewInt(500000),
					},
				},
			},
			MerkleRoots: common.SnakeData[ocr.MerkleRoot]{}, // No merkle roots
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: CommitPriceUpdateOnlyCostTON (0.05) only
		txID, cost, gasLimit, err := getReportTxInfo(reportBytes, 10, cfg)
		require.NoError(t, err)

		assert.Equal(t, "seq-10", txID)
		assert.Nil(t, gasLimit)

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.05")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with one merkle root", func(t *testing.T) {
		// Create a commit report with 1 merkle root
		onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		commitReport := ocr.CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[ocr.MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress:       onrampAddr,
					MinSeqNr:            1,
					MaxSeqNr:            1,
					MerkleRoot:          make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: CommitPriceAndRootCostTON (0.08) - doesn't matter how many roots
		txID, cost, gasLimit, err := getReportTxInfo(reportBytes, 20, cfg)
		require.NoError(t, err)

		// Verify txID format for commit report
		assert.Equal(t, "seq-20", txID)

		// Verify no gas limit for commit report
		assert.Nil(t, gasLimit)

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.08")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with three merkle roots", func(t *testing.T) {
		// Create a commit report with 3 merkle roots
		onrampAddr1 := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		onrampAddr2 := common.CrossChainAddress{0x06, 0x07, 0x08, 0x09, 0x0a}
		onrampAddr3 := common.CrossChainAddress{0x0b, 0x0c, 0x0d, 0x0e, 0x0f}
		commitReport := ocr.CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[ocr.MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress:       onrampAddr1,
					MinSeqNr:            1,
					MaxSeqNr:            1,
					MerkleRoot:          make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress:       onrampAddr2,
					MinSeqNr:            2,
					MaxSeqNr:            2,
					MerkleRoot:          make([]byte, 32),
				},
				{
					SourceChainSelector: 789,
					OnRampAddress:       onrampAddr3,
					MinSeqNr:            3,
					MaxSeqNr:            3,
					MerkleRoot:          make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: CommitPriceAndRootCostTON (0.08) - same cost regardless of number of roots
		txID, cost, gasLimit, err := getReportTxInfo(reportBytes, 30, cfg)
		require.NoError(t, err)

		// Verify txID format for commit report
		assert.Equal(t, "seq-30", txID)

		// Verify no gas limit for commit report
		assert.Nil(t, gasLimit)

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.08")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with merkle roots and price updates", func(t *testing.T) {
		// Create a commit report with both merkle roots and price updates
		onrampAddr1 := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		onrampAddr2 := common.CrossChainAddress{0x06, 0x07, 0x08, 0x09, 0x0a}
		commitReport := ocr.CommitReport{
			PriceUpdates: &ocr.PriceUpdates{
				TokenPriceUpdates: common.SnakeData[ocr.TokenPriceUpdate]{
					{
						SourceToken: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
						UsdPerToken: big.NewInt(1000000),
					},
				},
				GasPriceUpdates: common.SnakeData[ocr.GasPriceUpdate]{
					{
						DestChainSelector: 456,
						UsdPerUnitGas:     big.NewInt(500000),
					},
				},
			},
			MerkleRoots: common.SnakeData[ocr.MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress:       onrampAddr1,
					MinSeqNr:            1,
					MaxSeqNr:            2,
					MerkleRoot:          make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress:       onrampAddr2,
					MinSeqNr:            1,
					MaxSeqNr:            1,
					MerkleRoot:          make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: CommitPriceAndRootCostTON (0.08) - has merkle roots
		txID, cost, gasLimit, err := getReportTxInfo(reportBytes, 40, cfg)
		require.NoError(t, err)

		// Verify txID format for commit report
		assert.Equal(t, "seq-40", txID)

		// Verify no gas limit for commit report
		assert.Nil(t, gasLimit)

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.08")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("invalid BOC data", func(t *testing.T) {
		invalidBytes := []byte("not a valid BOC")

		txID, _, _, err := getReportTxInfo(invalidBytes, 50, cfg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode report BOC")
		assert.Equal(t, "seq-50", txID) // Should still return a valid txID
	})

	t.Run("custom config values", func(t *testing.T) {
		customCfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.2,
			CommitPriceAndRootCostTON:    0.3,
			ExecuteCostTON:               0.5,
		}

		// Create a commit report with 2 merkle roots
		onrampAddr1 := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
		onrampAddr2 := common.CrossChainAddress{0x06, 0x07, 0x08, 0x09, 0x0a}
		commitReport := ocr.CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[ocr.MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress:       onrampAddr1,
					MinSeqNr:            1,
					MaxSeqNr:            1,
					MerkleRoot:          make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress:       onrampAddr2,
					MinSeqNr:            2,
					MaxSeqNr:            2,
					MerkleRoot:          make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes := reportCell.ToBOC()

		// Test: CommitPriceAndRootCostTON (0.3) with custom config
		txID, cost, gasLimit, err := getReportTxInfo(reportBytes, 60, customCfg)
		require.NoError(t, err)

		// Verify txID format for commit report
		assert.Equal(t, "seq-60", txID)

		// Verify no gas limit for commit report
		assert.Nil(t, gasLimit)

		// Verify cost is returned
		require.NotNil(t, cost)
		expectedCost := tlb.MustFromTON("0.3")
		assert.Equal(t, expectedCost.Nano(), cost.Nano(),
			"expected cost %s, got %s", expectedCost.String(), cost.String())
	})
}
