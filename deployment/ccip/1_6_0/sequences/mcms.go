package sequences

import (
	"fmt"
	"math"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	mcmsSeq "github.com/smartcontractkit/chainlink-ton/deployment/mcms/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// defaultMCMSContractCoin is the default amount of TON coins to allocate for MCMS contract deployment.
// MCMS contracts require more storage and operational capacity, hence the higher allocation compared to CCIP contracts.
const defaultMCMSContractCoin = "1.5"

func (a *TonAdapter) DeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployMCMSContracts
}

var DeployMCMSContracts = operations.NewSequence(
	"deploy-mcms",
	semver.MustParse("0.0.4"), // TODO mcms and timelock has different versions, can we pick mcms version here?
	"Deploys all MCM contracts with config",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		tonChain := chains.TonChains()[input.ChainSelector]
		deps, err := extractTonDepsFromMCMSDeploymentInput(tonChain, input.ExistingAddresses)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		seqInput, err := intoDeployMCMSSeqInput(input, deps.TonChain.WalletAddress)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		mcmsSeqReport, err := operations.ExecuteSequence(b, mcmsSeq.DeployMCMSSequence, deps, seqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", input.ChainSelector, err)
		}

		return sequences.OnChainOutput{
			Addresses: mcmsSeqReport.Output.Addresses,
			BatchOps:  mcmsSeqReport.Output.BatchOps,
		}, nil
	},
)

func extractTonDepsFromMCMSDeploymentInput(chain ton.Chain, existing []datastore.AddressRef) (mcmsConfig.MCMSDeps, error) {
	noneAddr := address.NewAddressNone()
	init := state.MCMSChainState{
		Timelock: *noneAddr,
		MCMS:     *noneAddr,
	}

	// fill in existing addresses
	for _, e := range existing {
		tonAddr, err := address.ParseAddr(e.Address)
		if err != nil {
			return mcmsConfig.MCMSDeps{}, fmt.Errorf("failed to parse existing address %s: %w", e.Address, err)
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

	deps := mcmsConfig.MCMSDeps{
		TonChain: chain,
		MCMSChainState: map[uint64]state.MCMSChainState{
			chain.Selector: init,
		},
	}
	return deps, nil
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

	// Set contract versions to match expected MCMS deployment versions
	timelockSemver := semver.MustParse("0.0.3")
	mcmsSemver := semver.MustParse("0.0.4")

	return mcmsSeq.DeployMCMSSeqInput{
		ContractsVersionSha: cfg.ContractVersion,
		ContractsParams: mcmsConfig.ChainContractParams{
			Timelock: mcmsConfig.TimelockParams{
				ID:              contractID,
				Coin:            defaultMCMSContractCoin,
				MinDelay:        minDelay,
				Admin:           deployer,
				ContractsSemver: timelockSemver,
			},
			MCMS: mcmsConfig.MCMSParams{
				ID:              contractID,
				Coin:            defaultMCMSContractCoin,
				ContractsSemver: mcmsSemver,
			},
		},
		ChainSelector: cfg.ChainSelector,
	}, nil
}

func (a *TonAdapter) FinalizeDeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return operations.NewSequence(
		"finalize-deploy-mcms",
		semver.MustParse("1.0.0"),
		"On TON, finalizing MCM deployment is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}

func (a *TonAdapter) GrantAdminRoleToTimelock() *operations.Sequence[deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return operations.NewSequence(
		"grant-admin-role-of-timelock-to-timelock",
		semver.MustParse("1.0.0"),
		"On TON, GrantAdminRoleToTimelock is a no-op",
		func(b operations.Bundle, chains cldf_chain.BlockChains, in deploy.GrantAdminRoleToTimelockConfigPerChainWithSelector) (output sequences.OnChainOutput, err error) {
			return output, nil
		})
}
