package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// defaultCCIPContractCoin is the default amount of TON coins to allocate for each CCIP contract deployment.
// This value is chosen to cover contract initialization and storage costs on TON blockchain.
const defaultCCIPContractCoin = "0.05"

// defaultReserveAmount is the default reserve amount allocated to the OnRamp contract.
// This reserve ensures the contract has sufficient balance for operational transactions.
const defaultReserveAmount = "0.5"

func (a *TonAdapter) DeployChainContracts() *operations.Sequence[deploy.ContractDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployChainContracts
}

var DeployChainContracts = operations.NewSequence(
	"ton/sequences/ccip/deploy-chain-contracts",
	semver.MustParse("1.6.0"),
	"Deploys all required contracts for CCIP 1.6.0 to a TON chain",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.ContractDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		tonChain := chains.TonChains()[input.ChainSelector]

		// deps used for op
		deps, err := extractTonDepsFromContractDeploymentInput(tonChain, input.ExistingAddresses)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		seqInput, err := intoDeployCCIPSeqInput(input, deps.TonChain.WalletAddress)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		ccipSeqReport, err := operations.ExecuteSequence(b, seq.DeployCCIPSequence, deps, seqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", input.ChainSelector, err)
		}

		deps, err = updateTonDepsWithDeployedAddresses(deps, ccipSeqReport.Output.Addresses)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update TON deps with deployed addresses: %w", err)
		}
		// TODO should we include these updates operations in this DeployCCIPSequence ? Probably move to a custom operation and call in CLD ?
		txs := helpers.NewEmptyTransactions()
		offrampAddr := deps.CCIPOnChainState[deps.TonChain.Selector].OffRamp
		// feequoter.addPriceUpdater(offramp)
		addPriceUpdaterInput := operation.AddPriceUpdaterInput{
			PriceUpdater: &offrampAddr,
		}
		addPriceUpdaterReport, err := operations.ExecuteOperation(b, operation.AddPriceUpdaterOp, deps, addPriceUpdaterInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to set offramp as price updater: %w", err)
		}
		txs.Append(addPriceUpdaterReport.Output)

		// feeQuoter.updateFeeTokens
		updateFeeTokensInput := operation.UpdateFeeQuoterFeeTokensInput{
			FeeTokens: map[string]operation.FeeTokenConfig{
				tvm.TonTokenAddr.String(): {
					PremiumMultiplierWeiPerEth: 1,
				},
				// TODO update link token dummy address here after https://smartcontract-it.atlassian.net/browse/NONEVM-3269
			},
		}
		updateFeeTokensReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterFeeTokensOp, deps, updateFeeTokensInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update fee quoter fee tokens: %w", err)
		}
		txs.Append(updateFeeTokensReport.Output)

		err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, tonChain.Client, tonChain.Wallet, txs)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to execute post-deployment transactions: %w", err)
		}

		return sequences.OnChainOutput{
			Addresses: ccipSeqReport.Output.Addresses,
			BatchOps:  ccipSeqReport.Output.BatchOps,
		}, nil
	},
)

func updateTonDepsWithDeployedAddresses(deps ccipConfig.CCIPDeps, deployed []datastore.AddressRef) (ccipConfig.CCIPDeps, error) {
	existingAddr := deps.CCIPOnChainState[deps.TonChain.Selector]
	for _, r := range deployed {
		tonAddr, err := address.ParseAddr(r.Address)
		if err != nil {
			return ccipConfig.CCIPDeps{}, err
		}
		if r.ChainSelector != deps.TonChain.Selector {
			continue
		}
		switch r.Type {
		case state.OnRamp:
			existingAddr.OnRamp = *tonAddr
		case state.OffRamp:
			existingAddr.OffRamp = *tonAddr
		case state.Router:
			existingAddr.Router = *tonAddr
		case state.FeeQuoter:
			existingAddr.FeeQuoter = *tonAddr
		case state.TonReceiver:
			existingAddr.ReceiverAddress = *tonAddr
		default:
			// ignore unknown types
		}
	}
	deps.CCIPOnChainState[deps.TonChain.Selector] = existingAddr
	return deps, nil
}

