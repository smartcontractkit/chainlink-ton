package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

func (a *TonAdapter) SetOCR3Config() *cldf_ops.Sequence[deployops.SetOCR3ConfigInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return SetOCR3Config
}

var SetOCR3Config = cldf_ops.NewSequence(
	"setocr3config",
	semver.MustParse("1.6.0"),
	"Set OCR3 Config on Ton chains",
	func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input deployops.SetOCR3ConfigInput) (output sequences.OnChainOutput, err error) {
		msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)
		a := &TonAdapter{}
		chainSelector := input.ChainSelector
		tonChain := chains.TonChains()[chainSelector]
		deps, err := extractTonDepsFromOcrInput(tonChain, a, input)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		// TODO (ops): improve deps passing
		opdeps := opston.SendMessagesDeps{
			Wallet: tonChain.Wallet,
			Client: tonChain.Client,
		}

		in := seq.SetOCR3OfframpSeqInput{
			ChainSelector: input.ChainSelector,
			Configs:       intoOCRConfigs(input.Configs),
		}
		setOCR3SeqReport, err := cldf_ops.ExecuteSequence(b, seq.SetOCR3OfframpSequence, deps, in)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		msgs = append(msgs, setOCR3SeqReport.Output...)

		//  TODO: 1. When executing directly (with injected DEP/wallet) execution is processed outside a cldf.Sequence
		//        2. When executing indirectly - via MCMS (plan/proposal returned) - not currently supported
		if len(msgs) != 0 {
			_, err := operations.ExecuteOperation(b, opston.SendMessagesRaw, opdeps, opston.SendMessagesRawInput{Messages: msgs})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send messages: %w", err)
			}
		}

		return sequences.OnChainOutput{}, nil
	},
)

func extractTonDepsFromOcrInput(chain ton.Chain, a *TonAdapter, input deployops.SetOCR3ConfigInput) (config.CCIPDeps, error) {
	offRampAddr, err := a.GetOffRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return config.CCIPDeps{}, err
	}
	onRampAddr, err := a.GetOnRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return config.CCIPDeps{}, err
	}
	routerAddr, err := a.GetRouterAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return config.CCIPDeps{}, err
	}
	feeQuoter, err := a.GetFQAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return config.CCIPDeps{}, err
	}
	return extractTonDepsFrom(chain, onRampAddr, offRampAddr, routerAddr, feeQuoter)
}

func intoOCRConfigs(configs map[ccipocr3.PluginType]deployops.OCR3ConfigArgs) map[operation.PluginType]operation.OCR3ConfigArgs {
	result := make(map[operation.PluginType]operation.OCR3ConfigArgs)
	for pluginType, cfg := range configs {
		var pType = operation.PluginType(pluginType)
		result[pType] = operation.OCR3ConfigArgs{
			ConfigDigest:                   cfg.ConfigDigest,
			PluginType:                     pType,
			F:                              cfg.F,
			IsSignatureVerificationEnabled: cfg.IsSignatureVerificationEnabled,
			Signers:                        cfg.Signers,
			Transmitters:                   cfg.Transmitters,
		}
	}
	return result
}
