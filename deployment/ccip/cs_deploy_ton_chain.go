package ops

import (
	"fmt"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/mcms"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
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

func (cs DeployCCIPContracts) Apply(env cldf.Environment, cfg DeployCCIPContractsCfg) (cldf.ChangesetOutput, error) {
	// TODO: Implement logic of deploying Ton chain packages and modules
	// - once all contracts are deployed, we can remove the hardcoded addresses from the TonTestDeployPrerequisitesChangeSet
	// - Deploy TON MCMS, https://smartcontract-it.atlassian.net/browse/NONEVM-1939
	env.Logger.Infof("deploying contracts for TON chains: %v", cfg.TonChainSelector)
	selector := cfg.TonChainSelector

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[selector]

	seqReports := make([]operations.Report[any, any], 0)
	proposals := make([]mcms.TimelockProposal, 0)

	states, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}
	s := states[selector]

	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()

	// TODO: deploy LINK
	if s.LinkTokenAddress.IsAddrNone() {
		s.LinkTokenAddress = *tvm.LinkTokenAddr // using dummy LINK address until we deploy real one
		_ = dataStore.Addresses().Upsert(ds.AddressRef{
			Address:       tvm.LinkTokenAddr.String(),
			ChainSelector: selector,
			Labels:        ds.LabelSet{},
			Type:          state.LinkToken,
			Version:       &state.Version1_6_0,
		})
	}

	deps := config.CCIPDeps{
		TonChain:         chain,
		CCIPOnChainState: states,
	}

	deps.CCIPOnChainState[selector] = s

	// deploy CCIP contracts
	ccipSeqInput := sequence.DeployCCIPSeqInput{
		CCIPConfig:          cfg.Params,
		ContractsVersionSha: cfg.ContractsVersion,
		ChainSelector:       selector,
	}
	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.DeployCCIPSequence, deps, ccipSeqInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", selector, err)
	}
	seqReports = append(seqReports, ccipSeqReport.ExecutionReports...)

	// Add newly deployed TON addresses to our output data store
	if len(ccipSeqReport.Output.Addresses) > 0 {
		for _, addr := range ccipSeqReport.Output.Addresses {
			err = dataStore.Addresses().Add(addr)
			if err != nil {
				return cldf.ChangesetOutput{}, fmt.Errorf("failed to add deployed address to data store: %w", err)
			}
		}

		// Reload state with complete address set (existing env.DataStore + new TON addresses)
		// Note: We use a temporary merged store only for loading state, not for output.
		// The output should only contain new TON addresses (in dataStore above).
		mergedStore := ds.NewMemoryDataStore()
		if err = mergedStore.Merge(env.DataStore); err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to merge existing addresses: %w", err)
		}
		if err = mergedStore.Merge(dataStore.Seal()); err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to merge new TON addresses: %w", err)
		}

		s, err = state.LoadCCIPOnChainStateUsingDataStore(mergedStore.Seal(), selector)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to reload state: %w", err)
		}
	}

	deps.CCIPOnChainState[selector] = s

	// Execute post-deployment cfg
	txs := helpers.NewEmptyTransactions()

	// feequoter.addPriceUpdater(offramp)
	addPriceUpdaterInput := operation.AddPriceUpdaterInput{
		PriceUpdater: &s.OffRamp,
	}
	addPriceUpdaterReport, err := operations.ExecuteOperation(env.OperationsBundle, operation.AddPriceUpdaterOp, deps, addPriceUpdaterInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to set offramp as price updater: %w", err)
	}
	txs.Append(addPriceUpdaterReport.Output)

	// feeQuoter.updateFeeTokens
	feeTokens := make(map[string]operation.FeeTokenConfig, len(cfg.Params.FeeQuoterParams.FeeTokens))
	for _, feeToken := range cfg.Params.FeeQuoterParams.FeeTokens {
		feeTokens[feeToken.Address.String()] = operation.FeeTokenConfig{PremiumMultiplierWeiPerEth: feeToken.PremiumMultiplierWeiPerEth}
	}
	updateFeeTokensInput := operation.UpdateFeeQuoterFeeTokensInput{
		FeeTokens: feeTokens,
	}
	updateFeeTokensReport, err := operations.ExecuteOperation(env.OperationsBundle, operation.UpdateFeeQuoterFeeTokensOp, deps, updateFeeTokensInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to update fee quoter fee tokens: %w", err)
	}
	txs.Append(updateFeeTokensReport.Output)

	err = helpers.ExecuteProposals(env, chain.Client, chain.Wallet, txs)

	if err != nil {
		return cldf.ChangesetOutput{}, err
	}

	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, err := utils.DataStoreToAddressBook(dataStore)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to convert data store to address book: %w", err)
	}

	// TODO: generate MCMS proposal or execute
	return cldf.ChangesetOutput{
		MCMSTimelockProposals: proposals,
		Reports:               seqReports,
		DataStore:             dataStore,
		AddressBook:           ab,
	}, nil
}
