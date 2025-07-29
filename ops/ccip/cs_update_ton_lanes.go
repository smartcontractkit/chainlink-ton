package ops

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	"github.com/smartcontractkit/mcms"
)

type AddLaneCfg struct {
	FromChainSelector uint64
	ToChainSelector   uint64
	FromFamily        string
	ToFamily          string
}

type AddTonLanes struct{}

var _ cldf.ChangeSetV2[AddLaneCfg] = AddTonLanes{}

func (cs AddTonLanes) VerifyPreconditions(_ cldf.Environment, _ AddLaneCfg) error {
	// TODO: Implement precondition checks for adding or updating a lane on Ton chain
	return nil
}

func (cs AddTonLanes) Apply(env cldf.Environment, config AddLaneCfg) (cldf.ChangesetOutput, error) {
	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)
	// mcmsOperations := make([]mcmstypes.BatchOperation, 0)

	// TODO: This feels like a lot of boilerplate
	selector := config.TonChainSelector
	states, err := stateview.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}
	// states, err := tonstate.LoadOnchainState(env)
	// if err != nil {
	// 	return cldf.ChangesetOutput{}, err
	// }
	state := states.TonChains[selector]

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[selector]

	// TODO: do we just have to keep setting this up??
	deps := operation.TonDeps{
		// AB:               ab, // ????
		TonChain:         chain,
		CCIPOnChainState: states,
	}

	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.UpdateTonLanesSequence, deps, input)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to apply lane updates: %w", err)
	}
	seqReports = append(seqReports, ccipSeqReport.ExecutionReports...)

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
	}, nil
}
