package ops

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/utils"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	"github.com/smartcontractkit/mcms"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type AddTonLanes struct{}

var _ cldf.ChangeSetV2[config.UpdateTonLanesConfig] = AddTonLanes{}

func (cs AddTonLanes) VerifyPreconditions(_ cldf.Environment, _ config.UpdateTonLanesConfig) error {
	// TODO: Implement precondition checks for adding or updating a lane on Ton chain
	return nil
}

func (cs AddTonLanes) Apply(env cldf.Environment, config config.UpdateTonLanesConfig) (cldf.ChangesetOutput, error) {

	var (
		timeLockProposals []mcms.TimelockProposal
		// mcmsOperations    []mcmstypes.BatchOperation
	)

	seqReports := make([]operations.Report[any, any], 0)

	// // Add lane on EVM chains
	// // TODO: applying a changeset within another changeset is an anti-pattern. Using it here until EVM is refactored into Operations
	// evmUpdatesInput := config.ToEVMUpdateLanesConfig(cfg)
	// out, err := v1_6.UpdateLanesLogic(env, cfg.EVMMCMSConfig, evmUpdatesInput)
	// if err != nil {
	// 	return cldf.ChangesetOutput{}, err
	// }
	// timeLockProposals = append(timeLockProposals, out.MCMSTimelockProposals...)

	// Add lane on Aptos chains
	// Execute UpdateAptosLanesSequence for each aptos chain
	state, err := stateview.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load Aptos onchain state: %w", err)
	}

	updateInputsByTonChain := sequence.ToTonUpdateLanesConfig(state.TonChains, config)
	fmt.Printf("%+v\n", updateInputsByTonChain)
	for tonChainSel, sequenceInput := range updateInputsByTonChain {
		tonChains := env.BlockChains.TonChains()
		chain := tonChains[tonChainSel]

		deps := operation.TonDeps{
			TonChain:         chain,
			CCIPOnChainState: state,
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

		ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, deps, sequenceInput)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to apply lane updates: %w", err)
		}
		seqReports = append(seqReports, ccipSeqReport.ExecutionReports...)

		internalMsgs, err := utils.Deserialize(ccipSeqReport.Output)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to deserialize lane updates: %w", err)
		}
		msgs := make([]*wallet.Message, len(internalMsgs))
		for i, msg := range internalMsgs {
			msgs[i] = &wallet.Message{
				Mode:            wallet.PayGasSeparately, // TODO: wallet.IgnoreErrors ?
				InternalMessage: msg,
			}
		}
		ctx := env.GetContext()
		tx, blockID, err := chain.Wallet.SendManyWaitTransaction(ctx, msgs)
		env.Logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to send lane updates: %w", err)
		}
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: timeLockProposals,
		Reports:               seqReports,
	}, nil
}
