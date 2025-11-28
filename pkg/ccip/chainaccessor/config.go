package chainaccessor

import (
	"context"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	configfetcher "github.com/smartcontractkit/chainlink-ton/pkg/ccip/common"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

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

func parseOCR3Config(config *offramp.OCR3Config) (ccipocr3.OCRConfig, error) {
	if config == nil {
		return ccipocr3.OCRConfig{}, nil
	}

	var configDigest ccipocr3.Bytes32
	copy(configDigest[:], config.ConfigInfo.ConfigDigest)

	entries, err := config.Signers.LoadAll()
	if err != nil {
		return ccipocr3.OCRConfig{}, fmt.Errorf("load signers: %w", err)
	}

	signers := make([][]byte, 0, len(entries))
	for _, entry := range entries {
		signer, err1 := entry.Key.LoadSlice(256)
		if err1 != nil {
			return ccipocr3.OCRConfig{}, fmt.Errorf("decode signer: %w", err1)
		}
		signers = append(signers, signer)
	}

	entries, err = config.Transmitters.LoadAll()
	if err != nil {
		return ccipocr3.OCRConfig{}, fmt.Errorf("load transmitters: %w", err)
	}
	transmitters := make([][]byte, 0, len(entries))
	for _, entry := range entries {
		transmitter, err1 := entry.Key.LoadAddr()
		if err1 != nil {
			return ccipocr3.OCRConfig{}, fmt.Errorf("decode transmitter addr: %w", err1)
		}
		transmitters = append(transmitters, addrToBytes(transmitter))
	}

	return ccipocr3.OCRConfig{
		ConfigInfo: ccipocr3.ConfigInfo{
			ConfigDigest:                   configDigest,
			F:                              config.ConfigInfo.F,
			N:                              config.ConfigInfo.N,
			IsSignatureVerificationEnabled: config.ConfigInfo.IsSignatureVerificationEnabled,
		},
		Signers:      signers,
		Transmitters: transmitters,
	}, nil
}

func (a *TONAccessor) parseOCR3Base(ocr3Base offramp.OCR3Base) (commitConfig ccipocr3.OCRConfig, execConfig ccipocr3.OCRConfig, err error) {
	commitConfig, err = parseOCR3Config(ocr3Base.Commit)
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}

	execConfig, err = parseOCR3Config(ocr3Base.Execute)
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}
	return commitConfig, execConfig, nil
}

// GetOffRampConfig retrieves static configuration for the off-ramp contract
func (a *TONAccessor) GetOffRampConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OfframpConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	var config offramp.Config
	if err = config.FetchResult(ctx, a.client, block, addr, nil); err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	var ocr3Base offramp.OCR3Base
	err = ocr3Base.FetchResult(ctx, a.client, block, addr, nil)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	commitConfig, execConfig, err := a.parseOCR3Base(ocr3Base)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	return ccipocr3.OfframpConfig{
		CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{OCRConfig: commitConfig},
		ExecLatestOCRConfig:   ccipocr3.OCRConfigResponse{OCRConfig: execConfig},
		StaticConfig: ccipocr3.OffRampStaticChainConfig{
			ChainSelector:        ccipocr3.ChainSelector(config.ChainSelector),
			GasForCallExactCheck: 0,
			RmnRemote:            nil, // TODO:
			TokenAdminRegistry:   nil, // TODO:
			NonceManager:         nil,
		},
		DynamicConfig: ccipocr3.OffRampDynamicChainConfig{
			FeeQuoter:                               addrToBytes(config.FeeQuoterAddress),
			PermissionLessExecutionThresholdSeconds: config.PermissionlessExecutionThresholdSeconds,
			IsRMNVerificationDisabled:               true,
			MessageInterceptor:                      nil,
		},
	}, nil
}

// GetOffRampSourceChainConfigs retrieves multiple source chain configurations from the off-ramp contract
func (a *TONAccessor) GetOffRampSourceChainConfigs(ctx context.Context, block *ton.BlockIDExt, sourceChainSelectors []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, err
	}

	var sourceChainConfigs = make(map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, len(sourceChainSelectors))
	sourceConfigsGot, err := configfetcher.FetchOffRampSrcChainConfig(ctx, a.client, block, addr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source chain configs: %w", err)
	}

	// if the dictionary is empty, we get back nil
	if len(sourceConfigsGot) == 0 {
		return nil, nil
	}

	if len(sourceChainConfigs) == 0 {
		// if no selectors specified, return all configs
		for selector, config := range sourceConfigsGot {
			sourceChainConfigs[ccipocr3.ChainSelector(selector)] = sourceChainConfigToGeneric(config)
		}
	} else {
		for _, selector := range sourceChainSelectors {
			config, ok := sourceConfigsGot[uint64(selector)]
			if !ok {
				return nil, fmt.Errorf("source chain selector '%d' not found in off-ramp source chain configs, got %v", selector, sourceConfigsGot)
			}
			sourceChainConfigs[selector] = sourceChainConfigToGeneric(config)
		}
	}

	return sourceChainConfigs, nil
}

