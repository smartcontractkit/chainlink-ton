package codec

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	mocks "github.com/smartcontractkit/chainlink-ton/cciplib/mocks/ccipocr3"
)

// any2TVMMessageIDGoldenPath points at the single source of truth for the expected
// MessageIDs of the fixed messages used below, shared with the TypeScript and Tolk
// implementations (see contracts/tests/ccip/offramp/OffRamp.messageID.spec.ts).
// Golden values are anchored to the TypeScript/Tolk implementations, which match the
// on-chain OffRamp leaf recomputation from the execute report.
const any2TVMMessageIDGoldenPath = "../../../testdata/golden/any2tvm_message_id.json"

// goldenTokenTransfer mirrors one entry of the golden file's message.tokenAmounts.
type goldenTokenTransfer struct {
	SourcePoolAddress string  `json:"sourcePoolAddress"`
	Token             string  `json:"token"`
	DestGasAmount     string  `json:"destGasAmount"`
	ExtraData         *string `json:"extraData"`
	Amount            string  `json:"amount"`
}

// goldenMessage mirrors the golden file's message object.
type goldenMessage struct {
	Header struct {
		MessageID           string `json:"messageId"`
		SourceChainSelector string `json:"sourceChainSelector"`
		DestChainSelector   string `json:"destChainSelector"`
		SequenceNumber      string `json:"sequenceNumber"`
		Nonce               string `json:"nonce"`
		OnRamp              string `json:"onRamp"`
	} `json:"header"`
	Sender       string                `json:"sender"`
	Data         string                `json:"data"`
	Receiver     string                `json:"receiver"`
	GasLimit     string                `json:"gasLimit"`
	TokenAmounts []goldenTokenTransfer `json:"tokenAmounts"`
}

// goldenCase mirrors one entry of the golden file's cases array.
type goldenCase struct {
	Name              string        `json:"name"`
	Message           goldenMessage `json:"message"`
	ExpectedMessageID string        `json:"expectedMessageId"`
}

