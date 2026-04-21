package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	seq "github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// defaultCCIPContractCoin is the default amount of TON coins to allocate for each CCIP contract deployment.
// This value is chosen to cover contract initialization and storage costs on TON blockchain.
const defaultCCIPContractCoin = "0.05"

// defaultReserveAmount is the default reserve amount allocated to the OnRamp contract.
// This reserve ensures the contract has sufficient balance for operational transactions.
const defaultReserveAmount = "0.5"

// TonDeployAdapter implements the deploy.Deployer interface for TON chains.
type TonDeployAdapter struct{}

var _ deploy.Deployer = &TonDeployAdapter{}

func (a *TonDeployAdapter) DeployChainContracts() *cldf_ops.Sequence[deploy.ContractDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployChainContracts
}

var DeployChainContracts = cldf_ops.NewSequence(
	"ton/sequences/ccip/tooling-api/deploy-chain-contracts",
	semver.MustParse("1.6.0"),
	"Deploys all required contracts for CCIP 1.6.0 to a TON chain",
	func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input deploy.ContractDeploymentConfigPerChainWithAddress) (sequences.OnChainOutput, error) {
		chain := chains.TonChains()[input.ChainSelector]

		stateCCIP, err := extractCCIPChainStateFromContractDeploymentInput(input.ExistingAddresses)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateCCIP),
		)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		seqInput, err := intoDeployCCIPSeqInput(input, chain.Wallet.Address())
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		ccipSeqReport, err := cldf_ops.ExecuteSequence(b, seq.DeployCCIPSequence, dp, seqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy CCIP for TON chain %d: %w", input.ChainSelector, err)
		}

		out := sequences.OnChainOutput{
			Addresses: ccipSeqReport.Output.Addresses,
			BatchOps:  ccipSeqReport.Output.BatchOps,
		}

		stateCCIP, err = updateCCIPChainStateWithDeployedAddresses(input.ChainSelector, stateCCIP, ccipSeqReport.Output.Addresses)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update TON deps with deployed addresses: %w", err)
		}
		dp, err = dp.With(dep.Provide(stateCCIP))
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update dependency provider: %w", err)
		}

		// TODO should we include these updates operations in this DeployCCIPSequence ? Probably move to a custom operation and call in CLD ?
		msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

		// feequoter.addPriceUpdater(offramp)
		{
			addr := stateCCIP.FeeQuoter
			body := feequoter.AddPriceUpdater{
				PriceUpdater: &stateCCIP.OffRamp,
			}

			//nolint:govet // allow shadowing
			r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: &addr,
						Amount:  tlb.MustFromTON("0.1"), // TODO (ops/gas): static, should allow overrides?
						Body:    codec.MustWrapMessage[any](bindings.PkgCCIP+".FeeQuoter", body),
					},
				},
				Plan: true,
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
			}

			msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
		}

		// feeQuoter.updateFeeTokens
		{
			_input := operation.UpdateFeeQuoterFeeTokensInput{
				FeeTokens: map[string]operation.FeeTokenConfig{
					tvm.TonTokenAddr.String(): {
						PremiumMultiplierWeiPerEth: 1,
					},
					tvm.LinkTokenAddr.String(): {
						PremiumMultiplierWeiPerEth: 1,
					},
				},
			}
			//nolint:govet // allow shadowing
			r, err := cldf_ops.ExecuteOperation(b, operation.UpdateFeeQuoterFeeTokensOp, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update fee quoter fee tokens: %w", err)
			}

			msgs = append(msgs, r.Output...)
		}

		_, err = cldf_ops.ExecuteOperation(b, opston.SendMessagesRaw, dp, opston.SendMessagesRawInput{Messages: msgs})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return out, nil
	},
)

func updateCCIPChainStateWithDeployedAddresses(selector uint64, existingAddr state.CCIPChainState, deployed []datastore.AddressRef) (state.CCIPChainState, error) {
	for _, r := range deployed {
		tonAddr, err := address.ParseAddr(r.Address)
		if err != nil {
			return state.CCIPChainState{}, err
		}
		if r.ChainSelector != selector {
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

	return existingAddr, nil
}

func extractCCIPChainStateFromContractDeploymentInput(existing []datastore.AddressRef) (state.CCIPChainState, error) {
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
			return state.CCIPChainState{}, fmt.Errorf("failed to parse existing address %s: %w", e.Address, err)
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

	return init, nil
}

func intoDeployCCIPSeqInput(cfg deploy.ContractDeploymentConfigPerChainWithAddress, deployer *address.Address) (seq.DeployCCIPSeqInput, error) {
	// generate a random contract ID for all contracts in this deployment
	contractID, err := tonops.RandomUint32()
	if err != nil {
		return seq.DeployCCIPSeqInput{}, fmt.Errorf("failed to generate random contract ID: %w", err)
	}
	return seq.DeployCCIPSeqInput{
		ContractsPackageRef: cfg.ContractVersion,
		CCIPConfig: ccipConfig.ChainContractParams{
			FeeQuoterParams: ccipConfig.FeeQuoterParams{
				ID:                           contractID,
				ContractsSemver:              cfg.Version,
				Coin:                         defaultCCIPContractCoin,
				MaxFeeJuelsPerMsg:            cfg.MaxFeeJuelsPerMsg,
				TokenPriceStalenessThreshold: cfg.TokenPriceStalenessThreshold,
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
				FeeAggregator:   deployer, // defaults to deployer, can be updated later via SetDynamicConfig
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
