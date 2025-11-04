package operation

import (
	"fmt"
	"sort"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployRouterInput struct {
	ID           uint32
	ContractPath string
	Coins        string
}

type DeployRouterOutput struct {
	Address *address.Address
}

var DeployRouterOp = operations.NewOperation(
	"deploy-router-op",
	semver.MustParse("0.1.0"),
	"Deploys the Router contract",
	deployRouter,
)

func deployRouter(b operations.Bundle, deps TonDeps, in DeployRouterInput) (DeployRouterOutput, error) {
	output := DeployRouterOutput{}

	// TODO wrap the code cell creation somewhere
	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := router.Storage{
		ID: in.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		RMNRemote: router.RMNRemote{
			Admin: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: nil,
			},
			CursedSubjects: nil,
			ForwardUpdates: nil,
		},
		OnRamps: nil, // set afterwards
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON(in.Coins), nil)
	if err != nil {
		return output, fmt.Errorf("failed to deploy router contract: %w", err)
	}
	b.Logger.Infow("Deployed Router", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

type UpdateRouterOnrampsInput map[string][]router.ChainSelector

type UpdateRouterDestOutput struct {
}

var UpdateRouterOnrampsOp = operations.NewOperation(
	"update-router-onramps-op",
	semver.MustParse("0.1.0"),
	"Update router onramps",
	updateRouterOnramps,
)

func updateRouterOnramps(b operations.Bundle, deps TonDeps, in UpdateRouterOnrampsInput) ([][]byte, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	msgs := make([]*tlb.InternalMessage, 0)
	for onRampAddrStr, selectors := range in {
		rampAddr := address.MustParseAddr(onRampAddrStr)
		input := router.SetRamps{
			DestChainSelectors: selectors,
			OnRamps:            rampAddr,
		}

		payload, err := tlb.ToCell(input)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize router input: %w", err)
		}

		msg := tlb.InternalMessage{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &addr,
			Body:    payload,
		}
		msgs = append(msgs, &msg)
	}

	return helpers.Serialize(msgs)
}

type UpdateRouterOfframpsInput struct {
	OffRampAdd    map[string][]router.ChainSelector
	OffRampRemove map[string][]router.ChainSelector
}

var UpdateRouterOfframpsOp = operations.NewOperation(
	"update-router-offramps-op",
	semver.MustParse("0.1.0"),
	"Update router offramps",
	updateRouterOfframps,
)

func updateRouterOfframps(b operations.Bundle, deps TonDeps, in UpdateRouterOfframpsInput) ([][]byte, error) {
	routerAddr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	type change struct {
		addr *address.Address
		sels []router.ChainSelector
	}

	// Collect + sort keys so iteration is deterministic.
	addKeys := make([]string, 0, len(in.OffRampAdd))
	for k := range in.OffRampAdd {
		addKeys = append(addKeys, k)
	}
	sort.Strings(addKeys)

	rmKeys := make([]string, 0, len(in.OffRampRemove))
	for k := range in.OffRampRemove {
		rmKeys = append(rmKeys, k)
	}
	sort.Strings(rmKeys)

	// Flatten maps into slices.
	adds := make([]change, 0, len(addKeys))
	for _, k := range addKeys {
		adds = append(adds, change{
			addr: address.MustParseAddr(k),
			sels: in.OffRampAdd[k],
		})
	}

	removes := make([]change, 0, len(rmKeys))
	for _, k := range rmKeys {
		removes = append(removes, change{
			addr: address.MustParseAddr(k),
			sels: in.OffRampRemove[k],
		})
	}

	// Zip: pair one add with one remove per message where possible.
	n := len(adds)
	if len(removes) > n {
		n = len(removes)
	}

	msgs := make([]*tlb.InternalMessage, 0, n)

	for i := 0; i < n; i++ {
		var input router.UpdateOffRamps

		if i < len(adds) {
			input.SourceChainSelectorAdd = adds[i].sels
			input.OffRampAdd = adds[i].addr
		}

		if i < len(removes) {
			input.SourceChainSelectorRemove = removes[i].sels
			input.OffRampRemove = removes[i].addr
		}

		// Skip emitting an empty op (shouldn't happen, but defensive)
		if len(input.SourceChainSelectorAdd) == 0 && len(input.SourceChainSelectorRemove) == 0 {
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
