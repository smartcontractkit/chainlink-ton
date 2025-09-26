package timelock

import (
	"math/big"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// --- Messages - incoming ---

// Initializes the contract with the following parameters:
//
// - `minDelay`: initial minimum delay for operations
// - `admin`: account to be granted admin role
// - `proposers`: accounts to be granted proposer role
// - `executors`: accounts to be granted executor role
// - `cancellers`: accounts to be granted canceller role
// - `bypassers`: accounts to be granted bypasser role
type Init struct {
	_ tlb.Magic `tlb:"#4982fcfd"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Minimum delay in seconds for future operations.
	MinDelay uint64 `tlb:"## 64"`

	// Address of the admin account.
	Admin address.Address `tlb:"addr"`

	// Collection of addresses to be granted proposer, executor, canceller and bypasser roles.
	Proposers  common.SnakeData[address.Address] `tlb:"^"`
	Executors  common.SnakeData[address.Address] `tlb:"^"`
	Cancellers common.SnakeData[address.Address] `tlb:"^"`
	Bypassers  common.SnakeData[address.Address] `tlb:"^"`

	// Flag to enable/disable the executor role check (if disabled, anyone can execute)
	ExecutorRoleCheckEnabled bool `tlb:"bool"`
	// The timeout required to finalize the currently executing op
	OpFinalizationTimeout uint64 `tlb:"## 64"`
}

// Top up contract with TON coins.
// Contract might receive/hold TON as part of the maintenance process.
type TopUp struct {
	_ tlb.Magic `tlb:"#fee62ba6"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`
}

// Schedule an operation containing a batch of transactions.
//
// Emits one {Timelock_CallScheduled} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'proposer' or 'admin' role.
// - all payloads must not start with a blocked function selector.
type ScheduleBatch struct {
	_ tlb.Magic `tlb:"#094718f4"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Calls       common.SnakeData[Call] `tlb:"^"`      // Array of calls to be scheduled // vec<Timelock_Call>
	Predecessor *big.Int               `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int               `tlb:"## 256"` // Salt used to derive the operation ID
	Delay       uint64                 `tlb:"## 64"`  // Delay in seconds before the operation can be executed
}

// Cancel an operation.
//
// Requirements:
//
// - the caller must have the 'canceller' or 'admin' role.
type Cancel struct {
	_ tlb.Magic `tlb:"#af3bf1d0"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// ID of the operation to cancel.
	ID *big.Int `tlb:"## 256"`
}

// Execute an (ready) operation containing a batch of transactions.
//
// Emits one {Timelock_CallExecuted} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'executor' or 'admin' role.
type ExecuteBatch struct {
	_ tlb.Magic `tlb:"#6e9bf263"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Calls       common.SnakeData[Call] `tlb:"^"`      // Array of calls to be scheduled // vec<Timelock_Call>
	Predecessor *big.Int               `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int               `tlb:"## 256"` // Salt used to derive the operation ID
}

// Changes the minimum timelock duration for future operations.
//
// Emits a {Timelock_MinDelayChange} event.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UpdateDelay struct {
	_ tlb.Magic `tlb:"#7a57a45c"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// New minimum delay in seconds for future operations.
	NewDelay uint64 `tlb:"## 64"`
}

// Changes the timeout required to finalize the currently executing op
//
// Replies with {Timelock_OpFinalizationTimeoutChange} message.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UpdateOpFinalizationTimeout struct {
	_ tlb.Magic `tlb:"#94278d4f"` //nolint:revive // (opcode) should stay uninitialized
	/// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	/// The timeout required to finalize the currently executing op
	NewOpFinalizationTimeout uint64 `tlb:"## 64"`
}

// Blocks a function selector from being used, i.e. schedule
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
	_ tlb.Magic `tlb:"#2637af77"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector to block.
	Selector uint32 `tlb:"## 32"`
}

// Unblocks a previously blocked function selector so it can be used again.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UnblockFunctionSelector struct {
	_ tlb.Magic `tlb:"#26f19f4e"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector to unblock.
	Selector uint32 `tlb:"## 32"`
}

// Directly execute a batch of transactions, bypassing any other checks.
//
// Emits one {Timelock_BypasserCallExecuted} event per transaction in the batch.
//
// Requirements:
//
// - the caller must have the 'bypasser' or 'admin' role.
type BypasserExecuteBatch struct {
	_ tlb.Magic `tlb:"#bb0e9f7d"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Array of calls to be scheduled
	Calls common.SnakeData[Call] `tlb:"^"` // vec<Timelock_Call>
}

