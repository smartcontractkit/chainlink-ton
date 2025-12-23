package ops // alias: opston

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// MessagePlannerOption is an interface an op IN type providing
// an option to produce a message plan.
type MessagePlannerOption interface {
	IsPlan() bool
}

// MessagePlanner is an interface for op OUT types that can produce a message plan.
type MessagePlanner interface {
	GetPlans() []MessagePlanRaw
}

// TODO: can be merged/replaced with InternamlMessage type?
type MessagePlanRaw struct {
	Body    *cell.Cell       `json:"body"`
	DstAddr *address.Address `json:"dst_addr"`
	Amount  tlb.Coins        `json:"amount"`
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
