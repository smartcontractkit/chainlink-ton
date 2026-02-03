package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/mcms/types"

	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (a *TonDeployAdapter) SetOCR3Config() *cldf_ops.Sequence[deployops.SetOCR3ConfigInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return SetOCR3Config
}

var SetOCR3Config = cldf_ops.NewSequence(
	"ton/sequences/ccip/set-ocr3-config",
	semver.MustParse("1.6.0"),
	"Set OCR3 Config on Ton chains",
	func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input deployops.SetOCR3ConfigInput) (output sequences.OnChainOutput, err error) {
		chainSelector := input.ChainSelector
		chain := chains.TonChains()[chainSelector]
		stateCCIP, err := extractCCIPChainStateFromOcrInput(input)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateCCIP),
		)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		sender := chain.Wallet.Address()
		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		{
			_input := seq.SetOCR3OfframpSeqInput{
				ChainSelector: input.ChainSelector,
				Configs:       intoOCRConfigs(input.Configs),
			}
			//nolint:govet // allow shadowing
			r, err := cldf_ops.ExecuteSequence(b, seq.SetOCR3OfframpSequence, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, err
			}

			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &stateCCIP.OffRamp, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner

			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{})
		}

		r, err := cldf_ops.ExecuteOperation(b, mcms.SendOrPlan, dp, _inputMCMS)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return r.Output, nil
	},
)

func extractCCIPChainStateFromOcrInput(input deployops.SetOCR3ConfigInput) (state.CCIPChainState, error) {
	offRampAddr, err := getOffRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return state.CCIPChainState{}, err
	}
	onRampAddr, err := getOnRampAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return state.CCIPChainState{}, err
	}
	routerAddr, err := getRouterAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return state.CCIPChainState{}, err
	}
	feeQuoter, err := getFQAddress(input.Datastore, input.ChainSelector)
	if err != nil {
		return state.CCIPChainState{}, err
	}
	return extractCCIPChainStateFrom(onRampAddr, offRampAddr, routerAddr, feeQuoter)
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
