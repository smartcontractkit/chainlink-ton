package sequence

import (
	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

// Set OCR3 Offramp Sequence Input
type SetOCR3OfframpSeqInput struct {
	ChainSelector uint64
	Configs       map[operation.PluginType]operation.OCR3ConfigArgs
}

var SetOCR3OfframpSequence = operations.NewSequence(
	"set-ton-ocr3-offramp-sequence",
	semver.MustParse("0.1.0"),
	"Set OCR3 configuration for Ton CCIP Offramp",
	setOCR3OfframpSequence,
)

func setOCR3OfframpSequence(b operations.Bundle, deps operation.TonDeps, in SetOCR3OfframpSeqInput) ([][]byte, error) {
	var txs [][]byte

	// TODO: this just needs to loop over configs

	// Set commit OCR3 Config
	if configArgs, exists := in.Configs[operation.PluginTypeCCIPCommit]; exists {
		commitReport, err := operations.ExecuteOperation(
			b,
			operation.SetOCR3ConfigOp,
			deps,
			configArgs,
		)
		if err != nil {
			return nil, err
		}
		txs = append(txs, commitReport.Output...)
	}

	// Set exec OCR3 Config
	if configArgs, exists := in.Configs[operation.PluginTypeCCIPExec]; exists {
		execReport, err := operations.ExecuteOperation(
			b,
			operation.SetOCR3ConfigOp,
			deps,
			configArgs,
		)
		if err != nil {
			return nil, err
		}
		txs = append(txs, execReport.Output...)
	}

	return txs, nil
}
