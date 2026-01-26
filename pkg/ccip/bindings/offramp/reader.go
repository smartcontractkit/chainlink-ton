package offramp

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetOwner gets the owner of the OffRamp contract
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner of the OffRamp contract
var GetPendingOwner = ownable2step.GetPendingOwner

// GetOCR3Config gets the OCR3 configuration of the OffRamp contract
var GetOCR3Config = tvm.NewNoArgsGetter(tvm.NoArgsOpts[OCR3Base]{
	Name: ocr3BaseGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (OCR3Base, error) {
		var c OCR3Base
		// chainID (index 0)
		chainIDInt, err := r.Int(0)
		if err != nil {
			return c, fmt.Errorf("failed to get ChainID: %w", err)
		}
		c.ChainID = uint8(chainIDInt.Uint64())

		// commit (index 1)
		isNil, err := r.IsNil(1)
		if err != nil {
			return c, err
		}
		if !isNil {
			configCell, err1 := r.Cell(1)
			if err1 != nil {
				return c, err1
			}

			var config OCR3Config
			if err = tlb.LoadFromCell(&config, configCell.BeginParse()); err != nil {
				return c, fmt.Errorf("load OCR3Config from cell: %w", err)
			}
			c.Commit = &config
		}

		// execute (index 2)
		isNil, err = r.IsNil(2)
		if err != nil {
			return c, err
		}
		if !isNil {
			configCell, err2 := r.Cell(2)
			if err2 != nil {
				return c, err2
			}

			var config OCR3Config
			if err = tlb.LoadFromCell(&config, configCell.BeginParse()); err != nil {
				return c, fmt.Errorf("load OCR3Config from cell: %w", err)
			}
			c.Execute = &config
		}

		return c, nil
	}),
})

// GetConfig gets the configuration of the OffRamp contract
var GetConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[Config]{
	Name: configGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (Config, error) {
		var c Config
		cs, err := r.Int(0)
		if err != nil {
			return c, fmt.Errorf("failed to get ChainSelector: %w", err)
		}

		chainSelector := cs.Uint64()

		feeQuoterAddressSlice, err := r.Slice(1)
		if err != nil {
			return c, fmt.Errorf("failed to get feeQuoter address slice: %w", err)
		}

		feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
		if err != nil {
			return c, fmt.Errorf("failed to load feeQuoter address: %w", err)
		}

		thresholdInt, err := r.Int(2)
		if err != nil {
			return c, fmt.Errorf("failed to get permissionlessExecutionThresholdSeconds: %w", err)
		}

		return Config{
			ChainSelector:                           chainSelector,
			FeeQuoterAddress:                        feeQuoterAddress,
			PermissionlessExecutionThresholdSeconds: uint32(thresholdInt.Uint64()),
		}, nil
	}),
})

// GetSourceChainConfig gets the source chain configuration for a given chain selector
var GetSourceChainConfig = tvm.Getter[uint64, SourceChainConfig]{
	Name: srcChainConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (SourceChainConfig, error) {
		var c SourceChainConfig
		routerAddressSlice, err := r.Slice(0)
		if err != nil {
			return c, fmt.Errorf("failed to get router address slice: %w", err)
		}
		routerAddress, err := routerAddressSlice.LoadAddr()
		if err != nil {
			return c, fmt.Errorf("failed to load router address: %w", err)
		}

		isEnabledInt, err := r.Int(1)
		if err != nil {
			return c, fmt.Errorf("failed to get isEnabled: %w", err)
		}
		isEnabled := isEnabledInt.Cmp(big.NewInt(0)) != 0

		minSeqNrInt, err := r.Int(2)
		if err != nil {
			return c, fmt.Errorf("failed to get minSeqNr: %w", err)
		}
		minSeqNr := minSeqNrInt.Uint64()

		isRMNDisabledInt, err := r.Int(3)
		if err != nil {
			return c, fmt.Errorf("failed to get isRMNVerificationDisabled: %w", err)
		}
		isRMNVerificationDisabled := isRMNDisabledInt.Cmp(big.NewInt(0)) != 0

		onRampSlice, err := r.Slice(4)
		if err != nil {
			return c, fmt.Errorf("failed to get onRamp slice: %w", err)
		}
		onRamp, err := ccipcommon.LoadCrossChainAddressWithoutPrefix(onRampSlice)
		if err != nil {
			return c, fmt.Errorf("failed to parse onRamp: %w", err)
		}

		return SourceChainConfig{
			Router:                    routerAddress,
			IsEnabled:                 isEnabled,
			MinSeqNr:                  minSeqNr,
			IsRMNVerificationDisabled: isRMNVerificationDisabled,
			OnRamp:                    onRamp,
		}, nil
	}),
}

// GetSourceChainSelectors gets all source chain selectors
var GetSourceChainSelectors = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]uint64]{
	Name: sourceChainSelectorsGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		return parser.ParseLispTuple(r.AsTuple()), nil
	}),
})

// GetCursedSubjects gets all cursed subjects from the OffRamp contract
var GetCursedSubjects = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]*big.Int]{
	Name: cursedSubjectsGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]*big.Int, error) {
		return parser.ParseLispTupleBigInt(r.AsTuple()), nil
	}),
})
