package upgradeable

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

var (
	_ ton.PlannerOption               = UpgradeInput{}
	_ ton.Planner[ton.MessagePlanRaw] = UpgradeOutput{}
	_ ton.MessageSender               = UpgradeOutput{}
)

type UpgradeInput struct {
	Messages []UpgradeMessage `json:"messages"`
	Plan     bool             `json:"plan"`

	// TODO: add WaitTrace option
}

type UpgradeMessage struct {
	Message      ton.InternalMessage[upgradeable.Upgrade] `json:"message"`
	ContractMeta ton.ContractMetadata                     `json:"contract_meta"`
}

func (in UpgradeInput) IsPlan() bool {
	return in.Plan
}

type UpgradeOutput struct {
	Plans       []ton.MessagePlanRaw `json:"plans"`
	Transaction *ton.TransactionInfo `json:"transaction,omitempty"`
}

func (o UpgradeOutput) GetPlans() []ton.MessagePlanRaw {
	return o.Plans
}

func (o UpgradeOutput) GetTransaction() *ton.TransactionInfo {
	return o.Transaction
}

type UpgradeDeps struct {
	ContractProvider ton.ContractProvider
	Wallet           *wallet.Wallet
}

var Upgrade = operations.NewOperation(
	"ton/ops/lib/versioning/upgradeable/upgrade",
	semver.MustParse("0.1.0"),
	"Upgrades an Upgradeable contract to a new implementation",
	handler,
)

func handler(b operations.Bundle, deps UpgradeDeps, in UpgradeInput) (UpgradeOutput, error) {
	// Convert messages to use any type
	_messages := make([]ton.InternalMessage[any], len(in.Messages))
	for i, u := range in.Messages {
		m := u.Message
		val := m.Body.Value

		c, err := deps.ContractProvider.GetContract(u.ContractMeta)
		if err != nil {
			return UpgradeOutput{}, fmt.Errorf("failed to get contract code: %w", err)
		}
		val.Code = c.Code
		valAny := any(val)

		_messages[i] = ton.InternalMessage[any]{
			Bounce:  m.Bounce,
			DstAddr: m.DstAddr,
			Amount:  m.Amount,
			Body: codec.MessageEnvelope[any]{
				Metadata: m.Body.Metadata,
				Payload:  m.Body.Payload,
				Cell:     m.Body.Cell,
				Value:    &valAny,
			},
		}
	}

	_in := ton.SendMessagesInput[any]{
		Messages: _messages,
		Plan:     in.Plan,
	}

	// TOOD: improve deps passing
	opdeps := ton.SendMessagesDeps{
		Wallet: deps.Wallet,
	}

	r, err := operations.ExecuteOperation(b, ton.SendMessages, opdeps, _in)
	if err != nil {
		return UpgradeOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
	}

	return UpgradeOutput{
		Plans:       r.Output.GetPlans(),
		Transaction: r.Output.GetTransaction(),
	}, nil
}
