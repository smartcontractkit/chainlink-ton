package ops

import (
	"fmt"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

var _ cldf.ChangeSetV2[SetOCR3OffRampConfig] = SetOCR3Config{}

type SetOCR3OffRampConfig struct {
	RemoteChainSels []uint64
	Configs         map[operation.PluginType]operation.OCR3ConfigArgs
}

// SetOCR3Config updates OCR3 Offramp configurations
type SetOCR3Config struct{}

func (cs SetOCR3Config) VerifyPreconditions(env cldf.Environment, config SetOCR3OffRampConfig) error {
	for _, remoteSel := range config.RemoteChainSels {
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

func (cs SetOCR3Config) Apply(env cldf.Environment, config SetOCR3OffRampConfig) (cldf.ChangesetOutput, error) {
	var (
		proposals []mcms.TimelockProposal
		// mcmsOperations    []mcmstypes.BatchOperation
	)
	seqReports := make([]operations.Report[any, any], 0)

	state, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	for _, remoteSelector := range config.RemoteChainSels {
		tonChains := env.BlockChains.TonChains()
		chain := tonChains[remoteSelector]
		deps := operation.TonDeps{
			TonChain:         chain,
			CCIPOnChainState: state,
		}
		in := seq.SetOCR3OfframpSeqInput{
			ChainSelector: remoteSelector,
			Configs:       config.Configs,
		}
		setOCR3SeqReport, err := operations.ExecuteSequence(env.OperationsBundle, seq.SetOCR3OfframpSequence, deps, in)
		if err != nil {
			return cldf.ChangesetOutput{}, err
		}
		seqReports = append(seqReports, setOCR3SeqReport.ExecutionReports...)

		// TODO: generate MCMS proposals

		if err := helpers.ExecuteProposals(env, chain.Client, chain.Wallet, setOCR3SeqReport.Output); err != nil {
			return cldf.ChangesetOutput{}, err
		}
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
	}, nil
}
