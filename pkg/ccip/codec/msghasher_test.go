package codec

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	mocks "github.com/smartcontractkit/chainlink-ton/mocks/ccipocr3"
)

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

	t.Run("invalid receiver address", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.Receiver = []byte("invalid_address")

		_, err := hasher.Hash(ctx, msg)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "error convert receiver address")
	})

	// TODO: Re-enable when gasLimit is no longer hardcoded in the msgHasher and executecodec
	// t.Run("message without extra args", func(t *testing.T) {
	//	 msg := randomTONMessage(t, 5009297550715157269)
	//	 msg.ExtraArgs = nil
	//
	//	 hash, err := hasher.Hash(ctx, msg)
	//	 require.Error(t, err)
	//	 assert.Contains(t, err.Error(), "cannot hash without extra args")
	//	 assert.NotEqual(t, [32]byte{}, hash)
	// })

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

func TestMessageHasherV1_CrossLanguageCompatibility(t *testing.T) {
	// Right now the hash from ts and gobinding Any2TVMRamp message generates different msg hash. Need to fix it before running this test
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

	t.Run("matches TypeScript generateMessageId", func(t *testing.T) {
		// Use exact same TON address from TypeScript test
		tonAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
		require.NoError(t, err)

		rawTonAddr := ToRawAddr(tonAddr)
		// EVM_SENDER_ADDRESS_TEST: 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a
		evmSenderBytes, err := hex.DecodeString("1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a")
		require.NoError(t, err)

		evmOnrampBytes, err := hex.DecodeString("111111c891c5d4e6ad68064ae45d43146d4f9f3a")
		require.NoError(t, err)

		// Create messageID as 32-byte array with value 1 (matching TypeScript messageId: 1n)
		var messageID [32]byte
		binary.BigEndian.PutUint64(messageID[24:], 1) // This sets the last 8 bytes to 1

		// Create exact same message as TypeScript test
		msg := ccipocr3.Message{
			Header: ccipocr3.RampMessageHeader{
				MessageID:           messageID,
				SourceChainSelector: ccipocr3.ChainSelector(909606746561742123),   // CHAINSEL_EVM_TEST_90000001
				DestChainSelector:   ccipocr3.ChainSelector(13879075125137744094), // CHAINSEL_TON
				SequenceNumber:      ccipocr3.SeqNum(1),
				Nonce:               0,
				OnRamp:              evmOnrampBytes,
			},
			Sender:       ccipocr3.UnknownAddress(evmSenderBytes),
			Data:         []byte{}, // empty cell data
			Receiver:     rawTonAddr[:],
			ExtraArgs:    []byte{0x2}, // will be populated by mock
			TokenAmounts: nil,         // no token amounts
		}

		// Set messageID to 1
		binary.BigEndian.PutUint64(msg.Header.MessageID[24:], 1)

		hash, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)

		// Run the TypeScript file to get this value:
		// chainlink-ton/contracts/tests/ccip/OffRamp.spec.ts  "Test generateMessageId hash compatibility with Go"
		expectedHashHex := "ce60f1962af3c7c7f9d3e434dea13530564dbff46704d628ff4b2206bbc93289"
		expectedHash, err := hex.DecodeString(expectedHashHex)
		require.NoError(t, err)

		var expectedHashArray [32]byte
		copy(expectedHashArray[:], expectedHash)

		assert.Equal(t, ccipocr3.Bytes32(expectedHashArray), hash,
			"Go message hasher should produce same hash as TypeScript generateMessageId")
	})
}
