package sequences

import (
	"fmt"
	"math"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	mcmsSeq "github.com/smartcontractkit/chainlink-ton/deployment/mcms/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// defaultMCMSContractCoin is the default amount of TON coins to allocate for MCMS contract deployment.
// MCMS contracts require more storage and operational capacity, hence the higher allocation compared to CCIP contracts.
const defaultMCMSContractCoin = "1.5"

func (a *TonDeployAdapter) DeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployMCMSContracts
}

var DeployMCMSContracts = operations.NewSequence(
	"ton/sequences/ccip/deploy-mcms-suite",
	semver.MustParse("0.0.4"), // TODO mcms and timelock has different versions, can we pick mcms version here?
	"Deploys all MCM contracts with config",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		chain := chains.TonChains()[input.ChainSelector]
		stateMCMS, err := extractMCMSChainStateFromMCMSDeploymentInput(chain, input.ExistingAddresses)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateMCMS[input.ChainSelector]),
		)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		_input, err := intoDeployMCMSSeqInput(input, chain.WalletAddress)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		r, err := operations.ExecuteSequence(b, mcmsSeq.DeployMCMSSequence, dp, _input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", input.ChainSelector, err)
		}

		return sequences.OnChainOutput{
			Addresses: r.Output.Addresses,
			BatchOps:  r.Output.BatchOps,
		}, nil
	},
)

func extractMCMSChainStateFromMCMSDeploymentInput(chain ton.Chain, existing []datastore.AddressRef) (map[uint64]state.MCMSChainState, error) {
	noneAddr := address.NewAddressNone()
	init := state.MCMSChainState{
		Timelock: *noneAddr,
		MCMS:     *noneAddr,
	}

	// fill in existing addresses
	for _, e := range existing {
		tonAddr, err := address.ParseAddr(e.Address)
		if err != nil {
			return nil, fmt.Errorf("failed to parse existing address %s: %w", e.Address, err)
		}
		switch e.Type {
		case state.Timelock:
			init.Timelock = *tonAddr
		case state.MCMS:
			init.MCMS = *tonAddr
		default:
			// ignore unknown types
		}
	}

	state := map[uint64]state.MCMSChainState{
		chain.Selector: init,
	}
	return state, nil
}

func intoDeployMCMSSeqInput(cfg deploy.MCMSDeploymentConfigPerChainWithAddress, deployer *address.Address) (mcmsSeq.DeployMCMSSeqInput, error) {
	// Generate a random contract ID for all contracts in this deployment
	contractID, err := tonops.RandomUint32()
	if err != nil {
		return mcmsSeq.DeployMCMSSeqInput{}, fmt.Errorf("failed to generate random contract ID: %w", err)
	}

	// MinDelay from cfg.TimelockMinDelay (big.Int) to uint32 safely
	var minDelay uint32
	if cfg.TimelockMinDelay != nil && cfg.TimelockMinDelay.IsUint64() {
		val := cfg.TimelockMinDelay.Uint64()
		if val <= math.MaxUint32 {
			minDelay = uint32(val)
		} else {
			// overflow, set to max
			minDelay = math.MaxUint32
		}
	}

	return mcmsSeq.DeployMCMSSeqInput{
		ContractsVersionSha: cfg.ContractVersion,
		ContractsParams: mcmsConfig.ChainContractParams{
			Timelock: mcmsConfig.TimelockParams{
				ID:              contractID,
				Coin:            defaultMCMSContractCoin,
				ContractsSemver: &state.TimelockVersion,
				InitMessage: timelock.Init{
					MinDelay: minDelay,
					Admin:    deployer,
				},
			},
			MCMS: mcmsConfig.MCMSParams{
				ID:              contractID,
				Coin:            defaultMCMSContractCoin,
				ContractsSemver: &state.MCMSVersion,
			},
		},
		ChainSelector: cfg.ChainSelector,
	}, nil
}

func (a *TonDeployAdapter) FinalizeDeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return operations.NewSequence(
		"ton/sequences/ccip/deploy-mcms-suite-finalize",
		semver.MustParse("1.0.0"),
		"On TON, finalizing MCM deployment is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}

func (a *TonDeployAdapter) GrantAdminRoleToTimelock() *operations.Sequence[deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return operations.NewSequence(
		"ton/sequences/ccip/grant-admin-role-to-timelock",
		semver.MustParse("1.0.0"),
		"On TON, GrantAdminRoleToTimelock is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}
