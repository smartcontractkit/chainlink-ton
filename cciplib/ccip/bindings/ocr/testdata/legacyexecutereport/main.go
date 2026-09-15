// legacyexecutereport encodes and decodes ExecuteReport cells using the binding
// immediately before OffChainTokenData became a nested LispList.
package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
)

type reportJSON struct {
	SourceChainSelector uint64      `json:"sourceChainSelector"`
	Message             messageJSON `json:"message"`
	Proofs              []string    `json:"proofs"`
	ProofFlagBits       string      `json:"proofFlagBits"`
}

type messageJSON struct {
	MessageID           string `json:"messageId"`
	SourceChainSelector uint64 `json:"sourceChainSelector"`
	DestChainSelector   uint64 `json:"destChainSelector"`
	SequenceNumber      uint64 `json:"sequenceNumber"`
	Nonce               uint64 `json:"nonce"`
	Sender              string `json:"sender"`
	Data                string `json:"data"`
	Receiver            string `json:"receiver"`
	GasLimitNano        string `json:"gasLimitNano"`
}

func main() {
	if len(os.Args) != 2 {
		fatalf("usage: %s encode|decode", os.Args[0])
	}

	switch os.Args[1] {
	case "encode":
		input, err := io.ReadAll(os.Stdin)
		if err != nil {
			fatalf("read input: %v", err)
		}
		var report reportJSON
		if err := json.Unmarshal(input, &report); err != nil {
			fatalf("decode JSON: %v", err)
		}
		encoded, err := encode(report)
		if err != nil {
			fatalf("encode report: %v", err)
		}
		fmt.Println(base64.StdEncoding.EncodeToString(encoded))
	case "decode":
		input, err := io.ReadAll(os.Stdin)
		if err != nil {
			fatalf("read input: %v", err)
		}
		boc, err := base64.StdEncoding.DecodeString(string(trimSpace(input)))
		if err != nil {
			fatalf("decode BOC: %v", err)
		}
		report, err := decode(boc)
		if err != nil {
			fatalf("decode report: %v", err)
		}
		output, err := json.Marshal(report)
		if err != nil {
			fatalf("encode JSON: %v", err)
		}
		fmt.Println(string(output))
	default:
		fatalf("usage: %s encode|decode", os.Args[0])
	}
}

func encode(input reportJSON) ([]byte, error) {
	messageID, err := decodeHex(input.Message.MessageID, 32)
	if err != nil {
		return nil, fmt.Errorf("message ID: %w", err)
	}
	sender, err := decodeHex(input.Message.Sender, -1)
	if err != nil {
		return nil, fmt.Errorf("sender: %w", err)
	}
	data, err := decodeHex(input.Message.Data, -1)
	if err != nil {
		return nil, fmt.Errorf("data: %w", err)
	}
	receiver, err := address.ParseAddr(input.Message.Receiver)
	if err != nil {
		return nil, fmt.Errorf("receiver: %w", err)
	}
	gasLimit, ok := new(big.Int).SetString(input.Message.GasLimitNano, 10)
	if !ok || gasLimit.Sign() < 0 {
		return nil, errors.New("gasLimitNano must be a non-negative decimal integer")
	}
	proofFlagBits, ok := new(big.Int).SetString(input.ProofFlagBits, 10)
	if !ok || proofFlagBits.Sign() < 0 {
		return nil, errors.New("proofFlagBits must be a non-negative decimal integer")
	}

	proofs := make(common.SnakedCell[common.Proof], 0, len(input.Proofs))
	for i, proofHex := range input.Proofs {
		proof, err := decodeHex(proofHex, 32)
		if err != nil {
			return nil, fmt.Errorf("proof %d: %w", i, err)
		}
		proofs = append(proofs, common.Proof{Value: new(big.Int).SetBytes(proof)})
	}

	coins, err := tlb.FromNano(gasLimit, 0)
	if err != nil {
		return nil, fmt.Errorf("gas limit coins: %w", err)
	}
	report := ocr.ExecuteReport{
		SourceChainSelector: input.SourceChainSelector,
		Message: ocr.Any2TVMRampMessage{
			Header: ocr.RampMessageHeader{
				MessageID:           messageID,
				SourceChainSelector: input.Message.SourceChainSelector,
				DestChainSelector:   input.Message.DestChainSelector,
				SequenceNumber:      input.Message.SequenceNumber,
				Nonce:               input.Message.Nonce,
			},
			Sender:       common.CrossChainAddress(sender),
			Data:         common.SnakeBytes(data),
			Receiver:     receiver,
			GasLimit:     coins,
			TokenAmounts: nil,
		},
		OffChainTokenData: common.LispList[common.SnakeBytes]{},
		Proofs:            proofs,
		ProofFlagBits:     proofFlagBits,
	}
	c, err := tlb.ToCell(report)
	if err != nil {
		return nil, err
	}
	return c.ToBOC(), nil
}

