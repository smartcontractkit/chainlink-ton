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

var randomBlessedCommitReport = func() cciptypes.CommitPluginReport {
	// Generate a random TON address for testing
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	if err != nil {
		panic(err)
	}

	return cciptypes.CommitPluginReport{
		BlessedMerkleRoots: []cciptypes.MerkleRootChain{
			{
				OnRampAddress: make(cciptypes.UnknownAddress, 64),
				ChainSel:      cciptypes.ChainSelector(rand.Uint64()),
				SeqNumsRange: cciptypes.NewSeqNumRange(
					cciptypes.SeqNum(rand.Uint64()),
					cciptypes.SeqNum(rand.Uint64()),
				),
				MerkleRoot: randomBytes32(),
			},
		},
		UnblessedMerkleRoots: []cciptypes.MerkleRootChain{
			{
				OnRampAddress: make(cciptypes.UnknownAddress, 64),
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
		RMNSignatures: []cciptypes.RMNECDSASignature{
			{R: randomBytes32(), S: randomBytes32()},
		},
	}
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
				report.BlessedMerkleRoots[0].MerkleRoot = cciptypes.Bytes32{}
				return report
			},
		},
		{
			name: "both blessed and unblessed merkle roots",
			report: func(report cciptypes.CommitPluginReport) cciptypes.CommitPluginReport {
				report.UnblessedMerkleRoots = []cciptypes.MerkleRootChain{
					report.BlessedMerkleRoots[0]}
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
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			report := tc.report(randomBlessedCommitReport())
			commitCodec := NewCommitPluginCodecV1()
			encodedReport, err := commitCodec.Encode(t.Context(), report)
			if tc.expErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			decodedReport, err := commitCodec.Decode(t.Context(), encodedReport)
			require.NoError(t, err)
			require.Equal(t, report, decodedReport)
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

	rep := randomBlessedCommitReport()
	for i := 0; i < b.N; i++ {
		_, err := commitCodec.Encode(ctx, rep)
		require.NoError(b, err)
	}
}

func BenchmarkCommitPluginCodecV1_Decode(b *testing.B) {
	commitCodec := NewCommitPluginCodecV1()
	ctx := context.Background()
	encodedReport, err := commitCodec.Encode(ctx, randomBlessedCommitReport())
	require.NoError(b, err)

	for i := 0; i < b.N; i++ {
		_, err := commitCodec.Decode(ctx, encodedReport)
		require.NoError(b, err)
	}
}

func BenchmarkCommitPluginCodecV1_Encode_Decode(b *testing.B) {
	commitCodec := NewCommitPluginCodecV1()
	ctx := context.Background()

	rep := randomBlessedCommitReport()
	for i := 0; i < b.N; i++ {
		encodedReport, err := commitCodec.Encode(ctx, rep)
		require.NoError(b, err)
		decodedReport, err := commitCodec.Decode(ctx, encodedReport)
		require.NoError(b, err)
		require.Equal(b, rep, decodedReport)
	}
}
