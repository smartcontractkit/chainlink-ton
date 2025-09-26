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
func (a *TONAccessor) getOffRampConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OfframpConfig, error) {
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
	for _, selector := range sourceChainSelectors {
		key := cell.BeginCell().MustStoreUInt(uint64(selector), 64).EndCell()
		entry, err := dict.LoadValue(key)
		// The plugin is built with EVM behaviour in mind: if a value doesn't exist the zero value is returned
		if errors.Is(err, cell.ErrNoSuchKeyInDict) {
			// TODO: should we still set to zero value?
			continue
		}
		if err != nil {
			return nil, err
		}
		var config offramp.SourceChainConfig
		if err := tlb.LoadFromCell(&config, entry); err != nil {
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
		MessageInterceptor:     []byte{}, // unimplemented on TON
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
func (a *TONAccessor) getCurseInfo(_ context.Context, _ *ton.BlockIDExt) (ccipocr3.CurseInfo, error) {
	return ccipocr3.CurseInfo{
		CursedSourceChains: map[ccipocr3.ChainSelector]bool{},
		CursedDestination:  false,
		GlobalCurse:        false,
	}, nil
}
