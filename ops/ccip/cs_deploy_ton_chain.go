package ops

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms"

	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	tonstate "github.com/smartcontractkit/chainlink-ton/ops/state"

	tonaddress "github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
)

type DeployCCIPContractsCfg struct {
	TonChainSelector uint64
	Params           config.ChainContractParams
}

func (c DeployCCIPContractsCfg) Validate() error {
	// TODO: implement chain selector validation, contract parameters validation
	return nil
}

var _ cldf.ChangeSetV2[DeployCCIPContractsCfg] = DeployCCIPContracts{}

// DeployCCIPContracts deploys Ton chain packages and modules
type DeployCCIPContracts struct{}

func (cs DeployCCIPContracts) VerifyPreconditions(_ cldf.Environment, _ DeployCCIPContractsCfg) error {
	// TODO: Implement precondition checks for contract deployment
	return nil
}

func (cs DeployCCIPContracts) Apply(env cldf.Environment, config DeployCCIPContractsCfg) (cldf.ChangesetOutput, error) {
	// TODO: Implement logic of deploying Ton chain packages and modules
	// - once all contracts are deployed, we can remove the hardcoded addresses from the TonTestDeployPrerequisitesChangeSet
	// - Deploy TON MCMS, https://smartcontract-it.atlassian.net/browse/NONEVM-1939
	// - Deploy and initialize TON CCIP Offramp, Router, Onramp, Dummy Receiver and set the contract address https://smartcontract-it.atlassian.net/browse/NONEVM-1938
	// - Replace with actual TON addresses after contracts are supported, https://smartcontract-it.atlassian.net/browse/NONEVM-1938
	env.Logger.Infof("TON_E2E: Deploying contracts for TON chains: %v", config.TonChainSelector)
	selector := config.TonChainSelector

	ab := cldf.NewMemoryAddressBook()
	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)

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

	deps := operation.TonDeps{
		TonChain:         chain,
		CCIPOnChainState: states,
	}

	// TODO: deploy MCMS

	// TODO: deploy LINK

	// deploy CCIP contracts
	ccipSeqInput := sequence.DeployCCIPSeqInput{
		// MCMSAddress:      mcmsSeqReport.Output.MCMSAddress,
		// LinkTokenAddress: linkTokenAddress,
		CCIPConfig: config.Params,
	}
	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.DeployCCIPSequence, deps, ccipSeqInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", selector, err)
	}
	seqReports = append(seqReports, ccipSeqReport.ExecutionReports...)
	// mcmsOperations = append(mcmsOperations, ccipSeqReport.Output.MCMSOperations...)

	// Placeholders
	address := tonaddress.MustParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	state.OffRamp = *address
	address = tonaddress.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")
	state.LinkTokenAddress = *address
	address = tonaddress.MustParseAddr("UQCk4967vNM_V46Dn8I0x-gB_QE2KkdW1GQ7mWz1DtYGLEd8")
	state.ReceiverAddress = *address

	state.OnRamp = *ccipSeqReport.Output.OnRampAddress
	state.Router = *ccipSeqReport.Output.RouterAddress
	state.FeeQuoter = *ccipSeqReport.Output.FeeQuoterAddress

	// TODO: generate MCMS proposal/execute

	// Save state
	err = tonstate.SaveOnchainState(selector, state, env)
	if err != nil {
		return cldf.ChangesetOutput{}, err
	}
	return cldf.ChangesetOutput{
		AddressBook:           ab,
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
	}, nil
}
