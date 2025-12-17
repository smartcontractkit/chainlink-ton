package sequences

import (
	"fmt"
	"math"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	mcmsSeq "github.com/smartcontractkit/chainlink-ton/deployment/mcms/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/xssnick/tonutils-go/address"
)

const defaultMCMSContractCoin = "1.5"

func (a *TonAdapter) DeployMCMS() *operations.Sequence[deploy.MCMSDeploymentConfigPerChainWithAddress, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return DeployMCMSContracts
}

var DeployMCMSContracts = operations.NewSequence(
	"deploy-mcms",
	semver.MustParse("0.0.4"), // TODO mcms and timelock has different versions, can we pick mcms version here?
	"Deploys all MCM contracts with config",
	func(b operations.Bundle, chains cldf_chain.BlockChains, input deploy.MCMSDeploymentConfigPerChainWithAddress) (output sequences.OnChainOutput, err error) {
		var txs [][]byte

		tonChain := chains.TonChains()[input.ChainSelector]
		deps, err := extractTonDepsFromMCMSDeploymentInput(tonChain)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		seqInput := intoDeployMCMSSeqInput(input, deps.TonChain.WalletAddress)
		mcmsSeqReport, err := operations.ExecuteSequence(b, mcmsSeq.DeployMCMSSequence, deps, seqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", input.ChainSelector, err)
		}

		txs = append(txs, mcmsSeqReport.Output.Transactions...)

		// Execute the txs || MCMS proposals
		err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, deps.TonChain.Client, deps.TonChain.Wallet, txs)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		return sequences.OnChainOutput{}, nil
	},
)

func extractTonDepsFromMCMSDeploymentInput(chain ton.Chain) (mcmsConfig.MCMSDeps, error) {
	deps := mcmsConfig.MCMSDeps{
		TonChain: chain,
		MCMSChainState: map[uint64]state.MCMSChainState{
			// initialize with zero addresses; actual addresses will be filled in after deployment
			chain.Selector: {
				Timelock: *tvm.ZeroAddress,
				MCMS:     *tvm.ZeroAddress,
			},
		},
	}
	return deps, nil
}

func intoDeployMCMSSeqInput(cfg deploy.MCMSDeploymentConfigPerChainWithAddress, deployer *address.Address) mcmsSeq.DeployMCMSSeqInput {
	// The external config uses mcmstypes.Config which has signers, but assumes all evm address for, but
	// we need ton addresses. For now, use deployer as the default for all roles
	proposers := []*address.Address{deployer}
	executors := []*address.Address{deployer}
	cancellers := []*address.Address{deployer}
	bypassers := []*address.Address{deployer}

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
		ContractsVersionSha: sequence.ContractsLocalVersion,
		ContractsParams: mcmsConfig.ChainContractParams{
			Timelock: mcmsConfig.TimelockParams{
				Coin:       defaultMCMSContractCoin,
				MinDelay:   minDelay,
				Admin:      deployer,
				Proposers:  proposers,
				Executors:  executors,
				Cancellers: cancellers,
				Bypassers:  bypassers,
			},
			MCMS: mcmsConfig.MCMSParams{
				Coin: defaultMCMSContractCoin,
			},
		},
		ChainSelector: cfg.ChainSelector,
	}
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
