// SPDX-License-Identifier: BUSL-1.1
tolk 1.2

import "../lib/utils";
import "../lib/access/access_control";

const CONTRACT_VERSION = "0.0.3";

/**
 * Contract module which acts as a timelocked controller with role-based
 * access control. When set as the owner of an `Ownable` smart contract, it
 * can enforce a timelock on `onlyOwner` maintenance operations and prevent
 * a list of blocked functions from being called. The timelock can be bypassed
 * by a bypasser or an admin in emergency situations that require quick action.
 *
 * Non-emergency actions are expected to follow the timelock.
 *
 * The contract has six roles. Each role can be inhabited by multiple
 * (potentially overlapping) addresses.
 *
 * 1) Admin: The admin manages membership for all roles (including the admin
 *    role itself). The admin automatically inhabits all other roles. The admin
 *    can call the bypasserExecuteBatch function to bypass any restrictions like
 *    the delay imposed by the timelock and the list of blocked functions. The
 *    admin can manage the list of blocked functions. In practice, the admin
 *    role is expected to (1) be inhabited by a contract requiring a secure
 *    quorum of votes before taking any action and (2) to be used rarely, namely
 *    only for emergency actions or configuration of the RBACTimelock.
 *
 * 2) Proposer: The proposer can schedule delayed operations that don't use any
 *    blocked function selector.
 *
 * 3) Executor: The executor can execute previously scheduled operations once
 *    their delay has expired. The contract enforces that the calls in an
 *    operation are executed with the correct args (target, data, value), but
 *    the executor can freely choose the gas limit. Since the executor is
 *    typically not particularly trusted, we recommend that (transitive) callees
 *    implement standard behavior of simply reverting if insufficient gas is
 *    provided. In particular, this means callees should not have non-reverting
 *    gas-dependent branches.
 *
 * 4) Canceller: The canceller can cancel operations that have been scheduled
 *    but not yet executed.
 *
 * 5) Bypasser: The bypasser can bypass any restrictions like the delay imposed
 *    by the timelock and the list of blocked functions to immediately execute
 *    operations, e.g. in case of emergencies.
 *
 * 6) Oracle: The oracle can submit an error report, for an executed non-final opration
 *    which marks an operation in error state. The error report is used for a category of
 *    errors which might occur during execution of an operation, but can't be caught
 *    on-chain (OOG errors, and downstream tx-trace errors).
 *
 * @dev This contract is a modified version of OpenZeppelin's
 * contracts/governance/TimelockController.sol contract from v4.7.0, accessed in
 * commit 561d1061fc568f04c7a65853538e834a889751e8 of
 * github.com/OpenZeppelin/openzeppelin-contracts
 * Said contract is under "Copyright (c) 2016-2023 zOS Global Limited and
 * contributors" and its original MIT license can be found at
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/561d1061fc568f04c7a65853538e834a889751e8/LICENSE
 */

// --- Messages - incoming ---

/// Initializes the contract with the following parameters:
///
/// - `minDelay`: initial minimum delay for operations
/// - `admin`: account to be granted admin role
/// - `proposers`: accounts to be granted proposer role
/// - `executors`: accounts to be granted executor role
/// - `cancellers`: accounts to be granted canceller role
/// - `bypassers`: accounts to be granted bypasser role
///
struct (0x4982fcfd) Timelock_Init {
    /// Query ID of the change request.
    queryId: uint64;

    /// Minimum delay in seconds for future operations.
    minDelay: uint32;

    /// Address of the admin account.
    admin: address;

    /// Collection of addresses to be granted proposer, executor, canceller and bypasser roles.
    proposers: SnakedCell<address>;
    executors: SnakedCell<address>;
    cancellers: SnakedCell<address>;
    bypassers: SnakedCell<address>;

    /// Flag to enable/disable the executor role check (if disabled, anyone can execute)
    executorRoleCheckEnabled: bool;
    /// The timeout required to finalize the currently executing op
    opFinalizationTimeout: uint32;
}

/// Schedule an operation containing a batch of transactions.
///
/// Emits one {Timelock_CallScheduled} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'proposer' or 'admin' role.
/// - all payloads must not start with a blocked function selector.
///
struct (0x094718f4) Timelock_ScheduleBatch {
    /// Query ID of the change request.
    queryId: uint64;

    // Array of calls to be scheduled
    calls: SnakedCell<Timelock_Call>;
    // Predecessor operation ID
    predecessor: uint256;
    // Salt used to derive the operation ID
    salt: uint256;
    // Delay in seconds before the operation can be executed
    delay: uint32;
}

/// Cancel an operation.
///
/// Requirements:
///
/// - the caller must have the 'canceller' or 'admin' role.
///
struct (0xaf3bf1d0) Timelock_Cancel {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the operation to cancel.
    id: uint256;
}

/// Execute an (ready) operation containing a batch of transactions.
///
/// Emits one {Timelock_CallExecuted} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'executor' or 'admin' role.
///
struct (0x6e9Bf263) Timelock_ExecuteBatch {
    /// Query ID of the change request.
    queryId: uint64;

    /// Array of calls to be scheduled
    calls: SnakedCell<Timelock_Call>;
    /// Predecessor operation ID
    predecessor: uint256;
    /// Salt used to derive the operation ID
    salt: uint256;
}

/// Changes the minimum timelock duration for future operations.
///
/// Replies with {Timelock_MinDelayChange} message.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x7a57a45c) Timelock_UpdateDelay {
    /// Query ID of the change request.
    queryId: uint64;

    /// New minimum delay in seconds for future operations.
    newDelay: uint32;
}

/// Changes the timeout required to finalize the currently executing op
///
/// Replies with {Timelock_OpFinalizationTimeoutChange} message.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x94278d4f) Timelock_UpdateOpFinalizationTimeout {
    /// Query ID of the change request.
    queryId: uint64;

    /// The timeout required to finalize the currently executing op
    newOpFinalizationTimeout: uint32;
}

/// Blocks a function selector from being used, i.e. schedule
/// operations with this function selector will revert.
///
/// Note that blocked selectors are only checked when an operation is being
/// scheduled, not when it is executed. You may want to check any pending
/// operations for whether they contain the blocked selector and cancel them.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x2637af77) Timelock_BlockFunctionSelector {
    /// Query ID of the change request.
    queryId: uint64;

    /// Function selector to block.
    selector: uint32;
}

/// Unblocks a previously blocked function selector so it can be used again.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x26f19f4e) Timelock_UnblockFunctionSelector {
    /// Query ID of the change request.
    queryId: uint64;

    /// Function selector to unblock.
    selector: uint32;
}