// loadAny2TVMMessageIDGoldenCases reads the golden MessageIDs that the Go, TypeScript,
// and Tolk implementations of the Any2TVM message hasher must all agree on.
func loadAny2TVMMessageIDGoldenCases(t *testing.T) []goldenCase {
	data, err := os.ReadFile(any2TVMMessageIDGoldenPath)
	require.NoError(t, err)

	var golden struct {
		Cases []goldenCase `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(data, &golden))
	require.NotEmpty(t, golden.Cases, "golden file must contain at least one case")

	for _, c := range golden.Cases {
		require.NotEqual(t, "PENDING", c.ExpectedMessageID,
			"case %s has a placeholder golden value; anchor it via the TypeScript/Tolk test first", c.Name)
	}
	return golden.Cases
}

// mustHex decodes a 0x-prefixed hex string from the golden file.
func mustHex(t *testing.T, s string) []byte {
	b, err := hex.DecodeString(strings.TrimPrefix(s, "0x"))
	require.NoError(t, err)
	return b
}

// mustBigInt parses a decimal string from the golden file.
func mustBigInt(t *testing.T, s string) *big.Int {
	v, ok := new(big.Int).SetString(s, 10)
	require.True(t, ok, "invalid decimal string %q", s)
	return v
}

// goldenCaseToMessage converts a golden file case into a ccipocr3.Message.
func goldenCaseToMessage(t *testing.T, c goldenCase) ccipocr3.Message {
	msg := c.Message
	header := msg.Header

	receiverAddr, err := address.ParseAddr(msg.Receiver)
	require.NoError(t, err)
	rawReceiver, err := ToRawAddr(receiverAddr)
	require.NoError(t, err)

	var messageID [32]byte
	messageIDInt := mustBigInt(t, header.MessageID)
	require.LessOrEqual(t, messageIDInt.BitLen(), 256)
	messageIDFill := messageIDInt.FillBytes(messageID[:])
	copy(messageID[:], messageIDFill)

	tokenAmounts := make([]ccipocr3.RampTokenAmount, 0, len(msg.TokenAmounts))
	for _, tt := range msg.TokenAmounts {
		ttTokenAddr, err := address.ParseAddr(tt.Token)
		require.NoError(t, err)
		rawToken, err := ToRawAddr(ttTokenAddr)
		require.NoError(t, err)

		var extraData []byte
		if tt.ExtraData != nil {
			extraData = mustHex(t, *tt.ExtraData)
		}

		tokenAmounts = append(tokenAmounts, ccipocr3.RampTokenAmount{
			SourcePoolAddress: ccipocr3.UnknownAddress(mustHex(t, tt.SourcePoolAddress)),
			DestTokenAddress:  rawToken[:],
			DestExecData:      binary.BigEndian.AppendUint32(nil, uint32(mustBigInt(t, tt.DestGasAmount).Uint64())), //nolint:gosec // fixture value fits
			ExtraData:         extraData,
			Amount:            ccipocr3.BigInt{Int: mustBigInt(t, tt.Amount)},
		})
	}

	return ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           messageID,
			SourceChainSelector: ccipocr3.ChainSelector(mustBigInt(t, header.SourceChainSelector).Uint64()),
			DestChainSelector:   ccipocr3.ChainSelector(mustBigInt(t, header.DestChainSelector).Uint64()),
			SequenceNumber:      ccipocr3.SeqNum(mustBigInt(t, header.SequenceNumber).Uint64()),
			Nonce:               mustBigInt(t, header.Nonce).Uint64(),
			OnRamp:              mustHex(t, header.OnRamp),
		},
		Sender:       ccipocr3.UnknownAddress(mustHex(t, msg.Sender)),
		Data:         mustHex(t, msg.Data),
		Receiver:     rawReceiver[:],
		ExtraArgs:    []byte{0x2},
		TokenAmounts: tokenAmounts,
	}
}

// Extract a single message from the executecodec_test.go helper
func randomTONMessage(t *testing.T, sourceChainSelector uint64) ccipocr3.Message {
	report := randomTONExecuteReport(t, sourceChainSelector)
	return report.ChainReports[0].Messages[0]
}

func TestMessageHasherV1_TON(t *testing.T) {
	ctx := context.Background()
	mockExtraDataCodec := new(mocks.SourceChainExtraDataCodec)
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM: mockExtraDataCodec,
	})

	mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
		"destgasamount": uint32(1000),
	}, nil)
	mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(map[string]any{
		"gasLimit": big.NewInt(1000),
	}, nil)

	lg := logger.Test(t)
	hasher := NewMessageHasherV1(lg, edc)

	t.Run("successful hash generation", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		hash, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
		assert.NotEqual(t, [32]byte{}, hash)
		assert.Len(t, hash, 32)
	})

	t.Run("consistent hash for same message", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		hash1, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
		hash2, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
		assert.Equal(t, hash1, hash2)
	})

	t.Run("different hash for different messages", func(t *testing.T) {
		msg1 := randomTONMessage(t, 5009297550715157269)
		msg2 := randomTONMessage(t, 5009297550715157269)
		msg2.Header.Nonce = msg1.Header.Nonce + 1

		hash1, err := hasher.Hash(ctx, msg1)
		require.NoError(t, err)
		hash2, err := hasher.Hash(ctx, msg2)
		require.NoError(t, err)
		assert.NotEqual(t, hash1, hash2)
	})

	t.Run("empty token amount", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts[0].Amount = ccipocr3.BigInt{}

		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "empty amount for token")
	})

	t.Run("negative token amount", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts[0].Amount = ccipocr3.NewBigInt(big.NewInt(-100))

		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "negative amount for token")
	})

	t.Run("invalid dest token address length", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts[0].DestTokenAddress = []byte("short")

		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid destTokenAddress address")
	})

	t.Run("invalid receiver address will be encoded with zero address", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.Receiver = []byte("invalid_address")

		_, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
	})

	t.Run("message with empty ExtraArgs", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.ExtraArgs = nil

		hash, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "cannot hash without extra args")
		assert.NotEqual(t, [32]byte{}, hash)
	})

	t.Run("message without token amounts", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts = nil

		hash, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
		assert.NotEqual(t, [32]byte{}, hash)
	})
}

func TestMessageHasherV1_ErrorCases(t *testing.T) {
	ctx := context.Background()
	mockExtraDataCodec := new(mocks.SourceChainExtraDataCodec)
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{})

	lg := logger.Test(t)
	hasher := NewMessageHasherV1(lg, edc)

	t.Run("decode dest exec data error", func(t *testing.T) {
		mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(nil, assert.AnError)

		msg := randomTONMessage(t, 5009297550715157269)
		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode dest exec data")
	})

	t.Run("decode dest exec data error", func(t *testing.T) {
		mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
			"destgasamount": uint32(1000),
		}, nil)
		mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(nil, assert.AnError)

		msg := randomTONMessage(t, 5009297550715157269)
		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode dest exec data")
	})
}

// TestMessageHasherV1_ExecuteCodecConsistency verifies that TokenAmounts is correctly
// serialized as nil (Maybe 0) rather than empty slice (Maybe 1) when there are no tokens.
// This is critical because the hash depends on how TokenAmounts is serialized.
func TestMessageHasherV1_ExecuteCodecConsistency(t *testing.T) {
	ctx := context.Background()
	mockExtraDataCodec := new(mocks.SourceChainExtraDataCodec)
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM: mockExtraDataCodec,
	})

	mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
		"destgasamount": uint32(1000),
	}, nil)
	mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(map[string]any{
		"gasLimit": big.NewInt(100_000_000),
	}, nil)

	executeCodec := NewExecutePluginCodecV1(edc)

	t.Run("tokenAmounts nil preserved through encode/decode", func(t *testing.T) {
		// Create a message with NO token amounts
		tonAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
		require.NoError(t, err)

		rawTonAddr, err := ToRawAddr(tonAddr)
		require.NoError(t, err)
		evmSenderBytes, err := hex.DecodeString("1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a")
		require.NoError(t, err)

		evmOnrampBytes, err := hex.DecodeString("111111c891c5d4e6ad68064ae45d43146d4f9f3a")
		require.NoError(t, err)

		var messageID [32]byte
		binary.BigEndian.PutUint64(messageID[24:], 1)

		// Message with NO token amounts - this MUST remain nil through encode/decode
		msg := ccipocr3.Message{
			Header: ccipocr3.RampMessageHeader{
				MessageID:           messageID,
				SourceChainSelector: ccipocr3.ChainSelector(909606746561742123),
				DestChainSelector:   ccipocr3.ChainSelector(1399300952838017768),
				SequenceNumber:      ccipocr3.SeqNum(1),
				Nonce:               0,
				OnRamp:              evmOnrampBytes,
			},
			Sender:       ccipocr3.UnknownAddress(evmSenderBytes),
			Data:         []byte{},
			Receiver:     rawTonAddr[:],
			ExtraArgs:    []byte{0x2},
			TokenAmounts: nil, // MUST stay nil, not become empty slice
		}

		// Encode the message
		report := ccipocr3.ExecutePluginReport{
			ChainReports: []ccipocr3.ExecutePluginReportSingleChain{
				{
					SourceChainSelector: msg.Header.SourceChainSelector,
					Messages:            []ccipocr3.Message{msg},
					OffchainTokenData:   nil,
					Proofs:              []ccipocr3.Bytes32{},
					ProofFlagBits:       ccipocr3.BigInt{Int: big.NewInt(0)},
				},
			},
		}

		encoded, err := executeCodec.Encode(ctx, report)
		require.NoError(t, err)

		// Decode the message
		decoded, err := executeCodec.Decode(ctx, encoded)
		require.NoError(t, err)

		decodedMsg := decoded.ChainReports[0].Messages[0]

		// CRITICAL: TokenAmounts must be nil after decode, not an empty slice!
		// If it's an empty slice instead of nil, the hash will be different because:
		// - nil serializes as Maybe 0 (1 bit = 0)
		// - empty slice serializes as Maybe 1 + empty cell reference
		t.Logf("Original msg.TokenAmounts == nil: %v", msg.TokenAmounts == nil)
		t.Logf("Decoded msg.TokenAmounts == nil: %v", decodedMsg.TokenAmounts == nil)

		require.Nil(t, decodedMsg.TokenAmounts,
			"TokenAmounts should be nil after decode, not an empty slice. "+
				"This is critical for hash consistency: nil→Maybe 0, empty slice→Maybe 1+ref")
	})
}

func TestMessageHasherV1_CrossLanguageCompatibility(t *testing.T) {
	ctx := context.Background()
	mockExtraDataCodec := new(mocks.SourceChainExtraDataCodec)
	edc := ccipocr3.ExtraDataCodecMap(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM: mockExtraDataCodec,
	})

	mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
		"destgasamount": uint32(1000),
	}, nil)
	mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(map[string]any{
		"gasLimit": big.NewInt(100_000_000),
	}, nil)

	lg := logger.Test(t)
	hasher := NewMessageHasherV1(lg, edc)
	executeCodec := NewExecutePluginCodecV1(edc)

	// The golden values are anchored to the TypeScript/Tolk implementations (see
	// contracts/tests/ccip/offramp/OffRamp.messageID.spec.ts), which match the on-chain
	// OffRamp leaf recomputation from the execute report. The Go hasher must agree with
	// them, and the execute codec must round-trip each message without changing its leaf.
	for _, goldenCase := range loadAny2TVMMessageIDGoldenCases(t) {
		t.Run(goldenCase.Name, func(t *testing.T) {
			msg := goldenCaseToMessage(t, goldenCase)

			t.Run("hasher matches golden", func(t *testing.T) {
				hash, err := hasher.Hash(ctx, msg)
				require.NoError(t, err)

				decoded, err := hex.DecodeString(strings.TrimPrefix(goldenCase.ExpectedMessageID, "0x"))
				require.NoError(t, err)
				require.Len(t, decoded, 32, "golden messageID must be exactly 32 bytes")
				var golden ccipocr3.Bytes32
				copy(golden[:], decoded)

				assert.Equal(t, golden, hash,
					"Go message hasher should produce the golden MessageID shared with TypeScript and Tolk")
			})

			// The hasher (commit plugin) and the execute codec (execute plugin) must
			// serialize the message identically, or the committed merkle root never
			// matches the on-chain recomputation from the execute report. This check is
			// tautology-proof: the golden comes from TypeScript/Tolk, not from the hasher.
			t.Run("execute codec round-trip preserves the golden leaf", func(t *testing.T) {
				hash, err := hasher.Hash(ctx, msg)
				require.NoError(t, err)

				report := ccipocr3.ExecutePluginReport{
					ChainReports: []ccipocr3.ExecutePluginReportSingleChain{{
						SourceChainSelector: msg.Header.SourceChainSelector,
						Messages:            []ccipocr3.Message{msg},
						// One blob per token; nil is only valid for tokenless messages.
						OffchainTokenData: nil,
						Proofs:            []ccipocr3.Bytes32{},
						ProofFlagBits:     ccipocr3.BigInt{Int: big.NewInt(0)},
					}},
				}
				if len(msg.TokenAmounts) != 0 {
					report.ChainReports[0].OffchainTokenData = [][][]byte{{{0x1}}}
				}
				encoded, err := executeCodec.Encode(ctx, report)
				require.NoError(t, err)
				decoded, err := executeCodec.Decode(ctx, encoded)
				require.NoError(t, err)

				// OnRamp is not carried in the on-chain report (it is recovered from the
				// source chain config); restore it from the original before re-hashing.
				decodedMsg := decoded.ChainReports[0].Messages[0]
				decodedMsg.Header.OnRamp = msg.Header.OnRamp

				reHashed, err := hasher.Hash(ctx, decodedMsg)
				require.NoError(t, err)
				assert.Equal(t, hash, reHashed,
					"hasher leaf and execute-report leaf must match after encode/decode")
			})
		})
	}
}
