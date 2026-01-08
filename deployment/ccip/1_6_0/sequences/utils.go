package sequences

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/mcms/types"
)

// withOperationOutput is a helper to extract plans from operation output and map them to batch operations.
func withOperationOutput(out sequences.OnChainOutput, _out any, selector types.ChainSelector, meta []types.OperationMetadata) (sequences.OnChainOutput, error) {
	// Try to extract the plans and map to batch operation
	planer, ok := _out.(opston.Planner[opston.MessagePlanRaw]) //nolint:govet // should be ok
	if !ok {
		return out, fmt.Errorf("operation output does not implement Planner interface")
	}
	plans := planer.GetPlans()
	plan := len(plans) > 0

	if plan {
		batchOp, err := mcms.RawPlansToBatch(selector, plans, meta)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
		}

		if out.BatchOps == nil {
			out.BatchOps = make([]types.BatchOperation, 0)
		}

		out.BatchOps = append(out.BatchOps, batchOp)
	}

	return out, nil
}

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
