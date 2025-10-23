package operation

import (
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployOffRampInput struct {
	ID                                      uint32
	ChainSelector                           uint64
	FeeQuoter                               *address.Address
	PermissionlessExecutionThresholdSeconds uint32
	ContractPath                            string
	DeployerContractPath                    string
	MerkleRootContractPath                  string
	ReceiveExecutorContractPath             string
	Coins                                   string
}

// TODO: single deploy output
type DeployOffRampOutput struct {
	Address *address.Address
}

var DeployOffRampOp = operations.NewOperation(
	"deploy-offramp-op",
	semver.MustParse("0.1.0"),
	"Deploys the OffRamp contract",
	deployOffRamp,
)

func deployOffRamp(b operations.Bundle, deps TonDeps, in DeployOffRampInput) (DeployOffRampOutput, error) {
	output := DeployOffRampOutput{}

	// TODO wrap the code cell creation somewhere
	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	deployerCode, err := wrappers.ParseCompiledContract(in.DeployerContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile deployer contract: %w", err)
	}

	merkleRootCode, err := wrappers.ParseCompiledContract(in.MerkleRootContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile merkle root contract: %w", err)
	}

	receiveExecutorCode, err := wrappers.ParseCompiledContract(in.ReceiveExecutorContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile receive executor contract: %w", err)
	}
	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := offramp.Storage{
		ID: in.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Deployables: offramp.Deployables{
			Deployer:            deployerCode,
			MerkleRootCode:      merkleRootCode,
			ReceiveExecutorCode: receiveExecutorCode,
		},
		// empty OCR3Base
		OCR3Base: cell.BeginCell().
			MustStoreUInt(0, 8).
			MustStoreBoolBit(false).
			MustStoreBoolBit(false).
			EndCell(),
		FeeQuoter:                               in.FeeQuoter,
		ChainSelector:                           in.ChainSelector,
		PermissionlessExecutionThresholdSeconds: in.PermissionlessExecutionThresholdSeconds,
		SourceChainConfigs:                      nil,
		LatestPriceSequenceNumber:               0,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON(in.Coins), nil)
	if err != nil {
		return output, fmt.Errorf("failed to deploy offramp contract: %w", err)
	}
	b.Logger.Infow("Deployed OffRamp", "addr", contract.Address)

	output.Address = contract.Address
	return output, nil
}

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
	"update-offramp-source-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates offramp's source chain configs",
	updateOffRampSourceChainConfigs,
)

func updateOffRampSourceChainConfigs(b operations.Bundle, deps TonDeps, in UpdateOffRampSourcesInput) ([][]byte, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].OffRamp

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

		router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
		configs = append(configs, offramp.UpdateSourceChainConfig{
			SourceChainSelector: selector,
			Config: offramp.SourceChainConfig{
				Router:                    &router,
				IsEnabled:                 update.IsEnabled,
				MinSeqNr:                  0, // TODO: this field should not be set on update
				IsRMNVerificationDisabled: update.IsRMNVerificationDisabled,
				OnRamp:                    common.CrossChainAddress(update.OnRamp),
			},
		})
	}

	// TODO: TEMP workaround
	input := configs[0]
	// input := offramp.UpdateSourceChainConfigs{
	// 	Updates: common.SnakeData[offramp.UpdateSourceChainConfig](configs),
	// }

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &addr,
			Body:    payload,
		},
	}
	return helpers.Serialize(messages)
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
	"update-offramp-ocr3-config",
	semver.MustParse("0.1.0"),
	"Updates offramp's OCR3 config",
	setOCR3Config,
)

func setOCR3Config(b operations.Bundle, deps TonDeps, in OCR3ConfigArgs) ([][]byte, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].OffRamp

	signers := make([]offramp.Signer, 0, len(in.Signers))
	for _, signer := range in.Signers {
		if len(signer) != 32 {
			return nil, fmt.Errorf("invalid signer address, expected 32 bytes, got %d", len(signer))
		}
		signers = append(signers, offramp.Signer{Pubkey: signer})
	}

	transmitters := make([]offramp.Transmitter, 0, len(in.Transmitters))
	for _, transmitter := range in.Transmitters {
		if len(transmitter) != 36 {
			return nil, fmt.Errorf("invalid transmitter address, expected 36 bytes, got %d", len(transmitter))
		}
		workchain := int32(binary.BigEndian.Uint32(transmitter[0:4])) //nolint:gosec // G115
		addr := address.NewAddress(0, byte(workchain), transmitter[4:])
		transmitters = append(transmitters, offramp.Transmitter{Address: addr})
	}

	input := offramp.SetOCR3Config{
		QueryID:                        0,
		ConfigDigest:                   in.ConfigDigest[:],
		PluginType:                     uint16(in.PluginType),
		F:                              in.F,
		IsSignatureVerificationEnabled: in.IsSignatureVerificationEnabled,
		Signers:                        common.SnakeData[offramp.Signer](signers),
		Transmitters:                   common.SnakeData[offramp.Transmitter](transmitters),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("1"),
			DstAddr: &addr,
			Body:    payload,
		},
	}
	return helpers.Serialize(messages)
}
