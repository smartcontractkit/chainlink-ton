package ocr

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

const tokenlessExecuteReportJSON = `{
  "sourceChainSelector": 5009297550715157269,
  "message": {
    "messageId": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "sourceChainSelector": 5009297550715157269,
    "destChainSelector": 1234,
    "sequenceNumber": 5678,
    "nonce": 9012,
    "sender": "1122334455",
    "data": "aabbccdd",
    "receiver": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "gasLimitNano": "123456789"
  },
  "proofs": [
    "0000000000000000000000000000000000000000000000000000000000000001",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ],
  "proofFlagBits": "3"
}`

func TestTokenAmounts(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)

	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	destGasAmount := tlb.MustFromTON("1000")
	tokenAmountsCell, err := tlb.ToCell(common.SnakeRef[Any2TVMTokenTransfer]{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		}, {
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
	})
	require.NoError(t, err)
	array := common.SnakeRef[Any2TVMTokenTransfer]{}
	err = tlb.LoadFromCell(&array, tokenAmountsCell.BeginParse())
	require.NoError(t, err)
	require.Len(t, array, 6)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)
	destGasAmount := tlb.MustFromTON("1000")
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	tokenAmountsSlice := []Any2TVMTokenTransfer{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(30),
		},
	}

	rampMessageSlice := Any2TVMRampMessage{
		Header: RampMessageHeader{
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

	report := ExecuteReport{
		SourceChainSelector: 1,
		Message:             rampMessageSlice,
		OffChainTokenData:   common.LispList[common.LispList[common.SnakeBytes]]{},
		Proofs:              common.SnakedCell[common.Proof]{{Value: big.NewInt(0)}, {Value: big.NewInt(0)}},
		ProofFlagBits:       big.NewInt(0),
	}

	// Encode to cell
	c, err := tlb.ToCell(report)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded ExecuteReport
	err = tlb.LoadFromCell(&decoded, newCell.BeginParse())
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Len(t, decoded.Message.TokenAmounts, 3)
	require.Len(t, decoded.Proofs, 2)
}

func TestExecuteReport_TokenlessEncodingMatchesLegacyBinding(t *testing.T) {
	legacyBinary := filepath.Join(t.TempDir(), "legacy-execute-report")
	legacyToolDir := filepath.Join("testdata", "legacyexecutereport")
	build := exec.Command("go", "build", "-o", legacyBinary, ".")
	build.Dir = legacyToolDir
	buildOutput, err := build.CombinedOutput()
	require.NoErrorf(t, err, "build legacy execute-report CLI: %s", buildOutput)

	legacyEncode := exec.Command(legacyBinary, "encode")
	legacyEncode.Stdin = strings.NewReader(tokenlessExecuteReportJSON)
	legacyOutput, err := legacyEncode.CombinedOutput()
	require.NoErrorf(t, err, "encode with legacy binding: %s", legacyOutput)
	legacyBOC, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(legacyOutput)))
	require.NoError(t, err)

	currentReport := tokenlessExecuteReport(t)
	currentCell, err := tlb.ToCell(currentReport)
	require.NoError(t, err)
	currentBOC := currentCell.ToBOC()

	// BOC equality proves equality of the complete bag of cells, including the
	// required OffChainTokenData reference. Hash equality makes the intended
	// on-chain report identity explicit as well.
	require.Equal(t, legacyBOC, currentBOC)
	legacyCell, err := cell.FromBOC(legacyBOC)
	require.NoError(t, err)
	require.Equal(t, legacyCell.Hash(), currentCell.Hash())

	legacyDecode := exec.Command(legacyBinary, "decode")
	legacyDecode.Stdin = bytes.NewReader([]byte(base64.StdEncoding.EncodeToString(legacyBOC)))
	decodedOutput, err := legacyDecode.CombinedOutput()
	require.NoErrorf(t, err, "decode with legacy binding: %s", decodedOutput)

	var expected, decoded any
	require.NoError(t, json.Unmarshal([]byte(tokenlessExecuteReportJSON), &expected))
	require.NoError(t, json.Unmarshal(decodedOutput, &decoded))
	require.Equal(t, expected, decoded)
}

