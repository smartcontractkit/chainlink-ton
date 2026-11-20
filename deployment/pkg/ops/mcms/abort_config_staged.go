package mcms // alias: opsmcms

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	mcmsbind "github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

type AbortConfigStagedInput struct {
	Bounce  bool             `json:"bounce"`
	DstAddr *address.Address `json:"dstAddr"`
	Amount  tlb.Coins        `json:"amount"`
	QueryID uint64           `json:"queryId"`
	Plan    bool             `json:"plan"`
}

// AbortConfigStaged discards the staged config for the given query ID. It is the
// recovery counterpart to SetConfigStaged when a staging session is no longer needed.
var AbortConfigStaged = cldfops.NewOperation(
	"ton/ops/mcms/abort-config-staged",
	semver.MustParse("0.1.0"),
	"Sends or plans abortConfigStaging for MCMS contracts",
	func(b cldfops.Bundle, dp *dep.DependencyProvider, in AbortConfigStagedInput) (opston.SendMessagesOutput, error) {
		if _, err := dep.Resolve[cldfton.Chain](dp); err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
		}
		if in.DstAddr == nil {
			return opston.SendMessagesOutput{}, errors.New("destination address (DstAddr) is required")
		}
		if in.Amount.IsZero() {
			return opston.SendMessagesOutput{}, errors.New("amount must be greater than zero")
		}

		value := mcmsbind.AbortConfig{QueryID: in.QueryID}
		meta, err := codec.NewMessageMetaFromValue(bindings.TypeMCMS, value)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to build message metadata: %w", err)
		}
		bodyCell, err := tlb.ToCell(value)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to encode message body: %w", err)
		}

		messages := []opston.InternalMessage[any]{{
			Bounce:  in.Bounce,
			DstAddr: in.DstAddr,
			Amount:  in.Amount,
			Body: &codec.MessageEnvelope[any]{
				Metadata: meta,
				Cell:     bodyCell,
				Value:    &value,
			},
		}}

		out, err := cldfops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
			Messages: messages,
			Plan:     in.Plan,
		})
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to send or plan abortConfigStaging: %w", err)
		}
		return out.Output, nil
	},
)
