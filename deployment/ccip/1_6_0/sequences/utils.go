package sequences

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

func extractCCIPChainStateFrom(onRamp []byte, offRamp []byte, router []byte, feeQuoter []byte) (state.CCIPChainState, error) {
	onRampAddr, err := codec.AddressBytesToTONAddress(onRamp)
	if err != nil {
		return state.CCIPChainState{}, fmt.Errorf("failed to convert onramp address: %w", err)
	}
	offRampAddr, err := codec.AddressBytesToTONAddress(offRamp)
	if err != nil {
		return state.CCIPChainState{}, fmt.Errorf("failed to convert offramp address: %w", err)
	}
	routerAddr, err := codec.AddressBytesToTONAddress(router)
	if err != nil {
		return state.CCIPChainState{}, fmt.Errorf("failed to convert router address: %w", err)
	}
	feeQuoterAddr, err := codec.AddressBytesToTONAddress(feeQuoter)
	if err != nil {
		return state.CCIPChainState{}, fmt.Errorf("failed to convert feequoter address: %w", err)
	}

	// Only fill in the fields that are relevant to the operations used
	state := state.CCIPChainState{
		OnRamp:    *onRampAddr,
		OffRamp:   *offRampAddr,
		Router:    *routerAddr,
		FeeQuoter: *feeQuoterAddr,
	}
	return state, nil
}
