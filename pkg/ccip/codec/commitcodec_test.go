package codec

import (
	"context"
	cryptorand "crypto/rand"
	"math/big"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
)

func RandomCommitReport() cciptypes.CommitPluginReport {
	// Generate a random TON address for testing
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	if err != nil {
		panic(err)
	}

	return cciptypes.CommitPluginReport{
		UnblessedMerkleRoots: []cciptypes.MerkleRootChain{
			{
				OnRampAddress: randomUnknownAddress(),
				ChainSel:      cciptypes.ChainSelector(rand.Uint64()),
				SeqNumsRange: cciptypes.NewSeqNumRange(
					cciptypes.SeqNum(rand.Uint64()),
					cciptypes.SeqNum(rand.Uint64()),
				),
				MerkleRoot: randomBytes32(),
			},
			{
				OnRampAddress: randomUnknownAddress(),
				ChainSel:      cciptypes.ChainSelector(rand.Uint64()),
				SeqNumsRange: cciptypes.NewSeqNumRange(
					cciptypes.SeqNum(rand.Uint64()),
					cciptypes.SeqNum(rand.Uint64()),
				),
				MerkleRoot: randomBytes32(),
			},
		},
		PriceUpdates: cciptypes.PriceUpdates{
			TokenPriceUpdates: []cciptypes.TokenPrice{
				{
					TokenID: cciptypes.UnknownEncodedAddress(addr.String()),
					Price:   cciptypes.NewBigInt(big.NewInt(rand.Int63())),
				},
			},
			GasPriceUpdates: []cciptypes.GasPriceChain{
				{GasPrice: cciptypes.NewBigInt(big.NewInt(rand.Int63())), ChainSel: cciptypes.ChainSelector(rand.Uint64())},
				{GasPrice: cciptypes.NewBigInt(big.NewInt(rand.Int63())), ChainSel: cciptypes.ChainSelector(rand.Uint64())},
				{GasPrice: cciptypes.NewBigInt(big.NewInt(rand.Int63())), ChainSel: cciptypes.ChainSelector(rand.Uint64())},
			},
		},
	}
}

func randomUnknownAddress() cciptypes.UnknownAddress {
	addr := make([]byte, 64)
	_, _ = cryptorand.Read(addr)
	return addr
}

func TestCommitPluginCodecV1(t *testing.T) {
	testCases := []struct {
		name   string
		report func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport
		expErr bool
	}{
		{
			name: "base report blessed",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				return report
			},
		},
		{
			name: "base report unblessed",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.RMNSignatures = nil
				report.UnblessedMerkleRoots = report.BlessedMerkleRoots
				report.BlessedMerkleRoots = nil
				return report
			},
		},
		{
			name: "empty token address",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.TokenPriceUpdates[0].TokenID = ""
				return report
			},
			expErr: true,
		},
		{
			name: "empty merkle root",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.UnblessedMerkleRoots[0].MerkleRoot = cciptypes.Bytes32{}
				return report
			},
		},
		{
			name: "zero token price",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.TokenPriceUpdates[0].Price = cciptypes.NewBigInt(big.NewInt(0))
				return report
			},
		},
		{
			name: "zero gas price",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.GasPriceUpdates[0].GasPrice = cciptypes.NewBigInt(big.NewInt(0))
				return report
			},
		},
		{
			name: "empty gas price",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.GasPriceUpdates[0].GasPrice = cciptypes.NewBigInt(nil)
				return report
			},
			expErr: true,
		},
		{
			name: "empty price updates - no token prices or gas prices",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.TokenPriceUpdates = nil
				report.PriceUpdates.GasPriceUpdates = nil
				return report
			},
		},
		{
			name: "empty price updates - empty slices",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.TokenPriceUpdates = []cciptypes.TokenPrice{}
				report.PriceUpdates.GasPriceUpdates = []cciptypes.GasPriceChain{}
				return report
			},
		},
		{
			name: "only token price updates, no gas price updates",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.GasPriceUpdates = nil
				return report
			},
		},
		{
			name: "only gas price updates, no token price updates",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.PriceUpdates.TokenPriceUpdates = nil
				return report
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			reportToEncode := tc.report(RandomCommitReport())
			commitCodec := NewCommitPluginCodecV1()
			encodedReport, err := commitCodec.Encode(t.Context(), reportToEncode)
			if tc.expErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			decodedReport, err := commitCodec.Decode(t.Context(), encodedReport)
			require.NoError(t, err)

			// For cases where both price update slices are empty, they will be normalized to nil
			// after encode/decode to save gas onchain, so we need to handle this case specifically.
			if len(reportToEncode.PriceUpdates.TokenPriceUpdates) == 0 &&
				len(reportToEncode.PriceUpdates.GasPriceUpdates) == 0 {
				// Assert that both price slices are empty in the decoded report
				assert.Empty(t, decodedReport.PriceUpdates.TokenPriceUpdates)
				assert.Empty(t, decodedReport.PriceUpdates.GasPriceUpdates)

				// Rest of report should match
				assert.Equal(t, reportToEncode.BlessedMerkleRoots, decodedReport.BlessedMerkleRoots)
				assert.Equal(t, reportToEncode.UnblessedMerkleRoots, decodedReport.UnblessedMerkleRoots)
				assert.Equal(t, reportToEncode.RMNSignatures, decodedReport.RMNSignatures)
			} else {
				// Else compare the entire report
				require.Equal(t, reportToEncode, decodedReport)
			}
		})
	}
}

