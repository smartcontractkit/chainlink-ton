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

	},
)
