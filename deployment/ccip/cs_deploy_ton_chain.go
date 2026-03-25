package ops

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
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

	reports := make([]operations.Report[any, any], 0)

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

	// TODO: deploy TON native token
	if s.TONNativeAddress.IsAddrNone() {
		s.TONNativeAddress = *tvm.TonTokenAddr // using dummy TON address until we deploy real one
		_ = dataStore.Addresses().Upsert(ds.AddressRef{
			Address:       tvm.TonTokenAddr.String(),
			ChainSelector: selector,
			Labels:        ds.LabelSet{},
			Type:          state.TONNative,
			Version:       &state.Version1_6_0,
		})
	}

	states[selector] = s

	dp, err := dep.NewDependencyProvider(
		dep.Provide(chain),
		dep.Provide(states[selector]),
	)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
	}

	// deploy CCIP contracts
	ccipSeqInput := sequence.DeployCCIPSeqInput{
		CCIPConfig:          cfg.Params,
		ContractsVersionSha: cfg.ContractsVersion,
		ChainSelector:       selector,
	}
	ccipSeqReport, err := operations.ExecuteSequence(env.OperationsBundle, sequence.DeployCCIPSequence, dp, ccipSeqInput)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", selector, err)
	}
	reports = append(reports, ccipSeqReport.ExecutionReports...)

	// TODO (ops): duplicates csMCMSDeploy - extract to common deploy/addr processing utility
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

	// Update TonChainState with newly deployed addresses + update provider
	states[selector] = s
	dp, err = dp.With(dep.Provide(states[selector]))
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to update dependency provider: %w", err)
	}

	// Execute post-deployment cfg
	msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

	// feequoter.addPriceUpdater(offramp)
	{
		contractType := bindings.PkgCCIP + ".FeeQuoter"
		//nolint:govet // allow shadowing
		body, err := codec.WrapMessage[any](contractType, feequoter.AddPriceUpdater{PriceUpdater: &s.OffRamp})
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to wrap message: %w", err)
		}

		_in := opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &s.FeeQuoter,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    body,
				},
			},
			Plan: true, // plan, defer execution to later step
		}

		r, err := operations.ExecuteOperation(env.OperationsBundle, opston.SendMessages, dp, _in)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
		}

		reports = append(reports, r.ToGenericReport())
		msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
	}

	// feeQuoter.updateFeeTokens
	{
		feeTokens := make(map[string]operation.FeeTokenConfig, len(cfg.Params.FeeQuoterParams.FeeTokens))
		for _, feeToken := range cfg.Params.FeeQuoterParams.FeeTokens {
			feeTokens[feeToken.Address.String()] = operation.FeeTokenConfig{
				PremiumMultiplierWeiPerEth: feeToken.PremiumMultiplierWeiPerEth,
			}
		}
		_in := operation.UpdateFeeQuoterFeeTokensInput{
			FeeTokens: feeTokens,
		}
		//nolint:govet // allow shadowing
		r, err := operations.ExecuteOperation(env.OperationsBundle, operation.UpdateFeeQuoterFeeTokensOp, dp, _in)
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to update fee quoter fee tokens: %w", err)
		}

		reports = append(reports, r.ToGenericReport())
		msgs = append(msgs, r.Output...)
	}

	if len(msgs) != 0 {
		//nolint:govet // allow shadowing
		r, err := operations.ExecuteOperation(env.OperationsBundle, opston.SendMessagesRaw, dp, opston.SendMessagesRawInput{Messages: msgs})
		if err != nil {
			return cldf.ChangesetOutput{}, fmt.Errorf("failed to send messages: %w", err)
		}

		reports = append(reports, r.ToGenericReport())
	}

	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, err := utils.DataStoreToAddressBook(dataStore)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to convert data store to address book: %w", err)
	}

	// TODO: generate MCMS proposal or execute
	return cldf.ChangesetOutput{
		Reports:     reports,
		DataStore:   dataStore,
		AddressBook: ab,
	}, nil
}