/// Directly execute a batch of transactions, bypassing any other checks.
///
/// Emits one {Timelock_BypasserCallExecuted} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'bypasser' or 'admin' role.
///
struct (0xbb0e9f7d) Timelock_BypasserExecuteBatch {
    /// Query ID of the change request.
    queryId: uint64;

    /// Array of calls to be scheduled
    calls: SnakedCell<Timelock_Call>;
}

/// Updates the executor role check (enabled/disabled) which guards the execution of operations.
///
/// Replies with {Timelock_ExecutorRoleCheckUpdated} message.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x34d98baa) Timelock_UpdateExecutorRoleCheck {
    /// Query ID of the change request.
    queryId: uint64;

    /// Flag to enable/disable the executor role check (if disabled, anyone can execute)
    enabled: bool;
}

/// Submit an oracle error report, which marks an operation in error state.
///
/// The error report is used for a category of errors which might occur during execution
/// of an operation, but can't be caught on-chain (OOG errors, and downstream tx-trace errors).
///
struct (0xf4538b79) Timelock_SubmitErrorReport {
    /// Query ID of the change request.
    queryId: uint64;

    /// The operation which produced the error (used to re-derive the op id).
    opBatch: Cell<Timelock_OperationBatch>;
    /// The hash of the execute transaction.
    opTxHash: uint256;

    /// The hash of the transaction which errored (part of the tx trace).
    errorTxHash: uint256;
    /// The error code.
    errorCode: uint32;
}

/// Emitted when a bounced message is handled.
struct (0x3ed17038) Timelock_BounceHandled {
    /// The sender of the bounced message.
    sender: address;
    /// The truncated body of the bounced message.
    bouncedBody: uint256;
    /// The id of the currently pending operation (Timelock_OperationBatch hash)
    opPendingId: uint256;
    /// Whether the bounced message matched the pending op (one of the calls).
    matchesPendingOp: bool;
}

/// Union of all incoming messages.
type Timelock_InMessage =
    | Timelock_Init
    | Timelock_ScheduleBatch
    | Timelock_Cancel
    | Timelock_ExecuteBatch
    | Timelock_UpdateDelay
    | Timelock_UpdateOpFinalizationTimeout
    | Timelock_BlockFunctionSelector
    | Timelock_UnblockFunctionSelector
    | Timelock_BypasserExecuteBatch
    | Timelock_UpdateExecutorRoleCheck
    | Timelock_SubmitErrorReport;

/// Union of all outgoing messages.
type Timelock_OutMessage =
    | Timelock_BatchScheduled
    | Timelock_CallScheduled
    | Timelock_BatchExecuted
    | Timelock_CallExecuted
    | Timelock_BypasserBatchExecuted
    | Timelock_BypasserCallExecuted
    | Timelock_Canceled
    | Timelock_MinDelayChange
    | Timelock_OpFinalizationTimeoutChange
    | Timelock_FunctionSelectorBlocked
    | Timelock_FunctionSelectorUnblocked
    | Timelock_ExecutorRoleCheckUpdated
    | Timelock_ErrorReportSubmitted
    | Timelock_BounceHandled;

// --- Messages - outgoing ---

/// Replied to sender after a batch is scheduled.
struct (0xdf65b59e) Timelock_BatchScheduled {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the batch that was scheduled.
    id: uint256;
    /// Delay in seconds before the operation can be executed
    delay: uint32;
}

/// Emitted when a call is scheduled as part of operation `id`.
struct (0xc55fca54) Timelock_CallScheduled {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the batch for the operation that was scheduled.
    id: uint256;
    index: uint64;
    /// Call to be executed as part of the operation.
    /// Notice: split out into a separate cell to avoid message size limit issues (vs. EVM inline).
    call: Cell<Timelock_Call>;
    predecessor: uint256;
    salt: uint256;
    delay: uint32;
}

/// Replied to sender after a batch is executed.
struct (0xa941ea1a) Timelock_BatchExecuted {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the batch that was executed.
    id: uint256;
}

/// Emitted when a call is performed as part of operation `id`.
struct (0x49ea5d0e) Timelock_CallExecuted {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the batch for the operation that was executed.
    id: uint256;
    index: uint64;
    target: address;
    value: coins;
    data: cell;
}

/// Replied to sender after a batch is executed via bypasser escape hatch.
struct (0x539b4214) Timelock_BypasserBatchExecuted {
    /// Query ID of the change request.
    queryId: uint64;
}

/// Replied to sender when a call is performed via bypasser.
struct (0x9c7f3010) Timelock_BypasserCallExecuted {
    /// Query ID of the change request.
    queryId: uint64;

    /// Index of the call in the batch.
    index: uint64;
    target: address;
    value: coins;
    data: cell;
}

/// Replied to sender when operation `id` is cancelled.
struct (0x580e80f2) Timelock_Canceled {
    /// Query ID of the change request.
    queryId: uint64;

    /// ID of the cancelled operation.
    id: uint256;
}

/// Replied to sender when the minimum delay for future operations is modified.
struct (0x904b14e0) Timelock_MinDelayChange {
    /// Query ID of the change request.
    queryId: uint64;

    /// Duration of the old minimum delay in seconds.
    oldDuration: uint32;
    /// Duration of the new minimum delay in seconds.
    newDuration: uint32;
}

/// Replied to sender when the op finalization timeout is modified.
struct (0x1f102718) Timelock_OpFinalizationTimeoutChange {
    /// Query ID of the change request.
    queryId: uint64;

    /// Duration of the old timeout in seconds.
    oldDuration: uint32;
    /// Duration of the new timeout in seconds.
    newDuration: uint32;
}

/// Emitted when a function selector is blocked.
struct (0x9c4d6d94) Timelock_FunctionSelectorBlocked {
    /// Query ID of the change request.
    queryId: uint64;

    /// Function selector that was blocked.
    selector: uint32;
}

/// Emitted when a function selector is unblocked.
struct (0xf410a31b) Timelock_FunctionSelectorUnblocked {
    /// Query ID of the change request.
    queryId: uint64;

    /// Function selector that was unblocked.
    selector: uint32;
}

/// Replied to sender after the executor role check is updated.
struct (0xc6d451e2) Timelock_ExecutorRoleCheckUpdated {
    /// Query ID of the change request.
    queryId: uint64;

    /// Flag to enable/disable the executor role check (if disabled, anyone can execute)
    enabled: bool;
}

/// Replied to sender when an error report is successfully submitted.
struct (0xdbd4c8ee) Timelock_ErrorReportSubmitted {
    /// Query ID of the change request.
    queryId: uint64;

