package boc

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type tolkCompiledContract struct {
	Hex string `json:"hex"`
}

// ParseTolkCompiledContract parses the JSON output of the Tolk compiler
// (`*.compiled.json`) and returns the contract code cell decoded from its
// hex-encoded BOC.
func ParseTolkCompiledContract(data []byte) (*cell.Cell, error) {
	var compiled tolkCompiledContract
	if err := json.Unmarshal(data, &compiled); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}
	if compiled.Hex == "" {
		return nil, errors.New("hex field is empty in the JSON")
	}

	codeBocBytes, err := hex.DecodeString(compiled.Hex)
	if err != nil {
		return nil, fmt.Errorf("failed to decode hex: %w", err)
	}

	codeCell, err := cell.FromBOC(codeBocBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse BOC binary: %w", err)
	}
	return codeCell, nil
}