func randomBytes32() (r [32]byte) {
	b := make([]byte, 32)
	_, _ = cryptorand.Read(b) // Assignment for errcheck. Only used in tests so we can ignore.
	copy(r[:], b)
	return
}

func BenchmarkCommitPluginCodecV1_Encode(b *testing.B) {
	commitCodec := NewCommitPluginCodecV1()
	ctx := context.Background()

	rep := RandomCommitReport()
	for i := 0; i < b.N; i++ {
		_, err := commitCodec.Encode(ctx, rep)
		require.NoError(b, err)
	}
}

func BenchmarkCommitPluginCodecV1_Decode(b *testing.B) {
	commitCodec := NewCommitPluginCodecV1()
	ctx := context.Background()
	encodedReport, err := commitCodec.Encode(ctx, RandomCommitReport())
	require.NoError(b, err)

	for i := 0; i < b.N; i++ {
		_, err := commitCodec.Decode(ctx, encodedReport)
		require.NoError(b, err)
	}
}

func BenchmarkCommitPluginCodecV1_Encode_Decode(b *testing.B) {
	commitCodec := NewCommitPluginCodecV1()
	ctx := context.Background()

	rep := RandomCommitReport()
	for i := 0; i < b.N; i++ {
		encodedReport, err := commitCodec.Encode(ctx, rep)
		require.NoError(b, err)
		decodedReport, err := commitCodec.Decode(ctx, encodedReport)
		require.NoError(b, err)
		require.Equal(b, rep, decodedReport)
	}
}

func TestCommitPluginCodecV1_NilPriceUpdates(t *testing.T) {
	t.Run("encode sets PriceUpdates to nil when both slices are empty", func(t *testing.T) {
		report := cciptypes.CommitPluginReport{
			UnblessedMerkleRoots: []cciptypes.MerkleRootChain{
				{
					OnRampAddress: randomUnknownAddress(),
					ChainSel:      cciptypes.ChainSelector(12345),
					SeqNumsRange:  cciptypes.NewSeqNumRange(cciptypes.SeqNum(1), cciptypes.SeqNum(10)),
					MerkleRoot:    randomBytes32(),
				},
			},
			PriceUpdates: cciptypes.PriceUpdates{
				TokenPriceUpdates: nil,
				GasPriceUpdates:   nil,
			},
		}

		commitCodec := NewCommitPluginCodecV1()
		encodedReport, err := commitCodec.Encode(context.Background(), report)
		require.NoError(t, err)
		require.NotNil(t, encodedReport)

		// Decode and verify the round-trip works
		decodedReport, err := commitCodec.Decode(context.Background(), encodedReport)
		require.NoError(t, err)

		// Verify that empty slices are preserved as nil or empty
		assert.Empty(t, decodedReport.PriceUpdates.TokenPriceUpdates)
		assert.Empty(t, decodedReport.PriceUpdates.GasPriceUpdates)
		assert.Len(t, decodedReport.UnblessedMerkleRoots, len(report.UnblessedMerkleRoots))
	})

	t.Run("decode handles nil PriceUpdates without panic", func(t *testing.T) {
		// Create a report with empty price updates
		report := cciptypes.CommitPluginReport{
			UnblessedMerkleRoots: []cciptypes.MerkleRootChain{
				{
					OnRampAddress: randomUnknownAddress(),
					ChainSel:      cciptypes.ChainSelector(67890),
					SeqNumsRange:  cciptypes.NewSeqNumRange(cciptypes.SeqNum(5), cciptypes.SeqNum(15)),
					MerkleRoot:    randomBytes32(),
				},
			},
			PriceUpdates: cciptypes.PriceUpdates{
				TokenPriceUpdates: []cciptypes.TokenPrice{},
				GasPriceUpdates:   []cciptypes.GasPriceChain{},
			},
		}

		commitCodec := NewCommitPluginCodecV1()

		// Encode the report
		encodedReport, err := commitCodec.Encode(context.Background(), report)
		require.NoError(t, err)

		// Decode should not panic even if PriceUpdates is nil in the encoded data
		decodedReport, err := commitCodec.Decode(context.Background(), encodedReport)
		require.NoError(t, err)
		assert.NotNil(t, decodedReport)

		// Verify slices are empty (nil or zero-length)
		assert.Empty(t, decodedReport.PriceUpdates.TokenPriceUpdates)
		assert.Empty(t, decodedReport.PriceUpdates.GasPriceUpdates)
	})
}
