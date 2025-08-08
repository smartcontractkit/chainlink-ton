package ops

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/mcms"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
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

	// Add lane on TON chains
	// Execute UpdateTonLanesSequence for each ton chain
	s, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load Aptos onchain state: %w", err)
	}

	updateInputsByTonChain := sequence.ToTonUpdateLanesConfig(s, config)
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

		internalMsgs, err := utils.Deserialize(updateSeqReport.Output)
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
		env.Logger.Infow("Sending msgs", "msgs", msgs)
		tx, blockID, err := chain.Wallet.SendManyWaitTransaction(ctx, msgs)
		env.Logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to send lane updates: %w", err)
		}
		msg, err := tracetracking.MapToReceivedMessage(tx)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to get outgoing messages: %w", err)
		}
		err = msg.WaitForTrace(chain.Client)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to wait for trace: %w", err)
		}
		for _, msg := range msg.OutgoingInternalReceivedMessages {
			// check external messages for all marked as Success
			env.Logger.Infow("ReceivedMessage", "msg", msg)
		}
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: timeLockProposals,
		Reports:               seqReports,
	}, nil
}
