package ops

import (
	"fmt"

	chainsel "github.com/smartcontractkit/chain-selectors"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
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
	var (
		timeLockProposals []mcms.TimelockProposal
		// mcmsOperations    []mcmstypes.BatchOperation
	)

	seqReports := make([]operations.Report[any, any], 0)

	// Add lane on TON chains
	// Execute UpdateTonLanesSequence for each ton chain
	s, err := tonstate.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	updateInputsByTonChain := sequence.ToTonUpdateLanesConfig(s, cfg)
	fmt.Printf("%+v\n", updateInputsByTonChain)
	for tonChainSel, sequenceInput := range updateInputsByTonChain {
		tonChains := env.BlockChains.TonChains()
		chain := tonChains[tonChainSel]
		deps := operation.TonDeps{
			TonChain:         chain,
			CCIPOnChainState: s,
		}
		// Execute the sequence
		updateSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, deps, sequenceInput)
		if err != nil {
			return cldf.ChangesetOutput{}, err
		}
		seqReports = append(seqReports, updateSeqReport.ExecutionReports...)
		// mcmsOperations = append(mcmsOperations, updateSeqReport.Output)

		// Generate MCMS proposals
		// proposal, err := utils.GenerateProposal(
		// 	env,
		// 	state.TonChains[tonChainSel].MCMSAddress,
		// 	deps.TonChain.Selector,
		// 	mcmsOperations,
		// 	"Update lanes on Ton chain",
		// 	*cfg.TonMCMSConfig,
		// )
		// if err != nil {
		// 	return cldf.ChangesetOutput{}, fmt.Errorf("failed to generate MCMS proposal for Ton chain %d: %w", tonChainSel, err)
		// }
		// timeLockProposals = append(timeLockProposals, *proposal)

		if err := utils.ExecuteProposals(env, chain.Client, chain.Wallet, updateSeqReport.Output); err != nil {
			return cldf.ChangesetOutput{}, err
		}
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: timeLockProposals,
		Reports:               seqReports,
	}, nil
}
