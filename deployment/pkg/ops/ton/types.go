package ton // alias: opston

import (
	"context"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

// PlannerOption is an interface an op IN type providing
// an option to produce a message plan.
type PlannerOption interface {
	IsPlan() bool
}

// Planner is an interface for op OUT types that can produce a message plan.
type Planner[T any] interface {
	GetPlans() []T
}

// MessagePlanRaw represents a raw message plan with high-level info and the raw cell.
type MessagePlanRaw struct {
	// High level info about the message
	Opcode  uint32           `json:"opcode"`
	DstAddr *address.Address `json:"dstAddr"`
	Amount  tlb.Coins        `json:"amount"`

	// Raw cell of the internal message
	Cell *tlbe.Cell[tlb.InternalMessage] `json:"cell"`
}

func AsCells(plans []MessagePlanRaw) []*tlbe.Cell[tlb.InternalMessage] {
	cells := make([]*tlbe.Cell[tlb.InternalMessage], len(plans))
	for i, plan := range plans {
		cells[i] = plan.Cell
	}
	return cells
}

// MessageSender is an interface for op OUT types that can provide transaction info.
type MessageSender interface {
	GetTransaction() *tlbe.Cell[tlb.Transaction]
}

// &tlb.InternalMessage representation
type InternalMessage[T any] struct {
	Bounce    bool                      `json:"bounce"`
	DstAddr   *address.Address          `json:"dstAddr"`
	Amount    tlb.Coins                 `json:"amount"`
	Body      *codec.MessageEnvelope[T] `json:"body,omitempty"`
	StateInit *StateInit                `json:"stateInit,omitempty"`
}

func (im *InternalMessage[T]) ToMessage() (*tlb.InternalMessage, error) {
	msg := &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      im.Bounce,
		DstAddr:     im.DstAddr,
		Amount:      im.Amount,
	}

	if im.StateInit != nil {
		msg.StateInit = &tlb.StateInit{}
		if im.StateInit.Code != nil {
			msg.StateInit.Code = im.StateInit.Code
		}
		if im.StateInit.Data != nil {
			msg.StateInit.Data = im.StateInit.Data
		}

		stateCell, err := tlb.ToCell(msg.StateInit)
		if err != nil {
			return nil, fmt.Errorf("failed to convert state init to cell: %w", err)
		}

		wc := int8(0) // TODO: expose option to set workchain (default ok for now)
		msg.DstAddr = address.NewAddress(0, byte(wc), stateCell.Hash())
	}

	// Notice: nil Body is allowed (empty message)
	if im.Body != nil {
		// recursive for nested envelopes
		err := im.Body.LoadDecoded(bindings.Registry)
		if err != nil {
			return nil, fmt.Errorf("failed to load message body envelope: %w", err)
		}

		bodyCell, err := im.Body.ToCell()
		if err != nil {
			return nil, fmt.Errorf("failed to convert message body to cell: %w", err)
		}
		msg.Body = bodyCell
	}

	return msg, nil
}

func (im *InternalMessage[T]) ToCell() (*cell.Cell, error) {
	msg, err := im.ToMessage()
	if err != nil {
		return nil, fmt.Errorf("failed to convert InternalMessage to tlb.InternalMessage: %w", err)
	}
	return tlb.ToCell(msg)
}

type StateInit struct {
	Code *cell.Cell `json:"code,omitempty"`
	Data *cell.Cell `json:"data,omitempty"`
}

// ContractCodeProvider provides compiled contract code based on metadata.
type ContractCodeProvider interface {
	GetContract(ctx context.Context, meta ContractMetadata) (CompiledContract, error)
}

// Describes a contract by its package and identifier, used to retrieve compiled code from a ContractCodeProvider.
type ContractMetadata struct {
	Package string                 `json:"package"` // Name of the package where the contract is defined (e.g., "github.com/smartcontractkit/chainlink-ton@contracts/v1.6.3")
	ID      tvm.FullyQualifiedName `json:"id"`      // Contract identifier within the package
}

func (m ContractMetadata) Key() string {
	return fmt.Sprintf("%s:%s", m.Package, m.ID)
}

// CompiledContract represents a compiled TON contract with its name and code (cell).
type CompiledContract struct {
	Metadata ContractMetadata `json:"metadata"` // Metadata to identify the contract (package, id, version)
	Code     *cell.Cell       `json:"code"`     // Compiled code of the contract as a cell
	Version  *semver.Version  `json:"version"`  // Version of the contract package (e.g., semver.MustParse("0.1.0"))
}