func decode(boc []byte) (reportJSON, error) {
	c, err := cell.FromBOC(boc)
	if err != nil {
		return reportJSON{}, err
	}
	var report ocr.ExecuteReport
	if err := tlb.LoadFromCell(&report, c.BeginParse()); err != nil {
		return reportJSON{}, err
	}
	if len(report.Message.TokenAmounts) != 0 {
		return reportJSON{}, errors.New("only tokenless reports are supported")
	}
	if len(report.OffChainTokenData) != 0 {
		return reportJSON{}, errors.New("only tokenless reports are supported")
	}

	proofs := make([]string, 0, len(report.Proofs))
	for _, proof := range report.Proofs {
		proofs = append(proofs, hex.EncodeToString(proofBytes(proof.Value)))
	}
	return reportJSON{
		SourceChainSelector: report.SourceChainSelector,
		Message: messageJSON{
			MessageID:           hex.EncodeToString(report.Message.Header.MessageID),
			SourceChainSelector: report.Message.Header.SourceChainSelector,
			DestChainSelector:   report.Message.Header.DestChainSelector,
			SequenceNumber:      report.Message.Header.SequenceNumber,
			Nonce:               report.Message.Header.Nonce,
			Sender:              hex.EncodeToString(report.Message.Sender),
			Data:                hex.EncodeToString(report.Message.Data),
			Receiver:            report.Message.Receiver.String(),
			GasLimitNano:        report.Message.GasLimit.Nano().String(),
		},
		Proofs:        proofs,
		ProofFlagBits: report.ProofFlagBits.String(),
	}, nil
}

// proofBytes renders a decoded proof as its 32-byte unsigned wire value.
// The legacy binding decodes the `## 256` proof field as a signed big.Int, so a
// proof whose top bit is set comes back negative (e.g. 0xff..ff decodes to -1).
// The wire value is the two's-complement bit pattern, so re-encode negatives
// before rendering.
func proofBytes(value *big.Int) []byte {
	out := make([]byte, 32)
	if value.Sign() < 0 {
		// value + 2^256 is the unsigned bit pattern.
		unsigned := new(big.Int).Add(value, new(big.Int).Lsh(big.NewInt(1), 256))
		return unsigned.FillBytes(out)
	}
	return value.FillBytes(out)
}

func decodeHex(value string, expectedLength int) ([]byte, error) {
	decoded, err := hex.DecodeString(value)
	if err != nil {
		return nil, err
	}
	if expectedLength >= 0 && len(decoded) != expectedLength {
		return nil, fmt.Errorf("expected %d bytes, got %d", expectedLength, len(decoded))
	}
	return decoded, nil
}

func trimSpace(value []byte) []byte {
	for len(value) > 0 && (value[0] == ' ' || value[0] == '\n' || value[0] == '\r' || value[0] == '\t') {
		value = value[1:]
	}
	for len(value) > 0 {
		last := value[len(value)-1]
		if last != ' ' && last != '\n' && last != '\r' && last != '\t' {
			break
		}
		value = value[:len(value)-1]
	}
	return value
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
