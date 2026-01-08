package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
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
	"github.com/xssnick/tonutils-go/address"
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

		messages := make([]opston.InternalMessage[any], 0, 4)

		feeQuoterAddr := deps.CCIPOnChainState[chainSelector].FeeQuoter
		onRampAddr := deps.CCIPOnChainState[chainSelector].OnRamp
		routerAddr := deps.CCIPOnChainState[chainSelector].Router

		// 1. Update FeeQuoter dest chain configs
		feeQuoterDestUpdate := buildFeeQuoterDestChainConfig(input)
		b.Logger.Infow("Updating destination configs on FeeQuoter", "update", feeQuoterDestUpdate)
		feeQuoterDestEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &feeQuoterDestUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap fee quoter dest config: %w", err)
		}
		messages = append(messages, opston.InternalMessage[any]{
			Body:    feeQuoterDestEnvelope,
			DstAddr: &feeQuoterAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

		// 2. Update OnRamp dest chain configs
		onRampDestUpdate := buildOnRampDestChainConfig(input, deps, chainSelector)
		b.Logger.Infow("Updating destination configs on OnRamp", "update", onRampDestUpdate)
		onRampEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".OnRamp", &onRampDestUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap onramp config: %w", err)
		}
		messages = append(messages, opston.InternalMessage[any]{
			Body:    onRampEnvelope,
			DstAddr: &onRampAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

		// 3. Update FeeQuoter prices
		feeQuoterPrices := buildFeeQuoterPrices(input)
		b.Logger.Infow("Updating prices on FeeQuoter", "update", feeQuoterPrices)
		pricesEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &feeQuoterPrices)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap fee quoter prices: %w", err)
		}
		messages = append(messages, opston.InternalMessage[any]{
			Body:    pricesEnvelope,
			DstAddr: &feeQuoterAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

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
		messages = append(messages, opston.InternalMessage[any]{
			Body:    routerEnvelope,
			DstAddr: &routerAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

		seqDeps := opston.AnySequenceDeps{}
		seqDeps[opston.SendMessages.Def().ID] = opston.SendMessagesDeps{Wallet: tonChain.Wallet}

		anySeqInput := opston.AnySequenceInput{
			Defs: []operations.Definition{
				opston.SendMessages.Def(),
			},
			Inputs: []any{
				opston.SendMessagesInput{
					Messages: messages,
					Plan:     false,
				},
			},
		}

		_, err = operations.ExecuteSequence(b, opston.AnySequence, seqDeps, anySeqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to execute sequence: %w", err)
		}

		return sequences.OnChainOutput{}, nil
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

		messages := make([]opston.InternalMessage[any], 0, 2)

		offRampAddr := deps.CCIPOnChainState[chainSelector].OffRamp
		routerAddr := deps.CCIPOnChainState[chainSelector].Router

		// 1. Update OffRamp source chain configs
		offRampUpdate := buildOffRampSourceConfig(input, &routerAddr)
		b.Logger.Infow("Updating source configs on OffRamp", "update", offRampUpdate)
		offRampEnvelope, err := toncodec.WrapMessage[any](bindings.PkgCCIP+".OffRamp", &offRampUpdate)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to wrap offramp config: %w", err)
		}
		messages = append(messages, opston.InternalMessage[any]{
			Body:    offRampEnvelope,
			DstAddr: &offRampAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

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
		messages = append(messages, opston.InternalMessage[any]{
			Body:    routerEnvelope,
			DstAddr: &routerAddr,
			Amount:  tlb.MustFromTON("0.1"),
			Bounce:  true,
		})

		// Execute all messages in a SINGLE transaction via AnySequence
		seqDeps := opston.AnySequenceDeps{}
		seqDeps[opston.SendMessages.Def().ID] = opston.SendMessagesDeps{Wallet: tonChain.Wallet}

		anySeqInput := opston.AnySequenceInput{
			Defs: []operations.Definition{
				opston.SendMessages.Def(),
			},
			Inputs: []any{
				opston.SendMessagesInput{
					Messages: messages,
					Plan:     false,
				},
			},
		}

		_, err = operations.ExecuteSequence(b, opston.AnySequence, seqDeps, anySeqInput)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to execute sequence: %w", err)
		}

		return sequences.OnChainOutput{}, nil
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
