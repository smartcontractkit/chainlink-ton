package codec

import (
	"context"
	"encoding/json"
	"math/big"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tvm/cell"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
)

// executeReportGoldenDir is the repo-rooted directory holding the golden fixture
// and BOC files. Tests in the codec package run from cciplib/ccip/codec, so the
// relative path climbs out of the cciplib module to the repo root.
const executeReportGoldenDir = "../../../testdata/golden"

// executeReportFixture wraps a ccipocr3.ExecutePluginReport with a description,
// matching the golden file convention at testdata/golden/execute_report.json.
type executeReportFixture struct {
	Description string                       `json:"description"`
	Report      ccipocr3.ExecutePluginReport `json:"report"`
}

// newExecutePluginCodecV1WithRealDecoder constructs the current ExecutePluginCodecV1
// with a real NewExtraDataDecoder registered for the chain families used in tests.
// Selector 5009297550715157269 (used in the golden fixture) is EVM-family.
func newExecutePluginCodecV1WithRealDecoder() ccipocr3.ExecutePluginCodec {
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM:    NewExtraDataDecoder(),
		chainsel.FamilySolana: NewExtraDataDecoder(),
		chainsel.FamilyTon:    NewExtraDataDecoder(),
	})
	return NewExecutePluginCodecV1(edc)
}

// loadExecuteReportFixture reads and parses the golden JSON fixture.
func loadExecuteReportFixture(t *testing.T) ccipocr3.ExecutePluginReport {
	t.Helper()
	data, err := os.ReadFile(executeReportGoldenDir + "/execute_report.json")
	require.NoError(t, err)
	var fx executeReportFixture
	require.NoError(t, json.Unmarshal(data, &fx))
	return fx.Report
}

// loadExecuteReportGoldenBOC reads the committed golden BOC bytes.
func loadExecuteReportGoldenBOC(t *testing.T) []byte {
	t.Helper()
	boc, err := os.ReadFile(executeReportGoldenDir + "/execute_report.boc")
	require.NoError(t, err)
	return boc
}

