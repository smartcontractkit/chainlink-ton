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
	cciputils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
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
	"ton/sequences/ccip/tooling-api/deploy-mcms",
	semver.MustParse("0.0.4"), // TODO mcms and timelock has different versions, can we pick mcms version here?
	"Deploys all MCM contracts with config",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		chain := chains.TonChains()[input.ChainSelector]

		qualifier := cciputils.CLLQualifier // default
		if input.Qualifier != nil {
			qualifier = *input.Qualifier
		}

		stateMCMS, err := extractMCMSChainStateFromMCMSDeploymentInput(chain, input.ExistingAddresses, qualifier)
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

		// Attach the qualifier to the output (to be stored in DS)
		for i := range r.Output.Addresses {
			r.Output.Addresses[i].Qualifier = qualifier
		}

		return sequences.OnChainOutput{
			Addresses: r.Output.Addresses,
			BatchOps:  r.Output.BatchOps,
		}, nil
	},
)

// TODO: unify and deduplicate with state.LoadMCMSOnChainState
func extractMCMSChainStateFromMCMSDeploymentInput(chain ton.Chain, existing []datastore.AddressRef, qualifier string) (map[uint64]state.MCMSChainState, error) {
	noneAddr := address.NewAddressNone()
	s := state.MCMSChainState{
		ByQualifier: map[string]*state.MCMSSuiteState{
			qualifier: {Timelock: noneAddr, MCMS: noneAddr},
		},
	}

	// fill in existing addresses
	for _, e := range existing {
		tonAddr, err := address.ParseAddr(e.Address)
		if err != nil {
			return nil, fmt.Errorf("failed to parse existing address %s: %w", e.Address, err)
		}

		if e.Qualifier != qualifier {
			continue // skip addresses that don't match the qualifier for this deployment
		}

		switch e.Type {
		case state.Timelock:
			s.ByQualifier[qualifier].Timelock = tonAddr
		case state.MCMS:
			s.ByQualifier[qualifier].MCMS = tonAddr
		default:
			// ignore unknown types
		}
	}

	return map[uint64]state.MCMSChainState{chain.Selector: s}, nil
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
		"ton/sequences/ccip/tooling-api/finalize-deploy-mcms",
		semver.MustParse("1.0.0"),
		"On TON, finalizing MCM deployment is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}

func (a *TonDeployAdapter) GrantAdminRoleToTimelock() *operations.Sequence[deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return operations.NewSequence(
		"ton/sequences/ccip/tooling-api/grant-admin-role-to-timelock",
		semver.MustParse("1.0.0"),
		"On TON, GrantAdminRoleToTimelock is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}
