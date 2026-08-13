package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdseq "github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	timelockbind "github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
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
			Config:     input.MCMSDeploymentConfigPerChain,
			ContractID: uint32(contractID),
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
		semver.MustParse("1.2.0"),
		"Grants the ADMIN_ROLE on the source timelock to the new timelock and renounces it from the deployer key",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in ccipddeploy.GrantAdminRoleToTimelockConfigPerChainWithSelector) (output ccipdseq.OnChainOutput, err error) {
			chain, ok := chains.TonChains()[in.ChainSelector]
			if !ok {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found in environment", in.ChainSelector)
			}

			// The refs are already resolved to full refs (with .Address) by the apply step.
			timelockToTransferAddr, err := utils.ToTONAddress(in.TimelockToTransferRef)
			if err != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to resolve timelock-to-transfer address: %w", err)
			}
			newAdminTimelockAddr, err := utils.ToTONAddress(in.NewAdminTimelockRef)
			if err != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to resolve new-admin timelock address: %w", err)
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
			)
			if err != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			ctx := b.GetContext()
			deployerAddr := chain.Wallet.WalletAddress()

			// The deployer holds the ADMIN_ROLE on the timelock-to-transfer as it was set as
			// the initial admin during init. If the new timelock is already the admin, we only
			// need the deployer to renounce their admin role.

			// Step 1: send the grant message FIRST (directly, no MCMS batching) and wait for
			// its trace to confirm it landed before proceeding.
			hasRole, err := tvm.CallGetterLatest(ctx, chain.Client, timelockToTransferAddr, rbac.GetHasRole, rbac.HasRoleArgs{
				Role:    timelockbind.RoleAdmin,
				Account: newAdminTimelockAddr,
			})
			if err != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to check if new timelock %s has admin role on %s: %w", newAdminTimelockAddr.String(), timelockToTransferAddr.String(), err)
			}

			if !hasRole {
				queryID, errQ := tvm.RandomQueryID()
				if errQ != nil {
					return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to generate grant query ID: %w", errQ)
				}

				grantBody := rbac.GrantRole{
					QueryID: queryID,
					Role:    tlbe.NewUint256(timelockbind.RoleAdmin),
					Account: newAdminTimelockAddr,
				}

				// Direct send (Plan=false). SendMessagesRaw performs a balance pre-check and
				// waits for the full transaction trace, failing if the grant reverts (non-zero exit code).
				if _, err := cldfops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: timelockToTransferAddr,
							Amount:  tlb.MustFromTON("0.1"),
							Body:    codec.MustWrapMessage[any](bindings.TypeRBAC, grantBody),
						},
					},
					Plan: false,
				}); err != nil {
					// Abort BEFORE renouncing: the new timelock does not have admin, so the
					// deployer must keep ADMIN_ROLE. A rerun of this sequence will recover the grant.
					return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to send grant admin role message (deployer keeps ADMIN_ROLE): %w", err)
				}

				// Step 2: verify the grant actually landed before proceeding to renounce.
				hasRole, err = tvm.CallGetterLatest(ctx, chain.Client, timelockToTransferAddr, rbac.GetHasRole, rbac.HasRoleArgs{
					Role:    timelockbind.RoleAdmin,
					Account: newAdminTimelockAddr,
				})
				if err != nil {
					return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to verify grant admin role on %s: %w", timelockToTransferAddr.String(), err)
				}
				if !hasRole {
					// Safety invariant: never renounce the deployer's ADMIN_ROLE unless the new
					// timelock provably holds it. Abort to avoid a timelock with NO admin.
					return ccipdseq.OnChainOutput{}, fmt.Errorf("new timelock %s does not have ADMIN_ROLE on %s after grant; NOT renouncing deployer to preserve an admin", newAdminTimelockAddr.String(), timelockToTransferAddr.String())
				}
			}

			// Step 3: only now renounce the deployer's ADMIN_ROLE (direct send, requires the
			// deployer to still hold it. CallerConfirmation==sender is the deployer).
			queryID, errQ := tvm.RandomQueryID()
			if errQ != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to generate renounce query ID: %w", errQ)
			}

			renounceBody := rbac.RenounceRole{
				QueryID: queryID,
				Role:    tlbe.NewUint256(timelockbind.RoleAdmin),
				// renounceRole requires callerConfirmation == sender. The deployer is the sender.
				CallerConfirmation: deployerAddr,
			}

			if _, err := cldfops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: timelockToTransferAddr,
						Amount:  tlb.MustFromTON("0.1"),
						Body:    codec.MustWrapMessage[any](bindings.TypeRBAC, renounceBody),
					},
				},
				Plan: false,
			}); err != nil {
				return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to send renounce admin role message: %w", err)
			}

			// Both sends are direct; no batch operations or new addresses are produced.
			return ccipdseq.OnChainOutput{}, nil
		})
}

func (a *TonDeployAdapter) UpdateMCMSConfig() *cldfops.Sequence[ccipddeploy.UpdateMCMSConfigInputPerChainWithSelector, ccipdseq.OnChainOutput, cldfchain.BlockChains] {
	return cldfops.NewSequence(
		"ton/sequences/ccip/tooling-api/update-mcms-config",
		semver.MustParse("1.0.0"),
		"On TON, updating MCM config is a no-op",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in ccipddeploy.UpdateMCMSConfigInputPerChainWithSelector) (output ccipdseq.OnChainOutput, err error) {
			// TODO: update config on chain by calling appropriate entry points on the contracts

			return output, nil
		})
}
