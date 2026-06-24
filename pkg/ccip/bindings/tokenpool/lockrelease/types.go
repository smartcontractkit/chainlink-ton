package lockrelease

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Constants ---

// ReturnExcessesBack is shared with jetton lib (0xd53276db) - defined in common/jetton.
// TODO: centralize ReturnExcessesBack opcode in a shared jetton bindings package

const (
	// ReleaseTransferValue is the TON value sent for a release transfer.
	ReleaseTransferValue = 50000000 // 0.05 TON in nanotons
	// ReplyValue is the TON value for reply messages.
	ReplyValue = 10000000 // 0.01 TON in nanotons
)

// --- Data types ---

// PendingRelease represents a pending release operation.
// Corresponds to LockReleaseTokenPool_PendingRelease in the Tolk contract.
type PendingRelease struct {
	ReplyTo        *address.Address              `tlb:"addr"`
	Request        *tokenpool.ReleaseOrMintInV1  `tlb:"^"`
	Out            *tokenpool.ReleaseOrMintOutV1 `tlb:"^"`
	ExpectedSender *address.Address              `tlb:"addr"`
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
// Extends the common TokenPool storage with lock/release specific state.
type Storage struct {
	PoolData        tokenpool.Storage              `tlb:"^"`
	JettonClient    *cell.Cell                     `tlb:"^"`       // Cell<JettonClient> - TODO: define JettonClient type in common/jetton bindings
	PendingReleases *tlbe.Dict[uint64, *cell.Cell] `tlb:"dict 64"` // map<uint64, Cell<PendingRelease>>
}

// --- Exit Codes ---

// ExitCode represents a LockReleaseTokenPool-specific error code.
// FACILITY_ID = 263, base error = 26300.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodePendingReleaseAlreadyExists ExitCode = iota + 26300 // Facility ID 263 * 100
	ExitCodePendingReleaseNotFound
	ExitCodeUnexpectedReleaseConfirmationSender
	ExitCodeUnexpectedReleaseBounce
)

// New converts an ExitCode to a tvm.ExitCode.
func (e ExitCode) New() tvm.ExitCode {
	return tvm.ExitCode(e)
}

// --- TLB Registry ---

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	ReturnExcessesBack{},
}).MustWithStorageType(Storage{})

// --- Standard interface ---

// From imports common types from the parent tokenpool package for convenience.
type (
	ReleaseOrMint                = tokenpool.ReleaseOrMint
	ReleaseOrMintTransferDetails = tokenpool.ReleaseOrMintTransferDetails
	ChainSelector                = tokenpool.ChainSelector
)
