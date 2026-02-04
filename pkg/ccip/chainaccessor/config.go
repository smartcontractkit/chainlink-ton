package chainaccessor

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	offrampview "github.com/smartcontractkit/chainlink-ton/pkg/ccip/view/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// globalCurseSubject is the uint128 value used to indicate a global curse.
// Defined in contracts/contracts/ccip/rmn_remote/lib.tolk as RMNREMOTE_GLOBAL_CURSE_SUBJECT
var globalCurseSubject = func() *big.Int {
	subject, _ := new(big.Int).SetString("01000000000000000000000000000001", 16)
	return subject
}()

// Note: This file contains contract configuration related methods for the TON accessor

// addrToBytes converts a TON address to raw bytes format.
func addrToBytes(addr *address.Address) ([]byte, error) {
	rawAddr, err := codec.ToRawAddr(addr)
	if err != nil {
		return nil, fmt.Errorf("failed to convert address to raw bytes: %w", err)
	}
	return rawAddr[:], nil
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
		transmitterBytes, err1 := addrToBytes(transmitter)
		if err1 != nil {
			return ccipocr3.OCRConfig{}, fmt.Errorf("convert transmitter to bytes: %w", err1)
		}
		transmitters = append(transmitters, transmitterBytes)
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
	config, err := tvm.CallGetter(ctx, a.client, block, addr, offramp.GetConfig)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	ocr3Base, err := tvm.CallGetter(ctx, a.client, block, addr, offramp.GetOCR3Config)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	commitConfig, execConfig, err := a.parseOCR3Base(ocr3Base)
	if err != nil {
		return ccipocr3.OfframpConfig{}, err
	}

	feeQuoterBytes, err := addrToBytes(config.FeeQuoterAddress)
	if err != nil {
		return ccipocr3.OfframpConfig{}, fmt.Errorf("convert fee quoter address: %w", err)
	}

	return ccipocr3.OfframpConfig{
		CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{OCRConfig: commitConfig},
		ExecLatestOCRConfig:   ccipocr3.OCRConfigResponse{OCRConfig: execConfig},
		StaticConfig: ccipocr3.OffRampStaticChainConfig{
			ChainSelector:        ccipocr3.ChainSelector(config.ChainSelector),
			GasForCallExactCheck: 0,
			RmnRemote:            nil, // Leave nil so we don't enable full RMN mode on TON, only fast curse
			TokenAdminRegistry:   nil, // TODO: add once TON supports token transfers
			NonceManager:         nil,
		},
		DynamicConfig: ccipocr3.OffRampDynamicChainConfig{
			FeeQuoter:                               feeQuoterBytes,
			PermissionLessExecutionThresholdSeconds: config.PermissionlessExecutionThresholdSeconds,
			IsRMNVerificationDisabled:               true,
			MessageInterceptor:                      nil,
		},
	}, nil
}

// GetOffRampSourceChainConfigs retrieves multiple source chain configurations from the off-ramp contract
func (a *TONAccessor) GetOffRampSourceChainConfigs(ctx context.Context, block *ton.BlockIDExt, sourceChainSelectors []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	lggr := logger.With(a.lggr, "sourceChainSelectors", sourceChainSelectors)
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, err
	}

	var sourceConfigsGot offrampview.SourceChainConfigMap
	if err = sourceConfigsGot.Fetch(ctx, a.client, block, addr); err != nil {
		return nil, fmt.Errorf("failed to fetch source chain configs: %w", err)
	}

	// if the dictionary is empty, we get back nil
	if len(sourceConfigsGot) == 0 {
		lggr.Debugw("no source chain configs found, nothing to do")
		return nil, nil
	}

	sourceChainConfigs := filterSourceChainConfigs(sourceConfigsGot, sourceChainSelectors)
	lggr.Debugw("GetOffRampSourceChainConfigs returning", "sourceChainConfigs", sourceChainConfigs)
	return sourceChainConfigs, nil
}

