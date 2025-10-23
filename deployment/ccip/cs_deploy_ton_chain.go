package ops

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

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
	ContractsVersion string
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
	env.Logger.Infof("deploying contracts for TON chains: %v", config.TonChainSelector)
	selector := config.TonChainSelector

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[selector]

	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)

	states, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}
	s := states[selector]

	deps := operation.TonDeps{
		TonChain:         chain,
		CCIPOnChainState: states,
	}

	// TODO: deploy MCMS

	// deploy CCIP contracts
	ccipSeqInput := sequence.DeployCCIPSeqInput{
		// MCMSAddress:      mcmsSeqReport.Output.MCMSAddress,
		// LinkTokenAddress: linkTokenAddress,
		CCIPConfig:          config.Params,
		ContractsVersionSha: config.ContractsVersion,
		ContractsSemver:     semver.MustParse("1.6.0"), // TODO Move to the change input. Will do in a later PR given that this will be a breaking change for CLD
		ChainSelector:       selector,
	}
	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.DeployCCIPSequence, deps, ccipSeqInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", selector, err)
	}
	seqReports = append(seqReports, ccipSeqReport.ExecutionReports...)
	// mcmsOperations = append(mcmsOperations, ccipSeqReport.Output.MCMSOperations...)

	// TODO: deploy LINK
	address := tonaddress.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")
	s.LinkTokenAddress = *address

	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()
	if ccipSeqReport.Output.RouterAddress != nil {
		// FYI Add method will never fail given that the dataStore is empty
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.RouterAddress.CLDFAddressRef)
		s.Router = ccipSeqReport.Output.RouterAddress.TONAddress
	}
	if ccipSeqReport.Output.FeeQuoterAddress != nil {
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.FeeQuoterAddress.CLDFAddressRef)
		s.FeeQuoter = ccipSeqReport.Output.FeeQuoterAddress.TONAddress
	}
	if ccipSeqReport.Output.OnRampAddress != nil {
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.OnRampAddress.CLDFAddressRef)
		s.OnRamp = ccipSeqReport.Output.OnRampAddress.TONAddress
	}
	if ccipSeqReport.Output.OffRampAddress != nil {
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.OffRampAddress.CLDFAddressRef)
		s.OffRamp = ccipSeqReport.Output.OffRampAddress.TONAddress
	}
	if ccipSeqReport.Output.ReceiverAddress != nil {
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.ReceiverAddress.CLDFAddressRef)
		s.ReceiverAddress = ccipSeqReport.Output.ReceiverAddress.TONAddress
	}
	if ccipSeqReport.Output.TimelockAddress != nil {
		_ = dataStore.Addresses().Add(ccipSeqReport.Output.TimelockAddress.CLDFAddressRef)
		s.Timelock = ccipSeqReport.Output.TimelockAddress.TONAddress
	}

	deps.CCIPOnChainState[selector] = s

	// Execute post-deployment config
	var txs [][]byte

	// feeQuoter.updateFeeTokens
	feeTokens := make(map[string]operation.FeeTokenConfig, len(config.Params.FeeQuoterParams.FeeTokens))
	for _, feeToken := range config.Params.FeeQuoterParams.FeeTokens {
		feeTokens[feeToken.Address.String()] = operation.FeeTokenConfig{PremiumMultiplierWeiPerEth: feeToken.PremiumMultiplierWeiPerEth}
	}
	updateFeeTokensInput := operation.UpdateFeeQuoterFeeTokensInput{
		Lggr:      env.Logger,
		FeeTokens: feeTokens,
	}
	updateFeeTokensReport, err := operations.ExecuteOperation(env.OperationsBundle, operation.UpdateFeeQuoterFeeTokensOp, deps, updateFeeTokensInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to update fee quoter fee tokens: %w", err)
	}

	txs = append(txs, updateFeeTokensReport.Output...)

	err = utils.ExecuteProposals(env, chain.Client, chain.Wallet, txs)

	if err != nil {
		return cldf.ChangesetOutput{}, err
	}

	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, _ := dataStoreToAddressBook(dataStore)

	// TODO: generate MCMS proposal or execute
	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
		DataStore:             dataStore,
		AddressBook:           ab,
	}, nil
}

// Temp function to transform a DataStore to the legacy AddressBook. Couldn't find any utility function to do this.
// Once we adopt this new change set in CLD we can remove returning AddressBook at all :)
func dataStoreToAddressBook(ds *ds.MemoryDataStore) (*cldf.AddressBookMap, error) {
	ab := cldf.NewMemoryAddressBook()
	addresses, err := ds.Addresses().Fetch()
	if err != nil {
		return nil, fmt.Errorf("failed to list addresses from datastore: %w", err)
	}
	for _, addrRef := range addresses {
		err := ab.Save(addrRef.ChainSelector, addrRef.Address, cldf.NewTypeAndVersion(cldf.ContractType(addrRef.Type), *addrRef.Version))
		if err != nil {
			return nil, fmt.Errorf("failed to save address %s to address book: %w", addrRef.Type, err)
		}
	}
	return ab, nil
}
