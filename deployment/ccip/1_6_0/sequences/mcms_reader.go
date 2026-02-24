package sequences

import (
	"fmt"

	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	ccipdds "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
	ccipdmcms "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

var _ ccipdcs.MCMSReader = &MCMSReaderAdapter{}

type MCMSReaderAdapter struct{}

// GetChainMetadata returns the chain metadata for a given MCMS input.
func (r *MCMSReaderAdapter) GetChainMetadata(e cldf.Environment, cs uint64, input ccipdmcms.Input) (types.ChainMetadata, error) {
	chain, ok := e.BlockChains.TonChains()[cs]
	if !ok {
		return types.ChainMetadata{}, fmt.Errorf("chain with selector %d not found in environment", cs)
	}

	mcmsAddr, err := r.GetMCMSRef(e, cs, input)
	if err != nil {
		return types.ChainMetadata{}, fmt.Errorf("failed to get MCMS address for chain %d: %w", cs, err)
	}

	inspector := mcmston.NewInspector(chain.Client)
	counts, err := inspector.GetOpCount(e.GetContext(), mcmsAddr.Address)
	if err != nil {
		return types.ChainMetadata{}, fmt.Errorf("failed to get opCount for MCMS at address %s on chain %d: %w", mcmsAddr.Address, cs, err)
	}

	return types.ChainMetadata{
		StartingOpCount: counts,
		MCMAddress:      mcmsAddr.Address,
		// Notice: AdditionalFields not used for TON right now
	}, nil
}

// GetTimelockRef returns the timelock contract address reference for a given MCMS input.
func (r *MCMSReaderAdapter) GetTimelockRef(e cldf.Environment, cs uint64, input ccipdmcms.Input) (cldfds.AddressRef, error) {
	t := ccipdutils.RBACTimelock
	version := state.TimelockVersion
	ref := ccipdds.GetAddressRef(e.DataStore.Addresses().Filter(), cs, t, &version, input.Qualifier)
	if ref.Address == "" {
		return cldfds.AddressRef{}, fmt.Errorf("timelock contract not found for chain selector %d", cs)
	}

	return ref, nil
}

// GetMCMSRef returns the MCMS contract address reference for a given MCMS input.
func (r *MCMSReaderAdapter) GetMCMSRef(e cldf.Environment, cs uint64, input ccipdmcms.Input) (cldfds.AddressRef, error) {
	// find mcms address
	// populate contract type from TimelockAction
	var t cldf.ContractType
	switch input.TimelockAction {
	case types.TimelockActionSchedule:
		t = ccipdutils.ProposerManyChainMultisig
	case types.TimelockActionBypass:
		t = ccipdutils.BypasserManyChainMultisig
	case types.TimelockActionCancel:
		t = ccipdutils.CancellerManyChainMultisig
	default:
		return cldfds.AddressRef{}, fmt.Errorf("unsupported timelock action type: %s", input.TimelockAction)
	}

	version := state.MCMSVersion
	ref := ccipdds.GetAddressRef(e.DataStore.Addresses().Filter(), cs, t, &version, input.Qualifier)
	if ref.Address == "" {
		return cldfds.AddressRef{}, fmt.Errorf("MCMS contract not found for chain selector %d", cs)
	}

	return ref, nil
}
