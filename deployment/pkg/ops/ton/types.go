package ton // alias: opston

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

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

// RawPlansToBatch converts raw message plans (TON) to MCMS batch operation type.
func RawPlansToBatch(selector types.ChainSelector, plans []MessagePlanRaw, meta []types.OperationMetadata) (types.BatchOperation, error) {
	mcmsTxs := make([]types.Transaction, len(plans))
	for i, planRaw := range plans {
		data := cell.BeginCell().EndCell() // empty body by default
		if planRaw.Body != nil {
			data = planRaw.Body
		}

		// Extract metadata for the transaction
		m := types.OperationMetadata{
			ContractType: "",
			Tags:         []string{},
		}
		if len(meta) > i {
			m = meta[i]
		}

		var err error
		mcmsTxs[i], err = mcmston.NewTransaction(
			planRaw.DstAddr,
			data.BeginParse(),
			planRaw.Amount.Nano(),
			m.ContractType,
			m.Tags,
		)
		if err != nil {
			return types.BatchOperation{}, fmt.Errorf("failed to create mcms transaction: %w", err)
		}
	}

	return types.BatchOperation{
		ChainSelector: types.ChainSelector(selector),
		Transactions:  mcmsTxs,
	}, nil
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
