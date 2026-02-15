package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"

	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdseq "github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (a *TonDeployAdapter) DeployMCMS() *cldfops.Sequence[ccipddeploy.MCMSDeploymentConfigPerChainWithAddress, ccipdseq.OnChainOutput, cldfchain.BlockChains] {
	return DeployMCMSContracts
}

var DeployMCMSContracts = cldfops.NewSequence(
	"ton/sequences/ccip/tooling-api/deploy-mcms",
	semver.MustParse("0.0.4"), // TODO mcms and timelock has different versions, can we pick mcms version here?
	"Deploys all MCM contracts with config",
	func(b cldfops.Bundle, chains cldfchain.BlockChains, input ccipddeploy.MCMSDeploymentConfigPerChainWithAddress) (output ccipdseq.OnChainOutput, err error) {
		chain := chains.TonChains()[input.ChainSelector]

		defaultQualifier := ccipdutils.CLLQualifier
		if input.Qualifier == nil {
			input.Qualifier = &defaultQualifier
		}

		stateMCMS, err := extractMCMSChainStateFromMCMSDeploymentInput(chain, input.ExistingAddresses, *input.Qualifier)
		if err != nil {
			return ccipdseq.OnChainOutput{}, err
		}

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateMCMS[input.ChainSelector]),
		)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		// Generate a random contract ID used for contracts in this deployment
		contractID, err := tvm.RandomQueryID()
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to generate random contract ID: %w", err)
		}

		b.Logger.Info("in.TimelockAdmin - skipping param (EVM specific type - 20 bytes, not compatible with TON address format)")
		b.Logger.Infof("in.TimelockAdmin - using deployer address %s as initial admin", chain.WalletAddress)

		r, err := cldfops.ExecuteSequence(b, opsmcms.DeployMCMSSequence, dp, opsmcms.DeployMCMSSeqInput{
			Config:                  input.MCMSDeploymentConfigPerChain,
			ContractID:              uint32(contractID),
			ContractsSemverMCMS:     &state.MCMSVersion,
			ContractsSemverTimelock: &state.TimelockVersion,
		})
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", input.ChainSelector, err)
		}

		return r.Output, nil
	},
)

// TODO: unify and deduplicate with state.LoadMCMSOnChainState
func extractMCMSChainStateFromMCMSDeploymentInput(chain cldfton.Chain, existing []cldfds.AddressRef, qualifier string) (map[uint64]state.MCMSChainState, error) {
	none := address.NewAddressNone()
	s := state.MCMSChainState{
		ByQualifier: map[string]*state.MCMSSuiteState{
			qualifier: {
				Proposer:  none,
				Bypasser:  none,
				Canceller: none,
				Timelock:  none,
			},
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
		case cldfds.ContractType(ccipdutils.RBACTimelock):
			s.ByQualifier[qualifier].Timelock = tonAddr
		case cldfds.ContractType(ccipdutils.ProposerManyChainMultisig):
			s.ByQualifier[qualifier].Proposer = tonAddr
		case cldfds.ContractType(ccipdutils.BypasserManyChainMultisig):
			s.ByQualifier[qualifier].Bypasser = tonAddr
		case cldfds.ContractType(ccipdutils.CancellerManyChainMultisig):
			s.ByQualifier[qualifier].Canceller = tonAddr
		default:
			// ignore unknown types
		}
	}

	return map[uint64]state.MCMSChainState{chain.Selector: s}, nil
}

func (a *TonDeployAdapter) FinalizeDeployMCMS() *cldfops.Sequence[ccipddeploy.MCMSDeploymentConfigPerChainWithAddress, ccipdseq.OnChainOutput, cldfchain.BlockChains] {
	return cldfops.NewSequence(
		"ton/sequences/ccip/tooling-api/finalize-deploy-mcms",
		semver.MustParse("1.0.0"),
		"On TON, finalizing MCM deployment is a no-op",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in ccipddeploy.MCMSDeploymentConfigPerChainWithAddress) (output ccipdseq.OnChainOutput, err error) {
			return output, nil
		})
}

func (a *TonDeployAdapter) GrantAdminRoleToTimelock() *cldfops.Sequence[ccipddeploy.GrantAdminRoleToTimelockConfigPerChainWithSelector, ccipdseq.OnChainOutput, cldfchain.BlockChains] {
	return cldfops.NewSequence(
		"ton/sequences/ccip/tooling-api/grant-admin-role-to-timelock",
		semver.MustParse("1.0.0"),
		"On TON, GrantAdminRoleToTimelock is a no-op",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in ccipddeploy.GrantAdminRoleToTimelockConfigPerChainWithSelector) (output ccipdseq.OnChainOutput, err error) {
			// TODO:
			//  - grant role to timelock
			//  - renounce role from deployer key

			return output, nil
		})
}
