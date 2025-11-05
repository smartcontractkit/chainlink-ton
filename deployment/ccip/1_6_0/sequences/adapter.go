package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	chainSelectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/xssnick/tonutils-go/address"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	ccipapi "github.com/smartcontractkit/chainlink-ccip/deployment/lanes"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

func init() {
	v, err := semver.NewVersion("1.6.0")
	if err != nil {
		panic(err)
	}
	ccipapi.GetLaneAdapterRegistry().RegisterLaneAdapter(chainSelectors.FamilyTon, v, &TonAdapter{})
}

type TonAdapter struct{}

func (a *TonAdapter) GetOnRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	tonChain, err := tonstate.LoadOnchainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(tonChain.OnRamp)
}

func (a *TonAdapter) GetOffRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	tonChain, err := tonstate.LoadOnchainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(tonChain.OffRamp)
}

func (a *TonAdapter) GetFQAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	tonChain, err := tonstate.LoadOnchainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(tonChain.FeeQuoter)
}

func (a *TonAdapter) GetRouterAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	tonChain, err := tonstate.LoadOnchainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(tonChain.Router)
}

func convertAddress(address address.Address) ([]byte, error) {
	addrCodec := codec.NewAddressCodec()
	rawAddress, err := addrCodec.AddressStringToBytes(address.String())
	if err != nil {
		return []byte{}, fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}

	return rawAddress, nil
}
