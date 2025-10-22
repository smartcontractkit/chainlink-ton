package offramp

import (
	"context"
	"encoding/hex"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type View struct {
	view.MetaData
	LatestPriceSequenceNumber uint64                       `json:"latestPriceSequenceNumber,omitempty"`
	Config                    Config                       `json:"Config,omitempty"`
	SourceChainConfigs        map[uint64]SourceChainConfig `json:"sourceChainConfigs,omitempty"`
}

type SourceChainConfig struct {
	Router                    string `json:"router,omitempty"`
	IsEnabled                 bool   `json:"isEnabled,omitempty"`
	MinSeqNr                  uint64 `json:"minSeqNr,omitempty"`
	IsRMNVerificationDisabled bool   `json:"isRMNVerificationDisabled,omitempty"`
	OnRamp                    string `json:"onRamp,omitempty"`
}

type Config struct {
	FeeQuoter                               string `json:"feeQuoter,omitempty"`
	ChainSelector                           uint64 `json:"chainSelector,omitempty"`
	PermissionlessExecutionThresholdSeconds uint32 `json:"permissionlessExecutionThresholdSeconds,omitempty"`
}

// FetchView generates a view of the offramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var offRampConfig offramp.Config
	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, view.ConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting offRamp config: %v", err)
	}

	if err = offRampConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse offRamp config: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, view.LatestPriceSequenceNumberGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting latestPriceSequenceNumber: %v", err)
	}

	latestSeqNumInt, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get latestPriceSequenceNumber: %w", err)
	}

	sourceChainConfigs, err := fetchSrcChainConfig(ctx, c, block, offRampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source chain configs: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      offRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		LatestPriceSequenceNumber: latestSeqNumInt.Uint64(),
		Config: Config{
			ChainSelector:                           offRampConfig.ChainSelector,
			FeeQuoter:                               offRampConfig.FeeQuoterAddress.String(),
			PermissionlessExecutionThresholdSeconds: offRampConfig.PermissionlessExecutionThresholdSeconds,
		},
		SourceChainConfigs: sourceChainConfigs,
	}, nil
}

// fetchSrcChainConfig retrieves source chain configurations from the off-ramp contract.
func fetchSrcChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (map[uint64]SourceChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	var eg errgroup.Group
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(map[uint64]SourceChainConfig)
	chainSelectors := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.SrcChainConfigGetter, dest)
			if err != nil {
				return err
			}
			var cfg offramp.SourceChainConfig
			if err = cfg.FromResult(result); err != nil {
				return err
			}

			var onRampAddr string
			if cfg.OnRamp != nil {
				onRampAddr = hex.EncodeToString(cfg.OnRamp) // note the OnRamp is a cross-chain address that's not necessarily hex encoded
			}

			lock.Lock()
			output[dest] = SourceChainConfig{
				Router:                    cfg.Router.String(),
				IsEnabled:                 cfg.IsEnabled,
				MinSeqNr:                  cfg.MinSeqNr,
				IsRMNVerificationDisabled: cfg.IsRMNVerificationDisabled,
				OnRamp:                    onRampAddr,
			}
			lock.Unlock()
			return nil
		})
	}

	return output, eg.Wait()
}