func tokenlessExecuteReport(t *testing.T) ExecuteReport {
	t.Helper()

	var input struct {
		SourceChainSelector uint64 `json:"sourceChainSelector"`
		Message             struct {
			MessageID           string `json:"messageId"`
			SourceChainSelector uint64 `json:"sourceChainSelector"`
			DestChainSelector   uint64 `json:"destChainSelector"`
			SequenceNumber      uint64 `json:"sequenceNumber"`
			Nonce               uint64 `json:"nonce"`
			Sender              string `json:"sender"`
			Data                string `json:"data"`
			Receiver            string `json:"receiver"`
			GasLimitNano        string `json:"gasLimitNano"`
		} `json:"message"`
		Proofs        []string `json:"proofs"`
		ProofFlagBits string   `json:"proofFlagBits"`
	}
	require.NoError(t, json.Unmarshal([]byte(tokenlessExecuteReportJSON), &input))

	messageID, err := hex.DecodeString(input.Message.MessageID)
	require.NoError(t, err)
	sender, err := hex.DecodeString(input.Message.Sender)
	require.NoError(t, err)
	data, err := hex.DecodeString(input.Message.Data)
	require.NoError(t, err)
	receiver, err := address.ParseAddr(input.Message.Receiver)
	require.NoError(t, err)
	gasLimitNano, ok := new(big.Int).SetString(input.Message.GasLimitNano, 10)
	require.True(t, ok)
	gasLimit, err := tlb.FromNano(gasLimitNano, 0)
	require.NoError(t, err)
	proofFlagBits, ok := new(big.Int).SetString(input.ProofFlagBits, 10)
	require.True(t, ok)

	proofs := make(common.SnakedCell[common.Proof], 0, len(input.Proofs))
	for _, proofHex := range input.Proofs {
		proof, err := hex.DecodeString(proofHex)
		require.NoError(t, err)
		proofs = append(proofs, common.Proof{Value: new(big.Int).SetBytes(proof)})
	}

	return ExecuteReport{
		SourceChainSelector: input.SourceChainSelector,
		Message: Any2TVMRampMessage{
			Header: RampMessageHeader{
				MessageID:           messageID,
				SourceChainSelector: input.Message.SourceChainSelector,
				DestChainSelector:   input.Message.DestChainSelector,
				SequenceNumber:      input.Message.SequenceNumber,
				Nonce:               input.Message.Nonce,
			},
			Sender:       common.CrossChainAddress(sender),
			Data:         common.SnakeBytes(data),
			Receiver:     receiver,
			GasLimit:     gasLimit,
			TokenAmounts: nil,
		},
		OffChainTokenData: common.LispList[common.LispList[common.SnakeBytes]]{},
		Proofs:            proofs,
		ProofFlagBits:     proofFlagBits,
	}
}

func TestTVM2AnyRampMessageBody_LoadsTokenTransferLayout(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	receiver, err := (common.CrossChainAddress{4, 5, 6}).ToCell()
	require.NoError(t, err)
	destTokenAddress, err := (common.CrossChainAddress{1, 2, 3}).ToCell()
	require.NoError(t, err)
	extraData := cell.BeginCell().MustStoreUInt(18, 256).EndCell()
	destExecData := cell.BeginCell().MustStoreUInt(0xdead, 32).EndCell()
	transfer := cell.BeginCell().
		MustStoreAddr(addr).
		MustStoreBigUInt(big.NewInt(4242), 256).
		MustStoreRef(destTokenAddress).
		MustStoreRef(extraData).
		MustStoreRef(destExecData).
		EndCell()
	body := cell.BeginCell().MustStoreRef(receiver).MustStoreRef(tvm.EmptyCell).MustStoreRef(tvm.EmptyCell).MustStoreRef(transfer).MustStoreAddr(addr).MustStoreCoins(1).EndCell()

	var decoded TVM2AnyRampMessageBody
	err = tlb.LoadFromCell(&decoded, body.BeginParse())
	require.NoError(t, err)
	require.Len(t, decoded.TokenTransfer, 1)
	require.Equal(t, addr.String(), decoded.TokenTransfer[0].SourcePoolAddress.String())
	require.Equal(t, big.NewInt(4242), decoded.TokenTransfer[0].Amount)
	require.Equal(t, common.CrossChainAddress{1, 2, 3}, decoded.TokenTransfer[0].DestTokenAddress)
	require.Equal(t, extraData, decoded.TokenTransfer[0].ExtraData)
	require.Equal(t, destExecData, decoded.TokenTransfer[0].DestExecData)
}

func TestTVM2AnyRampMessageBody_LoadsLegacyEmptyTokenAmounts(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	receiver, err := (common.CrossChainAddress{4, 5, 6}).ToCell()
	require.NoError(t, err)
	body := cell.BeginCell().MustStoreRef(receiver).MustStoreRef(tvm.EmptyCell).MustStoreRef(tvm.EmptyCell).MustStoreRef(tvm.EmptyCell).MustStoreAddr(addr).MustStoreCoins(1).EndCell()

	var decoded TVM2AnyRampMessageBody
	err = tlb.LoadFromCell(&decoded, body.BeginParse())
	require.NoError(t, err)
	require.Empty(t, decoded.TokenTransfer)
}
