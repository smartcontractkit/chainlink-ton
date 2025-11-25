package sequences

import (
	"github.com/Masterminds/semver/v3"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
)

func (a *TonAdapter) SetOCR3Config() *cldf_ops.Sequence[deployops.SetOCR3ConfigInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return SetOCR3Config
}

var SetOCR3Config = cldf_ops.NewSequence(
	"setocr3config",
	semver.MustParse("1.6.0"),
	"Set OCR3 Config on Ton chains",
	func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input deployops.SetOCR3ConfigInput) (output sequences.OnChainOutput, err error) {
		var txs [][]byte
		a := &TonAdapter{}
		chainSelector := input.ChainSelector
		tonChain := chains.TonChains()[chainSelector]
		deps, err := extractTonDepsFromOcrInput(tonChain, a, input)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		in := seq.SetOCR3OfframpSeqInput{
			ChainSelector: input.ChainSelector,
			Configs:       intoOCRConfigs(input.Configs),
		}
		setOCR3SeqReport, err := cldf_ops.ExecuteSequence(b, seq.SetOCR3OfframpSequence, deps, in)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		txs = append(txs, setOCR3SeqReport.Output...)

		// Execute the txs || MCMS proposals
		err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, deps.TonChain.Client, deps.TonChain.Wallet, txs)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		return sequences.OnChainOutput{}, nil
	},
)

func extractTonDepsFromOcrInput(chain ton.Chain, a *TonAdapter, input deployops.SetOCR3ConfigInput) (operation.TonDeps, error) {
	offRampAddr, err := a.GetOffRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return operation.TonDeps{}, err
	}
	onRampAddr, err := a.GetOnRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return operation.TonDeps{}, err
	}
	routerAddr, err := a.GetRouterAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return operation.TonDeps{}, err
	}
	feeQuoter, err := a.GetFQAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return operation.TonDeps{}, err
	}
	return extractTonDepsFrom(chain, onRampAddr, offRampAddr, routerAddr, feeQuoter)
}

func intoOCRConfigs(configs map[ccipocr3.PluginType]deployops.OCR3ConfigArgs) map[operation.PluginType]operation.OCR3ConfigArgs {
	result := make(map[operation.PluginType]operation.OCR3ConfigArgs)
	for pluginType, config := range configs {
		var pType = operation.PluginType(pluginType)
		result[pType] = operation.OCR3ConfigArgs{
			ConfigDigest:                   config.ConfigDigest,
			PluginType:                     pType,
			F:                              config.F,
			IsSignatureVerificationEnabled: config.IsSignatureVerificationEnabled,
			Signers:                        config.Signers,
			Transmitters:                   config.Transmitters,
		}
	}
	return result
}
