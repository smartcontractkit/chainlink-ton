package ton // alias: opston

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
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

// plan: *tlbe.Cell[tlb.InternalMessage]

// MessageSender is an interface for op OUT types that can provide transaction info.
type MessageSender interface {
	GetTransaction() *TransactionInfo
}

type TransactionInfo struct {
	AccountAddr *address.Address  `json:"accountAddr"`
	Hash        string            `json:"hash"`
	OutMsgCount uint16            `json:"outMsgCount"`
	EndStatus   tlb.AccountStatus `json:"endStatus"`
	TotalFees   tlb.Coins         `json:"totalFees"`
}

// &tlb.InternalMessage representation
type InternalMessage[T any] struct {
	Bounce    bool                     `json:"bounce"`
	DstAddr   *address.Address         `json:"dstAddr"`
	Amount    tlb.Coins                `json:"amount"`
	Body      codec.MessageEnvelope[T] `json:"body"`
	StateInit *StateInit               `json:"stateInit,omitempty"`
}

func (im *InternalMessage[T]) ToMessage() (*tlb.InternalMessage, error) {
	msg := &tlb.InternalMessage{
		Bounce:  im.Bounce,
		DstAddr: im.DstAddr,
		Amount:  im.Amount,
	}

	if im.StateInit != nil {
		msg.StateInit = &tlb.StateInit{}
		if im.StateInit.Code != nil {
			msg.StateInit.Code = im.StateInit.Code
		}
		if im.StateInit.Data != nil {
			msg.StateInit.Data = im.StateInit.Data
		}
	}

	bodyCell, err := im.Body.ToCell()
	if err != nil {
		return nil, fmt.Errorf("failed to convert message body to cell: %w", err)
	}
	msg.Body = bodyCell

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
	GetContract(meta ContractMetadata) (CompiledContract, error)
}

type ContractMetadata struct {
	Package string          `json:"package"` // Name of the package where the contract is defined (e.g., "github.com/smartcontractkit/chainlink-ton")
	Version *semver.Version `json:"version"` // Version of the contract package (e.g., semver.MustParse("0.1.0"))
	ID      string          `json:"id"`      // Contract identifier within the package (e.g., "mcms.RBACTimelock") (can be a path, or maps to a path within the package)
}

func (m ContractMetadata) Key() string {
	return fmt.Sprintf("%s@%s:%s", m.Package, m.Version.String(), m.ID)
}

// CompiledContract represents a compiled TON contract with its name and code (cell).
type CompiledContract struct {
	Metadata ContractMetadata
	Code     *cell.Cell
}
