package timelock

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

// --- Messages - incoming ---

// @dev Initializes the contract with the following parameters:
//
// - `minDelay`: initial minimum delay for operations
// - `admin`: account to be granted admin role
// - `proposers`: accounts to be granted proposer role
// - `executors`: accounts to be granted executor role
// - `cancellers`: accounts to be granted canceller role
// - `bypassers`: accounts to be granted bypasser role
type Init struct {
	_ tlb.Magic `tlb:"#4982fcfd"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Minimum delay in seconds for future operations.
	MinDelay uint64 `tlb:"## 64"`

	// Address of the admin account.
	Admin address.Address `tlb:"addr"`

	// Collection of addresses to be granted proposer, executor, canceller and bypasser roles.
	Proposers  []address.Address `tlb:"^"`
	Executors  []address.Address `tlb:"^"`
	Cancellers []address.Address `tlb:"^"`
	Bypassers  []address.Address `tlb:"^"`
}

// @dev Top up contract with TON coins.
// Contract might receive/hold TON as part of the maintenance process.
type TopUp struct {
	_ tlb.Magic `tlb:"#fee62ba6"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`
}

// @dev Schedule an operation containing a batch of transactions.
//
// Emits one {Timelock_CallScheduled} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'proposer' or 'admin' role.
// - all payloads must not start with a blocked function selector.
type ScheduleBatch struct {
	_ tlb.Magic `tlb:"#094718f4"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Calls       []Call   `tlb:"^"`      // Array of calls to be scheduled // vec<Timelock_Call>
	Predecessor *big.Int `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int `tlb:"## 256"` // Salt used to derive the operation ID
	Delay       uint64   `tlb:"## 64"`  // Delay in seconds before the operation can be executed
}

// @dev Cancel an operation.
//
// Requirements:
//
// - the caller must have the 'canceller' or 'admin' role.
type Cancel struct {
	_ tlb.Magic `tlb:"#af3bf1d0"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// ID of the operation to cancel.
	ID *big.Int `tlb:"## 256"`
}

// @dev Execute an (ready) operation containing a batch of transactions.
//
// Emits one {Timelock_CallExecuted} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'executor' or 'admin' role.
type ExecuteBatch struct {
	_ tlb.Magic `tlb:"#6e9bf263"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Calls       []Call   `tlb:"^"`      // Array of calls to be scheduled // vec<Timelock_Call>
	Predecessor *big.Int `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int `tlb:"## 256"` // Salt used to derive the operation ID
}

// @dev Changes the minimum timelock duration for future operations.
//
// Emits a {Timelock_MinDelayChange} event.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UpdateDelay struct {
	_ tlb.Magic `tlb:"#7a57a45c"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// New minimum delay in seconds for future operations.
	NewDelay uint64 `tlb:"## 64"`
}

// @dev Blocks a function selector from being used, i.e. schedule
// operations with this function selector will revert.
//
// Note that blocked selectors are only checked when an operation is being
// scheduled, not when it is executed. You may want to check any pending
// operations for whether they contain the blocked selector and cancel them.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type BlockFunctionSelector struct {
	_ tlb.Magic `tlb:"#2637af77"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector to block.
	Selector uint32 `tlb:"## 32"`
}

// @dev Unblocks a previously blocked function selector so it can be used again.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UnblockFunctionSelector struct {
	_ tlb.Magic `tlb:"#26f19f4e"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector to unblock.
	Selector uint32 `tlb:"## 32"`
}

// @dev Directly execute a batch of transactions, bypassing any other checks.
//
// Emits one {Timelock_BypasserCallExecuted} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'bypasser' or 'admin' role.
type BypasserExecuteBatch struct {
	_ tlb.Magic `tlb:"#bb0e9f7d"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Array of calls to be scheduled
	Calls []Call `tlb:"^"` // vec<Timelock_Call>
}

// --- Messages - outgoing ---

// @dev Emitted when a call is scheduled as part of operation `id`.
type CallScheduled struct {
	_ tlb.Magic `tlb:"#c55fca54"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	ID          *big.Int `tlb:"## 256"` // ID of the operation that was scheduled.
	Index       uint64   `tlb:"## 64"`  // Index of the call in the operation
	Call        Call     `tlb:"^"`      // Call to be executed as part of the operation.
	Predecessor *big.Int `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int `tlb:"## 256"` // Salt used to derive the operation ID
	Delay       uint64   `tlb:"## 64"`  // Delay in seconds before the operation can be executed
}

