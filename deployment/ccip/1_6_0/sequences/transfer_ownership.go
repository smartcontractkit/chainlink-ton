package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/mcms/types"

	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipds "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

// TonTransferOwnershipAdapter implements the deploy.TransferOwnershipAdapter interface for TON chains.
type TonTransferOwnershipAdapter struct {
	timelockAddrs map[uint64]*address.Address
}

var _ deploy.TransferOwnershipAdapter = &TonTransferOwnershipAdapter{}

// InitializeTimelockAddress reads the timelock address for each TON chain from the datastore and stores it in the adapter for later use.
func (a *TonTransferOwnershipAdapter) InitializeTimelockAddress(e cldf.Environment, input mcms.Input) error {
	tonChains := e.BlockChains.TonChains()
	timelockAddrs := make(map[uint64]*address.Address)
	for sel := range tonChains {
		reader := &MCMSReaderAdapter{}
		timelockRef, err := reader.GetTimelockRef(e, sel, input)
		if err != nil {
			return fmt.Errorf("failed to get timelock ref for chain %d: %w", sel, err)
		}
		addr, err := ccipds.FindAndFormatRef(e.DataStore, timelockRef, sel, utils.ToTONAddress)
		if err != nil {
			return fmt.Errorf("failed to find timelock address for chain %d: %w", sel, err)
		}
		timelockAddrs[sel] = addr
	}

	a.timelockAddrs = timelockAddrs
	return nil
}

func (a *TonTransferOwnershipAdapter) SequenceTransferOwnershipViaMCMS() *cldfops.Sequence[deploy.TransferOwnershipPerChainInput, sequences.OnChainOutput, cldfchain.BlockChains] {
	return cldfops.NewSequence(
		"ton/sequences/ccip/tooling-api/transfer-ownership-via-mcms",
		semver.MustParse("0.1.0"),
		"Transfers ownership of TON contracts via MCMS",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in deploy.TransferOwnershipPerChainInput) (output sequences.OnChainOutput, err error) {
			chain, ok := chains.TonChains()[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found in environment", in.ChainSelector)
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			proposedOwner, err := a.getProposedOwner(in)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get proposed owner: %w", err)
			}

			_inputMCMS := opsmcms.NewSendOrPlanInput(types.ChainSelector(in.ChainSelector))

			deployerAddr := chain.Wallet.WalletAddress()
			currentOwner, err := a.getCurrentOwner(in, deployerAddr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get current owner: %w", err)
			}

			for _, contractRef := range in.ContractRef {
				if _, exist := a.timelockAddrs[in.ChainSelector]; !exist && !proposedOwner.Equals(deployerAddr) {
					return sequences.OnChainOutput{}, fmt.Errorf("timelock address not initialized for chain %d, cannot plan transfer ownership to non-deployer", in.ChainSelector)
				}

				contractType := bindings.PkgLib + ".access.Ownable"
				//nolint:govet // allow shadowing
				contractAddr, err := address.ParseAddr(contractRef.Address)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse contract address %s: %w", contractRef.Address, err)
				}

				// Read the actual on-chain owner
				onChainOwner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, contractAddr, ownable2step.GetOwner)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get owner of %s: %w", contractRef.Address, err)
				}

				if !currentOwner.Equals(onChainOwner) {
					return sequences.OnChainOutput{}, fmt.Errorf("current owner mismatch for %s: expected %s, got %s", contractRef.Address, currentOwner.String(), onChainOwner.String())
				}

				queryID, errQ := tvm.RandomQueryID()
				if errQ != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to generate query ID: %w", errQ)
				}

				body := ownable2step.TransferOwnership{
					QueryID:  queryID,
					NewOwner: proposedOwner,
				}

				r, err := cldfops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: contractAddr,
							Amount:  tlb.MustFromTON("0.1"),
							Body:    codec.MustWrapMessage[any](contractType, body),
						},
					},
					Plan: true,
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to build transfer ownership message for %s: %w", contractRef.Address, err)
				}

				// Send directly if deployer is the current owner, otherwise plan through MCMS
				plan := !deployerAddr.Equals(currentOwner)
				_inputMCMS.Add(opston.AsCells(r.Output.Plans), plan, []types.OperationMetadata{
					{
						ContractType: contractType,
						Tags:         []string{},
					},
				})
			}

			r, err := cldfops.ExecuteOperation(b, opsmcms.SendOrPlan, dp, _inputMCMS)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan transfer ownership messages: %w", err)
			}

			return r.Output, nil
		},
	)
}

