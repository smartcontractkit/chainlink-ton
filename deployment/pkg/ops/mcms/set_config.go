package mcms // alias: opsmcms

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

var _ opston.PlannerOption = SetConfigInput{}

type SetConfigInput struct {
	// SetConfig message parameters
	Bounce  bool             `json:"bounce"`
	DstAddr *address.Address `json:"dstAddr"`
	Amount  tlb.Coins        `json:"amount"`

	// Params for setConfig message body
	Config    *mcmstypes.Config `json:"config"` // Notice: common config input type
	ClearRoot bool              `json:"clearRoot"`

	Plan bool             `json:"plan"`
	Wait *config.Duration `json:"wait,omitempty"` // optional wait time after sending messages (trace tracking)
}

func (in SetConfigInput) IsPlan() bool {
	return in.Plan
}

var SetConfig = cldfops.NewOperation(
	"ton/ops/mcms/set-config",
	semver.MustParse("0.1.0"),
	"Sets the configuration for MCMS contracts",
	func(b cldfops.Bundle, dp *dep.DependencyProvider, in SetConfigInput) (opston.SendMessagesOutput, error) {
		chain, err := dep.Resolve[cldfton.Chain](dp)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
		}

		// Plan a setConfig message
		// TODO: check is ConfigTransformer.ToChainConfig can be used? Is it used anywhere else for any chain?
		configurer, err := mcmston.NewConfigurer(chain.Wallet, tlb.MustFromTON("0"), mcmston.WithDoNotSendInstructionsOnChain())
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to transform MCMS config to chain format: %w", err)
		}

		if in.DstAddr == nil {
			return opston.SendMessagesOutput{}, errors.New("destination address (DstAddr) is required")
		}

		tr, err := configurer.SetConfig(b.GetContext(), in.DstAddr.String(), in.Config, in.ClearRoot)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to transform MCMS config to chain format: %w", err)
		}

		tx, ok := tr.RawData.(mcmstypes.Transaction)
		if !ok {
			return opston.SendMessagesOutput{}, fmt.Errorf("unexpected type for configurer output: %T", tr.RawData)
		}

		body, err := cell.FromBOC(tx.Data) // extract the planned body
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to parse MCMS setC BOC: %w", err)
		}

		// Plan or send the message based on the input
		mcell, err := tlbe.NewCellFrom(tlb.InternalMessage{
			Bounce:  in.Bounce,
			DstAddr: in.DstAddr,
			Amount:  in.Amount,
			Body:    body,
		})
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to create message cell: %w", err)
		}

		opcode, err := tvm.ExtractOpcode(body)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to extract opcode from message body: %w", err)
		}

		if in.Plan {
			plan := opston.MessagePlanRaw{
				Opcode:  opcode,
				DstAddr: in.DstAddr,
				Amount:  in.Amount,

				Cell: mcell,
			}

			return opston.SendMessagesOutput{Plans: []opston.MessagePlanRaw{plan}}, nil // return early on plan
		}

		msgs := []*tlbe.Cell[tlb.InternalMessage]{mcell}
		out, err := cldfops.ExecuteOperation(b, opston.SendMessagesRaw, dp, opston.SendMessagesRawInput{Messages: msgs, Wait: in.Wait})
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to send messages: %w", err)
		}

		return out.Output, nil
	},
)
