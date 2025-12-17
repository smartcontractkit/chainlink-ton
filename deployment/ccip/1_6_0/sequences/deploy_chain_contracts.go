package sequences

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

func (a *TonAdapter) DeployChainContracts() *operations.Sequence[deploy.ContractDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployChainContracts
}

var DeployChainContracts = operations.NewSequence(
	"deploy-chain-contracts",
	semver.MustParse("1.6.0"),
	"Deploys all required contracts for CCIP 1.6.0 to a TON chain",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.ContractDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		return output, nil
	},
)

func (a *TonAdapter) DeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployMCMSContracts
}

var DeployMCMSContracts = operations.NewSequence(
	"deploy-mcms",
	semver.MustParse("0.0.4"),
	"Deploys all MCM contracts with config",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		return output, nil
	},
)

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
	// Not implemented for Solana
	return nil
}
