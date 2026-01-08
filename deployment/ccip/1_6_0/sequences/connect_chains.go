package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	toncodec "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	"github.com/smartcontractkit/mcms/types"
)

func (a *TonAdapter) ConfigureLaneLegAsSource() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsSource
}

func (a *TonAdapter) ConfigureLaneLegAsDest() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsDest
}

// TODO: this product level API is designed to always plan and return output.BatchOps
var ConfigureLaneLegAsSource = operations.NewSequence(
	"ConfigureLaneLegAsSource",
	semver.MustParse("1.6.0"),
	"Configures lane leg as source on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		chainSelector := input.Source.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDepsFrom(tonChain, input.Source.OnRamp, input.Source.OffRamp, input.Source.Router, input.Source.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		ctx := b.GetContext()
		walletAddr := tonChain.Wallet.Address()

		feeQuoterAddr := deps.CCIPOnChainState[chainSelector].FeeQuoter
		onRampAddr := deps.CCIPOnChainState[chainSelector].OnRamp
		routerAddr := deps.CCIPOnChainState[chainSelector].Router

		opDeps := opston.SendMessagesDeps{Wallet: tonChain.Wallet}
		out := sequences.OnChainOutput{}

		// 1. Update FeeQuoter dest chain configs
		feeQuoterDestUpdate := buildFeeQuoterDestChainConfig(input)
		b.Logger.Infow("Updating destination configs on FeeQuoter", "update", feeQuoterDestUpdate)
		feeQuoterDestEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &feeQuoterDestUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap fee quoter dest config: %w", err)
		}

		feeQuoterPlan, err := opston.ShouldPlanOperation(ctx, tonChain.Client, &feeQuoterAddr, walletAddr)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to determine if planning is needed for fee quoter: %w", err)
		}

		feeQuoterDestConfigResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &feeQuoterAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    feeQuoterDestEnvelope,
				},
			},
			Plan: feeQuoterPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update fee quoter dest configs: %w", err)
		}

		out, err = withOperationOutput(out, feeQuoterDestConfigResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".FeeQuoter", Tags: []string{"UpdateDestChainConfigs"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process fee quoter dest config output: %w", err)
		}

		// 2. Update OnRamp dest chain configs
		onRampDestUpdate := buildOnRampDestChainConfig(input, deps, chainSelector)
		b.Logger.Infow("Updating destination configs on OnRamp", "update", onRampDestUpdate)
		onRampEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".OnRamp", &onRampDestUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap onramp config: %w", err)
		}

		onRampPlan, err := opston.ShouldPlanOperation(ctx, tonChain.Client, &onRampAddr, walletAddr)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to determine if planning is needed for onramp: %w", err)
		}

		onRampDestConfigResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &onRampAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    onRampEnvelope,
				},
			},
			Plan: onRampPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update onramp dest configs: %w", err)
		}

		out, err = withOperationOutput(out, onRampDestConfigResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".OnRamp", Tags: []string{"UpdateDestChainConfigs"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process onramp dest config output: %w", err)
		}

		// 3. Update FeeQuoter prices (reuse feeQuoterPlan from step 1)
		feeQuoterPrices := buildFeeQuoterPrices(input)
		b.Logger.Infow("Updating prices on FeeQuoter", "update", feeQuoterPrices)
		pricesEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &feeQuoterPrices)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap fee quoter prices: %w", err)
		}

		feeQuoterPricesResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &feeQuoterAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    pricesEnvelope,
				},
			},
			Plan: feeQuoterPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update fee quoter prices: %w", err)
		}

		out, err = withOperationOutput(out, feeQuoterPricesResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".FeeQuoter", Tags: []string{"UpdatePrices"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process fee quoter prices output: %w", err)
		}

		// 4. Update Router with onramps
		routerUpdate, err := buildRouterOnRampUpdate(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to build router update: %w", err)
		}
		b.Logger.Infow("Updating Router Onramps", "update", routerUpdate)
		routerEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".Router", &routerUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap router update: %w", err)
		}

		routerPlan, err := opston.ShouldPlanOperation(ctx, tonChain.Client, &routerAddr, walletAddr)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to determine if planning is needed for router: %w", err)
		}

		routerResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &routerAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    routerEnvelope,
				},
			},
			Plan: routerPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router onramps: %w", err)
		}

		out, err = withOperationOutput(out, routerResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".Router", Tags: []string{"ApplyRampUpdates"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process router output: %w", err)
		}

		return out, nil
	},
)

