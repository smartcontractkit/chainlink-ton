package onramp

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

const (
	dynamicConfigGetter = "dynamicConfig"
)

// View represents a view of the on-ramp contract configuration.
type View struct {
	view.MetaData
	ChainSelector   uint64                     `json:"chainSelector,omitempty"`
	DynamicConfig   DynamicConfig              `json:"dynamicConfig,omitempty"`
	DestChainConfig map[uint64]DestChainConfig `json:"feeQuoterDestChainConfig,omitempty"`
}

type DynamicConfig struct {
	FeeQuoter      string
	FeeAggregator  string
	AllowListAdmin string
}

type DestChainConfig struct {
	SequenceNumber   uint64          `json:"sequenceNumber,omitempty"`
	AllowlistEnabled bool            `json:"allowlistEnabled,omitempty"`
	Router           string          `json:"router,omitempty"`
	AllowedSenders   map[string]bool `json:"allowedSenders,omitempty"`
}

// FetchView generates a view of the on-ramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address, srcSelector uint64) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, onRampAddr, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, onRampAddr, dynamicConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting dynamicConfig: %w", err)
	}

	var dConfig onramp.DynamicConfig
	if err = dConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse dynamicConfig: %w", err)
	}

	destChainConfig, err := fetchDestChainConfig(ctx, c, block, onRampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      onRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		ChainSelector: srcSelector,
		DynamicConfig: DynamicConfig{
			FeeQuoter:      dConfig.FeeQuoter.String(),
			FeeAggregator:  dConfig.FeeAggregator.String(),
			AllowListAdmin: dConfig.AllowListAdmin.String(),
		},
		DestChainConfig: destChainConfig,
	}, nil
}

// fetchDestChainConfig retrieves destination chain configurations from the on-ramp contract.
func fetchDestChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address) (map[uint64]DestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, onRampAddr, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	chainSelectors := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]DestChainConfig)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(egCtx, block, onRampAddr, view.DestChainConfigGetter, dest) // New variables per goroutine
			if err != nil {
				return err
			}
			var cfg onramp.DestChainConfig
			if err = cfg.FromResult(result); err != nil {
				return err
			}

			var allowedSendersDict []cell.DictKV
			allowedSenders := make(map[string]bool)
			allowedSendersDict, err = cfg.AllowedSender.LoadAll()
			if err != nil {
				return fmt.Errorf("failed to load all allowed senders: %w", err)
			}

			var allowed bool
			var senderAddr *address.Address
			for _, senderVal := range allowedSendersDict {
				senderAddr, err = senderVal.Key.LoadAddr()
				if err != nil {
					return fmt.Errorf("failed to load sender address: %w", err)
				}

				allowed, err = senderVal.Value.LoadBoolBit()
				if err != nil {
					return fmt.Errorf("failed to load allowed bool: %w", err)
				}

				allowedSenders[senderAddr.String()] = allowed
			}

			lock.Lock()
			output[dest] = DestChainConfig{
				SequenceNumber:   cfg.SequenceNumber,
				AllowlistEnabled: cfg.AllowListEnabled,
				Router:           cfg.Router.String(),
				AllowedSenders:   allowedSenders,
			}
			lock.Unlock()

			return nil
		})
	}

	return output, eg.Wait()
}
