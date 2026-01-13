package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/mcms/types"

	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (a *TonAdapter) SetOCR3Config() *cldf_ops.Sequence[deployops.SetOCR3ConfigInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return SetOCR3Config
}

var SetOCR3Config = cldf_ops.NewSequence(
	"ton/sequences/ccip/set-ocr3-config",
	semver.MustParse("1.6.0"),
	"Set OCR3 Config on Ton chains",
	func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input deployops.SetOCR3ConfigInput) (output sequences.OnChainOutput, err error) {
		a := &TonAdapter{}
		chainSelector := input.ChainSelector
		tonChain := chains.TonChains()[chainSelector]
		deps, err := extractTonDepsFromOcrInput(tonChain, a, input)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		sender := tonChain.Wallet.Address()
		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		{
			_input := seq.SetOCR3OfframpSeqInput{
				ChainSelector: input.ChainSelector,
				Configs:       intoOCRConfigs(input.Configs),
			}
			r, err := cldf_ops.ExecuteSequence(b, seq.SetOCR3OfframpSequence, deps, _input)
			if err != nil {
				return sequences.OnChainOutput{}, err
			}

			addr := deps.CCIPOnChainState[chainSelector].OffRamp
			owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner

			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{})
		}

		r, err := operations.ExecuteOperation(b, mcms.SendOrPlan, tonChain, _inputMCMS)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return r.Output, nil
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
