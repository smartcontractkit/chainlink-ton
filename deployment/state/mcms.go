package state

import (
	"github.com/Masterminds/semver/v3"
	"github.com/rs/zerolog/log"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

var (
	Timelock ds.ContractType = "RBACTimelock"
	MCMS     ds.ContractType = "MCMS"
)

// MCMSChainState holds a Go binding for all the currently deployed MCMS contracts
// on a chain, indexed by qualifier. If a binding is nil, it means there is no such
// MCMS suite contracts on the chain for that qualifier.
type MCMSChainState struct {
	ByQualifier map[string]*MCMSSuiteState
}

// MCMSSuiteState holds the state of a single MCMS deployment - currently includes all contracts addresses.
type MCMSSuiteState struct {
	// 3x MCMS contracts, each gets a role in the timelock
	Proposer  *address.Address
	Canceller *address.Address
	Bypasser  *address.Address

	// Timelock contract address for this MCMS suite
	Timelock *address.Address
}

// TODO refactor state management for different protocol NONEVM-3181
func LoadMCMSOnChainState(e cldf.Environment) (map[uint64]MCMSChainState, error) {
	chains := make(map[uint64]MCMSChainState)
	for chainSelector := range e.BlockChains.TonChains() {
		addresses := e.DataStore.Addresses().Filter(
			ds.AddressRefByChainSelector(chainSelector),
		)
		chainState, err := loadMCMSChainState(addresses)
		if err != nil {
			return chains, err
		}

		chains[chainSelector] = chainState
	}
	return chains, nil
}

func LoadMCMSOnChainStateUsingDataStore(dataStore ds.DataStore, chainSelector uint64) (MCMSChainState, error) {
	addresses := dataStore.Addresses().Filter(
		ds.AddressRefByChainSelector(chainSelector),
	)

	return loadMCMSChainState(addresses)
}

func loadMCMSChainState(addresses []ds.AddressRef) (MCMSChainState, error) {
	state := MCMSChainState{
		ByQualifier: make(map[string]*MCMSSuiteState),
	}

	none := address.NewAddressNone()

	// Most programs upgraded in place, but some are not so we always want to
	// load the latest version
	versions := make(map[ds.ContractType]semver.Version)

	for _, addressType := range addresses {
		contractType := addressType.Type
		version := addressType.Version
		rawContractAddress := addressType.Address
		contractAddress, err := address.ParseAddr(rawContractAddress)

		if err != nil {
			return state, err
		}

		// Init suite state for this qualifier if not exist
		if state.ByQualifier[addressType.Qualifier] == nil {
			state.ByQualifier[addressType.Qualifier] = &MCMSSuiteState{
				Proposer:  none,
				Bypasser:  none,
				Canceller: none,
				Timelock:  none,
			}
		}

		switch contractType {
		case ds.ContractType(utils.RBACTimelock):
			state.ByQualifier[addressType.Qualifier].Timelock = contractAddress
		case ds.ContractType(utils.ProposerManyChainMultisig):
			state.ByQualifier[addressType.Qualifier].Proposer = contractAddress
		case ds.ContractType(utils.BypasserManyChainMultisig):
			state.ByQualifier[addressType.Qualifier].Bypasser = contractAddress
		case ds.ContractType(utils.CancellerManyChainMultisig):
			state.ByQualifier[addressType.Qualifier].Canceller = contractAddress
		default:
			continue
		}

		existingVersion, ok := versions[contractType]
		if ok {
			log.Warn().Str("existingVersion", existingVersion.String()).Str("type", contractType.String()).Msg("Duplicate address type found")
		}
		versions[contractType] = *version
	}

	return state, nil
}