// ConfigureLaneLegAsDest configures lane leg as dest on CCIP 1.6.0
var ConfigureLaneLegAsDest = operations.NewSequence(
	"ConfigureLaneLegAsDest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		chainSelector := input.Dest.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDepsFrom(tonChain, input.Dest.OnRamp, input.Dest.OffRamp, input.Dest.Router, input.Dest.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		ctx := b.GetContext()
		walletAddr := tonChain.Wallet.Address()

		offRampAddr := deps.CCIPOnChainState[chainSelector].OffRamp
		routerAddr := deps.CCIPOnChainState[chainSelector].Router

		opDeps := opston.SendMessagesDeps{Wallet: tonChain.Wallet}
		out := sequences.OnChainOutput{}

		// 1. Update OffRamp source chain configs
		offRampUpdate := buildOffRampSourceConfig(input, &routerAddr)
		b.Logger.Infow("Updating source configs on OffRamp", "update", offRampUpdate)
		offRampEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".OffRamp", &offRampUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap offramp config: %w", err)
		}

		offRampPlan, err := opston.ShouldPlanOperation(ctx, tonChain.Client, &offRampAddr, walletAddr)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to determine if planning is needed for offramp: %w", err)
		}

		offRampResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &offRampAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    offRampEnvelope,
				},
			},
			Plan: offRampPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp source configs: %w", err)
		}

		out, err = withOperationOutput(out, offRampResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".OffRamp", Tags: []string{"UpdateSourceChainConfigs"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process offramp output: %w", err)
		}

		// 2. Update Router with offramps
		routerUpdate, err := buildRouterOffRampUpdate(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to build router update: %w", err)
		}
		b.Logger.Infow("Updating Router OffRamps", "update", routerUpdate)
		routerEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".Router", &routerUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap router update: %w", err)
		}

		routerPlan, err := opston.ShouldPlanOperation(ctx, tonChain.Client, &routerAddr, walletAddr)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to determine if planning is needed for router: %w", err)
		}

		routerResult, err := operations.ExecuteOperation(b, opston.SendMessages, opDeps, opston.SendMessagesInput{
			Messages: []opston.InternalMessage[any]{
				{
					Bounce:  true,
					DstAddr: &routerAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Body:    routerEnvelope,
				},
			},
			Plan: routerPlan,
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router offramps: %w", err)
		}

		out, err = withOperationOutput(out, routerResult.Output, types.ChainSelector(chainSelector), []types.OperationMetadata{
			{ContractType: bindings.PkgCCIP + ".Router", Tags: []string{"ApplyRampUpdates"}},
		})
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to process router output: %w", err)
		}

		return out, nil
	},
)

///////////////
/// Builders ///
///////////////

func buildFeeQuoterDestChainConfig(input lanes.UpdateLanesInput) feequoter.UpdateDestChainConfigs {
	return feequoter.UpdateDestChainConfigs{
		Updates: []feequoter.UpdateDestChainConfig{
			{
				DestinationChainSelector: input.Dest.Selector,
				DestChainConfig: feequoter.DestChainConfig{
					IsEnabled:                         input.Dest.FeeQuoterDestChainConfig.IsEnabled,
					MaxNumberOfTokensPerMsg:           input.Dest.FeeQuoterDestChainConfig.MaxNumberOfTokensPerMsg,
					MaxDataBytes:                      input.Dest.FeeQuoterDestChainConfig.MaxDataBytes,
					MaxPerMsgGasLimit:                 input.Dest.FeeQuoterDestChainConfig.MaxPerMsgGasLimit,
					DestGasOverhead:                   input.Dest.FeeQuoterDestChainConfig.DestGasOverhead,
					DestGasPerPayloadByteBase:         input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteBase,
					DestGasPerPayloadByteHigh:         input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteHigh,
					DestGasPerPayloadByteThreshold:    input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteThreshold,
					DestDataAvailabilityOverheadGas:   input.Dest.FeeQuoterDestChainConfig.DestDataAvailabilityOverheadGas,
					DestGasPerDataAvailabilityByte:    input.Dest.FeeQuoterDestChainConfig.DestGasPerDataAvailabilityByte,
					DestDataAvailabilityMultiplierBps: input.Dest.FeeQuoterDestChainConfig.DestDataAvailabilityMultiplierBps,
					ChainFamilySelector:               input.Dest.FeeQuoterDestChainConfig.ChainFamilySelector,
					DefaultTokenFeeUsdCents:           input.Dest.FeeQuoterDestChainConfig.DefaultTokenFeeUSDCents,
					DefaultTokenDestGasOverhead:       input.Dest.FeeQuoterDestChainConfig.DefaultTokenDestGasOverhead,
					DefaultTxGasLimit:                 input.Dest.FeeQuoterDestChainConfig.DefaultTxGasLimit,
					GasMultiplierWeiPerEth:            input.Dest.FeeQuoterDestChainConfig.GasMultiplierWeiPerEth,
					GasPriceStalenessThreshold:        input.Dest.FeeQuoterDestChainConfig.GasPriceStalenessThreshold,
					NetworkFeeUsdCents:                input.Dest.FeeQuoterDestChainConfig.NetworkFeeUSDCents,
				},
			},
		},
	}
}

