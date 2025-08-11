package chainaccessor

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/xssnick/tonutils-go/address"
)

// TEMP: waiting on https://github.com/xssnick/tonutils-go/pull/346
func addrToBytes(addr *address.Address) []byte {
	codec := codec.AddressCodec{}
	raw, err := codec.AddressStringToBytes(addr.String())
	if err != nil {
		panic(err) // address.Address is always valid
	}
	return raw
}

// TODO: commit/exec latest ocr config

// TODO: optimize implementation by providing queries that return both static+dynamic together

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
		IsRMNVerificationDisabled:               false,
		MessageInterceptor:                      []byte{},
	}, nil
}

func (a *TONAccessor) getRMNRemoteConfig(ctx context.Context) (ccipocr3.RMNRemoteConfig, error) {
	return ccipocr3.RMNRemoteConfig{
		DigestHeader:    ccipocr3.RMNDigestHeader{},
		VersionedConfig: ccipocr3.VersionedConfig{},
	}, nil
}

func (a *TONAccessor) getFeeQuoterStaticConfig(ctx context.Context) (ccipocr3.FeeQuoterStaticConfig, error) {
	addr, ok := a.bindings[consts.ContractNameFeeQuoter]
	if !ok {
		return ccipocr3.FeeQuoterStaticConfig{}, errors.New("FeeQuoter not bound")
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "staticConfig")
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	// Parse results
	maxFeeJuelsPerMsg, err := result.Int(0)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	linkTokenAddressSlice, err := result.Slice(1)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	linkTokenAddress, err := linkTokenAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	tokenPriceStalenessThreshold, err := result.Int(2)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	return ccipocr3.FeeQuoterStaticConfig{
		MaxFeeJuelsPerMsg:  ccipocr3.NewBigInt(maxFeeJuelsPerMsg),
		LinkToken:          addrToBytes(linkTokenAddress),
		StalenessThreshold: uint32(tokenPriceStalenessThreshold.Uint64()),
	}, nil
}

func (a *TONAccessor) getOnRampDynamicConfig(ctx context.Context) (ccipocr3.OnRampDynamicConfig, error) {
	addr, ok := a.bindings[consts.ContractNameOnRamp]
	if !ok {
		return ccipocr3.OnRampDynamicConfig{}, errors.New("OnRamp not bound")
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "dynamicConfig")
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	// Parse results
	feeQuoterAddressSlice, err := result.Slice(0)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	feeAggregatorAddressSlice, err := result.Slice(1)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	feeAggregatorAddress, err := feeAggregatorAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	allowlistAdminAddressSlice, err := result.Slice(2)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	allowlistAdminAddress, err := allowlistAdminAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	// TODO: convert addresses to byte slices
	return ccipocr3.OnRampDynamicConfig{
		FeeQuoter:              addrToBytes(feeQuoterAddress),
		ReentrancyGuardEntered: false,
		MessageInterceptor:     []byte{}, // TODO: unimplemented on TON?
		FeeAggregator:          addrToBytes(feeAggregatorAddress),
		AllowListAdmin:         addrToBytes(allowlistAdminAddress),
	}, nil
}

func (a *TONAccessor) getOnRampDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, ok := a.bindings[consts.ContractNameOnRamp]
	if !ok {
		return ccipocr3.OnRampDestChainConfig{}, errors.New("OnRamp not bound")
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "destChainConfig", dest)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	routerAddressSlice, err := result.Slice(0)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	routerAddress, err := routerAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	seqNum, err := result.Int(1)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	allowlistEnabledInt, err := result.Int(2)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}
	allowlistEnabled := allowlistEnabledInt.Cmp(big.NewInt(1)) == 0
	// skip parsing allowedSenders
	return ccipocr3.OnRampDestChainConfig{
		SequenceNumber:   seqNum.Uint64(),
		AllowListEnabled: allowlistEnabled,
		Router:           addrToBytes(routerAddress),
	}, nil
}

func (a *TONAccessor) getRouterConfig(_ context.Context) (ccipocr3.RouterConfig, error) {
	// TODO: confirm address.NewAddressNone == zero address if fully written out (0:00000..)
	return ccipocr3.RouterConfig{
		// Similar to Aptos, TON has no wrapped native, so we treat zero address as the native fee token
		WrappedNativeAddress: addrToBytes(address.NewAddressNone()),
	}, nil
}

// curseinfo (empty for now)
