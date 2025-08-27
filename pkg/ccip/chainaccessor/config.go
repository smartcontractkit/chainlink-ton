package chainaccessor

import (
	"context"
	"errors"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

// Note: This file contains contract configuration related methods for the TON accessor

// addrToBytes converts a TON address to raw bytes format
func addrToBytes(addr *address.Address) []byte {
	rawAddr := codec.ToRawAddr(addr)
	return rawAddr[:]
}

// getOffRampStaticConfig retrieves static configuration for the off-ramp contract
func (a *TONAccessor) getOffRampStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OffRampStaticChainConfig, error) {
	return ccipocr3.OffRampStaticChainConfig{
		ChainSelector:        0,
		GasForCallExactCheck: 0,
		RmnRemote:            []byte{},
		TokenAdminRegistry:   []byte{},
		NonceManager:         []byte{},
	}, nil
}

// getOffRampDynamicConfig retrieves dynamic configuration for the off-ramp contract
func (a *TONAccessor) getOffRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OffRampDynamicChainConfig, error) {
	return ccipocr3.OffRampDynamicChainConfig{
		FeeQuoter:                               []byte{},
		PermissionLessExecutionThresholdSeconds: 0,
		IsRMNVerificationDisabled:               true,
		MessageInterceptor:                      []byte{},
	}, nil
}

// getOffRampSourceChainConfigs retrieves source chain configurations from the off-ramp contract
func (a *TONAccessor) getOffRampSourceChainConfigs(ctx context.Context, block *ton.BlockIDExt, sourceChainSelectors []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, err
	}
	var sourceChainConfigs = make(map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, len(sourceChainSelectors))
	// TODO: check how much data we can return, if this can potentially be too big for a single RPC call
	result, err := a.client.RunGetMethod(ctx, block, addr, "allSourceChainConfigs")
	if err != nil {
		return nil, err
	}
	rawDict, err := result.Cell(0)
	if err != nil {
		return nil, err
	}
	dict := rawDict.AsDict(64)
	for _, selector := range sourceChainSelectors {
		key := cell.BeginCell().MustStoreUInt(uint64(selector), 64).EndCell()
		entry, err := dict.LoadValue(key)
		if errors.Is(err, cell.ErrNoSuchKeyInDict) {
			continue
		}
		if err != nil {
			return nil, err
		}
		var config offramp.SourceChainConfig
		if err := tlb.LoadFromCell(config, entry); err != nil {
			return nil, err
		}
		sourceChainConfigs[selector] = ccipocr3.SourceChainConfig{
			Router:                    addrToBytes(config.Router),
			IsEnabled:                 config.IsEnabled,
			IsRMNVerificationDisabled: config.IsRMNVerificationDisabled,
			MinSeqNr:                  config.MinSeqNr,
			OnRamp:                    ccipocr3.UnknownAddress(config.OnRamp),
		}
	}
	return sourceChainConfigs, nil
}

// getFeeQuoterStaticConfig retrieves static configuration from the fee quoter contract
func (a *TONAccessor) getFeeQuoterStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.FeeQuoterStaticConfig, error) {
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "staticConfig")
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	var cfg feequoter.StaticConfig
	if err := cfg.FromResult(result); err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	return ccipocr3.FeeQuoterStaticConfig{
		MaxFeeJuelsPerMsg:  ccipocr3.NewBigInt(cfg.MaxFeeJuelsPerMsg),
		LinkToken:          addrToBytes(cfg.LinkToken),
		StalenessThreshold: cfg.StalenessThreshold,
	}, nil
}

// getOnRampDynamicConfig retrieves dynamic configuration from the on-ramp contract
func (a *TONAccessor) getOnRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OnRampDynamicConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "dynamicConfig")
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	var cfg onramp.DynamicConfig
	if err := cfg.FromResult(result); err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	return ccipocr3.OnRampDynamicConfig{
		FeeQuoter:              addrToBytes(cfg.FeeQuoter),
		ReentrancyGuardEntered: false,
		MessageInterceptor:     []byte{}, // TODO: unimplemented on TON?
		FeeAggregator:          addrToBytes(cfg.FeeAggregator),
		AllowListAdmin:         addrToBytes(cfg.AllowListAdmin),
	}, nil
}

// getOnRampDestChainConfig retrieves destination chain configuration from the on-ramp contract
func (a *TONAccessor) getOnRampDestChainConfig(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "destChainConfig", dest)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	var cfg onramp.DestChainConfig
	if err := cfg.FromResult(result); err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	return ccipocr3.OnRampDestChainConfig{
		SequenceNumber:   cfg.SequenceNumber,
		AllowListEnabled: cfg.AllowListEnabled,
		Router:           addrToBytes(cfg.Router),
	}, nil
}

// getCurseInfo retrieves curse information for RMN verification
func (a *TONAccessor) getCurseInfo(_ context.Context, _ *ton.BlockIDExt) (ccipocr3.CurseInfo, error) {
	return ccipocr3.CurseInfo{
		CursedSourceChains: map[ccipocr3.ChainSelector]bool{},
		CursedDestination:  false,
		GlobalCurse:        false,
	}, nil
}
