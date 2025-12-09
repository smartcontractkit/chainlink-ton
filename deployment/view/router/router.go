package router

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

const (
	destChainsGetter = "destChainSelectors"
	onRampGetter     = "onRamp"
)

type View struct {
	view.MetaData
	OnRampAddresses map[uint64]*address.Address `json:"onRampAddresses,omitempty"`
}

// FetchView generates a view of the router contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	if err := tvm.FetchResult(ctx, c.Client, block, routerAddr, &typeVersion, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var addresses onRampAddressMap
	if err := addresses.Fetch(ctx, c.Client, block, routerAddr); err != nil {
		return nil, fmt.Errorf("failed to fetch onRamp addresses: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      routerAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		OnRampAddresses: addresses,
	}, nil
}

// nRampAddressMap represents a map of destination chain selectors to their on-ramp addresses.
// This type aligns with the on-chain data structure for on-ramp address mappings.
type onRampAddressMap map[uint64]*address.Address

// Fetch retrieves all on-ramp addresses for destination chains from the router contract.
func (o *onRampAddressMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, routerAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, routerAddr, destChainsGetter)
	if err != nil {
		return err
	}

	selectorSlice := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(onRampAddressMap)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			res, e := client.RunGetMethod(egCtx, block, routerAddr, onRampGetter, dest)
			if e != nil {
				return fmt.Errorf("error getting onrampAddr: %w", e)
			}

			onRampSlice, e := res.Slice(0)
			if e != nil {
				return e
			}

			onRampAddr, e := onRampSlice.LoadAddr()
			if e != nil {
				return fmt.Errorf("failed to load onramp address: %w", e)
			}

			lock.Lock()
			onRampAddrMap[dest] = onRampAddr
			lock.Unlock()
			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		return err
	}

	*o = onRampAddrMap
	return nil
}