// filterSourceChainConfigs filters the fetched source chain configs based on the requested selectors.
// If sourceChainSelectors is empty, all configs are returned.
// If sourceChainSelectors is provided, only matching configs are returned, non-existent selectors are skipped.
func filterSourceChainConfigs(sourceConfigsGot offrampview.SourceChainConfigMap, sourceChainSelectors []ccipocr3.ChainSelector) map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig {
	sourceChainConfigs := make(map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, len(sourceChainSelectors))

	if len(sourceChainSelectors) == 0 {
		// if no selectors specified, return all configs
		for selector, config := range sourceConfigsGot {
			genericConfig, err := sourceChainConfigToGeneric(config)
			if err != nil {
				return nil, fmt.Errorf("convert source chain config for selector %d: %w", selector, err)
			}
			sourceChainConfigs[ccipocr3.ChainSelector(selector)] = genericConfig
		}
	} else {
		for _, selector := range sourceChainSelectors {
			config, ok := sourceConfigsGot[uint64(selector)]
			if !ok {
				continue
			}
			genericConfig, err := sourceChainConfigToGeneric(config)
			if err != nil {
				return nil, fmt.Errorf("convert source chain config for selector %d: %w", selector, err)
			}
			sourceChainConfigs[selector] = genericConfig
		}
	}

	return sourceChainConfigs
}

// GetOffRampSourceChainConfig retrieves a specific source chain configuration
func (a *TONAccessor) GetOffRampSourceChainConfig(ctx context.Context, block *ton.BlockIDExt, sourceChainSelector ccipocr3.ChainSelector) (ccipocr3.SourceChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.SourceChainConfig{}, err
	}

	config, err := tvm.CallGetter(ctx, a.client, block, addr, offramp.GetSourceChainConfig, uint64(sourceChainSelector))
	if err != nil {
		// Handle ERROR_SOURCE_CHAIN_NOT_ENABLED=266 case for non-existent source chain
		var execError ton.ContractExecError
		if errors.As(err, &execError) && execError.Code == 266 {
			a.lggr.Debugw("source chain not enabled", "chainSelector", sourceChainSelector)
			return ccipocr3.SourceChainConfig{}, fmt.Errorf("%s not enabled", sourceChainSelector)
		}
		return ccipocr3.SourceChainConfig{}, err
	}

	return sourceChainConfigToGeneric(config)
}

// sourceChainConfigToGeneric converts from offramp.SourceChainConfig to ccipocr3.SourceChainConfig
func sourceChainConfigToGeneric(config offramp.SourceChainConfig) (ccipocr3.SourceChainConfig, error) {
	routerBytes, err := addrToBytes(config.Router)
	if err != nil {
		return ccipocr3.SourceChainConfig{}, fmt.Errorf("convert router address: %w", err)
	}
	return ccipocr3.SourceChainConfig{
		Router:                    routerBytes,
		IsEnabled:                 config.IsEnabled,
		IsRMNVerificationDisabled: config.IsRMNVerificationDisabled,
		MinSeqNr:                  config.MinSeqNr,
		OnRamp:                    ccipocr3.UnknownAddress(config.OnRamp),
	}, nil
}

// GetFeeQuoterStaticConfig retrieves static configuration from the fee quoter contract
func (a *TONAccessor) GetFeeQuoterStaticConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.FeeQuoterStaticConfig, error) {
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	cfg, err := tvm.CallGetter(ctx, a.client, block, addr, feequoter.GetStaticConfig)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, err
	}
	linkTokenBytes, err := addrToBytes(cfg.LinkToken)
	if err != nil {
		return ccipocr3.FeeQuoterStaticConfig{}, fmt.Errorf("convert link token address: %w", err)
	}
	return ccipocr3.FeeQuoterStaticConfig{
		MaxFeeJuelsPerMsg:  ccipocr3.NewBigInt(cfg.MaxFeeJuelsPerMsg),
		LinkToken:          linkTokenBytes,
		StalenessThreshold: cfg.StalenessThreshold,
	}, nil
}

