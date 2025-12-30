package ton // alias: opston

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

var (
	_ Planner[MessagePlanRaw] = AnySequenceOutput{}
)

type AnySequenceInput struct {
	// Definitions and Inputs should be of the same length and order
	Defs   []operations.Definition
	Inputs []any // Each element should be the corresponding input type for its operation
}

// TODO: reuse PlannerOption, Planner, MessageSender interfaces for
// sequences as well. The interfaces would need to return a collection of plans/txs,
// where an operation or a sequence may plan/produce multiple messages.
type AnySequenceOutput struct {
	Plans        []MessagePlanRaw
	Transactions []TransactionInfo
	// TODO: add deployed contract addresses mapping
}

func (o AnySequenceOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

// AnySequenceDeps is a generic map of dependencies
// for ops/seq that may require different types
type AnySequenceDeps map[string]any

var AnySequence = operations.NewSequence(
	"ton/sequences/any",
	semver.MustParse("0.1.0"),
	"Executes and/or plans a sequence of operations as defined by the inputs",
	anySeqHandler,
)

func anySeqHandler(b operations.Bundle, deps AnySequenceDeps, in AnySequenceInput) (AnySequenceOutput, error) {
	if len(in.Defs) != len(in.Inputs) {
		return AnySequenceOutput{}, fmt.Errorf("number of definitions (%d) does not match number of inputs (%d)", len(in.Defs), len(in.Inputs))
	}

	// Initialize the output
	output := AnySequenceOutput{
		Plans:        make([]MessagePlanRaw, 0),
		Transactions: make([]TransactionInfo, 0),
	}

	for i, def := range in.Defs {
		op, err := b.OperationRegistry.Retrieve(def)
		if err != nil {
			return output, fmt.Errorf("failed to retrieve operation %s: %w", def.ID, err)
		}

		// TODO: source requirements and inject deps for each op
		key := def.ID
		opdeps, ok := deps[key]
		if !ok {
			return output, fmt.Errorf("missing dependencies for operation %s", def.ID)
		}

		r, err := operations.ExecuteOperation(b, op, opdeps, in.Inputs[i])
		if err != nil {
			return output, fmt.Errorf("failed to execute operation %s: %w", def.ID, err)
		}

		// Extract plan and transaction info from the output
		po, ok := r.Input.(PlannerOption)
		if ok && po.IsPlan() {
			// If planning option is set, extract the plan
			planer, ok := r.Output.(Planner[MessagePlanRaw]) //nolint:govet // should be ok
			if !ok {
				return output, fmt.Errorf("operation %s output does not implement Planner interface", def.ID)
			}
			output.Plans = append(output.Plans, planer.GetPlans()...)
		}

		sender, ok := r.Output.(MessageSender)
		if ok {
			tx := sender.GetTransaction()
			if tx != nil {
				po, ok := r.Input.(PlannerOption)
				if ok && po.IsPlan() {
					return output, fmt.Errorf("operation %s declared as a plan but returned a transaction", def.ID)
				}
				output.Transactions = append(output.Transactions, *tx)
			}
		}
	}

	return output, nil
}
