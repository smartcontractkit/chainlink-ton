package ops

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"

	tonaddress "github.com/xssnick/tonutils-go/address"
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

	states, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}
	s := states[selector]

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
	address := tonaddress.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")
	s.LinkTokenAddress = *address
	address = tonaddress.MustParseAddr("UQCk4967vNM_V46Dn8I0x-gB_QE2KkdW1GQ7mWz1DtYGLEd8")
	s.ReceiverAddress = *address

	s.OnRamp = *ccipSeqReport.Output.OnRampAddress
	s.Router = *ccipSeqReport.Output.RouterAddress
	s.FeeQuoter = *ccipSeqReport.Output.FeeQuoterAddress
	s.OffRamp = *ccipSeqReport.Output.OffRampAddress

	// Save state
	err = state.SaveOnchainState(selector, s, env)
	deps.CCIPOnChainState[selector] = s
	if err != nil {
		return cldf.ChangesetOutput{}, err
	}

	// Execute post-deployment config
	var txs [][]byte

	// feeQuoter.updateFeeTokens
	feeTokens := make(map[string]operation.FeeTokenConfig, len(config.Params.FeeQuoterParams.FeeTokens))
	for _, config := range config.Params.FeeQuoterParams.FeeTokens {
		feeTokens[config.Address.String()] = operation.FeeTokenConfig{PremiumMultiplierWeiPerEth: config.PremiumMultiplierWeiPerEth}
	}
	updateFeeTokensInput := operation.UpdateFeeQuoterFeeTokensInput{
		Lggr:      env.Logger,
		FeeTokens: feeTokens,
	}
	updateFeeTokensReport, err := operations.ExecuteOperation(env.OperationsBundle, operation.UpdateFeeQuoterFeeTokensOp, deps, updateFeeTokensInput)
	txs = append(txs, updateFeeTokensReport.Output...)

	if err := utils.ExecuteProposals(env, chain.Client, chain.Wallet, txs); err != nil {
		return cldf.ChangesetOutput{}, err
	}

	// TODO: generate MCMS proposal or execute
	return cldf.ChangesetOutput{
		AddressBook:           ab,
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
	}, nil
}
