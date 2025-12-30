package ton // alias: opston

import (
	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

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

// TODO: can be merged/replaced with InternamlMessage type?
type MessagePlanRaw struct {
	Body    *cell.Cell       `json:"body"`
	DstAddr *address.Address `json:"dst_addr"`
	Amount  tlb.Coins        `json:"amount"`
	// TODO: StateInit missing?
}

// MessageSender is an interface for op OUT types that can provide transaction info.
type MessageSender interface {
	GetTransaction() *TransactionInfo
}

type TransactionInfo struct {
	AccountAddr *address.Address  `json:"account_addr"`
	Hash        string            `json:"hash"`
	OutMsgCount uint16            `json:"out_msg_count"`
	EndStatus   tlb.AccountStatus `json:"end_status"`
	TotalFees   tlb.Coins         `json:"total_fees"`
}

// &tlb.InternalMessage representation
type InternalMessage[T any] struct {
	Bounce    bool                     `json:"bounce"`
	DstAddr   *address.Address         `json:"dst_addr"`
	Amount    tlb.Coins                `json:"amount"`
	Body      codec.MessageEnvelope[T] `json:"body"`
	StateInit *StateInit               `json:"state_init,omitempty"`
}

type StateInit struct {
	Code *cell.Cell `json:"code,omitempty"`
	Data *cell.Cell `json:"data,omitempty"`
}

// ContractProvider provides compiled contract code based on metadata.
type ContractProvider interface {
	GetContract(meta ContractMetadata) (CompiledContract, error)
}

type ContractMetadata struct {
	Package string          `json:"package"` // Name of the package where the contract is defined (e.g., "github.com/smartcontractkit/chainlink-ton")
	Version *semver.Version `json:"version"` // Version of the contract package (e.g., semver.MustParse("0.1.0"))
	ID      string          `json:"id"`      // Contract identifier within the package (e.g., "mcms.RBACTimelock") (can be a path, or maps to a path within the package)
}

// CompiledContract represents a compiled TON contract with its name and code (cell).
type CompiledContract struct {
	Name string
	Code *cell.Cell
}
