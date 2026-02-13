package sequences

import (
	"fmt"

	mcms_ton "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	datastore_utils "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
	mcms_utils "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type MCMSReaderAdapter struct{}

// GetChainMetadata returns the chain metadata for a given MCMS input.
func (r *MCMSReaderAdapter) GetChainMetadata(e cldf.Environment, chainSelector uint64, input mcms_utils.Input) (types.ChainMetadata, error) {
	chain, ok := e.BlockChains.TonChains()[chainSelector]
	if !ok {
		return types.ChainMetadata{}, fmt.Errorf("chain with selector %d not found in environment", chainSelector)
	}

	mcmsAddr, err := r.GetMCMSRef(e, chainSelector, input)
	if err != nil {
		return types.ChainMetadata{}, fmt.Errorf("failed to get MCMS address for chain %d: %w", chainSelector, err)
	}

	inspector := mcms_ton.NewInspector(chain.Client)
	counts, err := inspector.GetOpCount(e.GetContext(), mcmsAddr.Address)
	if err != nil {
		return types.ChainMetadata{}, fmt.Errorf("failed to get opCount for MCMS at address %s on chain %d: %w", mcmsAddr.Address, chainSelector, err)
	}

	return types.ChainMetadata{
		StartingOpCount: counts,
		MCMAddress:      mcmsAddr.Address,
		// Notice: AdditionalFields not used for TON right now
	}, nil
}

// GetTimelockRef returns the timelock contract address reference for a given MCMS input.
func (r *MCMSReaderAdapter) GetTimelockRef(e cldf.Environment, chainSelector uint64, input mcms_utils.Input) (ds.AddressRef, error) {
	ref := datastore_utils.GetAddressRef(
		e.DataStore.Addresses().Filter(),
		chainSelector,
		cldf.ContractType(utils.RBACTimelock),
		&state.TimelockVersion,
		input.Qualifier,
	)
	if ref.Address == "" {
		return ds.AddressRef{}, fmt.Errorf("timelock contract not found for chain selector %d", chainSelector)
	}
	return ref, nil
}

// GetMCMSRef returns the MCMS contract address reference for a given MCMS input.
func (r *MCMSReaderAdapter) GetMCMSRef(e cldf.Environment, chainSelector uint64, input mcms_utils.Input) (ds.AddressRef, error) {
	// find mcms address
	// populate contract type from TimelockAction
	var addrType ds.ContractType
	switch input.TimelockAction {
	case types.TimelockActionSchedule:
		addrType = ds.ContractType(utils.ProposerManyChainMultisig)
	case types.TimelockActionBypass:
		addrType = ds.ContractType(utils.BypasserManyChainMultisig)
	case types.TimelockActionCancel:
		addrType = ds.ContractType(utils.CancellerManyChainMultisig)
	default:
		return ds.AddressRef{}, fmt.Errorf("unsupported timelock action type: %s", input.TimelockAction)
	}

	ref := datastore_utils.GetAddressRef(
		e.DataStore.Addresses().Filter(),
		chainSelector,
		cldf.ContractType(addrType),
		&state.MCMSVersion,
		input.Qualifier,
	)
	if ref.Address == "" {
		return ds.AddressRef{}, fmt.Errorf("MCMS contract not found for chain selector %d", chainSelector)
	}
	return ref, nil
}

var _ changesets.MCMSReader = &MCMSReaderAdapter{}
