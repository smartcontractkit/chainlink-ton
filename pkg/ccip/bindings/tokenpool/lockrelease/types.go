package lockrelease

import (
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// --- Constants ---

// ReturnExcessesBack is shared with jetton lib (0xd53276db) - defined in common/jetton.
// TODO: centralize ReturnExcessesBack opcode in a shared jetton bindings package

const (
	// ReleaseTransferValue is the TON value sent for a release transfer.
	ReleaseTransferValue = 50000000 // 0.05 TON in nanotons
	// ReplyValue is the TON value for reply messages.
	ReplyValue = 10000000 // 0.01 TON in nanotons
	// ContextExecutorDeployValue is the TON value for deploying a ContextExecutor.
	ContextExecutorDeployValue = 20000000 // 0.02 TON in nanotons
)

// --- Data types ---

// ReleaseContext represents the context for a release operation managed by ContextExecutor.
// Corresponds to LockReleaseTokenPool_ReleaseContext in the Tolk contract (opcode: 0xed696f9b).
type ReleaseContext struct {
	_              tlb.Magic                             `tlb:"#ed696f9b" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ForwardPayload tokenpool.ReleaseOrMintForwardPayload `tlb:"^"`
}

// --- Messages (incoming) ---

// ReturnExcessesBack is sent by the jetton wallet after a transfer operation.
// TODO: move to shared jetton bindings package, shared opcode 0xd53276db
type ReturnExcessesBack struct {
	_       tlb.Magic `tlb:"#d53276db" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// --- Storage ---

// Storage represents the LockReleaseTokenPool contract storage.
// Matches Tolk: struct Storage { poolData: Cell<TokenPool_Data>; contextExecutorCode: cell; contextExecutorNextId: uint64; }
type Storage struct {
	PoolData              tokenpool.Storage `tlb:"^"`
	ContextExecutorCode   *cell.Cell        `tlb:"^"`     // Code cell for ContextExecutor deployment
	ContextExecutorNextId uint64            `tlb:"## 64"` // Monotonically increasing ID for deterministic executor addresses
}

// --- Exit Codes ---

// ExitCode represents a LockReleaseTokenPool-specific error code.
// FACILITY_ID = 263, base error = 26300.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeUnexpectedReleaseBounce ExitCode = iota + 26300 // Facility ID 263 * 100
	ExitCodeContextExecutorUnavailable
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	ReturnExcessesBack{},
	// Context types
	ReleaseContext{},
}).MustWithStorageType(Storage{})

// --- Standard interface ---

// From imports common types from the parent tokenpool package for convenience.
type (
	ReleaseOrMint                = tokenpool.ReleaseOrMint
	ReleaseOrMintTransferDetails = tokenpool.ReleaseOrMintTransferDetails
	ChainSelector                = tokenpool.ChainSelector
)