func (a *TonTransferOwnershipAdapter) SequenceAcceptOwnership() *cldfops.Sequence[deploy.TransferOwnershipPerChainInput, sequences.OnChainOutput, cldfchain.BlockChains] {
	return cldfops.NewSequence(
		"ton/sequences/ccip/tooling-api/accept-ownership",
		semver.MustParse("0.1.0"),
		"Accepts ownership of TON contracts",
		func(b cldfops.Bundle, chains cldfchain.BlockChains, in deploy.TransferOwnershipPerChainInput) (output sequences.OnChainOutput, err error) {
			chain, ok := chains.TonChains()[in.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("TON chain with selector %d not found in environment", in.ChainSelector)
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			proposedOwner, err := a.getProposedOwner(in)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get proposed owner: %w", err)
			}

			sender := chain.Wallet.WalletAddress()
			_inputMCMS := opsmcms.NewSendOrPlanInput(types.ChainSelector(in.ChainSelector))

			for _, contractRef := range in.ContractRef {
				//nolint:govet // allow shadowing
				contractAddr, err := address.ParseAddr(contractRef.Address)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse contract address %s: %w", contractRef.Address, err)
				}

				contractType := bindings.PkgLib + ".access.Ownable"
				queryID, errQ := tvm.RandomQueryID()
				if errQ != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to generate query ID: %w", errQ)
				}

				body := ownable2step.AcceptOwnership{
					QueryID: queryID,
				}

				r, err := cldfops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: contractAddr,
							Amount:  tlb.MustFromTON("0.1"),
							Body:    codec.MustWrapMessage[any](contractType, body),
						},
					},
					Plan: true,
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to build accept ownership message for %s: %w", contractRef.Address, err)
				}

				// AcceptOwnership must be called by the proposed owner.
				// Plan through MCMS if the proposed owner is not the deployer (i.e., timelock needs to accept).
				plan := !sender.Equals(proposedOwner)
				_inputMCMS.Add(opston.AsCells(r.Output.Plans), plan, []types.OperationMetadata{
					{
						ContractType: contractType,
						Tags:         []string{},
					},
				})
			}

			r, err := cldfops.ExecuteOperation(b, opsmcms.SendOrPlan, dp, _inputMCMS)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan accept ownership messages: %w", err)
			}

			return r.Output, nil
		},
	)
}

// ShouldAcceptOwnershipWithTransferOwnership determines whether to accept ownership in the same changeset as transfer ownership.
// Returns true when the proposed owner is the timelock (deployer transfers then timelock accepts in one changeset).
// Returns false when the proposed owner is the deployer (timelock transfers via deferred execution, can't accept in same changeset).
// Returns false when the proposed owner is unknown
func (a *TonTransferOwnershipAdapter) ShouldAcceptOwnershipWithTransferOwnership(_ cldf.Environment, in deploy.TransferOwnershipPerChainInput) (bool, error) {
	proposedOwner, err := a.getProposedOwner(in)
	if err != nil {
		return false, fmt.Errorf("failed to get proposed owner: %w", err)
	}

	timelockAddr, ok := a.timelockAddrs[in.ChainSelector]
	if ok && proposedOwner.Equals(timelockAddr) {
		return true, nil // proposed owner is timelock, can accept in same changeset - will plan a proposal
	}

	return false, nil
}

// Default proposed owner to timelock address if not provided
func (a *TonTransferOwnershipAdapter) getProposedOwner(in deploy.TransferOwnershipPerChainInput) (*address.Address, error) {
	if in.ProposedOwner != "" {
		proposedOwner, err := address.ParseAddr(in.ProposedOwner)
		if err != nil {
			return nil, fmt.Errorf("failed to parse proposed owner address: %w", err)
		}

		return proposedOwner, nil
	}

	timelockAddr, ok := a.timelockAddrs[in.ChainSelector]
	if !ok {
		return nil, fmt.Errorf("timelock address not initialized for chain %d", in.ChainSelector)
	}

	return timelockAddr, nil
}

func (a *TonTransferOwnershipAdapter) getCurrentOwner(in deploy.TransferOwnershipPerChainInput, defaultAddr *address.Address) (*address.Address, error) {
	// Default current owner to deployer address if not provided
	// Notice: common case where deployer is transferring to timelock
	if in.CurrentOwner != "" {
		currentOwner, err := address.ParseAddr(in.CurrentOwner)
		if err != nil {
			return nil, fmt.Errorf("failed to parse current owner address: %w", err)
		}

		return currentOwner, nil
	}

	return defaultAddr, nil
}
