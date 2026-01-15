package ops

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/mcms"
	"github.com/smartcontractkit/mcms/types"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

var _ cldf.ChangeSetV2[SetOCR3OffRampConfig] = SetOCR3Config{}

type SetOCR3OffRampConfig struct {
	RemoteChainSels []uint64 // TODO (ops): unused currently
	Configs         map[operation.PluginType]operation.OCR3ConfigArgs
}

// SetOCR3Config updates OCR3 Offramp configurations
type SetOCR3Config struct{}

func (cs SetOCR3Config) VerifyPreconditions(env cldf.Environment, cfg SetOCR3OffRampConfig) error {
	for _, remoteSel := range cfg.RemoteChainSels {
		chainFamily, _ := chain_selectors.GetSelectorFamily(remoteSel)
		if chainFamily != chain_selectors.FamilyTon {
			return fmt.Errorf("chain %d is not an Ton chain", remoteSel)
		}
		_, exists := env.BlockChains.TonChains()[remoteSel]
		if !exists {
			return fmt.Errorf("chain %d is not in Ton env", remoteSel)
		}
	}
	return nil
}

func (cs SetOCR3Config) Apply(env cldf.Environment, cfg SetOCR3OffRampConfig) (cldf.ChangesetOutput, error) {
	proposals := make([]mcms.TimelockProposal, 0)
	reports := make([]operations.Report[any, any], 0)

	stateCCIP, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	stateMCMS, err := state.LoadMCMSOnChainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}

	for _, remoteSelector := range cfg.RemoteChainSels {
		tonChains := env.BlockChains.TonChains()
		chain := tonChains[remoteSelector]
		sender := chain.Wallet.Address()

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateCCIP[remoteSelector]),
			dep.Provide(stateMCMS[remoteSelector]),
		)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		_inputMCMS := opsmcms.NewSendOrPlanInput(types.ChainSelector(remoteSelector))

		{
			in := seq.SetOCR3OfframpSeqInput{
				ChainSelector: remoteSelector,
				Configs:       cfg.Configs,
			}
			//nolint:govet // allow shadowing
			r, err := operations.ExecuteSequence(env.OperationsBundle, seq.SetOCR3OfframpSequence, dp, in)
			if err != nil {
				return cldf.ChangesetOutput{}, err
			}
			reports = append(reports, r.ExecutionReports...)

			addr := stateCCIP[remoteSelector].OffRamp
			owner, err := tvm.CallGetterLatest(env.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return cldf.ChangesetOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner

			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{})
		}

		r, err := operations.ExecuteOperation(env.OperationsBundle, opsmcms.SendOrPlan, dp, _inputMCMS)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}
		reports = append(reports, r.ToGenericReport())
		stateMCMSChain := stateMCMS[remoteSelector]

		if len(r.Output.BatchOps) > 0 {
			opts := opsmcms.TimelockOpts{
				ChainSelector: types.ChainSelector(remoteSelector),
				MCMSAddr:      &stateMCMSChain.MCMS,
				TimelockAddr:  &stateMCMSChain.Timelock,
				Description:   fmt.Sprintf("Set OCR3 Offramp Config on chain %d", remoteSelector),
				Action:        types.TimelockActionSchedule,
				Value:         tlb.MustFromTON("0.1"),
			}
			p, err := opsmcms.BuildTimelockProposal(env.GetContext(), chain.Client, r.Output.BatchOps, opts)
			if err != nil {
				return cldf.ChangesetOutput{}, fmt.Errorf("failed to build timelock proposal: %w", err)
			}
			proposals = append(proposals, p)
		}
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               reports,
	}, nil
}
