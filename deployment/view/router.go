package view

import (
	"context"
	"fmt"
	"runtime"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

const (
	onRampGetter = "onRamp"
)

type RouterView struct {
	MetaData
	OnRampAddr map[uint64]*address.Address `json:"onRampAddr,omitempty"`
}

// FetchRouterView generates a view of the router contract at the specified block.
func FetchRouterView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*RouterView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, routerAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, routerAddr, destChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := parseExecutionResultForDestChainSelectors(result.AsTuple())
	var onRampSlice *cell.Slice
	var onRampAddr *address.Address
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(map[uint64]*address.Address)
	updateChanMap := make(map[uint64]chan *address.Address)
	for _, dest := range selectorSlice {
		updateChan := make(chan *address.Address, 1)
		updateChanMap[dest] = updateChan

		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(egCtx, block, routerAddr, onRampGetter, dest) // New variables per goroutine
			if err != nil {
				return fmt.Errorf("error getting onrampAddr: %v", err)
			}
			onRampSlice, err = result.Slice(0)
			if err != nil {
				return err
			}

			onRampAddr, err = onRampSlice.LoadAddr()
			if err != nil {
				return fmt.Errorf("failed to load onramp address: %w", err)
			}

			updateChan <- onRampAddr
			return nil
		})
	}

	// Wait for all goroutines to complete first
	if err = eg.Wait(); err != nil {
		return nil, err
	}

	// Then collect results
	for selector, ch := range updateChanMap {
		onRampAddrMap[selector] = <-ch
		close(ch)
	}

	return &RouterView{
		MetaData: MetaData{
			Address:      routerAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		OnRampAddr: onRampAddrMap,
	}, nil
}
