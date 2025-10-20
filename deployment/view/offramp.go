package view

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

const latestPriceSequenceNumberGetter = "latestPriceSequenceNumber"

type OffRampView struct {
	MetaData
	LatestPriceSequenceNumber uint64                              `json:"latestPriceSequenceNumber,omitempty"`
	Config                    OffRampConfig                       `json:"Config,omitempty"`
	SourceChainConfigs        map[uint64]OffRampSourceChainConfig `json:"sourceChainConfigs,omitempty"`
}

type OffRampSourceChainConfig struct {
	Router                    string `json:"router,omitempty"`
	IsEnabled                 bool   `json:"isEnabled,omitempty"`
	MinSeqNr                  uint64 `json:"minSeqNr,omitempty"`
	IsRMNVerificationDisabled bool   `json:"isRMNVerificationDisabled,omitempty"`
	OnRamp                    string `json:"onRamp,omitempty"`
}

type OffRampConfig struct {
	FeeQuoter                               string `json:"feeQuoter,omitempty"`
	ChainSelector                           uint64 `json:"chainSelector,omitempty"`
	PermissionlessExecutionThresholdSeconds uint32 `json:"permissionlessExecutionThresholdSeconds,omitempty"`
}

// FetchOffRampView generates a view of the offramp contract at the specified block.
func FetchOffRampView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (*OffRampView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var offRampConfig offramp.Config
	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, configGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting offRamp config: %v", err)
	}

	if err = offRampConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse offRamp config: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, latestPriceSequenceNumberGetter)
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

	return &OffRampView{
		MetaData: MetaData{
			Address:      offRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		LatestPriceSequenceNumber: latestSeqNumInt.Uint64(),
		Config: OffRampConfig{
			ChainSelector:                           offRampConfig.ChainSelector,
			FeeQuoter:                               offRampConfig.FeeQuoterAddress.String(),
			PermissionlessExecutionThresholdSeconds: offRampConfig.PermissionlessExecutionThresholdSeconds,
		},
		SourceChainConfigs: sourceChainConfigs,
	}, nil
}

// fetchSrcChainConfig retrieves source chain configurations from the off-ramp contract.
func fetchSrcChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (map[uint64]OffRampSourceChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, destChainsGetter)
	if err != nil {
		return nil, err
	}

	chainSelectors := parseExecutionResultForDestChainSelectors(result.AsTuple())
	var eg errgroup.Group
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]OffRampSourceChainConfig)
	var mut sync.Mutex
	for _, destChain := range chainSelectors {
		dest := destChain // capture loop variable
		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, srcChainConfigGetter, dest)
			if err != nil {
				return err
			}
			var cfg offramp.SourceChainConfig
			if err = cfg.FromResult(result); err != nil {
				return err
			}

			mut.Lock()
			output[dest] = OffRampSourceChainConfig{
				Router:                    cfg.Router.String(),
				IsEnabled:                 cfg.IsEnabled,
				MinSeqNr:                  cfg.MinSeqNr,
				IsRMNVerificationDisabled: cfg.IsRMNVerificationDisabled,
				OnRamp:                    string(cfg.OnRamp),
			}
			mut.Unlock()

			return nil
		})
	}

	return output, eg.Wait()
}
