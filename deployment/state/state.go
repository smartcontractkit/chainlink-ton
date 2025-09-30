package state

import (
	"context"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/rs/zerolog/log"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/address"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
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

// CCIPChainState holds a Go binding for all the currently deployed CCIP contracts
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

type TONChainView struct {
	ChainSelector uint64                        `json:"chainSelector,omitempty"`
	ChainID       string                        `json:"chainID,omitempty"`
	OnRamp        map[string]view.OnRampView    `json:"onRamp,omitempty"`
	Router        map[string]view.RouterView    `json:"router,omitempty"`
	FeeQuoter     map[string]view.FeeQuoterView `json:"feeQuoter,omitempty"`
	OffRamp       map[string]view.OffRampView   `json:"offRamp,omitempty"`
}

func newTONChainView() TONChainView {
	return TONChainView{
		ChainSelector: 0,
		ChainID:       "",
		OnRamp:        make(map[string]view.OnRampView),
		Router:        make(map[string]view.RouterView),
		FeeQuoter:     make(map[string]view.FeeQuoterView),
		OffRamp:       make(map[string]view.OffRampView),
	}
}

func (s CCIPChainState) GenerateView(e *cldf.Environment, selector uint64, chainID string) (TONChainView, error) {
	lggr := e.Logger
	tonView := newTONChainView()
	tonView.ChainSelector = selector
	tonView.ChainID = chainID
	tonClient, ok := e.BlockChains.TonChains()[selector]
	if !ok {
		return tonView, errors.New("chain not found or not a TON chain")
	}

	lggr.Infow("generating TON chain view",
		"chain", tonClient.Name(),
		"selector", selector)

	ctx := context.Background()
	block, err := tonClient.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return tonView, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	errGroup := errgroup.Group{}
	if !s.OnRamp.IsAddrNone() {
		errGroup.Go(func() error {
			onRampView, err := view.FetchOnRampView(ctx, tonClient, block, &s.OnRamp, selector)
			if err != nil {
				return fmt.Errorf("failed to generate onramp view for chain %d: %w", selector, err)
			}
			lggr.Infow("generated onRamp view", "chainID", chainID, "onRamp", s.OnRamp.String())
			tonView.OnRamp[s.OnRamp.String()] = *onRampView
			return nil
		})
	}

	if !s.Router.IsAddrNone() {
		errGroup.Go(func() error {
			routerView, err := view.FetchRouterView(ctx, tonClient, block, &s.Router)
			if err != nil {
				return fmt.Errorf("failed to generate router view for chain %d: %w", selector, err)
			}

			lggr.Infow("generated router view", "chainID", chainID, "router", s.Router.String())
			tonView.Router[s.Router.String()] = *routerView
			return nil
		})
	}

	if !s.FeeQuoter.IsAddrNone() {
		errGroup.Go(func() error {
			feeQuoterView, err := view.FetchFeeQuoterView(ctx, tonClient, block, &s.FeeQuoter)
			if err != nil {
				return fmt.Errorf("failed to generate fee quoter view for chain %d: %w", selector, err)
			}

			lggr.Infow("generated feeQuoter view", "chainID", chainID, "feeQuoter", s.FeeQuoter.String())
			tonView.FeeQuoter[s.FeeQuoter.String()] = *feeQuoterView
			return nil
		})
	}

	if !s.OffRamp.IsAddrNone() {
		errGroup.Go(func() error {
			offRampView, err := view.FetchOffRampView(ctx, tonClient, block, &s.OffRamp)
			if err != nil {
				return fmt.Errorf("failed to generate offramp view for chain %d: %w", selector, err)
			}

			lggr.Infow("generated offRamp view", "chainID", chainID, "offRamp", s.OffRamp.String())
			tonView.OffRamp[s.OffRamp.String()] = *offRampView
			return nil
		})
	}

	return tonView, errGroup.Wait()
}

func GetAddressBook(chainSelector uint64, state CCIPChainState) (cldf.AddressBook, error) {
	// TODO: use DataStore
	ab := cldf.NewMemoryAddressBook()
	if !state.LinkTokenAddress.IsAddrNone() {
		err := ab.Save(chainSelector, state.LinkTokenAddress.String(), cldf.NewTypeAndVersion(LinkToken, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	if !state.ReceiverAddress.IsAddrNone() {
		err := ab.Save(chainSelector, state.ReceiverAddress.String(), cldf.NewTypeAndVersion(TonReceiver, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	if !state.OffRamp.IsAddrNone() {
		err := ab.Save(chainSelector, state.OffRamp.String(), cldf.NewTypeAndVersion(OffRamp, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	if !state.Router.IsAddrNone() {
		err := ab.Save(chainSelector, state.Router.String(), cldf.NewTypeAndVersion(Router, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	if !state.OnRamp.IsAddrNone() {
		err := ab.Save(chainSelector, state.OnRamp.String(), cldf.NewTypeAndVersion(OnRamp, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	if !state.FeeQuoter.IsAddrNone() {
		err := ab.Save(chainSelector, state.FeeQuoter.String(), cldf.NewTypeAndVersion(FeeQuoter, Version1_6_0))
		if err != nil {
			return nil, err
		}
	}
	return ab, nil
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
