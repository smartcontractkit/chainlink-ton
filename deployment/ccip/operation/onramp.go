package operation

import (
	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

type OnRampDestinationUpdate struct {
	IsEnabled        bool // If false, disables the destination by setting router to 0x0.
	TestRouter       bool // Flag for safety only allow specifying either router or testRouter.
	AllowListEnabled bool
}

type UpdateOnRampDestChainConfigsInput struct {
	Updates map[uint64]OnRampDestinationUpdate
}

type UpdateOnRampDestChainConfigsOutput struct {
}

var UpdateOnRampDestChainConfigsOp = operations.NewOperation(
	"update-onramp-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates onramp's destination chain configs",
	updateOnRampDestChainConfigs,
)

func updateOnRampDestChainConfigs(b operations.Bundle, deps config.CCIPDeps, in UpdateOnRampDestChainConfigsInput) ([][]byte, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].OnRamp

	if len(in.Updates) == 0 {
		b.Logger.Info("Skipping onramp.updateOnRampDestChainConfigs, no updates")
		// Nothing to update
		return nil, nil
	}

	configs := make([]onramp.UpdateDestChainConfig, 0, len(in.Updates))

	for selector, update := range in.Updates {
		// TODO: TestRouter support
		router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
		configs = append(configs, onramp.UpdateDestChainConfig{
			DestinationChainSelector: selector,
			Router:                   &router,
			AllowListEnabled:         update.AllowListEnabled,
		})
	}

	input := onramp.UpdateDestChainConfigs{
		Updates: common.SnakeData[onramp.UpdateDestChainConfig](configs),
	}

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
