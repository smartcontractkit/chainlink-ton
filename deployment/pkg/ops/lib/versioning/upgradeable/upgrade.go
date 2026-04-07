package upgradeable

import (
	"encoding/hex"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
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

type UpgradeOutput opston.SendMessagesOutput

func (o UpgradeOutput) GetPlans() []opston.MessagePlanRaw {
	return o.Plans
}

func (o UpgradeOutput) GetTransaction() *tlbe.Cell[tlb.Transaction] {
	return o.Transaction
}

var Upgrade = operations.NewOperation(
	"ton/ops/lib/versioning/upgradeable/upgrade",
	semver.MustParse("0.1.0"),
	"Upgrades upgradeable contracts to a new implementation",
	func(b operations.Bundle, dp *dep.DependencyProvider, in UpgradeInput) (UpgradeOutput, error) {
		// Load contracts and prepare the underlying []opston.InternalMessage[any]
		messages := make([]opston.InternalMessage[any], len(in.Messages))
		for i, u := range in.Messages {
			contractProvider, err := dep.Resolve[opston.ContractCodeProvider](dp)
			if err != nil {
				return UpgradeOutput{}, fmt.Errorf("failed to resolve contract provider: %w", err)
			}

			c, err := contractProvider.GetContract(u.ContractMeta)
			if err != nil {
				return UpgradeOutput{}, fmt.Errorf("failed to get contract code: %w", err)
			}

			b.Logger.Debugf("Fetched contract code for upgrade: package=%s version=%s contractRef=%s id=%s codeHash=%s sourceRef=%s",
				u.ContractMeta.Package,
				u.ContractMeta.Version,
				u.ContractMeta.ContractRef,
				u.ContractMeta.ID,
				hex.EncodeToString(c.Code.Hash()),
				c.SourceRef,
			)

			// prepare message with loaded code
			m := u.Message

			body := m.Body
			// Create a new upgrade message (default) if none provided
			if body == nil {
				contractType := bindings.PkgLib + ".versioning.Upgradeable"
				body, err = codec.WrapMessage(contractType, upgradeable.Upgrade{QueryID: 0, Code: c.Code})
				if err != nil {
					return UpgradeOutput{}, fmt.Errorf("failed to wrap upgrade message: %w", err)
				}
				b.Logger.Debugf("Created upgrade message body: opcode=0x%08x queryID=%d contractType=%s",
					body.Metadata.Opcode, body.Value.QueryID, contractType)
			}

			// Map to MessageEnvelope[any]
			val := body.Value
			val.Code = c.Code
			valAny := any(val)

			// Pre-compute the Cell from the typed value before converting to MessageEnvelope[any].
			// WrapMessage does not set Cell, and  tlb.ToCell cannot reflect on *interface{},
			// so we must serialize while the concrete type information is still available.
			bodyCell, err := tlb.ToCell(val)
			if err != nil {
				return UpgradeOutput{}, fmt.Errorf("failed to serialize upgrade body to cell: %w", err)
			}

			b.Logger.Debugf("Upgrade message[%d]: dstAddr=%s bounce=%v amount=%s bodyCellHash=%s bodyCellBits=%d bodyCellRefs=%d",
				i, m.DstAddr.String(), m.Bounce, m.Amount.String(),
				hex.EncodeToString(bodyCell.Hash()),
				bodyCell.BitsSize(), bodyCell.RefsNum())

			// Round-trip verification: deserialize the body cell back to Upgrade struct
			var roundTrip upgradeable.Upgrade
			if err := tlb.LoadFromCell(&roundTrip, bodyCell.BeginParse()); err != nil {
				b.Logger.Debugf("WARNING: body cell round-trip deserialization FAILED: %v", err)
			} else {
				b.Logger.Debugf("Round-trip OK: queryID=%d codeHash=%s codeIsNil=%v",
					roundTrip.QueryID,
					hex.EncodeToString(roundTrip.Code.Hash()),
					roundTrip.Code == nil)
			}

			bodyAny := &codec.MessageEnvelope[any]{
				Metadata: body.Metadata,
				Payload:  body.Payload,
				Cell:     bodyCell,
				Value:    &valAny,
			}

			messages[i] = opston.InternalMessage[any]{
				Bounce:  m.Bounce,
				DstAddr: m.DstAddr,
				Amount:  m.Amount,
				Body:    bodyAny,
			}
		}

		_in := opston.SendMessagesInput{
			Messages: messages,
			Plan:     in.Plan,
		}

		r, err := operations.ExecuteOperation(b, opston.SendMessages, dp, _in)
		if err != nil {
			return UpgradeOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
		}

		return UpgradeOutput(r.Output), nil
	},
)
