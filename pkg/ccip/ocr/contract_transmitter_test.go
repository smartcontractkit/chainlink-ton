package ocr

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

func TestGetGasCostAmount(t *testing.T) {
	cfg := &Config{
		CommitPriceUpdateOnlyCostTON: 0.05,
		CommitPerMessageCostTON:      0.01,
		ExecuteCostTON:               0.1,
	}

	t.Run("execute report with gas limit", func(t *testing.T) {
		// Create an execute report with 0.5 TON gas limit
		gasLimit := tlb.MustFromTON("0.5")
		executeReport := ExecuteReport{
			SourceChainSelector: 123,
			Message: Any2TVMRampMessage{
				Header: RampMessageHeader{
					MessageID:           make([]byte, 32),
					SourceChainSelector: 123,
					DestChainSelector:   456,
					SequenceNumber:      1,
					Nonce:               1,
				},
				Sender: common.CrossChainAddress{
					ChainSelector: 123,
					AddressBytes:  make([]byte, 20),
				},
				Data:         common.SnakeBytes{Data: []byte("test data")},
				Receiver:     address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
				GasLimit:     gasLimit,
				TokenAmounts: nil,
			},
			OffChainTokenData: common.SnakeRef[common.SnakeBytes]{Data: []common.SnakeBytes{}},
			Proofs:            common.SnakeData[common.Proof]{},
			ProofFlagBits:     big.NewInt(0),
		}

		reportCell, err := tlb.ToCell(executeReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: ExecuteCostTON (0.1) + gasLimit (0.5) = 0.6 TON
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.6")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("execute report with larger gas limit", func(t *testing.T) {
		// Create an execute report with 1.25 TON gas limit
		gasLimit := tlb.MustFromTON("1.25")
		executeReport := ExecuteReport{
			SourceChainSelector: 123,
			Message: Any2TVMRampMessage{
				Header: RampMessageHeader{
					MessageID:           make([]byte, 32),
					SourceChainSelector: 123,
					DestChainSelector:   456,
					SequenceNumber:      1,
					Nonce:               1,
				},
				Sender: common.CrossChainAddress{
					ChainSelector: 123,
					AddressBytes:  make([]byte, 20),
				},
				Data:         common.SnakeBytes{Data: []byte("test data")},
				Receiver:     address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
				GasLimit:     gasLimit,
				TokenAmounts: nil,
			},
			OffChainTokenData: common.SnakeRef[common.SnakeBytes]{Data: []common.SnakeBytes{}},
			Proofs:            common.SnakeData[common.Proof]{},
			ProofFlagBits:     big.NewInt(0),
		}

		reportCell, err := tlb.ToCell(executeReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: ExecuteCostTON (0.1) + gasLimit (1.25) = 1.35 TON
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("1.35")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with no messages (price-only)", func(t *testing.T) {
		// Create a commit report with only price updates, no merkle roots
		commitReport := CommitReport{
			PriceUpdates: &PriceUpdates{
				TokenPriceUpdates: common.SnakeData[TokenPriceUpdate]{
					{
						SourceToken: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
						UsdPerToken: big.NewInt(1000000),
					},
				},
				GasPriceUpdates: common.SnakeData[GasPriceUpdate]{
					{
						DestChainSelector: 456,
						UsdPerUnitGas:     big.NewInt(500000),
					},
				},
			},
			MerkleRoots: common.SnakeData[MerkleRoot]{}, // No merkle roots
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: CommitPriceUpdateOnlyCostTON (0.05) only
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.05")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with one message", func(t *testing.T) {
		// Create a commit report with 1 merkle root
		commitReport := CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 123,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   1,
					MaxSeqNr:   1,
					MerkleRoot: make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: CommitPriceUpdateOnlyCostTON (0.05) + CommitPerMessageCostTON (0.01) * 1 = 0.06 TON
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.06")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with three messages", func(t *testing.T) {
		// Create a commit report with 3 merkle roots
		commitReport := CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 123,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   1,
					MaxSeqNr:   1,
					MerkleRoot: make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 456,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   2,
					MaxSeqNr:   2,
					MerkleRoot: make([]byte, 32),
				},
				{
					SourceChainSelector: 789,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 789,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   3,
					MaxSeqNr:   3,
					MerkleRoot: make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: CommitPriceUpdateOnlyCostTON (0.05) + CommitPerMessageCostTON (0.01) * 3 = 0.08 TON
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.08")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("commit report with messages and price updates", func(t *testing.T) {
		// Create a commit report with both merkle roots and price updates
		commitReport := CommitReport{
			PriceUpdates: &PriceUpdates{
				TokenPriceUpdates: common.SnakeData[TokenPriceUpdate]{
					{
						SourceToken: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
						UsdPerToken: big.NewInt(1000000),
					},
				},
				GasPriceUpdates: common.SnakeData[GasPriceUpdate]{
					{
						DestChainSelector: 456,
						UsdPerUnitGas:     big.NewInt(500000),
					},
				},
			},
			MerkleRoots: common.SnakeData[MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 123,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   1,
					MaxSeqNr:   2,
					MerkleRoot: make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 456,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   1,
					MaxSeqNr:   1,
					MerkleRoot: make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: CommitPriceUpdateOnlyCostTON (0.05) + CommitPerMessageCostTON (0.01) * 2 = 0.07 TON
		cost, err := getGasCostAmount(reportBytes, cfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.07")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})

	t.Run("invalid BOC data", func(t *testing.T) {
		invalidBytes := []byte("not a valid BOC")

		_, err := getGasCostAmount(invalidBytes, cfg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode report BOC")
	})

	t.Run("custom config values", func(t *testing.T) {
		customCfg := &Config{
			CommitPriceUpdateOnlyCostTON: 0.2,
			CommitPerMessageCostTON:      0.05,
			ExecuteCostTON:               0.5,
		}

		// Create a commit report with 2 messages
		commitReport := CommitReport{
			PriceUpdates: nil,
			MerkleRoots: common.SnakeData[MerkleRoot]{
				{
					SourceChainSelector: 123,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 123,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   1,
					MaxSeqNr:   1,
					MerkleRoot: make([]byte, 32),
				},
				{
					SourceChainSelector: 456,
					OnRampAddress: common.CrossChainAddress{
						ChainSelector: 456,
						AddressBytes:  make([]byte, 20),
					},
					MinSeqNr:   2,
					MaxSeqNr:   2,
					MerkleRoot: make([]byte, 32),
				},
			},
		}

		reportCell, err := tlb.ToCell(commitReport)
		require.NoError(t, err)

		reportBytes, err := reportCell.ToBOC()
		require.NoError(t, err)

		// Test: CommitPriceUpdateOnlyCostTON (0.2) + CommitPerMessageCostTON (0.05) * 2 = 0.3 TON
		cost, err := getGasCostAmount(reportBytes, customCfg)
		require.NoError(t, err)

		expectedCost := tlb.MustFromTON("0.3")
		assert.True(t, cost.Nano().Cmp(expectedCost.Nano()) == 0,
			"expected %s, got %s", expectedCost.String(), cost.String())
	})
}

