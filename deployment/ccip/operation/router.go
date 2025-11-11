package operation

import (
	"fmt"
	"sort"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
)

type RampUpdates map[string][]router.ChainSelector

type ApplyRampUpdatesInput struct {
	OnRampUpdates  RampUpdates
	OffRampAdds    RampUpdates
	OffRampRemoves RampUpdates
}

type ApplyRampUpdatesOutput struct {
}

var ApplyRampUpdatesOp = operations.NewOperation(
	"apply-ramp-updates-op",
	semver.MustParse("0.1.0"),
	"Apply Ramp Updates operations including OnRampUpdates, OffRampAdds and/or OffRampRemoves",
	applyRampUpdates,
)

func applyRampUpdates(b operations.Bundle, deps TonDeps, in ApplyRampUpdatesInput) ([][]byte, error) {
	routerAddr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	onramps, err := updateRouterOnramps(routerAddr, in.OnRampUpdates)
	if err != nil {
		return nil, err
	}

	offramps, err := updateRouterOfframps(routerAddr, in.OffRampAdds, in.OffRampRemoves)
	if err != nil {
		return nil, err
	}

	return append(onramps, offramps...), nil
}

func updateRouterOnramps(routerAddr address.Address, onRampUpdates map[string][]router.ChainSelector) ([][]byte, error) {
	msgs := make([]*tlb.InternalMessage, 0)
	for onRampAddrStr, selectors := range onRampUpdates {
		rampAddr := address.MustParseAddr(onRampAddrStr)
		input := router.ApplyRampUpdates{
			OnRampUpdates: &router.OnRamps{
				DestChainSelectors: selectors,
				OnRamps:            rampAddr,
			},
		}

		payload, err := tlb.ToCell(input)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize router input: %w", err)
		}

		msg := tlb.InternalMessage{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &routerAddr,
			Body:    payload,
		}
		msgs = append(msgs, &msg)
	}

	return helpers.Serialize(msgs)
}

func updateRouterOfframps(routerAddr address.Address, offRampAdds map[string][]router.ChainSelector, offRampRemoves map[string][]router.ChainSelector) ([][]byte, error) {
	type change struct {
		addr *address.Address
		sels []router.ChainSelector
	}

	// Collect + sort keys so iteration is deterministic.
	addKeys := make([]string, 0, len(offRampAdds))
	for k := range offRampAdds {
		addKeys = append(addKeys, k)
	}
	sort.Strings(addKeys)

	rmKeys := make([]string, 0, len(offRampRemoves))
	for k := range offRampRemoves {
		rmKeys = append(rmKeys, k)
	}
	sort.Strings(rmKeys)

	// Flatten maps into slices.
	adds := make([]change, 0, len(addKeys))
	for _, k := range addKeys {
		adds = append(adds, change{
			addr: address.MustParseAddr(k),
			sels: offRampAdds[k],
		})
	}

	removes := make([]change, 0, len(rmKeys))
	for _, k := range rmKeys {
		removes = append(removes, change{
			addr: address.MustParseAddr(k),
			sels: offRampRemoves[k],
		})
	}

	// Zip: pair one add with one remove per message where possible.
	n := len(adds)
	if len(removes) > n {
		n = len(removes)
	}

	msgs := make([]*tlb.InternalMessage, 0, n)

	for i := 0; i < n; i++ {
		var input router.ApplyRampUpdates

		if i < len(adds) {
			input.OffRampAdds = &router.OffRamps{
				SourceChainSelectors: adds[i].sels,
				OffRamp:              adds[i].addr,
			}
		}

		if i < len(removes) {
			input.OffRampRemoves = &router.OffRamps{
				SourceChainSelectors: removes[i].sels,
				OffRamp:              removes[i].addr,
			}
		}

		// Skip emitting an empty op (shouldn't happen, but defensive)
		if (input.OffRampAdds == nil || len(input.OffRampAdds.SourceChainSelectors) == 0) && (input.OffRampRemoves == nil || len(input.OffRampRemoves.SourceChainSelectors) == 0) {
			continue
		}

		payload, err := tlb.ToCell(input)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize router input: %w", err)
		}

		msg := tlb.InternalMessage{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"), // adjust if needed for larger ops
			DstAddr: &routerAddr,
			Body:    payload,
		}
		msgs = append(msgs, &msg)
	}

	return helpers.Serialize(msgs)
}
