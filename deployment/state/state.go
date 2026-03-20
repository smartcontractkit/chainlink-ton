package state

import (
	"context"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/rs/zerolog/log"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/address"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/deployment/view/feequoter"
	"github.com/smartcontractkit/chainlink-ton/deployment/view/offramp"
	"github.com/smartcontractkit/chainlink-ton/deployment/view/onramp"
	"github.com/smartcontractkit/chainlink-ton/deployment/view/router"
)

// Duplicates of chainlink/deployment/ccip/ to avoid import loops
var (
	Version1_6_0 = *semver.MustParse("1.6.0")
	// MCMS contract versions
	TimelockVersion = *semver.MustParse("0.0.3")
	MCMSVersion     = *semver.MustParse("0.0.4")
	// Core contracts
	LinkToken ds.ContractType = "LinkToken"
	TONNative ds.ContractType = "TONNative"
	Router    ds.ContractType = "Router"
	OnRamp    ds.ContractType = "OnRamp"
	OffRamp   ds.ContractType = "OffRamp"
	FeeQuoter ds.ContractType = "FeeQuoter"
	// Internal contracts
	Deployer        ds.ContractType = "Deployer"
	MerkleRoot      ds.ContractType = "MerkleRoot"
	SendExecutor    ds.ContractType = "SendExecutor"
	ReceiveExecutor ds.ContractType = "ReceiveExecutor"
	// Utilities
	TonReceiver ds.ContractType = "Receiver"
	Counter     ds.ContractType = "Counter"
)

// CCIPChainState holds a Go binding for all the currently deployed CCIP contracts
// on a chain. If a binding is nil, it means there is no such contract on the chain.
type CCIPChainState struct {
	LinkTokenAddress address.Address
	TONNativeAddress address.Address
	OffRamp          address.Address
	Router           address.Address
	OnRamp           address.Address
	FeeQuoter        address.Address
	ReceiverAddress  address.Address
}

type TONChainView struct {
	ChainSelector uint64                    `json:"chainSelector,omitempty"`
	ChainID       string                    `json:"chainID,omitempty"`
	OnRamp        map[string]onramp.View    `json:"onRamp,omitempty"`
	Router        map[string]router.View    `json:"router,omitempty"`
	FeeQuoter     map[string]feequoter.View `json:"feeQuoter,omitempty"`
	OffRamp       map[string]offramp.View   `json:"offRamp,omitempty"`
}

func newTONChainView() TONChainView {
	return TONChainView{
		ChainSelector: 0,
		ChainID:       "",
		OnRamp:        make(map[string]onramp.View),
		Router:        make(map[string]router.View),
		FeeQuoter:     make(map[string]feequoter.View),
		OffRamp:       make(map[string]offramp.View),
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
			onRampView, err := onramp.FetchView(ctx, tonClient, block, &s.OnRamp, selector)
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
			routerView, err := router.FetchView(ctx, tonClient, block, &s.Router)
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
			feeQuoterView, err := feequoter.FetchView(ctx, tonClient, block, &s.FeeQuoter)
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
			offRampView, err := offramp.FetchView(ctx, tonClient, block, &s.OffRamp)
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

func LoadCCIPOnChainStateUsingDataStore(dataStore ds.DataStore, chainSelector uint64) (CCIPChainState, error) {
	addresses := dataStore.Addresses().Filter(
		ds.AddressRefByChainSelector(chainSelector),
	)
	chainState, err := loadCCIPChainState(addresses)
	if err != nil {
		return chainState, err
	}

	return chainState, nil
}

func LoadOnchainState(e cldf.Environment) (map[uint64]CCIPChainState, error) {
	chains := make(map[uint64]CCIPChainState)
	for chainSelector := range e.BlockChains.TonChains() {
		chainState, err := LoadCCIPOnChainStateUsingDataStore(e.DataStore, chainSelector)
		if err != nil {
			return chains, err
		}

		chains[chainSelector] = chainState
	}
	return chains, nil
}

// loadCCIPChainState Loads all state for a TonChain into state
func loadCCIPChainState(addresses []ds.AddressRef) (CCIPChainState, error) {
	state := CCIPChainState{}

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

		switch contractType {
		case LinkToken:
			state.LinkTokenAddress = *contractAddress
		case TONNative:
			state.TONNativeAddress = *contractAddress
		case TonReceiver:
			state.ReceiverAddress = *contractAddress
		case OffRamp:
			state.OffRamp = *contractAddress
		case Router:
			state.Router = *contractAddress
		case OnRamp:
			state.OnRamp = *contractAddress
		case FeeQuoter:
			state.FeeQuoter = *contractAddress
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
