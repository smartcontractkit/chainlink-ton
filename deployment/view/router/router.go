package router

import (
	"context"
	"fmt"
	"runtime"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

const (
	onRampGetter = "onRamp"
)

type View struct {
	view.MetaData
	OnRampAddr map[uint64]*address.Address `json:"onRampAddr,omitempty"`
}

// FetchView generates a view of the router contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, routerAddr, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, routerAddr, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	var onrampSlice *cell.Slice
	var onRampAddr *address.Address
	var eg errgroup.Group
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(map[uint64]*address.Address)
	for _, dest := range selectorSlice {
		// On-chain returns *big.Int for selector values, convert to uint64
		eg.Go(func() error {
			result, err = c.Client.RunGetMethod(ctx, block, routerAddr, onRampGetter, dest)
			if err != nil {
				return fmt.Errorf("error getting onrampAddr: %v", err)
			}
			onrampSlice, err = result.Slice(0)
			if err != nil {
				return err
			}

			onRampAddr, err = onrampSlice.LoadAddr()
			if err != nil {
				return fmt.Errorf("failed to load onramp address: %w", err)
			}

			onRampAddrMap[dest] = onRampAddr
			return nil
		})
	}

	return &View{
		MetaData: view.MetaData{
			Address:      routerAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		OnRampAddr: onRampAddrMap,
	}, eg.Wait()
}