func buildOnRampDestChainConfig(input lanes.UpdateLanesInput, deps config.CCIPDeps, chainSelector uint64) onramp.UpdateDestChainConfigsMessage {
	routerAddr := deps.CCIPOnChainState[chainSelector].Router
	return onramp.UpdateDestChainConfigsMessage{
		Updates: []onramp.UpdateDestChainConfig{
			{
				DestinationChainSelector: input.Dest.Selector,
				Router:                   &routerAddr,
				AllowListEnabled:         input.Dest.AllowListEnabled,
			},
		},
	}
}

func buildFeeQuoterPrices(input lanes.UpdateLanesInput) feequoter.UpdatePrices {
	tokenPrices := make([]feequoter.TokenPriceUpdate, 0, len(input.Source.TokenPrices))
	for tokenAddr, price := range input.Source.TokenPrices {
		addr, err := address.ParseAddr(tokenAddr)
		if err != nil {
			// Skip invalid addresses
			continue
		}
		tokenPrices = append(tokenPrices, feequoter.TokenPriceUpdate{
			SourceToken: addr,
			UsdPerToken: price,
		})
	}

	return feequoter.UpdatePrices{
		TokenPrices: tokenPrices,
		GasPrices: []feequoter.GasPriceUpdate{
			{
				DestChainSelector:        input.Dest.Selector,
				ExecutionGasPrice:        input.Dest.GasPrice,
				DataAvailabilityGasPrice: input.Dest.GasPrice,
			},
		},
		SendExcessesTo: nil, // Use default
	}
}

func buildOffRampSourceConfig(input lanes.UpdateLanesInput, routerAddr *address.Address) offramp.UpdateSourceChainConfigs {
	return offramp.UpdateSourceChainConfigs{
		Configs: []offramp.UpdateSourceChainConfig{
			{
				SourceChainSelector: input.Source.Selector,
				Config: offramp.SourceChainConfig{
					Router:                    routerAddr,
					IsEnabled:                 !input.IsDisabled,
					IsRMNVerificationDisabled: !input.Source.RMNVerificationEnabled,
					OnRamp:                    input.Source.OnRamp,
				},
			},
		},
	}
}

func buildRouterOnRampUpdate(input lanes.UpdateLanesInput) (router.ApplyRampUpdates, error) {
	onRampAddr, err := codec.AddressBytesToTONAddress(input.Source.OnRamp)
	if err != nil {
		return router.ApplyRampUpdates{}, fmt.Errorf("failed to convert onramp address: %w", err)
	}

	return router.ApplyRampUpdates{
		QueryID: 0,
		OnRampUpdates: &router.OnRamps{
			DestChainSelectors: []router.ChainSelector{
				{Value: input.Dest.Selector},
			},
			OnRamps: onRampAddr,
		},
	}, nil
}

func buildRouterOffRampUpdate(input lanes.UpdateLanesInput) (router.ApplyRampUpdates, error) {
	offRampAddr, err := codec.AddressBytesToTONAddress(input.Dest.OffRamp)
	if err != nil {
		return router.ApplyRampUpdates{}, fmt.Errorf("failed to convert offramp address: %w", err)
	}

	return router.ApplyRampUpdates{
		QueryID: 0,
		OffRampAdds: &router.OffRamps{
			SourceChainSelectors: []router.ChainSelector{
				{Value: input.Source.Selector},
			},
			OffRamp: offRampAddr,
		},
		OffRampRemoves: nil,
	}, nil
}