    /// The id (hash) of the operation which produced the Timelock_Error.
    id: uint256;
    /// The hash of the operation execute transaction.
    opTxHash: uint256;

    /// The hash of the transaction which errored.
    errorTxHash: uint256;
    /// The error code.
    errorCode: uint32;

    /// Whether the operation that was pending was the one for which the error was reported.
    matchesPendingOp: bool;
}

// --- Storage ---

/// Timelock contract struct, host storage and runtime hooks (extensions).
struct Timelock<T> {
    data: Timelock_Data;

    /// Runtime hooks (extensions)
    context: T? = null,
    hooks: Timelock_Hooks<T>? = null;
}

/// RBACTimelock contract storage, auto-serialized to/from cell.
struct Timelock_Data {
    /// ID allows multiple independent instances, since contract address depends on initial state.
    id: uint32;

    /// Minimum delay for operations in seconds
    minDelay: uint32;
    /// Map of operation id to timestamp
    timestamps: map<uint256, uint64>;

    /// Number of fn selectors blocked by the contract.
    blockedFnSelectorsLen: uint32;
    /// Map of blocked function selectors.
    blockedFnSelectors: map<uint32, bool>;

    /// Flag to enable/disable the executor role check (if disabled, anyone can execute)
    executorRoleCheckEnabled: bool;
    /// Information about the currently pending operation.
    opPendingInfo: Timelock_OpPendingInfo;

    /// AccessControl trait data
    rbac: Cell<AccessControl_Data>;
}

/// Load from contract data using auto-serialization.
@inline
fun Timelock_Data.fromContractData(): Timelock_Data {
    return Timelock_Data.fromCell(contract.getData());
}

/// Store as contract data into persistent storage using auto-serialization.
@inline
fun Timelock_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}

/// Represents a single call
struct Timelock_Call {
    /// Address of the target contract to call.
    target: address;
    /// Value in TONs to send with the call.
    value: coins;
    /// Data to send with the call - message body.
    data: cell;
}

/// Batch of transactions represented as a operation, which can be scheduled and executed.
struct Timelock_OperationBatch {
    /// Array of calls to be scheduled
    calls: SnakedCell<Timelock_Call>;
    /// Predecessor operation ID
    predecessor: uint256;
    /// Salt used to derive the operation ID
    salt: uint256;
}

/// Information about the currently pending operation.
///
/// @dev TON-specific additional data required to support reliable execution in the async environment.
struct Timelock_OpPendingInfo {
    /// The time at which the scheduled ops becomes valid to execute [executionTime(opCount -
    /// At this time the previous executed operation is considered optimistically final.
    validAfter: uint64;
    /// The timeout required to finalize the currently executing op
    opFinalizationTimeout: uint32;
    /// The id of the currently pending operation (Timelock_OperationBatch hash)
    opPendingId: uint256;
    /// The ids (fingerprints) for calls awaiting finalization in the pending op (true = pending, false = finalized/bounced)
    opPendingCalls: map<uint256, bool>;
}

// --- Hooks struct (extensions) ---

/// Hook extensions exposed by the Timelock contract.
struct Timelock_Hooks<T> {
    /// AccessControl hooks exposed by the Timelock contract.
    rbac: AccessControl_Hooks<T>;

    /// Hook to get the identifier of an operation containing a batch of transactions.
    hashOperationBatch: ((T?, Timelock_OperationBatch) -> uint256)?;
}

// --- Constants ---

const TOPIC_BYPASSER_CALL_EXECUTED = stringCrc32("Timelock_BypasserCallExecuted");
const TOPIC_CALL_SCHEDULED = stringCrc32("Timelock_CallScheduled");
const TOPIC_CALL_EXECUTED = stringCrc32("Timelock_CallExecuted");
const TOPIC_BOUNCE_HANDLED = stringCrc32("Timelock_BounceHandled");

/// Notice: role constants are kept as original Ethereum implementation (keccak256)
const ADMIN_ROLE = 0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775;     // keccak256('ADMIN_ROLE')
const PROPOSER_ROLE = 0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1;  // keccak256('PROPOSER_ROLE')
const CANCELLER_ROLE = 0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783; // keccak256('CANCELLER_ROLE')
const EXECUTOR_ROLE = 0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63;  // keccak256('EXECUTOR_ROLE')
const BYPASSER_ROLE = 0xa1b2b8005de234c4b8ce8cd0be058239056e0d54f6097825b5117101469d5a8d;  // keccak256('BYPASSER_ROLE')
/// @dev: new role, can report errors for executed operations
const ORACLE_ROLE = 0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1;    // keccak256('ORACLE_ROLE')

/// Timestamp value used to mark an operation as done
const DONE_TIMESTAMP = 1;
/// Timestamp value used to mark an operation as error
const ERROR_TIMESTAMP = 2;

const DEFAULT_FINALIZATION_TIMEOUT = 10; // in seconds

/// Error codes used by the Timelock contract.
enum Timelock_Error {
    /// Thrown when trying to schedule an operation which contains a blocked function selector.
    SelectorIsBlocked = 60600 // Timelock<T>.errorCode(0)

    /// Thrown when trying to execute an operation which is not ready yet.
    OperationNotReady

    /// Thrown when an operation is missing a required dependency (predecessor not done).
    OperationMissingDependency

    /// Thrown when trying to cancel a non-pending operation.
    OperationCanNotBeCancelled

    /// Thrown when trying to schedule an already scheduled operation.
    OperationAlreadyScheduled

    /// Thrown when the provided delay is less than the minimum delay.
    InsufficientDelay

    /// Thrown when trying to execute a operation while the pending operation is not yet final.
    PendingOperationNotFinal

    /// Thrown when the provided call.value is insufficient (min required value not met).
    InsufficientValue

    /// Thrown when trying to report an error for an operation which is not done yet.
    OperationNotDone

    /// Thrown when trying to initialize the contract more than once.
    ContractAlreadyInitialized

    /// Thrown when trying to call a function on an uninitialized contract.
    ContractNotInitialized

    /// Value attached to incoming message is not enough to pay for handler execution
    InsufficientFee
}

// --- Constants - storage ---

/// Represents the amount of TON coins we reserve on the balance to pay for storage fees.
const MIN_TON_TO_RESERVE: int = ton("0.05");

// --- Methods ---

/// Returns the error code for this facility and the given local code.
///     errorCode(0) == 60600
fun Timelock<T>.errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.mcms.Timelock"), local);
}

