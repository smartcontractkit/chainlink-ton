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
	// OffRampAccountDeployValue is the TON value sent when deploying the per-release off-ramp account.
	OffRampAccountDeployValue = 100000000 // 0.1 TON in nanotons
)

// --- Data types ---

// ReleaseContext represents the context passed to the DepositAccount (off-ramp role) for
// release operations. Carries the full forward payload for post-release finalization.
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
type Storage struct {
	PoolData           tokenpool.Storage `tlb:"^"`
	OffRampAccountCode *cell.Cell        `tlb:"^"` // Compiled code cell of the DepositAccount (off-ramp role)
}

// --- Exit Codes ---

// ExitCode represents a LockReleaseTokenPool-specific error code.
// FACILITY_ID = 72, base error = 7200.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeUnexpectedReleaseBounce ExitCode = iota + 7200 // Facility ID 72 * 100
	ExitCodeInvalidOffRampAccountReply
	ExitCodeInvalidOffRampAccountNotification
	ExitCodeOffRampAccountDeployFailed
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
