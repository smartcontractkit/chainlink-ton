package codec

import (
	"context"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

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
	edc := ccipocr3.ExtraDataCodec(map[string]ccipocr3.SourceChainExtraDataCodec{
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
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "empty amount for token")
	})

	t.Run("negative token amount", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts[0].Amount = ccipocr3.NewBigInt(big.NewInt(-100))

		_, err := hasher.Hash(ctx, msg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "negative amount for token")
	})

	t.Run("invalid dest token address length", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.TokenAmounts[0].DestTokenAddress = []byte("short")

		_, err := hasher.Hash(ctx, msg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid destTokenAddress address")
	})

	t.Run("invalid receiver address", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.Receiver = []byte("invalid_address")

		_, err := hasher.Hash(ctx, msg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "error convert receiver address")
	})

	t.Run("message without extra args", func(t *testing.T) {
		msg := randomTONMessage(t, 5009297550715157269)
		msg.ExtraArgs = nil

		hash, err := hasher.Hash(ctx, msg)
		require.NoError(t, err)
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
	edc := ccipocr3.ExtraDataCodec(map[string]ccipocr3.SourceChainExtraDataCodec{})

	lg := logger.Test(t)
	hasher := NewMessageHasherV1(lg, edc)

	t.Run("decode dest exec data error", func(t *testing.T) {
		mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(nil, assert.AnError)

		msg := randomTONMessage(t, 5009297550715157269)
		_, err := hasher.Hash(ctx, msg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode dest exec data")
	})

	t.Run("decode dest exec data error", func(t *testing.T) {
		mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
			"destgasamount": uint32(1000),
		}, nil)
		mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(nil, assert.AnError)

		msg := randomTONMessage(t, 5009297550715157269)
		_, err := hasher.Hash(ctx, msg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode dest exec data")
	})
}
