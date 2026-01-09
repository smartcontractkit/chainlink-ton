package changeset

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/changesets"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	toncodec "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

// AddLanesWrapper provides a changeset for adding CCIP lanes on TON chains.
//
// This changeset uses the NewOpsAnySequence pattern, which means it accepts
// opsmcms.TimelockAnySequenceInput directly. Users build this input by:
//
// 1. Creating binding types (e.g., feequoter.UpdateDestChainConfigs)
// 2. Wrapping them with toncodec.WrapMessage[any](contractType, bindingValue)
// 3. Building opston.SendMessagesInput with the wrapped messages
// 4. Adding all inputs to opsmcms.TimelockAnySequenceInput
//
// Typical operations for adding lanes:
// - FeeQuoter: UpdateDestChainConfigs (set destination chain parameters)
// - FeeQuoter: UpdatePrices (set gas and token prices)
// - OnRamp: UpdateDestChainConfigs (enable destination chain)
// - OffRamp: UpdateSourceChainConfigs (enable source chain)
// - Router: ApplyRampUpdates (register onramps/offramps)
//
// For source lane configuration (TON as source):
//   - Update FeeQuoter with destination chain configs
//   - Update OnRamp with destination chain configs
//   - Update FeeQuoter with prices
//   - Update Router with onramp address
//
// For destination lane configuration (TON as dest):
//   - Update OffRamp with source chain configs
//   - Update Router with offramp address
type AddLanesWrapper struct {
	underlyingChangeset cldf.ChangeSetV2[opsmcms.TimelockAnySequenceInput]
}

func (a *AddLanesWrapper) VerifyPreconditions(env cldf.Environment, in opsmcms.TimelockAnySequenceInput) error {
	tonChains := env.BlockChains.TonChains()

	// Validate the TON chain exists in the environment
	chainSelector := uint64(in.ChainSelector)
	_, exists := tonChains[chainSelector]
	if !exists {
		return fmt.Errorf("TON chain %d is not in env", chainSelector)
	}
	return nil
}

func (a *AddLanesWrapper) Apply(env cldf.Environment, in opsmcms.TimelockAnySequenceInput) (cldf.ChangesetOutput, error) {
	return a.underlyingChangeset.Apply(env, in)
}

// CreateAddLanesChangeset creates a changeset for adding CCIP lanes using the
// NewOpsAnySequence pattern. This changeset leverages opston.SendMessages for all
// contract interactions, avoiding the need for operation-specific types.
//
// The changeset accepts opsmcms.TimelockAnySequenceInput, which allows users to:
// - Use raw binding types directly (e.g., feequoter.UpdateDestChainConfigs)
// - Wrap messages with toncodec.WrapMessage
// - Automatically handle MCMS/Timelock proposal generation
func CreateAddLanesChangeset(contracts ton.ContractCodeProvider) cldf.ChangeSetV2[opsmcms.TimelockAnySequenceInput] {
	return &AddLanesWrapper{
		underlyingChangeset: changesets.NewOpsAnySequence(bindings.Registry, contracts),
	}
}

// WrapFeeQuoterDestConfigMessage wraps a FeeQuoter UpdateDestChainConfigs message.
func WrapFeeQuoterDestConfigMessage(config feequoter.UpdateDestChainConfigs) (toncodec.MessageEnvelope[any], error) {
	return toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &config)
}

// WrapFeeQuoterPricesMessage wraps a FeeQuoter UpdatePrices message.
func WrapFeeQuoterPricesMessage(prices feequoter.UpdatePrices) (toncodec.MessageEnvelope[any], error) {
	return toncodec.WrapMessage[any](bindings.PkgCCIP+".FeeQuoter", &prices)
}

// WrapOnRampDestConfigMessage wraps an OnRamp UpdateDestChainConfigsMessage.
func WrapOnRampDestConfigMessage(config onramp.UpdateDestChainConfigsMessage) (toncodec.MessageEnvelope[any], error) {
	return toncodec.WrapMessage[any](bindings.PkgCCIP+".OnRamp", &config)
}

// WrapOffRampSourceConfigMessage wraps an OffRamp UpdateSourceChainConfigs message.
func WrapOffRampSourceConfigMessage(config offramp.UpdateSourceChainConfigs) (toncodec.MessageEnvelope[any], error) {
	return toncodec.WrapMessage[any](bindings.PkgCCIP+".OffRamp", &config)
}

// WrapRouterRampUpdatesMessage wraps a Router ApplyRampUpdates message.
func WrapRouterRampUpdatesMessage(updates router.ApplyRampUpdates) (toncodec.MessageEnvelope[any], error) {
	return toncodec.WrapMessage[any](bindings.PkgCCIP+".Router", &updates)
}
