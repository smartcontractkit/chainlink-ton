package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	chainSelectors "github.com/smartcontractkit/chain-selectors"
	ccipapi "github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
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

func (a *TonAdapter) GetOffRampAddress(env *cldf.Environment, chainSelector uint64) ([]byte, error) {
	tonChains, err := tonstate.LoadOnchainState(*env)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	offrampAddress := tonChains[chainSelector].OffRamp
	return offrampAddress.Data(), nil
}

func (a *TonAdapter) GetFQAddress(env *cldf.Environment, chainSelector uint64) ([]byte, error) {
	tonChains, err := tonstate.LoadOnchainState(*env)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	feeQuoterAddress := tonChains[chainSelector].FeeQuoter
	return feeQuoterAddress.Data(), nil
}

func (a *TonAdapter) GetRouterAddress(env *cldf.Environment, chainSelector uint64) ([]byte, error) {
	tonChains, err := tonstate.LoadOnchainState(*env)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	routerAddress := tonChains[chainSelector].Router
	return routerAddress.Data(), nil
}
