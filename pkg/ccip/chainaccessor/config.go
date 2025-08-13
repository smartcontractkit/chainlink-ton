package chainaccessor

import (
	"context"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

func addrToBytes(addr *address.Address) []byte {
	rawAddr := codec.ToRawAddr(addr)
	return rawAddr[:]
}

// TODO: commit/exec latest ocr config

func (a *TONAccessor) getOffRampStaticConfig(ctx context.Context) (ccipocr3.OffRampStaticChainConfig, error) {
	return ccipocr3.OffRampStaticChainConfig{
		ChainSelector:        0,
		GasForCallExactCheck: 0,
		RmnRemote:            []byte{},
		TokenAdminRegistry:   []byte{},
		NonceManager:         []byte{},
	}, nil
}

func (a *TONAccessor) getOffRampDynamicConfig(ctx context.Context) (ccipocr3.OffRampDynamicChainConfig, error) {
	return ccipocr3.OffRampDynamicChainConfig{
		FeeQuoter:                               []byte{},
		PermissionLessExecutionThresholdSeconds: 0,
		IsRMNVerificationDisabled:               true,
		MessageInterceptor:                      []byte{},
	}, nil
}

func (a *TONAccessor) getFeeQuoterStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.FeeQuoterStaticConfig, error) {
	addr, exists := a.bindings[consts.ContractNameFeeQuoter]
	if !exists {
		return ccipocr3.FeeQuoterStaticConfig{}, ErrNoBindings
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

func (a *TONAccessor) getOnRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OnRampDynamicConfig, error) {
	addr, exists := a.bindings[consts.ContractNameOnRamp]
	if !exists {
		return ccipocr3.OnRampDynamicConfig{}, ErrNoBindings
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

func (a *TONAccessor) getOnRampDestChainConfig(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, exists := a.bindings[consts.ContractNameOnRamp]
	if !exists {
		return ccipocr3.OnRampDestChainConfig{}, ErrNoBindings
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

func (a *TONAccessor) getCurseInfo(_ context.Context, _ *ton.BlockIDExt) (ccipocr3.CurseInfo, error) {
	return ccipocr3.CurseInfo{
		CursedSourceChains: map[ccipocr3.ChainSelector]bool{},
		CursedDestination:  false,
		GlobalCurse:        false,
	}, nil
}
