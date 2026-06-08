package sequences

import (
	"fmt"
	"strings"

	"github.com/Masterminds/semver/v3"
	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	ccipdmcms "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
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
	qualifier, version, err := parseQualifierVersion(input.Qualifier)
	if err != nil {
		return cldfds.AddressRef{}, fmt.Errorf("failed to parse timelock qualifier %q: %w", input.Qualifier, err)
	}

	ref := getAddressRef(e.DataStore.Addresses(), cs, t, qualifier, version)
	if ref.Address == "" {
		return cldfds.AddressRef{}, fmt.Errorf("timelock contract not found for chain selector %d and qualifier %q", cs, input.Qualifier)
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

	qualifier, version, err := parseQualifierVersion(input.Qualifier)
	if err != nil {
		return cldfds.AddressRef{}, fmt.Errorf("failed to parse MCMS qualifier %q: %w", input.Qualifier, err)
	}

	ref := getAddressRef(e.DataStore.Addresses(), cs, t, qualifier, version)
	if ref.Address == "" {
		return cldfds.AddressRef{}, fmt.Errorf("MCMS contract not found for chain selector %d and qualifier %q", cs, input.Qualifier)
	}

	return ref, nil
}

func getAddressRef(input cldfds.AddressRefStore, cs uint64, t cldf.ContractType, qualifier string, version *semver.Version) cldfds.AddressRef {
	var filters = []cldfds.FilterFunc[cldfds.AddressRefKey, cldfds.AddressRef]{
		cldfds.AddressRefByChainSelector(cs),
		cldfds.AddressRefByType(cldfds.ContractType(t)),
	}
	if qualifier != "" {
		filters = append(filters, cldfds.AddressRefByQualifier(qualifier))
	}
	if version != nil {
		filters = append(filters, cldfds.AddressRefByVersion(version))
	}
	filtered := input.Filter(filters...)

	var latestRef cldfds.AddressRef
	for _, ref := range filtered {
		if ref.Version == nil {
			continue
		}

		if latestRef.Version == nil || ref.Version.GreaterThan(latestRef.Version) {
			latestRef = ref
		}
	}

	return latestRef
}

func parseQualifierVersion(qualifier string) (string, *semver.Version, error) {
	contractQualifier, contractVersion, hasVersion := strings.Cut(qualifier, "@")
	if !hasVersion {
		return qualifier, nil, nil
	}

	version, err := semver.NewVersion(contractVersion)
	if err != nil {
		return "", nil, fmt.Errorf("invalid version in qualifier %q: %w", qualifier, err)
	}

	return contractQualifier, version, nil
}
