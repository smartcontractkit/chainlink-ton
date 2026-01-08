package sequences

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

func extractTonDepsFrom(chain ton.Chain, onRamp []byte, offRamp []byte, router []byte, feeQuoter []byte) (config.CCIPDeps, error) {
	onRampAddr, err := codec.AddressBytesToTONAddress(onRamp)
	if err != nil {
		return config.CCIPDeps{}, fmt.Errorf("failed to convert onramp address: %w", err)
	}
	offRampAddr, err := codec.AddressBytesToTONAddress(offRamp)
	if err != nil {
		return config.CCIPDeps{}, fmt.Errorf("failed to convert offramp address: %w", err)
	}
	routerAddr, err := codec.AddressBytesToTONAddress(router)
	if err != nil {
		return config.CCIPDeps{}, fmt.Errorf("failed to convert router address: %w", err)
	}
	feeQuoterAddr, err := codec.AddressBytesToTONAddress(feeQuoter)
	if err != nil {
		return config.CCIPDeps{}, fmt.Errorf("failed to convert feequoter address: %w", err)
	}

	// Only fill in the fields that are relevant to the operations used

	deps := config.CCIPDeps{
		TonChain: chain,
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			chain.Selector: {
				OnRamp:    *onRampAddr,
				OffRamp:   *offRampAddr,
				Router:    *routerAddr,
				FeeQuoter: *feeQuoterAddr,
			},
		},
	}
	return deps, nil
}
