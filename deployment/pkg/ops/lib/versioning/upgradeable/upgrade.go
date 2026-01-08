package upgradeable

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

var (
	_ opston.PlannerOption                  = UpgradeInput{}
	_ opston.Planner[opston.MessagePlanRaw] = UpgradeOutput{}
	_ opston.MessageSender                  = UpgradeOutput{}
)

type UpgradeInput struct {
	Messages []UpgradeMessage `json:"messages"`
	Plan     bool             `json:"plan"`

	// TODO: add WaitTrace option
}

type UpgradeMessage struct {
	Message      opston.InternalMessage[upgradeable.Upgrade] `json:"message"`
	ContractMeta opston.ContractMetadata                     `json:"contract_meta"`
}

func (in UpgradeInput) IsPlan() bool {
	return in.Plan
}

type UpgradeOutput struct {
	Plans       []opston.MessagePlanRaw `json:"plans"`
	Transaction *opston.TransactionInfo `json:"transaction,omitempty"`
}

func (o UpgradeOutput) GetPlans() []opston.MessagePlanRaw {
	return o.Plans
}

func (o UpgradeOutput) GetTransaction() *opston.TransactionInfo {
	return o.Transaction
}

type UpgradeDeps struct {
	ContractProvider opston.ContractCodeProvider
	Wallet           *wallet.Wallet
	Client           ton.APIClientWrapped
}

var Upgrade = operations.NewOperation(
	"ton/ops/lib/versioning/upgradeable/upgrade",
	semver.MustParse("0.1.0"),
	"Upgrades upgradeable contracts to a new implementation",
	func(b operations.Bundle, deps UpgradeDeps, in UpgradeInput) (UpgradeOutput, error) {
		// Load contracts and prepare the underlying []opston.InternalMessage[any]
		_messages := make([]opston.InternalMessage[any], len(in.Messages))
		for i, u := range in.Messages {
			c, err := deps.ContractProvider.GetContract(u.ContractMeta)
			if err != nil {
				return UpgradeOutput{}, fmt.Errorf("failed to get contract code: %w", err)
			}

			// prepare message with loaded code
			m := u.Message
			val := m.Body.Value
			val.Code = c.Code
			valAny := any(val)

			_messages[i] = opston.InternalMessage[any]{
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

		_in := opston.SendMessagesInput{
			Messages: _messages,
			Plan:     in.Plan,
		}

		// TOOD: improve deps passing
		opdeps := opston.SendMessagesDeps{
			Wallet: deps.Wallet,
			Client: deps.Client,
		}

		r, err := operations.ExecuteOperation(b, opston.SendMessages, opdeps, _in)
		if err != nil {
			return UpgradeOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
		}

		return UpgradeOutput{
			Plans:       r.Output.GetPlans(),
			Transaction: r.Output.GetTransaction(),
		}, nil
	},
)
