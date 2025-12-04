package changesets

import (
	"fmt"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	mcmsSeq "github.com/smartcontractkit/chainlink-ton/deployment/mcms/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

type DeployMCMSContractsCfg struct {
	ContractsVersion string
	ContractParams   config.ChainContractParams
	ChainSelector    uint64
}

var _ cldf.ChangeSetV2[DeployMCMSContractsCfg] = DeployMCMSContracts{}

// DeployMCMSContracts deploys MCMS packages and modules
type DeployMCMSContracts struct{}

func (cs DeployMCMSContracts) VerifyPreconditions(_ cldf.Environment, _ DeployMCMSContractsCfg) error {
	return nil
}

func (cs DeployMCMSContracts) Apply(env cldf.Environment, cfg DeployMCMSContractsCfg) (cldf.ChangesetOutput, error) {
	env.Logger.Infof("deploying contracts for MCMS contracts: %v", cfg.ChainSelector)
	selector := cfg.ChainSelector

	mcmsStates, err := state.LoadMCMSOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}
	m := mcmsStates[selector]

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[selector]
	mcmsSeqInput := mcmsSeq.DeployMCMSSeqInput{
		ContractsParams: config.ChainContractParams{
			MCMS:     cfg.ContractParams.MCMS,
			Timelock: cfg.ContractParams.Timelock,
		},
		ContractsVersionSha: cfg.ContractsVersion,
		ChainSelector:       cfg.ChainSelector,
	}

	mcmsDeps := config.MCMSDeps{
		TonChain:       chain,
		MCMSChainState: mcmsStates,
	}

	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)

	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()

	// deploy MCMS contracts
	mcmsSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, mcmsSeq.DeployMCMSSequence, mcmsDeps, mcmsSeqInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", selector, err)
	}

	seqReports = append(seqReports, mcmsSeqReport.ExecutionReports...)
	if mcmsSeqReport.Output.TimelockAddress != nil {
		_ = dataStore.Addresses().Add(mcmsSeqReport.Output.TimelockAddress.CLDFAddressRef)
		m.Timelock = mcmsSeqReport.Output.TimelockAddress.TONAddress
	}

	if mcmsSeqReport.Output.MCMSAddress != nil {
		_ = dataStore.Addresses().Add(mcmsSeqReport.Output.MCMSAddress.CLDFAddressRef)
		m.MCMS = mcmsSeqReport.Output.MCMSAddress.TONAddress
	}

	mcmsDeps.MCMSChainState[selector] = m
	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, _ := utils.DataStoreToAddressBook(dataStore)

	// TODO: generate MCMS proposal or execute
	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
		DataStore:             dataStore,
		AddressBook:           ab,
	}, nil
}