// GetOnRampDynamicConfig retrieves dynamic configuration from the on-ramp contract
func (a *TONAccessor) GetOnRampDynamicConfig(ctx context.Context, block *ton.BlockIDExt) (ccipocr3.OnRampDynamicConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	cfg, err := tvm.CallGetter(ctx, a.client, block, addr, onramp.GetDynamicConfig)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, err
	}
	feeQuoterBytes, err := addrToBytes(cfg.FeeQuoter)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, fmt.Errorf("convert fee quoter address: %w", err)
	}
	feeAggregatorBytes, err := addrToBytes(cfg.FeeAggregator)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, fmt.Errorf("convert fee aggregator address: %w", err)
	}
	allowListAdminBytes, err := addrToBytes(cfg.AllowListAdmin)
	if err != nil {
		return ccipocr3.OnRampDynamicConfig{}, fmt.Errorf("convert allow list admin address: %w", err)
	}
	return ccipocr3.OnRampDynamicConfig{
		FeeQuoter:              feeQuoterBytes,
		ReentrancyGuardEntered: false,
		MessageInterceptor:     []byte{}, // unimplemented on TON
		FeeAggregator:          feeAggregatorBytes,
		AllowListAdmin:         allowListAdminBytes,
	}, nil
}

// GetOnRampDestChainConfig retrieves destination chain configuration from the on-ramp contract
func (a *TONAccessor) GetOnRampDestChainConfig(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.OnRampDestChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}

	cfg, err := tvm.CallGetter(ctx, a.client, block, addr, onramp.GetDestChainConfig, uint64(dest))
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, err
	}

	routerBytes, err := addrToBytes(cfg.Router)
	if err != nil {
		return ccipocr3.OnRampDestChainConfig{}, fmt.Errorf("convert router address: %w", err)
	}

	return ccipocr3.OnRampDestChainConfig{
		SequenceNumber:   cfg.SequenceNumber,
		AllowListEnabled: cfg.AllowListEnabled,
		Router:           routerBytes,
	}, nil
}

// GetCurseInfo retrieves curse information for RMN verification
func (a *TONAccessor) GetCurseInfo(ctx context.Context, block *ton.BlockIDExt, dest ccipocr3.ChainSelector) (ccipocr3.CurseInfo, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return ccipocr3.CurseInfo{}, fmt.Errorf("could not get OffRamp address from accessor bindings: %w", err)
	}
	cursedSubjects, err := tvm.CallGetter(ctx, a.client, block, addr, offramp.GetCursedSubjects)
	if err != nil {
		return ccipocr3.CurseInfo{}, fmt.Errorf("could not get cursed subjects: %w", err)
	}

	return parseCurseInfo(cursedSubjects, dest), nil
}

// parseCurseInfo parses a list of cursed subjects and categorizes them into
// global curse, destination curse, and cursed source chains.
func parseCurseInfo(cursedSubjects []*big.Int, dest ccipocr3.ChainSelector) ccipocr3.CurseInfo {
	cursedChains := make(map[ccipocr3.ChainSelector]bool, len(cursedSubjects))
	globalCurse := false
	destinationCurse := false
	destAsBigInt := new(big.Int).SetUint64(uint64(dest))

	for _, curse := range cursedSubjects {
		if curse.Cmp(globalCurseSubject) == 0 {
			globalCurse = true
			continue
		}

		// Chain sels should fit into uint64
		if curse.Cmp(destAsBigInt) == 0 {
			destinationCurse = true
			continue
		}

		// Double check the cursed subject can fit in uint64 just in case
		if curse.IsUint64() {
			cursedChains[ccipocr3.ChainSelector(curse.Uint64())] = true
		}
	}

	return ccipocr3.CurseInfo{
		CursedSourceChains: cursedChains,
		CursedDestination:  destinationCurse,
		GlobalCurse:        globalCurse,
	}
}
