package ops

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/mcms"
	"github.com/smartcontractkit/mcms/types"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type AddTonLanes struct{}

var _ cldf.ChangeSetV2[config.UpdateTonLanesConfig] = AddTonLanes{}

func (cs AddTonLanes) VerifyPreconditions(env cldf.Environment, cfg config.UpdateTonLanesConfig) error {
	tonChains := env.BlockChains.TonChains()

	// For every configured lane validate TON source or destination chain definitions
	for _, laneCfg := range cfg.Lanes {
		if laneCfg.Source.ChainFamily() == chainsel.FamilyTon {
			_, exists := tonChains[laneCfg.Source.Selector]
			if !exists {
				return fmt.Errorf("source TON chain %d is not in env", laneCfg.Source.Selector)
			}
		}
		if laneCfg.Dest.ChainFamily() == chainsel.FamilyTon {
			_, exists := tonChains[laneCfg.Dest.Selector]
			if !exists {
				return fmt.Errorf("destination TON chain %d is not in env", laneCfg.Dest.Selector)
			}
		}
	}
	return nil
}

func (cs AddTonLanes) Apply(env cldf.Environment, cfg config.UpdateTonLanesConfig) (cldf.ChangesetOutput, error) {
	proposals := make([]mcms.TimelockProposal, 0)
	reports := make([]operations.Report[any, any], 0)

	// Add lane on TON chains
	// Execute UpdateTonLanesSequence for each ton chain
	stateCCIP, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	stateMCMS, err := state.LoadMCMSOnChainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}

	updateInputsByTonChain := sequence.ToTonUpdateLanesConfig(stateCCIP, cfg)
	env.Logger.Debug("%+v\n", updateInputsByTonChain)
	for selector, sequenceInput := range updateInputsByTonChain {
		chain := env.BlockChains.TonChains()[selector]
		chainStateCCIP := stateCCIP[selector]
		chainStateMCMS := stateMCMS[selector]
		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(chainStateCCIP),
		)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		// Execute the sequence
		{
			r, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, dp, sequenceInput)
			if err != nil {
				return cldf.ChangesetOutput{}, err
			}
			reports = append(reports, r.ExecutionReports...)

			if len(r.Output.BatchOps) > 0 {
				opts := opsmcms.TimelockOpts{
					ChainSelector: types.ChainSelector(selector),
					MCMSAddr:      &chainStateMCMS.MCMS,
					TimelockAddr:  &chainStateMCMS.Timelock,
					Description:   fmt.Sprintf("Update lanes on Ton chain %d", selector),
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
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               reports,
	}, nil
}
