package operation

import (
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type OffRampSourceUpdate struct {
	IsEnabled  bool // If false, disables the source by setting router to 0x0.
	TestRouter bool // Flag for safety only allow specifying either router or testRouter.
	// IsRMNVerificationDisabled is a flag to disable RMN verification for this source chain.
	IsRMNVerificationDisabled bool // TODO: remove this, default true?
	OnRamp                    []byte
}

type UpdateOffRampSourcesInput struct {
	Updates map[uint64]OffRampSourceUpdate
}

var UpdateOffRampSourceChainConfigsOp = operations.NewOperation(
	"ton/ops/ccip/offramp/update-source-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates offramp's source chain configs",
	updateOffRampSourceChainConfigs,
)

func updateOffRampSourceChainConfigs(b operations.Bundle, dp *dep.DependencyProvider, in UpdateOffRampSourcesInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	stateCCIP, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	if len(in.Updates) == 0 {
		b.Logger.Info("Skipping offramp.updateOffRampSourceChainConfigs, no updates")
		// Nothing to update
		return nil, nil
	}

	configs := make([]offramp.UpdateSourceChainConfig, 0, len(in.Updates))
	for selector, update := range in.Updates {
		if update.OnRamp == nil {
			return nil, errors.New("onramp.UpdateSourceChainConfigs: OnRamp address should not be nil")
		}

		configs = append(configs, offramp.UpdateSourceChainConfig{
			SourceChainSelector: selector,
			Config: offramp.SourceChainConfig{
				Router:                    &stateCCIP.Router,
				IsEnabled:                 update.IsEnabled,
				IsRMNVerificationDisabled: update.IsRMNVerificationDisabled,
				OnRamp:                    update.OnRamp,
			},
		})
	}

	input := offramp.UpdateSourceChainConfigs{
		Configs: configs,
	}
	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	return tlbe.ManyCellsFrom([]tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &stateCCIP.OffRamp,
			Body:    payload,
		},
	})
}

// PluginType represents the type of CCIP plugin.
type PluginType uint8

const (
	PluginTypeCCIPCommit PluginType = 0
	PluginTypeCCIPExec   PluginType = 1
)

// NOTE: this maps to MultiOCR3BaseOCRConfigArgsAptos but it's an internal type on chainlink/deployment...
type OCR3ConfigArgs struct {
	ConfigDigest                   [32]byte
	PluginType                     PluginType
	F                              uint8
	IsSignatureVerificationEnabled bool
	Signers                        [][]byte
	Transmitters                   [][]byte
}

var SetOCR3ConfigOp = operations.NewOperation(
	"ton/ops/ccip/offramp/set-ocr3-config",
	semver.MustParse("0.1.0"),
	"Updates offramp's OCR3 config",
	setOCR3Config,
)

func setOCR3Config(b operations.Bundle, dp *dep.DependencyProvider, in OCR3ConfigArgs) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	stateCCIP, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	signers := make([]offramp.Signer, 0, len(in.Signers))
	for _, signer := range in.Signers {
		if len(signer) != 32 {
			return nil, fmt.Errorf("invalid signer address, expected 32 bytes, got %d", len(signer))
		}
		signers = append(signers, offramp.Signer{Pubkey: signer})
	}

	transmitters := make([]common.AddressWrap, 0, len(in.Transmitters))
	for _, transmitter := range in.Transmitters {
		if len(transmitter) != 36 {
			return nil, fmt.Errorf("invalid transmitter address, expected 36 bytes, got %d", len(transmitter))
		}
		workchain := int32(binary.BigEndian.Uint32(transmitter[0:4])) //nolint:gosec // G115
		addr := address.NewAddress(0, byte(workchain), transmitter[4:])
		transmitters = append(transmitters, common.AddressWrap{Val: addr})
	}

	input := offramp.SetOCR3Config{
		QueryID:                        0,
		ConfigDigest:                   in.ConfigDigest[:],
		PluginType:                     uint16(in.PluginType),
		F:                              in.F,
		IsSignatureVerificationEnabled: in.IsSignatureVerificationEnabled,
		Signers:                        signers,
		Transmitters:                   transmitters,
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	return tlbe.ManyCellsFrom([]tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &stateCCIP.OffRamp,
			Body:    payload,
		},
	})
}