/// Loads the Timelock contract data from persistent storage.
fun Timelock<T>.load(context: T? = null, hooks: Timelock_Hooks<T>? = null): Timelock<T> {
    // Load the contract data from the persistent storage
    var data = Timelock_Data.fromContractData();

    // Return the Timelock instance with loaded data and hooks
    return Timelock<T> {
        data: data,
        context: context,
        hooks: hooks,
    };
}

/// Returns the id that derives the (contract) address of this Timelock instance.
fun Timelock<T>.getId(self): uint32 {
    return self.data.id;
}

/// Requires that the sender has the given role or the admin role.
fun Timelock<T>.onlyRoleOrAdminRole(self, role: uint256, sender: address): void {
    val rbac = self.hookTrait__AccessControl();
    if (!rbac.hasRole(ADMIN_ROLE, sender)) {
        rbac.requireRole(role, sender);
    }
}

/// Returns whether an id correspond to a registered operation. This
/// includes both Pending, Ready and Done operations.
fun Timelock<T>.isOperation(self, id: uint256): bool {
    return self.getTimestamp(id) > 0;
}

/// Returns whether an operation is pending or not.
fun Timelock<T>.isOperationPending(self, id: uint256): bool {
    return self.getTimestamp(id) > ERROR_TIMESTAMP;
}

/// Returns whether an operation is ready or not.
fun Timelock<T>.isOperationReady(self, id: uint256): bool {
    val t = self.getTimestamp(id);
    return t > ERROR_TIMESTAMP && t <= blockchain.now();
}

/// Returns whether an operation is done or not.
fun Timelock<T>.isOperationDone(self, id: uint256): bool {
    return self.getTimestamp(id) == DONE_TIMESTAMP;
}

/// Returns whether an operation is in error state or not.
fun Timelock<T>.isOperationError(self, id: uint256): bool {
    return self.getTimestamp(id) == ERROR_TIMESTAMP;
}

/// Returns whether the pending operation is final or not.
fun Timelock<T>.isPendingOperationFinal(self): bool {
    return self.data.opPendingInfo.validAfter <= blockchain.now();
}

/// Returns the timestamp at with an operation becomes ready (0 for
/// unset operations, 1 for done operations, 2 for operations in error state).
fun Timelock<T>.getTimestamp(self, id: uint256): uint64 {
    // Get the timestamp for the given id from the timestamps map
    var timestamp = self.data.timestamps.get(id);
    if (!timestamp.isFound) {
        return 0; // operation not exists
    }

    return timestamp.loadValue();
}

/// Returns the minimum delay for an operation to become valid.
///
/// This value can be changed by executing an operation that calls `updateDelay`.
fun Timelock<T>.getMinDelay(self): uint32 {
    return self.data.minDelay;
}

/// Returns the operation batch hash as its ID.
///
/// Override available via {Timelock_Hooks<T>.hashOperationBatch} hook.
fun Timelock<T>.hashOperationBatch(self, op: Timelock_OperationBatch): uint256 {
    if (self.hooks != null && self.hooks.hashOperationBatch != null) {
        return self.hooks.hashOperationBatch(self.context, op); // extension hook
    }

    // Fallback to taking the standard cell hash of the operation
    return op.toCell().hash();
}