// Updates the executor role check (enabled/disabled) which guards the execution of operations.
//
// Replies with {Timelock_ExecutorRoleCheckUpdated} message.
//
// Requirements:
//
// - the caller must have the 'admin' role.
type UpdateExecutorRoleCheck struct {
	_ tlb.Magic `tlb:"#34d98baa"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Flag to enable/disable the executor role check (if disabled, anyone can execute)
	Enabled bool `tlb:"bool"`
}

// Submit an oracle error report, which marks an operation in error state.
//
// The error report is used for a category of errors which might occur during execution
// of an operation, but can't be caught on-chain (OOG errors, and downstream tx-trace errors).
type SubmitErrorReport struct {
	_ tlb.Magic `tlb:"f4538b79"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// The operation which produced the error (used to re-derive the op id).
	OpBatch OperationBatch `tlb:"^"`
	// The hash of the execute transaction.
	OpTxHash *big.Int `tlb:"## 256"`

	// The hash of the transaction which errored (part of the tx trace).
	ErrorTxHash *big.Int `tlb:"## 256"`
	// The error code.
	ErrorCode uint32 `tlb:"## 32"`
}

// --- Messages - outgoing ---

// Emitted when a call is scheduled as part of operation `id`.
type CallScheduled struct {
	_ tlb.Magic `tlb:"#c55fca54"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	ID          *big.Int `tlb:"## 256"` // ID of the operation that was scheduled.
	Index       uint64   `tlb:"## 64"`  // Index of the call in the operation
	Call        Call     `tlb:"^"`      // Call to be executed as part of the operation.
	Predecessor *big.Int `tlb:"## 256"` // Predecessor operation ID
	Salt        *big.Int `tlb:"## 256"` // Salt used to derive the operation ID
	Delay       uint64   `tlb:"## 64"`  // Delay in seconds before the operation can be executed
}

// Emitted when a call is performed as part of operation `id`.
type CallExecuted struct {
	_ tlb.Magic `tlb:"#49ea5d0e"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	ID     *big.Int        `tlb:"## 256"` // ID of the operation that was executed.
	Index  uint64          `tlb:"## 64"`  // Index of the call in the operation
	Target address.Address `tlb:"addr"`   // Address of the target contract to call.
	Value  tlb.Coins       `tlb:"."`      // Value in TONs to send with the call.
	Data   *cell.Cell      `tlb:"^"`      // Data to send with the call - message body.
}

// Emitted when a call is performed via bypasser.
type BypasserCallExecuted struct {
	_ tlb.Magic `tlb:"#9c7f3010"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Index  uint64          `tlb:"## 64"` // Index of the call in the operation
	Target address.Address `tlb:"addr"`  // Address of the target contract to call.
	Value  tlb.Coins       `tlb:"."`     // Value in TONs to send with the call.
	Data   *cell.Cell      `tlb:"^"`     // Data to send with the call - message body.
}

// Emitted when operation `id` is cancelled.
type Cancelled struct {
	_ tlb.Magic `tlb:"#580e80f2"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	ID *big.Int `tlb:"## 256"` // ID of the operation that was cancelled.
}

// Emitted when the minimum delay for future operations is modified.
type MinDelayChange struct {
	_ tlb.Magic `tlb:"#904b14e0"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	OldDuration uint64 `tlb:"## 64"` // Duration of the old minimum delay in seconds.
	NewDuration uint64 `tlb:"## 64"` // Duration of the new minimum delay in seconds.
}

// Emitted when a function selector is blocked.
type FunctionSelectorBlocked struct {
	_ tlb.Magic `tlb:"#9c4d6d94"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector that was blocked.
	Selector uint32 `tlb:"## 32"`
}

// Emitted when a function selector is unblocked.
type FunctionSelectorUnblocked struct {
	_ tlb.Magic `tlb:"#f410a31b"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Function selector that was unblocked.
	Selector uint32 `tlb:"## 32"`
}

// Sent back to sender after the executor role check is updated.
type ExecutorRoleCheckUpdated struct {
	_ tlb.Magic `tlb:"#c6d451e2"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	// Flag to enable/disable the executor role check (if disabled, anyone can execute)
	Enabled bool `tlb:"bool"`
}

// --- Data (storage & structures) ---

