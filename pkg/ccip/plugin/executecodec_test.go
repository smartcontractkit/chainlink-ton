package plugin

import (
	"context"
	"encoding/base64"
	"math/big"
	"math/rand"
	"testing"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3/mocks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

func randomTONExecuteReport(t *testing.T, sourceChainSelector uint64) ccipocr3.ExecutePluginReport {
	const numChainReports = 2
	const msgsPerReport = 2
	const numTokensPerMsg = 2

	ac := AddressCodec{}

	chainReports := make([]ccipocr3.ExecutePluginReportSingleChain, numChainReports)
	for i := 0; i < numChainReports; i++ {
		reportMessages := make([]ccipocr3.Message, msgsPerReport)
		for j := 0; j < msgsPerReport; j++ {
			addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
			require.NoError(t, err)
			require.NoError(t, err)
			extraData := []byte{0x12, 0x34}

			addrBytes, err := base64.RawURLEncoding.DecodeString(addr.String())
			require.NoError(t, err)
			tokenAmounts := make([]ccipocr3.RampTokenAmount, numTokensPerMsg)
			for z := 0; z < numTokensPerMsg; z++ {
				tokenAmounts[z] = ccipocr3.RampTokenAmount{
					SourcePoolAddress: ccipocr3.UnknownAddress(addr.String()),
					DestTokenAddress:  addrBytes, // pad to 36 bytes
					ExtraData:         extraData,
					Amount:            ccipocr3.NewBigInt(big.NewInt(rand.Int63())),
					DestExecData:      []byte{0, 0, 0, 0},
				}
			}

			receiverAddr, err := ac.AddressStringToBytes(addr.String())
			require.NoError(t, err)

			reportMessages[j] = ccipocr3.Message{
				Header: ccipocr3.RampMessageHeader{
					MessageID:           [32]byte{},
					SourceChainSelector: ccipocr3.ChainSelector(sourceChainSelector),
					DestChainSelector:   ccipocr3.ChainSelector(rand.Uint64()),
					SequenceNumber:      ccipocr3.SeqNum(rand.Uint64()),
					Nonce:               rand.Uint64(),
				},
				Sender:       ccipocr3.UnknownAddress(addr.String()),
				Data:         extraData,
				Receiver:     receiverAddr,
				ExtraArgs:    []byte{0, 0, 0, 0},
				TokenAmounts: tokenAmounts,
			}
		}
		chainReports[i] = ccipocr3.ExecutePluginReportSingleChain{
			SourceChainSelector: ccipocr3.ChainSelector(sourceChainSelector),
			Messages:            reportMessages,
			OffchainTokenData:   [][][]byte{{{0x1}, {0x2, 0x3}}},
			Proofs:              []ccipocr3.Bytes32{},
			ProofFlagBits:       ccipocr3.BigInt{Int: big.NewInt(1)},
		}
	}
	return ccipocr3.ExecutePluginReport{ChainReports: chainReports}
}

func TestExecutePluginCodecV1_TON(t *testing.T) {
	ctx := context.Background()
	mockExtraDataCodec := new(mocks.SourceChainExtraDataCodec)
	edc := ccipocr3.ExtraDataCodec(map[string]ccipocr3.SourceChainExtraDataCodec{
		chainsel.FamilyEVM:    mockExtraDataCodec,
		chainsel.FamilySolana: mockExtraDataCodec,
		chainsel.FamilyTon:    mockExtraDataCodec,
	})

	mockExtraDataCodec.On("DecodeDestExecDataToMap", mock.Anything).Return(map[string]any{
		"destgasamount": uint32(1000),
	}, nil)
	mockExtraDataCodec.On("DecodeExtraArgsToMap", mock.Anything).Return(map[string]any{
		"gasLimit": big.NewInt(1000),
	}, nil)
	codec := NewExecutePluginCodecV1(edc)

	t.Run("encode/decode roundtrip", func(t *testing.T) {
		report := randomTONExecuteReport(t, 5009297550715157269) // evm selector for TON
		encoded, err := codec.Encode(ctx, report)
		require.NoError(t, err)
		decoded, err := codec.Decode(ctx, encoded)
		require.NoError(t, err)
		assert.Equal(t, report.ChainReports[0].SourceChainSelector, decoded.ChainReports[0].SourceChainSelector)
		assert.Equal(t, report.ChainReports[0].Messages[0].TokenAmounts[0].Amount, decoded.ChainReports[0].Messages[0].TokenAmounts[0].Amount)
	})

	t.Run("empty report", func(t *testing.T) {
		encoded, err := codec.Encode(ctx, ccipocr3.ExecutePluginReport{})
		require.NoError(t, err)
		assert.Nil(t, encoded)
	})
}
