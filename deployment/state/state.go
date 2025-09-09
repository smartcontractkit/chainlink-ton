package state

import (
	"errors"

	"github.com/Masterminds/semver/v3"
	"github.com/rs/zerolog/log"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/xssnick/tonutils-go/address"
)

// Duplicates of chainlink/deployment/ccip/ to avoid import loops
var (
	Version1_6_0                   = *semver.MustParse("1.6.0")
	LinkToken    cldf.ContractType = "LinkToken"
	TonReceiver  cldf.ContractType = "TonReceiver"
	Router       cldf.ContractType = "Router"
	OnRamp       cldf.ContractType = "OnRamp"
	OffRamp      cldf.ContractType = "OffRamp"
	FeeQuoter    cldf.ContractType = "FeeQuoter"
)

// TonCCIPChainState holds a Go binding for all the currently deployed CCIP contracts
// on a chain. If a binding is nil, it means here is no such contract on the chain.
type CCIPChainState struct {
	LinkTokenAddress address.Address
	OffRamp          address.Address
	Router           address.Address
	OnRamp           address.Address
	FeeQuoter        address.Address

	// dummy receiver address
	ReceiverAddress address.Address
}

func SaveOnchainState(chainSelector uint64, state CCIPChainState, e cldf.Environment) error {
	// TODO: use DataStore
	ab := e.ExistingAddresses
	if !state.LinkTokenAddress.IsAddrNone() {
		err := ab.Save(chainSelector, state.LinkTokenAddress.String(), cldf.NewTypeAndVersion(LinkToken, Version1_6_0))
		if err != nil {
			return err
		}
	}
	if !state.ReceiverAddress.IsAddrNone() {
		err := ab.Save(chainSelector, state.ReceiverAddress.String(), cldf.NewTypeAndVersion(TonReceiver, Version1_6_0))
		if err != nil {
			return err
		}
	}
	if !state.OffRamp.IsAddrNone() {
		err := ab.Save(chainSelector, state.OffRamp.String(), cldf.NewTypeAndVersion(OffRamp, Version1_6_0))
		if err != nil {
			return err
		}
	}
	if !state.Router.IsAddrNone() {
		err := ab.Save(chainSelector, state.Router.String(), cldf.NewTypeAndVersion(Router, Version1_6_0))
		if err != nil {
			return err
		}
	}
	if !state.OnRamp.IsAddrNone() {
		err := ab.Save(chainSelector, state.OnRamp.String(), cldf.NewTypeAndVersion(OnRamp, Version1_6_0))
		if err != nil {
			return err
		}
	}
	if !state.FeeQuoter.IsAddrNone() {
		err := ab.Save(chainSelector, state.FeeQuoter.String(), cldf.NewTypeAndVersion(FeeQuoter, Version1_6_0))
		if err != nil {
			return err
		}
	}
	return nil
}

func LoadOnchainState(e cldf.Environment) (map[uint64]CCIPChainState, error) {
	chains := make(map[uint64]CCIPChainState)
	for chainSelector, chain := range e.BlockChains.TonChains() {
		addresses, err := e.ExistingAddresses.AddressesForChain(chainSelector)
		if err != nil {
			// Chain not found in address book, initialize empty
			if !errors.Is(err, cldf.ErrChainNotFound) {
				return chains, err
			}
			addresses = make(map[string]cldf.TypeAndVersion)
		}
		chainState, err := loadChainState(chain, addresses)
		if err != nil {
			return chains, err
		}
		chains[chainSelector] = chainState
	}
	return chains, nil
}

// loadChainState Loads all state for a TonChain into state
func loadChainState(chain cldf_ton.Chain, addressTypes map[string]cldf.TypeAndVersion) (CCIPChainState, error) {
	_ = chain // TODO: Use chain to access the client if needed
	state := CCIPChainState{}

	// Most programs upgraded in place, but some are not so we always want to
	// load the latest version
	versions := make(map[cldf.ContractType]semver.Version)
	for addressStr, tvStr := range addressTypes {
		address, err := address.ParseAddr(addressStr)
		if err != nil {
			return state, err
		}

		switch tvStr.Type {
		case LinkToken:
			state.LinkTokenAddress = *address
		case TonReceiver:
			state.ReceiverAddress = *address
		case OffRamp:
			state.OffRamp = *address
		case Router:
			state.Router = *address
		case OnRamp:
			state.OnRamp = *address
		case FeeQuoter:
			state.FeeQuoter = *address
		default:
			log.Warn().Str("address", addressStr).Str("type", string(tvStr.Type)).Msg("Unknown TON address type")
			continue
		}

		existingVersion, ok := versions[tvStr.Type]
		if ok {
			log.Warn().Str("existingVersion", existingVersion.String()).Str("type", string(tvStr.Type)).Msg("Duplicate address type found")
		}
		versions[tvStr.Type] = tvStr.Version
	}

	return state, nil
}
