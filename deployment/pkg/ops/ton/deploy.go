package ton // alias: opston

import (
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
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
	Message      InternalMessage[T] `json:"message"`
	ContractMeta ContractMetadata   `json:"contract_meta"`
	Data         *D                 `json:"data"`
}

func (in DeployInput) IsPlan() bool {
	return in.Plan
}

type DeployOutput struct {
	Plans       []MessagePlanRaw `json:"plans"`
	Transaction *TransactionInfo `json:"transaction,omitempty"`
}

func (o DeployOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o DeployOutput) GetTransaction() *TransactionInfo {
	return o.Transaction
}

type DeployDeps struct {
	ContractProvider ContractProvider
	Wallet           *wallet.Wallet
}

var Deploy = operations.NewOperation(
	"ton/ops/deploy",
	semver.MustParse("0.1.0"),
	"Deploys contracts by sending messages with code loaded from the provider",
	func(b operations.Bundle, deps DeployDeps, in DeployInput) (DeployOutput, error) {
		// Load contracts and prepare the underlying []InternalMessage[any]
		_messages := make([]InternalMessage[any], len(in.Messages))
		for i, u := range in.Messages {
			c, err := deps.ContractProvider.GetContract(u.ContractMeta)
			if err != nil {
				return DeployOutput{}, fmt.Errorf("failed to get contract code: %w", err)
			}

			// prepare message with loaded code and data as StateInit
			m := u.Message
			val := m.Body.Value
			valAny := any(val)

			var data *cell.Cell
			if u.Data != nil {
				// Convert Data to cell based on its type
				data, err = encodeDataCellFor(u.ContractMeta, u.Data)
				if err != nil {
					return DeployOutput{}, fmt.Errorf("failed to encode data cell: %w", err)
				}
			}

			_messages[i] = InternalMessage[any]{
				Bounce:  m.Bounce,
				DstAddr: m.DstAddr,
				Amount:  m.Amount,
				Body: codec.MessageEnvelope[any]{
					Metadata: m.Body.Metadata,
					Payload:  m.Body.Payload,
					Cell:     m.Body.Cell,
					Value:    &valAny,
				},
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

		// TOOD: improve deps passing
		opdeps := SendMessagesDeps{
			Wallet: deps.Wallet,
		}

		r, err := operations.ExecuteOperation(b, SendMessages, opdeps, _in)
		if err != nil {
			return DeployOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
		}

		return DeployOutput{
			Plans:       r.Output.GetPlans(),
			Transaction: r.Output.GetTransaction(),
		}, nil
	},
)

// TODO: registry of contract metadata to (storage/data) struct type mappings
func getDataStructType(meta ContractMetadata) (reflect.Type, error) {
	// For simplicity, we can have a hardcoded mapping here.
	// In a real implementation, this could query a registry or use metadata.
	switch meta.ID {
	case "mcms.MCMS":
		return reflect.TypeOf(mcms.Data{}), nil
	// Add more contract metadata to struct type mappings as needed.
	default:
		return nil, fmt.Errorf("unknown contract for data struct type: %s", meta.ID)
	}
}

// encodeDataCellFor encodes the provided data into a TON cell based on its type.
//
// The function handles the following cases:
//   - If data is already a *cell.Cell, it is returned as is.
//   - If data is a map[string]any, it is unmarshaled into the appropriate struct type
//     based on the contract metadata and struct registry, then converted to a cell.
//   - If data is a struct (or pointer to struct), it is directly converted to a cell.
//   - Or else, an error is returned.
func encodeDataCellFor(meta ContractMetadata, data any) (*cell.Cell, error) {
	switch d := data.(type) {
	case *cell.Cell:
		return d, nil // already a cell pointer
	case map[string]any:
		// Need to find the struct type and unmarshal map to it
		// Get the target struct type from contract metadata or registry
		targetType, err := getDataStructType(meta)
		if err != nil {
			return nil, fmt.Errorf("failed to get data struct type: %w", err)
		}

		// Create new instance of the struct
		structVal := reflect.New(targetType).Interface()

		// Unmarshal map to struct (via JSON roundtrip or mapstructure)
		jsonBytes, err := json.Marshal(d)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal map: %w", err)
		}
		if err := json.Unmarshal(jsonBytes, structVal); err != nil {
			return nil, fmt.Errorf("failed to unmarshal to struct: %w", err)
		}

		// Convert struct to cell
		datac, err := tlb.ToCell(structVal)
		if err != nil {
			return nil, fmt.Errorf("failed to convert data to cell: %w", err)
		}

		return datac, nil
	default:
		// Check if it's a struct (or pointer to struct)
		rv := reflect.ValueOf(data)
		rt := rv.Type()
		if rt.Kind() == reflect.Ptr {
			rt = rt.Elem()
			rv = rv.Elem()
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
