package ops

import (
	"testing"

	"github.com/Masterminds/semver/v3"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
)

func DeployMCMSContractsConfig(t *testing.T, env cldf.Environment, chainSelector uint64, contractVersion string, idForContracts uint32) DeployMCMSContractsCfg {
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	// if contractVersion is not set, use local version
	if contractVersion == "" {
		contractVersion = sequence.ContractsLocalVersion
	}

	timelockContractSemver := semver.MustParse("0.0.3")
	mcmsContractSemver := semver.MustParse("0.0.4")
	return DeployMCMSContractsCfg{
		ChainSelector: chainSelector,
		ContractParams: config.ChainContractParams{
			Timelock: config.TimelockParams{
				ID:              idForContracts,
				Coin:            "0.5",
				ContractsSemver: timelockContractSemver,
				MinDelay:        0,
				Admin:           deployer.WalletAddress(),
				Proposers:       []*address.Address{deployer.WalletAddress()},
				Executors:       []*address.Address{deployer.WalletAddress()},
				Cancellers:      []*address.Address{deployer.WalletAddress()},
				Bypassers:       []*address.Address{deployer.WalletAddress()},
			},
			MCMS: config.MCMSParams{
				ID:              idForContracts,
				ContractsSemver: mcmsContractSemver,
				Coin:            "0.5",
			},
		},
		ContractsVersion: contractVersion,
	}
}
