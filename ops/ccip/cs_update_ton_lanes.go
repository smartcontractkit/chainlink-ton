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
	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)
	// mcmsOperations := make([]mcmstypes.BatchOperation, 0)

	// TODO: This feels like a lot of boilerplate
	selector := config.FromChainSelector
	states, err := stateview.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}
	// states, err := tonstate.LoadOnchainState(env)
	// if err != nil {
	// 	return cldf.ChangesetOutput{}, err
	// }
	// state := states.TonChains[selector]

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[selector]

	// TODO: do we just have to keep setting this up??
	deps := operation.TonDeps{
		// AB:               ab, // ????
		TonChain:         chain,
		CCIPOnChainState: states,
	}

	// TODO:
	input := sequence.UpdateTonLanesSeqInput{}

	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, deps, input)
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

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
	}, nil
}
