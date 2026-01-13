package ops

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms"
	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
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
	stateCCIP, err := tonstate.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	stateMCMS, err := state.LoadMCMSOnChainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}

	updateInputsByTonChain := sequence.ToTonUpdateLanesConfig(stateCCIP, cfg)
	env.Logger.Debug("%+v\n", updateInputsByTonChain)
	for tonChainSel, sequenceInput := range updateInputsByTonChain {
		tonChains := env.BlockChains.TonChains()
		chain := tonChains[tonChainSel]
		deps := config.CCIPDeps{
			TonChain:         chain,
			CCIPOnChainState: stateCCIP,
		}

		stateMCMSChain := stateMCMS[tonChainSel]

		// Execute the sequence
		{
			r, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, deps, sequenceInput)
			if err != nil {
				return cldf.ChangesetOutput{}, err
			}
			reports = append(reports, r.ExecutionReports...)

			if len(r.Output.BatchOps) > 0 {
				opts := opsmcms.TimelockOpts{
					ChainSelector: types.ChainSelector(tonChainSel),
					MCMSAddr:      &stateMCMSChain.MCMS,
					TimelockAddr:  &stateMCMSChain.Timelock,
					Description:   fmt.Sprintf("Update lanes on Ton chain %d", tonChainSel),
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