// TestExecuteReport_TokenlessMatchesGoldenBOC verifies backwards compatibility
// between the current cciplib binding (nested LispList[LispList[SnakeBytes]]
// OffChainTokenData) and the legacy binding (flat LispList[SnakeBytes]).
//
// No token-transfer messages have happened for TON in production yet, so a
// tokenless report must encode to the exact same bag of cells in both bindings.
// The golden BOC is produced by the legacy CLI (see
// cciplib/ccip/bindings/ocr/testdata/legacyexecutereport) and committed to the
// repo; CI regenerates it and asserts no mutation.
func TestExecuteReport_TokenlessMatchesGoldenBOC(t *testing.T) {
	ctx := context.Background()
	codec := newExecutePluginCodecV1WithRealDecoder()
	report := loadExecuteReportFixture(t)
	goldenBOC := loadExecuteReportGoldenBOC(t)

	// Encode with the current codec and assert exact byte equality with the
	// golden BOC produced by the legacy binding.
	encoded, err := codec.Encode(ctx, report)
	require.NoError(t, err)
	require.NotNil(t, encoded, "tokenless report must produce a non-nil BOC")
	assert.Equal(t, goldenBOC, encoded, "current codec BOC must match legacy golden BOC byte-for-byte")

	// Also verify cell hash equality to make the on-chain report identity explicit.
	goldenCell, err := cell.FromBOC(goldenBOC)
	require.NoError(t, err)
	encodedCell, err := cell.FromBOC(encoded)
	require.NoError(t, err)
	assert.Equal(t, goldenCell.Hash(), encodedCell.Hash(), "cell hashes must match")

	// Decode the golden BOC with the current codec and assert the result matches
	// the JSON fixture, accounting for the known asymmetries:
	//   - ExtraArgs: Decode always synthesizes a GenericExtraArgsV2 BOC, so the
	//     decoded value is non-empty even when the input was empty. We compare
	//     the decoded gasLimit instead of the raw bytes.
	//   - OffchainTokenData: Decode returns a non-nil empty slice [][]byte{}
	//     for tokenless reports, not nil.
	//   - Proofs: the fixture uses proofs without the top bit set to avoid the
	//     known signed-decode issue (## 256 decodes as signed big.Int); that
	//     fix is tracked in a separate PR that replaces Proof.Value with a
	//     custom big.Uint type.
	decoded, err := codec.Decode(ctx, goldenBOC)
	require.NoError(t, err)

	require.Len(t, decoded.ChainReports, 1, "decoded report must have one chain report")
	decodedCR := decoded.ChainReports[0]
	expectedCR := report.ChainReports[0]

	// Source chain selector
	assert.Equal(t, expectedCR.SourceChainSelector, decodedCR.SourceChainSelector)

	// Proofs — the fixture uses proofs without the top bit set so they
	// round-trip correctly with the current signed ## 256 decode.
	require.Len(t, decodedCR.Proofs, len(expectedCR.Proofs), "proof count must match")
	for i, expected := range expectedCR.Proofs {
		assert.Equal(t, expected, decodedCR.Proofs[i], "proof %d must round-trip exactly", i)
	}

	// ProofFlagBits
	assert.Equal(t, expectedCR.ProofFlagBits.Int, decodedCR.ProofFlagBits.Int)

	// OffchainTokenData: decoded is [] (non-nil empty), fixture is [] (non-nil empty).
	// Both should be len 0.
	assert.Empty(t, decodedCR.OffchainTokenData, "tokenless report decodes to empty offchainTokenData")

	// Messages
	require.Len(t, decodedCR.Messages, 1, "decoded report must have one message")
	decodedMsg := decodedCR.Messages[0]
	expectedMsg := expectedCR.Messages[0]

	// Header
	assert.Equal(t, expectedMsg.Header.MessageID, decodedMsg.Header.MessageID)
	assert.Equal(t, expectedMsg.Header.SourceChainSelector, decodedMsg.Header.SourceChainSelector)
	assert.Equal(t, expectedMsg.Header.DestChainSelector, decodedMsg.Header.DestChainSelector)
	assert.Equal(t, expectedMsg.Header.SequenceNumber, decodedMsg.Header.SequenceNumber)
	assert.Equal(t, expectedMsg.Header.Nonce, decodedMsg.Header.Nonce)

	// Sender, Data, Receiver
	assert.Equal(t, expectedMsg.Sender, decodedMsg.Sender)
	assert.Equal(t, expectedMsg.Data, decodedMsg.Data)
	assert.Equal(t, expectedMsg.Receiver, decodedMsg.Receiver)

	// ExtraArgs: Decode synthesizes a GenericExtraArgsV2 BOC with GasLimit from
	// the message and AllowOutOfOrderExecution: true. The fixture has empty
	// ExtraArgs (so DecodeExtraArgs is skipped during encode and gasLimit
	// defaults to zero). Decode the synthesized BOC back and verify gasLimit
	// is zero, matching the fixture's implicit default.
	assert.NotEmpty(t, decodedMsg.ExtraArgs, "Decode always synthesizes a GenericExtraArgsV2 BOC")
	decodedExtraArgsMap, err := NewExtraDataDecoder().DecodeExtraArgsToMap(decodedMsg.ExtraArgs)
	require.NoError(t, err)
	gasLimit, ok := decodedExtraArgsMap["gasLimit"].(*big.Int)
	require.True(t, ok, "decoded extraArgs must contain a gasLimit *big.Int")
	assert.Equal(t, int64(0), gasLimit.Int64(), "gasLimit must be zero for a tokenless report with empty extraArgs")

	// TokenAmounts: both nil (tokenless)
	assert.Nil(t, decodedMsg.TokenAmounts, "tokenless report decodes to nil tokenAmounts")
}
