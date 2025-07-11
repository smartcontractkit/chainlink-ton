tolk 1.0

import "@stdlib/tvm-dicts";
import "../../lib/access/access_control.tolk";

import "timelock_controller/error.tolk";
import "timelock_controller/op.tolk";
import "timelock_controller/params.tolk";
import "timelock_controller/operation_utils.tolk";
import "timelock_controller/admin_calls.tolk";

/**
 * @notice Contract module which acts as a timelocked controller with role-based
 * access control. When set as the owner of an `Ownable` smart contract, it
 * can enforce a timelock on `onlyOwner` maintenance operations and prevent
 * a list of blocked functions from being called. The timelock can be bypassed
 * by a bypasser or an admin in emergency situations that require quick action.
 *
 * Non-emergency actions are expected to follow the timelock.
 *
 * The contract has five roles. Each role can be inhabited by multiple
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
 * Note that this contract doesn't place any restrictions on the gas limit used
 * when executing operations. See the above comment on the executor role for
 * more details.
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

/// @dev Schedule an operation containing a batch of transactions.
///
/// Emits one {Timelock_CallScheduled} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'proposer' or 'admin' role.
/// - all payloads must not start with a blocked function selector.
///
struct (0x94718f4) Timelock_ScheduleBatch {
    /// Query ID of the change owner request.
    queryId: uint64;

    // Array of calls to be scheduled
    calls: cell; // TODO: encode as vec<Call>
    // Predecessor operation ID
    predecessor: uint256;
    // Salt used to derive the operation ID
    salt: uint256;
    // Delay in seconds before the operation can be executed
    delay: uint64;
}

/// @dev Cancel an operation.
///
/// Requirements:
///
/// - the caller must have the 'canceller' or 'admin' role.
///
struct (0xaf3bf1d0) Timelock_Cancel {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// ID of the operation to cancel.
    id: uint256;
}

/// @dev Execute an (ready) operation containing a batch of transactions.
///
/// Emits one {Timelock_CallExecuted} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'executor' or 'admin' role.
///
struct (0x6e9Bf263) Timelock_ExecuteBatch {
    /// Query ID of the change owner request.
    queryId: uint64;

    // Array of calls to be scheduled
    calls: cell; // TODO: encode as vec<Call>
    // Predecessor operation ID
    predecessor: uint256;
    // Salt used to derive the operation ID
    salt: uint256;
}

/// @dev Changes the minimum timelock duration for future operations.
///
/// Emits a {Timelock_MinDelayChange} event.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x7a57a45c) Timelock_UpdateDelay {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// New minimum delay in seconds for future operations.
    newDelay: uint64;
}

/// @dev Blocks a function selector from being used, i.e. schedule
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
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Function selector to block.
    selector: uint32;
}

/// @dev Unblocks a previously blocked function selector so it can be used again.
///
/// Requirements:
///
/// - the caller must have the 'admin' role.
///
struct (0x26f19f4e) Timelock_UnblockFunctionSelector {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Function selector to unblock.
    selector: uint32;
}

/// @dev Directly execute a batch of transactions, bypassing any other checks.
///
/// Emits one {Timelock_BypasserCallExecuted} event per transaction in the batch.
///
/// Requirements:
///
/// - the caller must have the 'bypasser' or 'admin' role.
///
struct (0xbb0e9f7d) Timelock_BypasserExecuteBatch {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Array of calls to be scheduled
    calls: cell; // TODO: encode as vec<Call>
}

/// @dev Union of all incoming messages.
type Timelock_Message = Timelock_ScheduleBatch
    | Timelock_Cancel
    | Timelock_ExecuteBatch
    | Timelock_UpdateDelay
    | Timelock_UnblockFunctionSelector
    | Timelock_BlockFunctionSelector
    | Timelock_UnblockFunctionSelector
    | Timelock_BypasserExecuteBatch;

// --- Messages - outgoing ---

/// @dev Emitted when a call is scheduled as part of operation `id`.
struct (0xc55fca54) Timelock_CallScheduled {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    id: uint256;
    index: uint64;
    target: address;
    value: coins;
    data: cell;
    predecessor: uint256;
    salt: uint256;
    delay: uint64;
}

/// @dev Emitted when a call is performed as part of operation `id`.
struct (0x49ea5d0e) Timelock_CallExecuted {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    id: uint256;
    index: uint64;
    target: address;
    value: coins;
    data: cell;
}

/// @dev Emitted when a call is performed via bypasser.
struct (0x9c7f3010) Timelock_BypasserCallExecuted {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    index: uint64;
    target: address;
    value: coins;
    data: cell;
}

/// @dev Emitted when operation `id` is cancelled.
struct (0x580e80f2) Timelock_Canceled {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    id: uint256;
}

/// @dev Emitted when the minimum delay for future operations is modified.
struct (0x904b14e0) Timelock_MinDelayChange {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    oldDuration: uint64;
    newDuration: uint64;
}

/// @dev Emitted when a function selector is blocked.
struct (0x9c4d6d94) Timelock_FunctionSelectorBlocked {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    selector: uint32;
}

/// @dev Emitted when a function selector is unblocked.
struct (0xf410a31b) Timelock_FunctionSelectorUnblocked {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// 
    selector: uint32;
}

// --- Storage ---

/// AccessControl contract struct, host storage and runtime hooks (extensions).
struct Timelock<T> {
    // data: Timelock_Data;

    /// Runtime hooks (extensions)
    context: T? = null,
    hooks: Timelock_Hooks<T>? = null;
}

/// RBACTimelock contract storage, auto-serialized to/from cells.
struct Timelock_Data {
    // id: uint32;          // required to allow multiple independent instances, since contract address depends on initial state

    minDelay: uint32;       // minimum delay for operations in seconds
    timestampCount: uint32; // number of timestamps stored, used to track the size of the storage
    timestamps: dict;       // maps operation id to timestamp

    rbac: Cell<AccessControl_Data>;
}

/// Load from contract data using auto-serialization.
@inline
fun Timelock_Data.fromContractData() {
    return Timelock_Data.fromCell(contract.getData());
}

/// Store as contract data into persistent storage using auto-serialization.
@inline
fun Timelock_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}

// --- Hooks struct (extensions) ---

/// @dev Hook extensions exposed by the Timelock contract.
struct Timelock_Hooks<T> {
    /// @dev AccessControl hooks exposed by the Timelock contract.
    rbac: AccessControl_Hooks<T>;

    /// Hook to get the identifier of an operation containing a batch of transactions.
    hashOperationBatch: ((T, cell, uint256, uint256) -> address)?;
}

// --- Constants ---

// TODO: use keccak256 hash function to match Ethereum implementation
// Notice: role constants are kept as original Ethereum implementation (keccak256)
const ADMIN_ROLE = stringSha256_32("ADMIN_ROLE");
const PROPOSER_ROLE = stringSha256_32("PROPOSER_ROLE");
const CANCELLER_ROLE = stringSha256_32("CANCELLER_ROLE");
const EXECUTOR_ROLE = stringSha256_32("EXECUTOR_ROLE");
const BYPASSER_ROLE = stringSha256_32("BYPASSER_ROLE");

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEndOfBits() && msgBody.isEndOfRefs()) { // ignore all empty messages
        return;
    }

    var cs: slice = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    // TODO: not available in tolk 0.99
    // if (isMessageBounced(flags)) { // ignore all bounced messages
    //     return;
    // }

    // Load the contract storage
    var s = Timelock_Data.fromContractData();

    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();

    val senderAddress: address = cs.loadAddress();
    cs.loadAddress(); // skip dst
    cs.loadCoins(); // skip value
    cs.skipBits(1); // skip extracurrency collection
    cs.loadCoins(); // skip ihr_fee
    var fwdFee = cs.loadCoins();

    val res = rbac.hasRole(ADMIN_ROLE, senderAddress);
    if (rbac.hasRole(ADMIN_ROLE, senderAddress)) {
        // Map from underlying contract storage to trait storage
        // RBACTimelockAdmin operations handler
        var timelockAdmin: RBACTimelockAdmin = {
            minDelay: s.minDelay,
            timestampCount: s.timestampCount,
            timestamps: s.timestamps,
        };

        var msgHandeled = 0
          || rbac.onInternalMessage(myBalance, msgValue, msgFull, msgBody)
          || timelockAdmin.onInternalMessage(myBalance, msgValue, msgFull, msgBody);

        if (msgHandeled) {
            // Map from underlying trait storage to contract storage
            s.minDelay = timelockAdmin.minDelay;
            s.timestampCount = timelockAdmin.timestampCount;
            s.timestamps = timelockAdmin.timestamps;
            s.rbac = rbac.data.toCell();
            // Save the updated storage
            s.storeAsContractData();
            return;
        }
    }

    val op = msgBody.loadMessageOp();
    val queryID = msgBody.loadMessageQueryId();
    if (rbac.hasRole(PROPOSER_ROLE, senderAddress)) {
        if (op == OP_SCHEDULE) {
            val delay = msgBody.loadUint(32);
            val tonValue = msgBody.loadCoins();
            val predecessor = msgBody.loadUint(256);
            val salt = msgBody.loadUint(256);
            val targetAccount = msgBody.loadAddress();
            val msgToSend = msgBody.loadRef();
            msgBody.assertEnd();

            assert(delay >= s.minDelay, ERROR_INVALID_DELAY);

            val id = hashOperation(tonValue, predecessor, salt, targetAccount, msgToSend);

            val (_, exists) = s.timestamps.uDictGet(256, id);
            assert(!exists, ERROR_OPERATION_EXISTS);
            val timestampSlice = beginCell().storeUint(blockchain.now() + delay, 32).endCell().beginParse();
            s.timestamps.uDictSet(256, id, timestampSlice);
            s.timestampCount += 1;
            s.storeAsContractData();
            return;
        }
    }

    if (rbac.hasRole(CANCELLER_ROLE, senderAddress)) {
        if (op == OP_CANCEL) {
            val id = msgBody.loadUint(256);
            msgBody.assertEnd();

            var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
            assert(exists, ERROR_OPERATION_NOT_EXISTS);
            val timestamp = timestampSlice!.loadUint(32);
            assert(timestamp != DONE_TIMESTAMP, ERROR_INVALID_OPERATION_STATE);

            s.timestamps.uDictDelete(256, id);
            s.timestampCount -= 1;
            s.storeAsContractData();
            return;
        }
    }

    if (rbac.hasRole(EXECUTOR_ROLE, senderAddress)) {
        if (op == OP_EXECUTE) {
            val tonValue = msgBody.loadCoins();
            val predecessor = msgBody.loadUint(256);
            val salt = msgBody.loadUint(256);
            val targetAccount = msgBody.loadAddress();
            val msgToSend = msgBody.loadRef();
            msgBody.assertEnd();

            if (predecessor > 0) {
                var (timestampSlice, exists) = s.timestamps.uDictGet(256, predecessor);
                assert(exists, ERROR_PREDECESSOR_NOT_EXISTS);
                val timestamp = timestampSlice!.loadUint(32);
                assert(timestamp == DONE_TIMESTAMP, ERROR_INVALID_PREDECOSSOR_STATE);
            }

            val id = hashOperation(tonValue, predecessor, salt, targetAccount, msgToSend);

            var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
            assert(exists, ERROR_OPERATION_NOT_EXISTS);
            val timestamp = timestampSlice!.loadUint(32);
            assert(timestamp <= blockchain.now(), ERROR_INVALID_OPERATION_STATE);

            reserveToncoinsOnBalance(MIN_TON_FOR_STORAGE, RESERVE_MODE_EXACT_AMOUNT);

            val op = createMessage({
                bounce: true,
                value: tonValue,
                dest: targetAccount,
                body: msgToSend
            });
            op.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

            timestampSlice = beginCell().storeUint(DONE_TIMESTAMP, 32).endCell().beginParse();
            s.timestamps.uDictSet(256, id, timestampSlice);
            s.storeAsContractData();
            return;
        }
    }

    if (op == OP_TOP_UP) {
        return; // just accept tons
    }

    throw ERROR_WRONG_OP;
}

// --- Extension hooks ---

@inline
fun Timelock<T>.hookTrait__AccessControl(self): AccessControl<T>{
    // Load the contract storage
    var s = Timelock_Data.fromContractData();

    // Construct trait instance (with AccessControl<Timelock>)
    return {
        data: AccessControl_Data.fromCell(s.rbac),
        // Set up runtime hooks (extensions)
        context: self.context,
        hooks: self.hooks != null ? self.hooks!.rbac : null,
    };
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.mcms.Timelock", "1.0.0");
}

// --- Getters - <AccessControl<T>> extension ---

/// @see <AccessControl<T>.hasRole>
get fun hasRole(role: int, account: address): bool {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.hasRole(role, account);
}

/// @see <AccessControl<T>.getRoleAdmin>
get fun getRoleAdmin(role: int): int {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleAdmin(role);
}

// --- Getters - <AccessControl<T>> enumerable extension ---

/// @see <AccessControl<T>.getRoleMember>
get fun getRoleMember(role: int, index: uint32): address {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMember(role, index);
}

/// @see <AccessControl<T>.getRoleMemberFirst>
get fun getRoleMemberFirst(role: int): address {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMemberFirst(role);
}

/// @see <AccessControl<T>.getRoleMemberNext>
get fun getRoleMemberNext(role: int, pivot: address): address {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMemberNext(role, pivot);
}

/// @see <AccessControl<T>.getRoleMemberCount>
get fun getRoleMemberCount(role: int): int {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMemberCount(role);
}

/// @see <AccessControl<T>.getRoleMembers>
get fun getRoleMembers(role: int): dict {
    var timelock: Timelock<bool> = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMembers(role);
}