// @dev Emitted when a call is performed as part of operation `id`.
type CallExecuted struct {
	_ tlb.Magic `tlb:"#49ea5d0e"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	ID     *big.Int        `tlb:"## 256"` // ID of the operation that was executed.
	Index  uint64          `tlb:"## 64"`  // Index of the call in the operation
	Target address.Address `tlb:"addr"`   // Address of the target contract to call.
	Value  tlb.Coins       `tlb:"## 256"` // Value in TONs to send with the call.
	Data   *cell.Cell      `tlb:"^"`      // Data to send with the call - message body.
}

// @dev Emitted when a call is performed via bypasser.
type BypasserCallExecuted struct {
	_ tlb.Magic `tlb:"#9c7f3010"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Index  uint64          `tlb:"## 64"`  // Index of the call in the operation
	Target address.Address `tlb:"addr"`   // Address of the target contract to call.
	Value  tlb.Coins       `tlb:"## 256"` // Value in TONs to send with the call.
	Data   *cell.Cell      `tlb:"^"`      // Data to send with the call - message body.
}

// @dev Emitted when operation `id` is cancelled.
type Cancelled struct {
	_ tlb.Magic `tlb:"#580e80f2"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	ID *big.Int `tlb:"## 256"` // ID of the operation that was cancelled.
}

// @dev Emitted when the minimum delay for future operations is modified.
type MinDelayChange struct {
	_ tlb.Magic `tlb:"#904b14e0"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	OldDuration uint64 `tlb:"## 64"` // Duration of the old minimum delay in seconds.
	NewDuration uint64 `tlb:"## 64"` // Duration of the new minimum delay in seconds.
}

// @dev Emitted when a function selector is blocked.
type FunctionSelectorBlocked struct {
	_ tlb.Magic `tlb:"#9c4d6d94"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector that was blocked.
	Selector uint32 `tlb:"## 32"`
}

// @dev Emitted when a function selector is unblocked.
type FunctionSelectorUnblocked struct {
	_ tlb.Magic `tlb:"#f410a31b"` //nolint:revive // opcode magic
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector that was unblocked.
	Selector uint32 `tlb:"## 32"`
}

// --- Data (storage & structures) ---

// RBACTimelock contract storage, auto-serialized to/from cell.
type Data struct {
	// ID allows multiple independent instances, since contract address depends on initial state.
	ID uint32 `tlb:"## 32"`

	// Minimum delay for operations in seconds
	MinDelay uint64 `tlb:"## 64"`
	// Map of operation id to timestamp
	Timestamps map[uint64]uint64 `tlb:"dict"`

	// Number of fn selectors blocked by the contract.
	BlockedFnSelectorsLen uint32 `tlb:"## 32"`
	// Map of blocked function selectors.
	BlockedFnSelectors map[uint32]bool `tlb:"dict"`

	// TODO: import as rbac.Data bindings from pkg/bindings/lib/access/rbac
	RBAC rbac.Data `tlb:"^"`
}

// @dev Represents a single call
type Call struct {
	// Address of the target contract to call.
	Target address.Address `tlb:"addr"`
	// Value in TONs to send with the call.
	Value *big.Int `tlb:"## 256"`
	// Data to send with the call - message body.
	Data *cell.Cell `tlb:"^"`
}

// @dev Batch of transactions represented as a operation, which can be scheduled and executed.
type OperationBatch struct {
	// Array of calls to be scheduled
	Calls []Call `tlb:"^"` // vec<Timelock_Call>
	// Predecessor operation ID
	Predecessor *big.Int `tlb:"## 256"`
	// Salt used to derive the operation ID
	Salt *big.Int `tlb:"## 256"`
}

// --- Constants ---

const (
	// Timestamp value used to mark an operation as done
	DoneTimestamp = 1

	// Error codes
	ErrorSelectorIsBlocked          = 101
	ErrorOperationNotReady          = 102
	ErrorOperationMissingDependency = 103
	ErrorOperationCannotBeCancelled = 104
	ErrorOperationAlreadyScheduled  = 105
	ErrorInsufficientDelay          = 106
)
