package contextexecutor

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// --- Constants ---

const (
	// FacilityID is derived from crc32("link.chain.ton.lib.executor.ContextExecutor") % 640 + 10.
	FacilityID    = 260
	ErrorCodeBase = FacilityID * 100
)

// --- Data types ---

// Data represents the ContextExecutor contract storage.
// C = context type (generic, encoded as a cell).
// Note: array<address> in Tolk uses a custom encoding (not standard TLB).
// We encode/decode the entire array as a cell ref for safety.
type Data struct {
	ID          uint64           `tlb:"## 64"`
	Owner       *address.Address `tlb:"addr"`
	Context     *cell.Cell       `tlb:"^"`
	ForwardFrom *cell.Cell       `tlb:"^"` // array<address> - Tolk uses custom encoding
}

// --- Messages (incoming) ---

// Set initializes the executor with context and forwardFrom addresses.
// Only callable by the owner.
// Opcode: 0x44e61eec
type Set struct {
	_           tlb.Magic  `tlb:"#44e61eec" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID     uint64     `tlb:"## 64"`
	Context     *cell.Cell `tlb:"^"`
	ForwardFrom *cell.Cell `tlb:"^"` // array<address>
}

// Ask queries the executor for context and forward payload.
// Opcode: 0xcad4d1d0
type Ask struct {
	_              tlb.Magic  `tlb:"#cad4d1d0" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	ForwardPayload *cell.Cell `tlb:"^"`
	Done           bool       `tlb:"bool"`
}

// --- Messages (outgoing) ---

// Reply is sent in response to Set or Ask messages.
// Opcode: 0x93e5bbc5
type Reply struct {
	_              tlb.Magic  `tlb:"#93e5bbc5" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	ID             uint64     `tlb:"## 64"`
	Context        *cell.Cell `tlb:"^"`
	ForwardFrom    *cell.Cell `tlb:"^"` // array<address>
	ForwardPayload *cell.Cell `tlb:"^"`
	Done           bool       `tlb:"bool"`
}

// ForwardNotification is sent by the executor to the owner when a message
// arrives from a registered forwardFrom address. The executor clears its
// forwardFrom list before sending this notification (one-shot semantics).
//
// Opcode: 0x55b412b9
type ForwardNotification struct {
	_           tlb.Magic  `tlb:"#55b412b9" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ID          uint64     `tlb:"## 64"`
	Context     *cell.Cell `tlb:"^"`
	ForwardFrom *cell.Cell `tlb:"^"` // array<address> (captured before clearing)
	Message     *cell.Cell `tlb:"^"` // Cell<InMessageForward>
}

// --- InMessageForward ---

// InMessageForward represents an internal message received by the executor.
// This mirrors the Tolk struct ContextExecutor_InMessageForward which is
// a synthetic struct (not a TLB message with an opcode).
// We encode it as a raw cell since it follows InternalMsgAddress encoding,
// not a standard TLB struct.
type InMessageForward struct {
	SenderAddress      *address.Address `tlb:"addr"`
	ValueCoins         tlb.Coins        `tlb:"int 257"`
	ValueExtra         *cell.Cell       `tlb:"^"` // ExtraCurrenciesMap
	OriginalForwardFee tlb.Coins        `tlb:"int 257"`
	CreatedLT          uint64           `tlb:"## 64"`
	CreatedAt          uint32           `tlb:"## 32"`
	Body               *cell.Cell       `tlb:"^"`
}

// --- Exit Codes ---

// ExitCode represents a ContextExecutor-specific error code.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeOnlyCallableByOwner ExitCode = iota + FacilityID*100
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	Set{},
	Ask{},
	// Outgoing
	Reply{},
	ForwardNotification{},
}).MustWithStorageType(Data{})
