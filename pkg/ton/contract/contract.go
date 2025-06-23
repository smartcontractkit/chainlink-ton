package contract

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type compiledContract struct {
	Hash       string `json:"hash"`
	HashBase64 string `json:"hashBase64"`
	Hex        string `json:"hex"`
}

func (c compiledContract) codeCell() (*cell.Cell, error) {
	// Extract the Hex-encoded BOC
	codeBocHex := c.Hex
	if codeBocHex == "" {
		return nil, fmt.Errorf("codeBocHex field is empty in the JSON")
	}

	// Decode the Hex string to get the actual BOC binary
	codeBocBytes, err := hex.DecodeString(codeBocHex)
	if err != nil {
		return nil, fmt.Errorf("Failed to decode hex: %v", err)
	}

	// Parse the BOC binary into a cell
	codeCell, err := cell.FromBOC(codeBocBytes)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse BOC binary: %v", err)
	}
	return codeCell, nil
}

func ParseCompiledContract(path string) (*cell.Cell, error) {
	// Check if contract file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("Contract file not found: %s", path)
	}
	jsonData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("Failed to read compiled contract: %v", err)
	}

	if strings.HasSuffix(path, ".compiled.json") {
		// Parse the JSON
		compiledContract := &compiledContract{}
		err = json.Unmarshal(jsonData, &compiledContract)
		if err != nil {
			return nil, fmt.Errorf("Failed to parse JSON: %v", err)
		}
		return compiledContract.codeCell()
	} else {
		return nil, fmt.Errorf("Unsupported contract file format: %s", path)
	}
}
