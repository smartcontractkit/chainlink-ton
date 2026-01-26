package sequence

import (
	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

// Set OCR3 Offramp Sequence Input
type SetOCR3OfframpSeqInput struct {
	ChainSelector uint64
	Configs       map[operation.PluginType]operation.OCR3ConfigArgs
}

var SetOCR3OfframpSequence = operations.NewSequence(
	"ton/sequences/ccip/offramp/set-ocr3-config",
	semver.MustParse("0.1.0"),
	"Set OCR3 configuration for Ton CCIP Offramp",
	setOCR3OfframpSequence,
)

func setOCR3OfframpSequence(b operations.Bundle, dp *dep.DependencyProvider, in SetOCR3OfframpSeqInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

	// TODO: this just needs to loop over configs

	// Set commit OCR3 Config
	if configCommit, exists := in.Configs[operation.PluginTypeCCIPCommit]; exists {
		r, err := operations.ExecuteOperation(b, operation.SetOCR3ConfigOp, dp, configCommit)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, r.Output...)
	}

	// Set exec OCR3 Config
	if configExec, exists := in.Configs[operation.PluginTypeCCIPExec]; exists {
		r, err := operations.ExecuteOperation(b, operation.SetOCR3ConfigOp, dp, configExec)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, r.Output...)
	}

	return msgs, nil
}