func extractTonDepsFromContractDeploymentInput(chain ton.Chain, existing []datastore.AddressRef) (ccipConfig.CCIPDeps, error) {
	noneAddr := address.NewAddressNone()
	init := state.CCIPChainState{
		OnRamp:    *noneAddr,
		OffRamp:   *noneAddr,
		Router:    *noneAddr,
		FeeQuoter: *noneAddr,
	}

	// fill in existing addresses
	for _, e := range existing {
		tonAddr, err := address.ParseAddr(e.Address)
		if err != nil {
			return ccipConfig.CCIPDeps{}, fmt.Errorf("failed to parse existing address %s: %w", e.Address, err)
		}
		switch e.Type {
		case state.OnRamp:
			init.OnRamp = *tonAddr
		case state.OffRamp:
			init.OffRamp = *tonAddr
		case state.Router:
			init.Router = *tonAddr
		case state.FeeQuoter:
			init.FeeQuoter = *tonAddr
		case state.TonReceiver:
			init.ReceiverAddress = *tonAddr
		default:
			// ignore unknown types
		}
	}

	deps := ccipConfig.CCIPDeps{
		TonChain: chain,
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			chain.Selector: init,
		},
	}
	return deps, nil
}

func intoDeployCCIPSeqInput(cfg deploy.ContractDeploymentConfigPerChainWithAddress, deployer *address.Address) (seq.DeployCCIPSeqInput, error) {
	// generate a random contract ID for all contracts in this deployment
	contractID, err := tonops.RandomUint32()
	if err != nil {
		return seq.DeployCCIPSeqInput{}, fmt.Errorf("failed to generate random contract ID: %w", err)
	}
	return seq.DeployCCIPSeqInput{
		ContractsVersionSha: cfg.ContractVersion,
		CCIPConfig: ccipConfig.ChainContractParams{
			FeeQuoterParams: ccipConfig.FeeQuoterParams{
				ContractsSemver:              cfg.Version,
				Coin:                         defaultCCIPContractCoin,
				MaxFeeJuelsPerMsg:            cfg.MaxFeeJuelsPerMsg,
				TokenPriceStalenessThreshold: uint64(cfg.TokenPriceStalenessThreshold),
				FeeTokens: map[ccipConfig.TokenSymbol]ccipConfig.FeeToken{
					"TON": {
						Address:                    tvm.TonTokenAddr,
						PremiumMultiplierWeiPerEth: 1,
					},
					// TODO update link token dummy address here after https://smartcontract-it.atlassian.net/browse/NONEVM-3269
				},
			},
			OffRampParams: ccipConfig.OffRampParams{
				ID:                               contractID,
				ContractsSemver:                  cfg.Version,
				Coin:                             defaultCCIPContractCoin,
				ChainSelector:                    cfg.ChainSelector,
				PermissionlessExecutionThreshold: cfg.PermissionLessExecutionThresholdSeconds,
			},
			OnRampParams: ccipConfig.OnRampParams{
				ID:              contractID,
				ContractsSemver: cfg.Version,
				Coin:            defaultCCIPContractCoin,
				ChainSelector:   cfg.ChainSelector,
				FeeAggregator:   tvm.ZeroAddress, // default to zero address
				Reserve:         defaultReserveAmount,
			},
			RouterParams: ccipConfig.RouterParams{
				ID:              contractID,
				ContractsSemver: cfg.Version,
				Coin:            defaultCCIPContractCoin,
			},
			ReceiverParams: ccipConfig.ReceiverParams{
				ID:              contractID,
				ContractsSemver: cfg.Version,
				Coin:            defaultCCIPContractCoin,
			},
		},
		ChainSelector: cfg.ChainSelector,
	}, nil
}
