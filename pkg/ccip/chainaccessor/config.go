package chainaccessor

import (
	"context"
	"errors"
	"fmt"

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

func parseOCR3Config(configCell *cell.Cell) (ccipocr3.OCRConfig, error) {
	var config offramp.OCR3Config
	if err := tlb.LoadFromCell(&config, configCell.BeginParse()); err != nil {
		return ccipocr3.OCRConfig{}, fmt.Errorf("load OCR3Config from cell: %w", err)
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

func (a *TONAccessor) getOCR3Config(ctx context.Context, block *ton.BlockIDExt) (commitConfig ccipocr3.OCRConfig, execConfig ccipocr3.OCRConfig, err error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "ocr3Config")
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}

	// commit (index 1)
	isNil, err := result.IsNil(1)
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}
	if !isNil {
		configCell, err1 := result.Cell(1)
		if err1 != nil {
			return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err1
		}
		commitConfig, err1 = parseOCR3Config(configCell)
		if err1 != nil {
			return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err1
		}
	}

	// exec (index 2)
	isNil, err = result.IsNil(2)
	if err != nil {
		return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err
	}
	if !isNil {
		configCell, err2 := result.Cell(2)
		if err2 != nil {
			return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err2
		}
		execConfig, err2 = parseOCR3Config(configCell)
		if err2 != nil {
			return ccipocr3.OCRConfig{}, ccipocr3.OCRConfig{}, err2
		}
	}
	return commitConfig, execConfig, nil
}

// getOffRampConfig retrieves static configuration for the off-ramp contract
func (a *TONAccessor) GetOffRampConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OfframpConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "config")
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	chainSelector, err := result.Int(0)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	feeQuoterAddressSlice, err := result.Slice(1)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}
	permissionlessExecutionThresholdSeconds, err := result.Int(2)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	commitConfig, execConfig, err := a.getOCR3Config(ctx, block)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	return ccipocr3.OfframpConfig{
		CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{OCRConfig: commitConfig},
		ExecLatestOCRConfig:   ccipocr3.OCRConfigResponse{OCRConfig: execConfig},
		StaticConfig: ccipocr3.OffRampStaticChainConfig{
			ChainSelector:        ccipocr3.ChainSelector(chainSelector.Uint64()),
			GasForCallExactCheck: 0,
			RmnRemote:            nil, // TODO:
			TokenAdminRegistry:   nil, // TODO:
			NonceManager:         nil,
		},
		DynamicConfig: ccipocr3.OffRampDynamicChainConfig{
			FeeQuoter:                               addrToBytes(feeQuoterAddress),
			PermissionLessExecutionThresholdSeconds: uint32(permissionlessExecutionThresholdSeconds.Uint64()), //nolint:gosec // this type is uint32 onchain
			IsRMNVerificationDisabled:               true,
			MessageInterceptor:                      nil,
		},
	}, nil
}

// getOffRampSourceChainConfigs retrieves multiple source chain configurations from the off-ramp contract
func (a *TONAccessor) GetOffRampSourceChainConfigs(ctx context.Context, block *ton.BlockIDExt, sourceChainSelectors []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
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
	isNil, err := result.IsNil(0)
	if err != nil {
		return nil, err
	}
	// if the dictionary is empty, we get back nil
	if isNil {
		return nil, nil
	}
	rawDict, err := result.Cell(0)
	if err != nil {
		return nil, err
	}
	dict := rawDict.AsDict(64)

	// If no specific selectors provided, get ALL keys from the dictionary
	if len(sourceChainSelectors) == 0 {
		dictEntries, err := dict.LoadAll()
		if err != nil {
			return nil, fmt.Errorf("failed to load dictionary entries: %w", err)
		}

		// Process each entry
		for _, entry := range dictEntries {
			selectorValue, err := entry.Key.LoadUInt(64)
			if err != nil {
				a.lggr.Warnf("Failed to parse selector key: %v", err)
				continue
			}

			selector := ccipocr3.ChainSelector(selectorValue)
			config, err := parseSourceChainConfig(entry.Value)
			if err != nil {
				a.lggr.Warnf("Failed to parse config for selector %d: %v", selector, err)
				continue
			}
			sourceChainConfigs[selector] = config
		}
	} else {
		for _, selector := range sourceChainSelectors {
			key := cell.BeginCell().MustStoreUInt(uint64(selector), 64).EndCell()
			entry, err := dict.LoadValue(key)
			// The plugin is built with EVM behaviour in mind: if a value doesn't exist the zero value is returned
			if errors.Is(err, cell.ErrNoSuchKeyInDict) {
				sourceChainConfigs[selector] = ccipocr3.SourceChainConfig{}
				continue
			}
			if err != nil {
				return nil, err
			}
			config, err := parseSourceChainConfig(entry)
			if err != nil {
				return nil, err
			}
			sourceChainConfigs[selector] = config
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

	result, err := a.client.RunGetMethod(ctx, block, addr, "sourceChainConfig", uint64(sourceChainSelector))
	if err != nil {
		// Handle ERROR_SOURCE_CHAIN_NOT_ENABLED=266 case for non-existent source chain
		var execError ton.ContractExecError
		if errors.As(err, &execError) && execError.Code == 266 {
			a.lggr.Debugw("source chain not enabled", "chainSelector", sourceChainSelector)
			return ccipocr3.SourceChainConfig{}, fmt.Errorf("%s not enabled", sourceChainSelector)
		}
		return ccipocr3.SourceChainConfig{}, err
	}

	var config offramp.SourceChainConfig
	if err := config.FromResult(result); err != nil {
		return ccipocr3.SourceChainConfig{}, err
	}

	return sourceChainConfigToGeneric(config), nil
}

// parseSourceChainConfig converts a raw slice into a ccipocr3.SourceChainConfig
func parseSourceChainConfig(slice *cell.Slice) (ccipocr3.SourceChainConfig, error) {
	var config offramp.SourceChainConfig
	if err := tlb.LoadFromCell(&config, slice); err != nil {
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

// getFeeQuoterStaticConfig retrieves static configuration from the fee quoter contract
func (a *TONAccessor) GetFeeQuoterStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.FeeQuoterStaticConfig, error) {
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
func (a *TONAccessor) GetOnRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OnRampDynamicConfig, error) {
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
		MessageInterceptor:     []byte{}, // unimplemented on TON
		FeeAggregator:          addrToBytes(cfg.FeeAggregator),
		AllowListAdmin:         addrToBytes(cfg.AllowListAdmin),
	}, nil
}

// getOnRampDestChainConfig retrieves destination chain configuration from the on-ramp contract
func (a *TONAccessor) GetOnRampDestChainConfig(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}

	result, err := a.client.RunGetMethod(ctx, block, addr, "destChainConfig", uint64(dest))
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
func (a *TONAccessor) GetCurseInfo(_ context.Context, _ *ton.BlockIDExt) (ccipocr3.CurseInfo, error) {
	return ccipocr3.CurseInfo{
		CursedSourceChains: map[ccipocr3.ChainSelector]bool{},
		CursedDestination:  false,
		GlobalCurse:        false,
	}, nil
}