/// Initializes the contract
fun Timelock<T>.init(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    minDelay: uint32,
    admin: address,
    proposers: SnakedCell<address>,
    executors: SnakedCell<address>,
    cancellers: SnakedCell<address>,
    bypassers: SnakedCell<address>,
    executorRoleCheckEnabled: bool = true,
    opFinalizationTimeout: uint32 = DEFAULT_FINALIZATION_TIMEOUT,
): void {
    // @dev: anyone can call init, but only once. The deployer should send init message with stateInit (deployment).
    // Check that the contract is not already initialized
    assert(!self.isInitialized()) throw Timelock_Error.ContractAlreadyInitialized;
    assert(value >= Timelock_Costs.init()) throw Timelock_Error.InsufficientFee;

    var rbac = self.hookTrait__AccessControl();

    rbac._setRoleAdmin(queryId, sender, ADMIN_ROLE, ADMIN_ROLE);
    rbac._setRoleAdmin(queryId, sender, PROPOSER_ROLE, ADMIN_ROLE);
    rbac._setRoleAdmin(queryId, sender, EXECUTOR_ROLE, ADMIN_ROLE);
    rbac._setRoleAdmin(queryId, sender, CANCELLER_ROLE, ADMIN_ROLE);
    rbac._setRoleAdmin(queryId, sender, BYPASSER_ROLE, ADMIN_ROLE);
    rbac._setRoleAdmin(queryId, sender, ORACLE_ROLE, ADMIN_ROLE);

    rbac._grantRole(queryId, sender, ADMIN_ROLE, admin);

    // Grant roles to proposers, executors, cancellers and bypassers
    var pp = proposers.iter();
    while (!pp.empty()) {
        rbac._grantRole(queryId, sender, PROPOSER_ROLE, pp.next());
    }

    var ee = executors.iter();
    while (!ee.empty()) {
        rbac._grantRole(queryId, sender, EXECUTOR_ROLE, ee.next());
    }

    var cc = cancellers.iter();
    while (!cc.empty()) {
        rbac._grantRole(queryId, sender, CANCELLER_ROLE, cc.next());
    }

    var bb = bypassers.iter();
    while (!bb.empty()) {
        rbac._grantRole(queryId, sender, BYPASSER_ROLE, bb.next());
    }

    // Map from underlying trait storage to contract storage
    self.data.rbac = rbac.data.toCell();

    self.data.minDelay = minDelay;
    self.data.executorRoleCheckEnabled = executorRoleCheckEnabled;
    self.data.opPendingInfo = Timelock_OpPendingInfo {
        validAfter: blockchain.now(),
        opFinalizationTimeout,
        opPendingId: 0,
        opPendingCalls: createEmptyMap()
    };

    // Reply back to sender
    val reply = createMessage({
        bounce: false,
        value: calculateGasFeeFor(FEE_SIZE_SMALL), // send small value as gas budget, keep the rest (payable)
        dest: sender,
        body: Timelock_MinDelayChange{queryId, oldDuration: 0, newDuration: minDelay}
    });
    reply.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// Schedule an operation containing a batch of transactions.
///
/// Emits one {Timelock_CallScheduled} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'proposer' or 'admin' role.
/// - all payloads must not start with a blocked function selector.
///
fun Timelock<T>.scheduleBatch(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    calls: SnakedCell<Timelock_Call>,
    predecessor: uint256,
    salt: uint256,
    delay: uint32
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    self.onlyRoleOrAdminRole(PROPOSER_ROLE, sender);

    val id = self.hashOperationBatch(Timelock_OperationBatch{calls, predecessor, salt});
    self.schedule(id, delay);

    var index = 0;
    var cc = calls.iter();
    while (!cc.empty()) {
        val call = cc.next();
        self.checkFunctionSelectorNotBlocked(call.data.beginParse());

        // We enforce a minimum amount of TON op.value trying to ensure the receiver gets at least enough gas for
        // fee validation + a bounce, and avoid out of gas errors in which cases a message will not bounce.
        if (call.value < calculateGasFeeDefault()) {
            throw Timelock_Error.InsufficientValue;
        }

        val body = Timelock_CallScheduled{
            queryId,
            id,
            index,
            call: call.toCell(),
            predecessor,
            salt,
            delay
        };
        emit(TOPIC_CALL_SCHEDULED, body);

        index += 1;
    }

    assert(value >= Timelock_Costs.scheduleBatch(index)) throw Timelock_Error.InsufficientFee;

    val reply = createMessage({
        bounce: false,
        value: calculateGasFeeFor(FEE_SIZE_SMALL), // send small value as gas budget, keep the rest (payable)
        dest: sender,
        body: Timelock_BatchScheduled{queryId, id, delay}
    });
    reply.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// Schedule an operation that becomes valid after a given delay.
fun Timelock<T>.schedule(mutate self, id: uint256, delay: uint32): void {
    assert(!self.isOperation(id)) throw Timelock_Error.OperationAlreadyScheduled;
    assert(delay >= self.getMinDelay()) throw Timelock_Error.InsufficientDelay;

    val value = blockchain.now() + delay;
    self.data.timestamps.set(id, value); // seconds since epoch
}

/// Cancel an operation.
///
/// Requirements:
///
/// - the caller must have the 'canceller' or 'admin' role.
///
fun Timelock<T>.cancel(mutate self, sender: address, value: coins, queryId: uint64, id: uint256): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    self.onlyRoleOrAdminRole(CANCELLER_ROLE, sender);
    assert(self.isOperationPending(id)) throw Timelock_Error.OperationCanNotBeCancelled;

    // Remove the timestamp for the operation
    self.data.timestamps.delete(id);

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: Timelock_Canceled{queryId, id}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Execute an (ready) operation containing a batch of transactions.
///
/// Emits one {Timelock_CallExecuted} event per transaction in the batch.
/// Replies with {Timelock_BatchExecuted} message.
///
/// Requirements:
///
/// - the caller must have the 'executor' or 'admin' role.
/// - the predecessor operation must have been executed successfully.
///     We use a finalization timeout to validate the predecessor batch was executed successfully
///
///     To finalize a predecessor execution, one of two conditions must be met:
///         1. Finalization timeout expired                      [can continue]
///         2. Message bounced back                              [predecessor invalidated, can't retry]
///         3. Oracle reported an error (e.g., out-of-gas error) [predecessor invalidated, can't retry]
///
fun Timelock<T>.executeBatch(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    calls: SnakedCell<Timelock_Call>,
    predecessor: uint256,
    salt: uint256
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    if (self.data.executorRoleCheckEnabled) {
        self.onlyRoleOrAdminRole(EXECUTOR_ROLE, sender);
    }

    val id = self.hashOperationBatch(Timelock_OperationBatch{calls, predecessor, salt});
    self.beforeCall(id, predecessor);
    self.resetPendingOpTracking();

    // We reserve some TON coins on the balance for rent
    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveToncoinsOnBalance(MIN_TON_TO_RESERVE, reserveMode);

    var index = 0;
    var cc = calls.iter();
    while (!cc.empty()) {
        val call = cc.next();

        // Track pending call fingerprint
        val truncatedBody = extractBouncedBody(call.data.beginParse());
        val fingerprint = self.getCallFingerprint(call.target, truncatedBody);
        self.data.opPendingInfo.opPendingCalls.set(fingerprint, true);

        self.execute(call);

        val body = Timelock_CallExecuted{
            queryId,
            id,
            index,
            target: call.target,
            value: call.value,
            data: call.data
        };
        emit(TOPIC_CALL_EXECUTED, body);

        index += 1;
    }

    assert(value >= Timelock_Costs.executeBatch(index)) throw Timelock_Error.InsufficientFee;

    self.afterCall(id);

    val reply = createMessage({
        bounce: false,
        value: calculateGasFeeFor(FEE_SIZE_SMALL), // send small value as gas budget, keep the rest (payable)
        dest: sender,
        body: Timelock_BatchExecuted{queryId, id}
    });
    reply.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// Execute an operation's call.
fun Timelock<T>.execute(self, call: Timelock_Call): void {
    // @dev: we do not require success before continuing with the next call (async execution model, fan out)
    val op = createMessage({
        bounce: true,
        value: call.value,
        dest: call.target,
        body: call.data
    });
    op.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Returns the fingerprint for a call (used to track pending calls).
fun Timelock<T>.getCallFingerprint(self, target: address, truncatedBody: uint256): uint256 {
    return beginCell()
        .storeAddress(target)
        .storeUint(truncatedBody, 256)
        .hash();
}

/// Resets the pending operation tracking info.
fun Timelock<T>.resetPendingOpTracking(mutate self): void {
    self.data.opPendingInfo.opPendingCalls = createEmptyMap();
    self.data.opPendingInfo.opPendingId = 0;
}

/// Hook before execution of an operation's calls.
fun Timelock<T>.beforeCall(self, id: uint256, predecessor: uint256): void {
    assert(self.isOperationReady(id)) throw Timelock_Error.OperationNotReady;
    assert(predecessor == 0 || self.isOperationDone(predecessor)) throw Timelock_Error.OperationMissingDependency;
    assert(self.isPendingOperationFinal()) throw Timelock_Error.PendingOperationNotFinal;
}

/// Hook after execution of an operation's calls.
fun Timelock<T>.afterCall(mutate self, id: uint256): void {
    assert(self.isOperationReady(id)) throw Timelock_Error.OperationNotReady;

    // Mark the operation as done
    self.data.timestamps.set(id, DONE_TIMESTAMP);

    // Set the pending operation finalization timeout and info
    self.data.opPendingInfo.validAfter = blockchain.now() + self.data.opPendingInfo.opFinalizationTimeout;
    self.data.opPendingInfo.opPendingId = id;
}

/// Changes the minimum timelock duration for future operations.
/// @see {Timelock_UpdateDelay} for more information.
fun Timelock<T>.updateDelay(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    newDelay: uint32
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ADMIN_ROLE, sender);

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: Timelock_MinDelayChange{
            queryId,
            oldDuration: self.data.minDelay,
            newDuration: newDelay
        }
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    // Update the minimum delay
    self.data.minDelay = newDelay;
}

/// Changes the timeout required to finalize the currently executing op
/// @see {Timelock_UpdateOpFinalizationTimeout} for more information.
fun Timelock<T>.updateOpFinalizationTimeout(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    newOpFinalizationTimeout: uint32
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ADMIN_ROLE, sender);

    val oldDuration = self.data.opPendingInfo.opFinalizationTimeout;

    // Update the op finalization timeout
    self.data.opPendingInfo.opFinalizationTimeout = newOpFinalizationTimeout;
    // Set the pending operation finalization timeout (if lower than current)
    val newValidAfter = blockchain.now() + self.data.opPendingInfo.opFinalizationTimeout;
    if (newValidAfter < self.data.opPendingInfo.validAfter) {
        // If the new timeout is shorter, we can update validAfter to the new time
        self.data.opPendingInfo.validAfter = newValidAfter;
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: Timelock_OpFinalizationTimeoutChange{queryId, oldDuration, newDuration: newOpFinalizationTimeout}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Blocks a function selector from being used, i.e. schedule
/// operations with this function selector will revert.
///
/// @dev Note that blocked selectors are only checked when an operation is being
/// scheduled, not when it is executed. You may want to check any pending
/// operations for whether they contain the blocked selector and cancel them.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
fun Timelock<T>.blockFunctionSelector(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    selector: uint32
): bool {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ADMIN_ROLE, sender);

    var body = createEmptyCell();
    val updated = self.data.blockedFnSelectors.addIfNotExists(selector, true);
    if (updated) {
        self.data.blockedFnSelectorsLen += 1;
        body = Timelock_FunctionSelectorBlocked{queryId, selector}.toCell();
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: body,
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    return updated;
}

/// Unblocks a previously blocked function selector so it can be used again.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
fun Timelock<T>.unblockFunctionSelector(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    selector: uint32,
): bool {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ADMIN_ROLE, sender);

    var body = createEmptyCell();
    val updated = self.data.blockedFnSelectors.delete(selector);
    if (updated) {
        self.data.blockedFnSelectorsLen -= 1;
        body = Timelock_FunctionSelectorUnblocked{queryId, selector}.toCell()
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: body,
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    return updated;
}

/// Directly execute a batch of transactions, bypassing any other checks.
///
/// Emits one {Timelock_BypasserCallExecuted} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'bypasser' or 'admin' role.
///
fun Timelock<T>.bypasserExecuteBatch(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    calls: SnakedCell<Timelock_Call>,
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    self.onlyRoleOrAdminRole(BYPASSER_ROLE, sender);

    // Notice: bypass doesn't clear or update pending operation info,
    // as it is not related to scheduled operations and is executed out of band.
    //
    // Make sure the bypass calls (truncated) are unique (e.g., via queryId) so they
    // do not interfere with (normal) scheduled pending calls - matched bounces will
    // otherwise produce false positives.

    // We reserve some TON coins on the balance for rent
    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveToncoinsOnBalance(MIN_TON_TO_RESERVE, reserveMode);

    var index = 0;
    var cc = calls.iter();
    while (!cc.empty()) {
        val call = cc.next();
        self.execute(call);

        val body = Timelock_BypasserCallExecuted{
            queryId,
            index,
            target: call.target,
            value: call.value,
            data: call.data
        };
        emit(TOPIC_BYPASSER_CALL_EXECUTED, body);
        index += 1;
    }

    assert(value >= Timelock_Costs.bypasserExecuteBatch(index)) throw Timelock_Error.InsufficientFee;

    val reply = createMessage({
        bounce: false,
        value: calculateGasFeeFor(FEE_SIZE_SMALL), // send small value as gas budget, keep the rest (payable)
        dest: sender,
        body: Timelock_BypasserBatchExecuted{queryId}
    });
    reply.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// Updates the executor role check (enabled/disabled) which guards the execution of operations.
///
/// @see <Timelock_UpdateExecutorRoleCheck> for more information.
fun Timelock<T>.updateExecutorRoleCheck(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    enabled: bool,
): void {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ADMIN_ROLE, sender);

    self.data.executorRoleCheckEnabled = enabled;

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: Timelock_ExecutorRoleCheckUpdated{queryId, enabled}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Submit an oracle error report, which marks the current operation in error state.
///
/// @see <Timelock_SubmitErrorReport> for more information.
fun Timelock<T>.submitErrorReport(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    opBatch: Timelock_OperationBatch,
    opTxHash: uint256,
    errorTxHash: uint256,
    errorCode: uint32
) {
    assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
    assert(value >= Timelock_Costs.submitErrorReport()) throw Timelock_Error.InsufficientFee;

    // Only the oracle can submit error reports
    val rbac = self.hookTrait__AccessControl();
    rbac.requireRole(ORACLE_ROLE, sender);

    val id = self.hashOperationBatch(opBatch);
    assert(self.isOperationDone(id)) throw Timelock_Error.OperationNotDone;

    // Mark op in error state (recover with new op + bypass)
    self.data.timestamps.set(id, ERROR_TIMESTAMP); // Mark the operation as error

    //   - opportunity to rollback, not currently supported

    // Check the reported error against the stored pending operation
    val matchesPendingOp = self.data.opPendingInfo.opPendingId == id;
    if (matchesPendingOp) {
        self.data.opPendingInfo.validAfter = blockchain.now(); // finalize immediately
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: Timelock_ErrorReportSubmitted{
            queryId,
            id,
            opTxHash,
            errorTxHash,
            errorCode,
            matchesPendingOp,
        }
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Returns whether the contract is initialized.
fun Timelock<T>.isInitialized(self): bool {
    // Set during init, never < blockchain.now()
    return self.data.opPendingInfo.validAfter != 0;
}

/// Returns whether the executor role check is enabled.
/// @dev if the executor role check is disabled, anyone can execute (no executor role needed)
fun Timelock<T>.isExecutorRoleCheckEnabled(self): bool {
    return self.data.executorRoleCheckEnabled;
}

/// Returns the blocked function selector with the given index.
///
/// This function is useful for enumerating all blocked function selectors, but is expensive
/// in terms of gas. It is recommended to use {getBlockedFunctionSelectorFirst} and {getBlockedFunctionSelectorNext}
/// to iterate through the selectors in a more gas-efficient way.
///
/// Function selectors are not sorted in any particular way, and their ordering may
/// change at any point.
///
/// WARNING: When using {getBlockedFunctionSelectorCount} and
/// {getBlockedFunctionSelectorAt} via RPC, make sure you perform all queries
/// on the same block. When using these functions within an onchain
/// transaction, make sure that the state of this contract hasn't changed in
/// between invocations to avoid time-of-check time-of-use bugs.
///
@inline
fun Timelock<T>.getBlockedFunctionSelectorAt(self, index: uint32): uint32 {
    if (index >= self.data.blockedFnSelectorsLen) {
        return 0; // index out of bounds
    }

    // Get a mutable reference to the blocked function selectors map (used for iteration)
    var blockedFnSelectors = self.data.blockedFnSelectors;

    // Notice: we need to iterate through the map to get the item at the specified index.
    // This is not efficient, but it is the only way to get an item at index without additional data structures.
    var i = 0;
    var s = blockedFnSelectors.findFirst();
    while (i < index && s.isFound) {
        s = blockedFnSelectors.iterateNext(s);
        i += 1; // increment to next selector
    }

    // Get the item at the specified index
    return s.isFound ? s.getKey() : 0;
}

@inline
fun Timelock<T>.getBlockedFunctionSelectorFirst(self): uint32 {
    if (self.data.blockedFnSelectorsLen == 0) {
        return 0; // no blocked function selectors
    }

    // Get the first item in the map
    var selector = self.data.blockedFnSelectors.findFirst();
    return selector.getKey();
}

@inline
fun Timelock<T>.getBlockedFunctionSelectorNext(self, pivot: uint32): uint32 {
    // Get the next item in the map, after the pivot
    var selector = self.data.blockedFnSelectors.findKeyGreater(pivot);
    if (!selector.isFound) {
        return 0; // no next item
    }

    return selector.getKey();
}

/// Checks to see if the function being scheduled is blocked.
@inline
fun Timelock<T>.checkFunctionSelectorNotBlocked(self, data: slice): void {
    if (data.isEndOfBits() || data.remainingBitsCount() < 32) {
        return; // Note: doesn NOT support blocking msg bodies (data) < 32 bit (e.g., empty msg)
    }

    // Load the function selector from the message body
    val selector = data.loadMessageOp(); // 32-bit integer
    var blocked = self.data.blockedFnSelectors.get(selector);

    if (blocked.isFound) {
        throw Timelock_Error.SelectorIsBlocked;
    }
}

/// Returns the number of blocked function selectors.
fun Timelock<T>.getBlockedFunctionSelectorCount(self): uint32 {
    return self.data.blockedFnSelectorsLen;
}

/// Returns the pending operation info.
fun Timelock<T>.getOpPendingInfo(self): Timelock_OpPendingInfo {
    return self.data.opPendingInfo;
}

// --- Message handlers ---

@inline
fun Timelock<T>.onInternalMessage(mutate self, msgSender: address, msgValue: coins, msgBody: slice) {
    val msg = lazy Timelock_InMessage.fromSlice(msgBody);
    match (msg) {
        Timelock_Init => {
            self.init(msgSender, msgValue, msg.queryId, msg.minDelay, msg.admin, msg.proposers, msg.executors,
                msg.cancellers, msg.bypassers, msg.executorRoleCheckEnabled, msg.opFinalizationTimeout);
        }
        Timelock_ScheduleBatch => {
            self.scheduleBatch(msgSender, msgValue, msg.queryId, msg.calls, msg.predecessor, msg.salt, msg.delay);
        }
        Timelock_Cancel => {
            self.cancel(msgSender, msgValue, msg.queryId, msg.id);
        }
        Timelock_ExecuteBatch => {
            self.executeBatch(msgSender, msgValue, msg.queryId, msg.calls, msg.predecessor, msg.salt);
        }
        Timelock_UpdateDelay => {
            self.updateDelay(msgSender, msgValue, msg.queryId, msg.newDelay);
        }
        Timelock_UpdateOpFinalizationTimeout => {
            self.updateOpFinalizationTimeout(msgSender, msgValue, msg.queryId, msg.newOpFinalizationTimeout);
        }
        Timelock_BlockFunctionSelector => {
            self.blockFunctionSelector(msgSender, msgValue, msg.queryId, msg.selector);
        }
        Timelock_UnblockFunctionSelector => {
            self.unblockFunctionSelector(msgSender, msgValue, msg.queryId, msg.selector);
        }
        Timelock_BypasserExecuteBatch => {
            self.bypasserExecuteBatch(msgSender, msgValue, msg.queryId, msg.calls);
        }
        Timelock_UpdateExecutorRoleCheck => {
            self.updateExecutorRoleCheck(msgSender, msgValue, msg.queryId, msg.enabled);
        }
        Timelock_SubmitErrorReport => {
            self.submitErrorReport(msgSender, msgValue, msg.queryId, msg.opBatch.load(),
                msg.opTxHash, msg.errorTxHash, msg.errorCode);
        }
        else => {
            assert(self.isInitialized()) throw Timelock_Error.ContractNotInitialized;
            var rbac = self.hookTrait__AccessControl();

            val msgHandled = 0
                || rbac.onInternalMessage(msgSender, msgValue, msgBody);

            if (msgHandled) {
                // Map from underlying trait storage to contract storage
                self.data.rbac = rbac.data.toCell();
            }

            // Notice: allow empty message (top up)
            // @dev Contract might receive/hold TON as part of the maintenance process.

            // If the message was not handled:
            //  - ignore all other messages, empty or not empty
            //  - accept generic replies, don't throw "wrong opcode"
        }
    }
}

fun onInternalMessage(in: InMessage) {
    // Load the contract storage as Timelock and handle the message
    var timelock = Timelock<bool>.load();
    timelock.onInternalMessage(in.senderAddress, in.valueCoins, in.body);

    // Store the updated contract data
    timelock.data.storeAsContractData();
}

fun onBouncedMessage(in: InMessageBounced) {
    // Load the contract storage as Timelock and handle the message
    var timelock = Timelock<bool>.load();

    // Check if bounce relates to pending operation
    val bouncedBody = extractBouncedBody(in.bouncedBody.skipBouncedPrefix());
    val fingerprint = timelock.getCallFingerprint(in.senderAddress, bouncedBody);
    val matchesPendingOp = timelock.data.opPendingInfo.opPendingCalls.get(fingerprint).isFound;

    val id = timelock.data.opPendingInfo.opPendingId;
    emit(TOPIC_BOUNCE_HANDLED, Timelock_BounceHandled{
        sender: in.senderAddress,
        bouncedBody,
        opPendingId: id,
        matchesPendingOp,
    });

    if (id == 0) {
        return; // noop
    }

    if (!matchesPendingOp) {
        return; // unrelated bounce, error oracle should intervene with a report
    }

    // Note: make sure opFinalizationTimeout is a large enough value to avoid races here
    timelock.data.timestamps.set(id, ERROR_TIMESTAMP); // mark op as error
    timelock.data.opPendingInfo.validAfter = blockchain.now(); // mark op as final
    timelock.data.opPendingInfo.opPendingCalls.set(fingerprint, false); // mark op pendingCalls as final/bounced

    //   - opportunity to rollback, not currently supported

    // Store the updated contract data
    timelock.data.storeAsContractData();
}

// --- Extension hooks ---

@inline
fun Timelock<T>.hookTrait__AccessControl(self): AccessControl<T>{
    // Construct trait instance (with AccessControl<Timelock>)
    return {
        data: AccessControl_Data.fromCell(self.data.rbac),
        // Set up runtime hooks (extensions)
        context: self.context,
        hooks: self.hooks != null ? self.hooks!.rbac : null,
    };
}

// --- Costs ---

struct Timelock_Costs{}

fun Timelock_Costs.init(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // Timelock_MinDelayChange fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        + MIN_TON_TO_RESERVE // rent reserve expected on initialization
        ;
}

fun Timelock_Costs.scheduleBatch(size: int): int {
    return
        + ton("0.002") // computeFee
        + ton("0.002") * size // Timelock_CallScheduled events fwdFee
        + ton("0.019") // Timelock_BatchScheduled fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

// Notice: execute caller is expected to pay for the processing fees,
// while the rest (rent, op.value) is paid/reserved by the contract.
fun Timelock_Costs.executeBatch(size: int): int {
    return
        + ton("0.002") // computeFee
        + ton("0.002") * size // Timelock_CallExecuted events fwdFee
        + ton("0.019") // Timelock_BatchExecuted fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

fun Timelock_Costs.bypasserExecuteBatch(size: int): int {
    return
        + ton("0.002") // computeFee
        + ton("0.002") * size // messages executed/sent fwdFee
        + ton("0.019") // Timelock_BypasserBatchExecuted fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

fun Timelock_Costs.submitErrorReport(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // Timelock_ErrorReportSubmitted fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.mcms.Timelock", CONTRACT_VERSION);
}

/// @see <Timelock<T>.getId>
get fun getId(): uint32 {
    return Timelock<bool>.load().getId();
}

/// @see <Timelock<T>.isOperation>
get fun isOperation(id: uint256): bool {
    return Timelock<bool>.load().isOperation(id);
}

/// @see <Timelock<T>.isOperationPending>
get fun isOperationPending(id: uint256): bool {
    return Timelock<bool>.load().isOperationPending(id);
}

/// @see <Timelock<T>.isOperationReady>
get fun isOperationReady(id: uint256): bool {
    return Timelock<bool>.load().isOperationReady(id);
}

/// @see <Timelock<T>.isOperationDone>
get fun isOperationDone(id: uint256): bool {
    return Timelock<bool>.load().isOperationDone(id);
}

/// @see <Timelock<T>.isOperationError>
get fun isOperationError(id: uint256): bool {
    return Timelock<bool>.load().isOperationError(id);
}

/// @see <Timelock<T>.isPendingOperationFinal>
get fun isPendingOperationFinal(): bool {
    return Timelock<bool>.load().isPendingOperationFinal();
}

/// @see <Timelock<T>.getTimestamp>
get fun getTimestamp(id: uint256): uint64 {
    return Timelock<bool>.load().getTimestamp(id);
}

/// @see <Timelock<T>.getMinDelay>
get fun getMinDelay(): uint32 {
    return Timelock<bool>.load().getMinDelay();
}

/// @see <Timelock<T>.hashOperationBatch>
get fun hashOperationBatch(op: Timelock_OperationBatch): uint256 {
    return Timelock<bool>.load().hashOperationBatch(op);
}

/// @see <Timelock<T>.getBlockedFunctionSelectorCount>
get fun getBlockedFunctionSelectorCount(): uint32 {
    return Timelock<bool>.load().getBlockedFunctionSelectorCount();
}

/// @see <Timelock<T>.getBlockedFunctionSelectorAt>
get fun getBlockedFunctionSelectorAt(index: uint32): uint32 {
    return Timelock<bool>.load().getBlockedFunctionSelectorAt(index);
}

/// @see <Timelock<T>.isInitialized>
get fun isInitialized(): bool {
    return Timelock<bool>.load().isInitialized();
}

/// @see <Timelock<T>.isExecutorRoleCheckEnabled>
get fun isExecutorRoleCheckEnabled(): bool {
    return Timelock<bool>.load().isExecutorRoleCheckEnabled();
}

/// @see <Timelock<T>.getOpPendingInfo>
get fun getOpPendingInfo(): Timelock_OpPendingInfo {
    return Timelock<bool>.load().getOpPendingInfo();
}

// --- Getters - <AccessControl<T>> extension ---

/// @see <AccessControl<T>.hasRole>
get fun hasRole(role: uint256, account: address): bool {
    val timelock = Timelock<bool>.load();
    val rbac = timelock.hookTrait__AccessControl();
    return rbac.hasRole(role, account);
}

/// @see <AccessControl<T>.getRoleAdmin>
get fun getRoleAdmin(role: uint256): uint256 {
    val timelock = Timelock<bool>.load();
    val rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleAdmin(role);
}

// --- Getters - <AccessControl<T>> enumerable extension ---

/// @see <AccessControl<T>.getRoleMember>
get fun getRoleMember(role: uint256, index: uint32): address? {
    val rbac = Timelock<bool>.load().hookTrait__AccessControl();
    return rbac.getRoleMember(role, index);
}

/// @see <AccessControl<T>.getRoleMemberFirst>
get fun getRoleMemberFirst(role: uint256): address? {
    val rbac = Timelock<bool>.load().hookTrait__AccessControl();
    return rbac.getRoleMemberFirst(role);
}

/// @see <AccessControl<T>.getRoleMemberNext>
get fun getRoleMemberNext(role: uint256, pivot: address): address? {
    val rbac = Timelock<bool>.load().hookTrait__AccessControl();
    return rbac.getRoleMemberNext(role, pivot);
}

/// @see <AccessControl<T>.getRoleMemberCount>
get fun getRoleMemberCount(role: uint256): int {
    val rbac = Timelock<bool>.load().hookTrait__AccessControl();
    return rbac.getRoleMemberCount(role);
}

/// @see <AccessControl<T>.getRoleMembers>
get fun getRoleMembers(role: uint256): map<address, bool>  {
    val rbac = Timelock<bool>.load().hookTrait__AccessControl();
    return rbac.getRoleMembers(role);
}