// RBACTimelock contract storage, auto-serialized to/from cell.
type Data struct {
	// ID allows multiple independent instances, since contract address depends on initial state.
	ID uint32 `tlb:"## 32"`

	// Minimum delay for operations in seconds
	MinDelay uint64 `tlb:"## 64"`
	// Map of operation id to timestamp
	Timestamps *cell.Dictionary `tlb:"dict 64"` // map<uint64, uint64>

	// Number of fn selectors blocked by the contract.
	BlockedFnSelectorsLen uint32 `tlb:"## 32"`
	// Map of blocked function selectors.
	BlockedFnSelectors *cell.Dictionary `tlb:"dict 32"` // map<uint32, bool>

	// Flag to enable/disable the executor role check (if disabled, anyone can execute)
	ExecutorRoleCheckEnabled bool `tlb:"bool"`
	// Information about the currently pending operation.
	OpPendingInfo OpPendingInfo `tlb:"."`

	// AccessControl trait data
	RBAC rbac.Data `tlb:"^"`
}

// Represents a single call
type Call struct {
	// Address of the target contract to call.
	Target address.Address `tlb:"addr"`
	// Value in TONs to send with the call.
	Value *big.Int `tlb:"## 256"`
	// Data to send with the call - message body.
	Data *cell.Cell `tlb:"^"`
}

// Batch of transactions represented as a operation, which can be scheduled and executed.
type OperationBatch struct {
	// Array of calls to be scheduled
	Calls common.SnakeData[Call] `tlb:"^"` // vec<Timelock_Call>
	// Predecessor operation ID
	Predecessor *big.Int `tlb:"## 256"`
	// Salt used to derive the operation ID
	Salt *big.Int `tlb:"## 256"`
}

// Information about the currently pending operation.
//
// @dev TON-specific additional data required to support reliable execution in the async environment.
type OpPendingInfo struct {
	// The time at which the scheduled ops becomes valid to execute [executionTime(opCount -
	// At this time the previous executed operation is considered optimistically final and successful,
	// meaning no bounce was received and we can continue executing.
	ValidAfter uint32 `tlb:"## 32"`
	// The timeout required to finalize the currently executing op
	OpFinalizationTimeout uint64 `tlb:"## 64"`
	// The id of the currently pending operation (OperationBatch hash)
	OpPendingID *big.Int `tlb:"## 256"`
}

// --- Constants ---

func mustHexToBigInt(hexStr string) *big.Int {
	// Remove "0x" prefix if present
	if strings.HasPrefix(hexStr, "0x") || strings.HasPrefix(hexStr, "0X") {
		hexStr = hexStr[2:]
	}

	value, success := new(big.Int).SetString(hexStr, 16)
	if !success {
		panic("invalid hex string")
	}
	return value
}

// crc32 hash of the event name
type Topic = uint32

// role identifier (keccak256 hash of the role name)
type Role = *big.Int

var (
	// TODO: compute with Go implementation of keccak256
	// Notice: role constants are kept as original Ethereum implementation (keccak256)
	RoleAdmin     Role = mustHexToBigInt("0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775") // keccak256('ADMIN_ROLE')
	RoleProposer  Role = mustHexToBigInt("0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1") // keccak256('PROPOSER_ROLE')
	RoleCanceller Role = mustHexToBigInt("0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783") // keccak256('CANCELLER_ROLE')
	RoleExecutor  Role = mustHexToBigInt("0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63") // keccak256('EXECUTOR_ROLE')
	RoleBaypasser Role = mustHexToBigInt("0xa1b2b8005de234c4b8ce8cd0be058239056e0d54f6097825b5117101469d5a8d") // keccak256('BYPASSER_ROLE')
	// @dev: new role, can report errors for executed operations
	RoleOracle Role = mustHexToBigInt("0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1") // keccak256('ORACLE_ROLE')

	TopicBypasserCallExecuted Topic = hash.CRC32("Timelock_BypasserCallExecuted")
	TopicCallScheduled        Topic = hash.CRC32("Timelock_CallScheduled")
	TopicCallExecuted         Topic = hash.CRC32("Timelock_CallExecuted")
)

const (
	// Timestamp value used to mark an operation as done
	DoneTimestamp = 1
	// Timestamp value used to mark an operation as error
	ErrorTimestamp = 2

	// Error codes
	ErrorSelectorIsBlocked          = 101
	ErrorOperationNotReady          = 102
	ErrorOperationMissingDependency = 103
	ErrorOperationCannotBeCancelled = 104
	ErrorOperationAlreadyScheduled  = 105
	ErrorInsufficientDelay          = 106
	// Thrown when trying to execute a pending operation while another pending operation is not yet final
	ErrorPendingOperationNotFinal = 107
	// Thrown when the provided op.value is insufficient (min required value not met).
	ErrorInsufficientValue = 108
	// Thrown when trying to submit an error report for an operation that is not done.
	ErrorOperationNotDone = 109
	// Thrown when trying to initialize the contract more than once.
	ErrorContractAlreadyInitialized = 110
	// Thrown when trying to call a function on an uninitialized contract.
	ErrorContractNotInitialized = 111
)
