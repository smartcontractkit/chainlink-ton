package operation

import (
	"fmt"
	"math/big"
	"sort"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
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

func applyRampUpdates(b operations.Bundle, deps config.CCIPDeps, in ApplyRampUpdatesInput) (*helpers.Transactions, error) {
	routerAddr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	onramps, err := updateRouterOnramps(routerAddr, in.OnRampUpdates)
	if err != nil {
		return nil, err
	}

	offramps, err := updateRouterOfframps(routerAddr, in.OffRampAdds, in.OffRampRemoves)
	if err != nil {
		return nil, err
	}

	onramps.Append(offramps)
	return onramps, nil
}

func updateRouterOnramps(routerAddr address.Address, onRampUpdates map[string][]router.ChainSelector) (*helpers.Transactions, error) {
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

	return helpers.NewTransactions(msgs)
}

func updateRouterOfframps(routerAddr address.Address, offRampAdds map[string][]router.ChainSelector, offRampRemoves map[string][]router.ChainSelector) (*helpers.Transactions, error) {
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

	return helpers.NewTransactions(msgs)
}

// CurseInput defines the input for the curse operation.
type CurseInput struct {
	Subjects []*big.Int // 128-bit subject IDs to curse (typically chain selectors)
}

// CurseOp is the operation for cursing subjects on the router via RMN Remote.
var CurseOp = operations.NewOperation(
	"router-curse",
	semver.MustParse("0.1.0"),
	"Curse subjects on the router via RMN Remote",
	curse,
)

func curse(
	b operations.Bundle,
	deps config.CCIPDeps,
	in CurseInput,
) (*helpers.Transactions, error) {
	// Validate input
	if len(in.Subjects) == 0 {
		return helpers.NewEmptyTransactions(), nil // No subjects to curse
	}

	// Get router address from chain state
	routerAddr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	// Convert *big.Int subjects to Subject wrappers
	subjects := make([]router.Subject, len(in.Subjects))
	for i, subj := range in.Subjects {
		subjects[i] = router.Subject{Value: new(big.Int).Set(subj)}
	}

	// Create curse message
	curseMsg := router.RMNRemoteCurse{
		Subjects: subjects,
	}

	// Serialize to cell
	payload, err := tlb.ToCell(curseMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize curse message: %w", err)
	}

	// Create internal message
	msg := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"), // TON amount for gas
			DstAddr: &routerAddr,
			Body:    payload,
		},
	}

	// Serialize and return
	return helpers.NewTransactions(msg)
}

// UncurseInput defines the input for the uncurse operation.
type UncurseInput struct {
	Subjects []*big.Int // 128-bit subject IDs to uncurse (typically chain selectors)
}

// UncurseOp is the operation for uncursing subjects on the router via RMN Remote.
var UncurseOp = operations.NewOperation(
	"router-uncurse",
	semver.MustParse("0.1.0"),
	"Uncurse subjects on the router via RMN Remote",
	uncurse,
)

func uncurse(
	b operations.Bundle,
	deps config.CCIPDeps,
	in UncurseInput,
) (*helpers.Transactions, error) {
	// Validate input
	if len(in.Subjects) == 0 {
		return helpers.NewEmptyTransactions(), nil // No subjects to uncurse
	}

	// Get router address from chain state
	routerAddr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	// Convert *big.Int subjects to Subject wrappers
	subjects := make([]router.Subject, len(in.Subjects))
	for i, subj := range in.Subjects {
		subjects[i] = router.Subject{Value: new(big.Int).Set(subj)}
	}

	// Create uncurse message
	uncurseMsg := router.RMNRemoteUncurse{
		Subjects: subjects,
	}

	// Serialize to cell
	payload, err := tlb.ToCell(uncurseMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize uncurse message: %w", err)
	}

	// Create internal message
	msg := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"), // TON amount for gas
			DstAddr: &routerAddr,
			Body:    payload,
		},
	}

	// Serialize and return
	return helpers.NewTransactions(msg)
}