// GetOffRampSourceChainConfig retrieves a specific source chain configuration
func (a *TONAccessor) GetOffRampSourceChainConfig(ctx context.Context, block *ton.BlockIDExt, sourceChainSelector ccipocr3.ChainSelector) (ccipocr3.SourceChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.SourceChainConfig{}, err
	}

	var config offramp.SourceChainConfig
	opts := []interface{}{uint64(sourceChainSelector)}
	err = config.FetchResult(ctx, a.client, block, addr, opts)
	if err != nil {
		// Handle ERROR_SOURCE_CHAIN_NOT_ENABLED=266 case for non-existent source chain
		var execError ton.ContractExecError
		if errors.As(err, &execError) && execError.Code == 266 {
			a.lggr.Debugw("source chain not enabled", "chainSelector", sourceChainSelector)
			return ccipocr3.SourceChainConfig{}, fmt.Errorf("%s not enabled", sourceChainSelector)
		}
		return ccipocr3.SourceChainConfig{}, err
	}

	return sourceChainConfigToGeneric(config), nil
}

// sourceChainConfigToGeneric converts from offramp.SourceChainConfig to ccipocr3.SourceChainConfig
func sourceChainConfigToGeneric(config offramp.SourceChainConfig) ccipocr3.SourceChainConfig {
	return ccipocr3.SourceChainConfig{
		Router:                    addrToBytes(config.Router),
		IsEnabled:                 config.IsEnabled,
		IsRMNVerificationDisabled: config.IsRMNVerificationDisabled,
		MinSeqNr:                  config.MinSeqNr,
		OnRamp:                    ccipocr3.UnknownAddress(config.OnRamp),
	}
}

// GetFeeQuoterStaticConfig retrieves static configuration from the fee quoter contract
func (a *TONAccessor) GetFeeQuoterStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.FeeQuoterStaticConfig, error) {
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	var cfg feequoter.StaticConfig
	if err = cfg.FetchResult(ctx, a.client, block, addr, nil); err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	return ccipocr3.FeeQuoterStaticConfig{
		MaxFeeJuelsPerMsg:  ccipocr3.NewBigInt(cfg.MaxFeeJuelsPerMsg),
		LinkToken:          addrToBytes(cfg.LinkToken),
		StalenessThreshold: cfg.StalenessThreshold,
	}, nil
}

// GetOnRampDynamicConfig retrieves dynamic configuration from the on-ramp contract
func (a *TONAccessor) GetOnRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OnRampDynamicConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	var cfg onramp.DynamicConfig
	if err = cfg.FetchResult(ctx, a.client, block, addr, nil); err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	return ccipocr3.OnRampDynamicConfig{
		FeeQuoter:              addrToBytes(cfg.FeeQuoter),
		ReentrancyGuardEntered: false,
		MessageInterceptor:     []byte{}, // unimplemented on TON
		FeeAggregator:          addrToBytes(cfg.FeeAggregator),
		AllowListAdmin:         addrToBytes(cfg.AllowListAdmin),
	}, nil
}

// GetOnRampDestChainConfig retrieves destination chain configuration from the on-ramp contract
func (a *TONAccessor) GetOnRampDestChainConfig(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}

	var cfg onramp.DestChainConfig
	opts := []interface{}{uint64(dest)}
	if err = cfg.FetchResult(ctx, a.client, block, addr, opts); err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}

	return ccipocr3.OnRampDestChainConfig{
		SequenceNumber:   cfg.SequenceNumber,
		AllowListEnabled: cfg.AllowListEnabled,
		Router:           addrToBytes(cfg.Router),
	}, nil
}

// GetCurseInfo retrieves curse information for RMN verification
func (a *TONAccessor) GetCurseInfo(_ context.Context, _ *ton.BlockIDExt) (ccipocr3.CurseInfo, error) {
	return ccipocr3.CurseInfo{
		CursedSourceChains: map[ccipocr3.ChainSelector]bool{},
		CursedDestination:  false,
		GlobalCurse:        false,
	}, nil
}
