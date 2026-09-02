package lockreleaselockbox

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
)

// --- Constants ---

const (
	// OffRampAccountDeployValue is the TON value sent when deploying the per-release
	// DepositAccount (off-ramp role). lock_release_lockbox deploys with value 0 and carries
	// the remaining message value through (SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE).
	OffRampAccountDeployValue = 0
)

// --- Data types ---

// LockContext represents the context for a lock operation. Carries the full forward payload
// for post-lock finalization.
type LockContext struct {
	_              tlb.Magic                          `tlb:"#60fdb63b" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ForwardPayload tokenpool.LockOrBurnForwardPayload `tlb:"^"`
}

// ReleaseContext represents the context passed to the DepositAccount (off-ramp role) for
// release operations. Carries the full forward payload for post-release finalization.
type ReleaseContext struct {
	_              tlb.Magic                             `tlb:"#90230477" json:"-"` //nolint:revive // (opcode) should stay uninitialized
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

// Storage represents the LockReleaseLockboxTokenPool contract storage.
type Storage struct {
	PoolData           tokenpool.Storage `tlb:"^"`
	Lockbox            *address.Address  `tlb:"addr"` // JettonLockBox address
	OffRampAccountCode *cell.Cell        `tlb:"^"`    // Compiled code cell of the DepositAccount (off-ramp role), deployed per release operation
}

// --- Exit Codes ---

// ExitCode represents a LockReleaseLockboxTokenPool-specific error code.
// FACILITY_ID = 209, base error = 20900.
type ExitCode tvm.ExitCode

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go

const (
	ExitCodeLockboxNotConfigured ExitCode = iota + 20900 // Facility ID 209 * 100
	ExitCodeUnexpectedLockboxConfirmationSender
	ExitCodeUnexpectedLockBounce
	ExitCodeInvalidOffRampAccountReply
	ExitCodeInvalidOffRampAccountNotification
	ExitCodeOffRampAccountDeployFailed
	ExitCodeLockboxWithdrawFailed
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
	LockContext{},
	ReleaseContext{},
}).MustWithStorageType(Storage{})

// --- Standard interface ---

// Re-import common types from the parent tokenpool package for convenience.
type (
	LockOrBurn                   = tokenpool.LockOrBurn
	ReleaseOrMint                = tokenpool.ReleaseOrMint
	LockOrBurnTransferDetails    = tokenpool.LockOrBurnTransferDetails
	ReleaseOrMintTransferDetails = tokenpool.ReleaseOrMintTransferDetails
	LockOrBurnForwardPayload     = tokenpool.LockOrBurnForwardPayload
	ChainSelector                = tokenpool.ChainSelector
)
