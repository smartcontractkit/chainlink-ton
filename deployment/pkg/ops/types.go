package ops // alias: opston

import (
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
	GetPlan() MessagePlanRaw
}

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
