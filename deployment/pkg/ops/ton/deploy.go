package ton // alias: opston

import (
	"fmt"
	"reflect"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
)

var (
	_ PlannerOption           = DeployInput{}
	_ Planner[MessagePlanRaw] = DeployOutput{}
	_ MessageSender           = DeployOutput{}
)

type DeployInput struct {
	Messages []DeployMessage[any, any] `json:"messages"`
	Plan     bool                      `json:"plan"`

	// TODO: add WaitTrace option
}

type DeployMessage[T any, D any] struct {
	ContractMeta ContractMetadata   `json:"contractMeta"`
	Data         *D                 `json:"data"`
	Message      InternalMessage[T] `json:"message"`
}

func (in DeployInput) IsPlan() bool {
	return in.Plan
}

type DeployOutput SendMessagesOutput

func (o DeployOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o DeployOutput) GetTransaction() *tlbe.Cell[tlb.Transaction] {
	return o.Transaction
}

var Deploy = operations.NewOperation(
	"ton/ops/deploy",
	semver.MustParse("0.2.0"),
	"Deploys contracts by sending messages with code loaded from the provider",
	func(b operations.Bundle, dp *dep.DependencyProvider, in DeployInput) (DeployOutput, error) {
		// Load contracts and prepare the underlying []InternalMessage[any]
		_messages := make([]InternalMessage[any], len(in.Messages))
		for i, u := range in.Messages {
			contractProvider, err := dep.Resolve[ContractCodeProvider](dp)
			if err != nil {
				return DeployOutput{}, fmt.Errorf("failed to resolve contract provider: %w", err)
			}

			c, err := contractProvider.GetContract(b.GetContext(), u.ContractMeta)
			if err != nil {
				return DeployOutput{}, fmt.Errorf("failed to get contract code: %w", err)
			}

			// prepare message with loaded code and data as StateInit

			var data *cell.Cell
			if u.Data != nil {
				// Convert Data to cell based on its type
				data, err = encodeDataCellFor(u.Data)
				if err != nil {
					return DeployOutput{}, fmt.Errorf("failed to encode data cell: %w", err)
				}
			}

			m := u.Message
			_messages[i] = InternalMessage[any]{
				Bounce:  m.Bounce,
				DstAddr: m.DstAddr,
				Amount:  m.Amount,
				Body:    m.Body,
				StateInit: &StateInit{
					Code: c.Code,
					Data: data,
				},
			}
		}

		_in := SendMessagesInput{
			Messages: _messages,
			Plan:     in.Plan,
		}

		r, err := operations.ExecuteOperation(b, SendMessages, dp, _in)
		if err != nil {
			return DeployOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
		}

		return DeployOutput(r.Output), nil
	},
)

// encodeDataCellFor encodes the provided data into a TON cell based on its type.
//
// The function handles the following cases:
//   - If data is already a *cell.Cell, it is returned as is.
//   - If data is a struct (or pointer to struct), it is directly converted to a cell.
//   - Or else, an error is returned.
func encodeDataCellFor(data any) (*cell.Cell, error) {
	switch d := data.(type) {
	case *cell.Cell:
		return d, nil // already a cell, supports resolver: "codec.resolvers.contract-data-to-cell"
	default:
		// Check if it's a struct (or pointer to struct)
		rv := reflect.ValueOf(data)
		rt := rv.Type()
		if rt.Kind() == reflect.Pointer {
			rt = rt.Elem()
		}

		if rt.Kind() == reflect.Struct {
			// Try to convert struct to cell
			datac, err := tlb.ToCell(data)
			if err != nil {
				return nil, fmt.Errorf("failed to convert struct to cell: %w", err)
			}
			return datac, nil
		}

		return nil, fmt.Errorf("unsupported data type: %T", data)
	}
}
