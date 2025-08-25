package ops

import (
	"errors"
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
	state, err := tonstate.LoadOnchainState(env)
	if err != nil {
		return fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	// supportedChains := state.SupportedChains()
	if cfg.TonMCMSConfig == nil {
		return errors.New("config for TON MCMS is required for AddTONLanes changeset")
	}

	// For every configured lane validate TON source or destination chain definitions
	for _, laneCfg := range cfg.Lanes {
		// Source cannot be an unknown.
		// if _, ok := supportedChains[laneCfg.Source.GetSelector()]; !ok {
		// 	return fmt.Errorf("unsupported source chain: %d", laneCfg.Source.GetSelector())
		// }
		// Destination cannot be an unknown.
		// if _, ok := supportedChains[laneCfg.Dest.GetSelector()]; !ok {
		// 	return fmt.Errorf("unsupported destination chain: %d", laneCfg.Dest.GetSelector())
		// }
		if laneCfg.Source.GetChainFamily() == chainsel.FamilyTon {
			tonChain, exists := env.BlockChains.TonChains()[laneCfg.Source.GetSelector()]
			if !exists {
				return fmt.Errorf("source TON chain %d is not in env", laneCfg.Source.GetSelector())
			}
			err := laneCfg.Source.(config.TonChainDefinition).Validate(
				tonChain.Client,
				state[laneCfg.Source.GetSelector()],
			)
			if err != nil {
				return fmt.Errorf("failed to validate TON source chain %d: %w", laneCfg.Source.GetSelector(), err)
			}
		}
		if laneCfg.Dest.GetChainFamily() == chainsel.FamilyTon {
			tonChain, exists := env.BlockChains.TonChains()[laneCfg.Dest.GetSelector()]
			if !exists {
				return fmt.Errorf("destination TON chain %d is not in env", laneCfg.Dest.GetSelector())
			}
			err := laneCfg.Dest.(config.TonChainDefinition).Validate(
				tonChain.Client,
				state[laneCfg.Dest.GetSelector()],
			)
			if err != nil {
				return fmt.Errorf("failed to validate TON destination chain %d: %w", laneCfg.Dest.GetSelector(), err)
			}
		}
	}

	// This EVM specific changeset will be called from within this TON changeset, hence, we're verifying it here
	// TODO: this is an anti-pattern, change this once EVM changesets are refactored as Operations
	// evmUpdateCfg := config.ToEVMUpdateLanesConfig(cfg)
	// err = v1_6.UpdateLanesPrecondition(env, evmUpdateCfg)
	// if err != nil {
	// 	return err
	// }
	return nil
}

func (cs AddTonLanes) Apply(env cldf.Environment, cfg config.UpdateTonLanesConfig) (cldf.ChangesetOutput, error) {

	var (
		timeLockProposals []mcms.TimelockProposal
		// mcmsOperations    []mcmstypes.BatchOperation
	)

	seqReports := make([]operations.Report[any, any], 0)

	// Add lane on EVM chains
	// TODO: applying a changeset within another changeset is an anti-pattern. Using it here until EVM is refactored into Operations
	// evmUpdatesInput := config.ToEVMUpdateLanesConfig(cfg)
	// out, err := v1_6.UpdateLanesLogic(env, cfg.EVMMCMSConfig, evmUpdatesInput)
	// if err != nil {
	// 	return cldf.ChangesetOutput{}, err
	// }
	// timeLockProposals = append(timeLockProposals, out.MCMSTimelockProposals...)

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
