package v160

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	chainSelectors "github.com/smartcontractkit/chain-selectors"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	ccipapi "github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
)

func init() {
	v, err := semver.NewVersion("1.6.0")
	if err != nil {
		panic(err)
	}
	ccipapi.GetLaneAdapterRegistry().RegisterLaneAdapter(chainSelectors.FamilyTon, v, &TonAdapter{})
}

type TonAdapter struct{}

func (a *TonAdapter) GetOnRampAddress(env *cldf.Environment, chainSelector uint64) ([]byte, error) {
	tonChains, err := tonstate.LoadOnchainState(*env)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	onrampAddress := tonChains[chainSelector].OnRamp
	return onrampAddress.Data(), nil
}

func (a *TonAdapter) GetOffRampAddress(e *cldf.Environment, chainSelector uint64) ([]byte, error) {
	return []byte{}, nil // Not implemented for Ton
}

func (a *TonAdapter) GetFQAddress(e *cldf.Environment, chainSelector uint64) ([]byte, error) {
	return []byte{}, nil // Not implemented for Ton
}

func (a *TonAdapter) GetRouterAddress(e *cldf.Environment, chainSelector uint64) ([]byte, error) {
	return []byte{}, nil // Not implemented for Ton
}
