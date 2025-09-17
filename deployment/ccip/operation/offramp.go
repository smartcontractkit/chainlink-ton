package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployOffRampInput struct {
	ChainSelector                           uint64
	FeeQuoter                               *address.Address
	PermissionlessExecutionThresholdSeconds uint32
	ContractPath                            string
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

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := offramp.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Deployer:       cell.BeginCell().EndCell(),
		MerkleRootCode: cell.BeginCell().EndCell(),
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
		KeyLen:                                  64,
		LatestPriceSequenceNumber:               0,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"), nil)
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
	IsRMNVerificationDisabled bool
}

type UpdateOffRampSourcesInput struct {
	Updates map[uint64]OffRampSourceUpdate
}

type UpdateOffRampSourcesOutput struct {
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
		b.Logger.Infow("Skipping offramp.updateSourceChainConfigs, no updates", "chainSelector", deps.TonChain.Selector)
		return nil, nil
	}

	var configs []offramp.UpdateSourceChainConfig

	for selector, update := range in.Updates {
		router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
		configs = append(configs, offramp.UpdateSourceChainConfig{
			SourceChainSelector: selector,
			Config: offramp.SourceChainConfig{
				Router:                    &router,
				IsEnabled:                 update.IsEnabled,
				MinSeqNr:                  0, // TODO: this field should not be set on update
				IsRMNVerificationDisabled: update.IsRMNVerificationDisabled,
				OnRamp:                    common.CrossChainAddress{}, // TODO: how to source this without chainview
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
	return utils.Serialize(messages)
}
