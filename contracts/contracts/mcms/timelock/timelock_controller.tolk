tolk 0.99

import "@stdlib/tvm-dicts";
import "../../lib/access/access_control.tolk";

import "common/workchain.tolk";
import "common/message.tolk";

import "timelock_controller/error.tolk";
import "timelock_controller/storage.tolk";
import "timelock_controller/op.tolk";
import "timelock_controller/params.tolk";
import "timelock_controller/operation_utils.tolk";
import "timelock_controller/get.tolk";
import "timelock_controller/admin_calls.tolk";

// Notice: role constants are kept as original Ethereum implementation (keccak256)
const ROLE_ADMIN = 0; // TODO: keccak256("ADMIN_ROLE");
const ROLE_PROPOSER = 1; // TODO: keccak256("PROPOSER_ROLE");
const ROLE_CANCELLER = 2; // TODO: keccak256("CANCELLER_ROLE");
const ROLE_EXECUTOR = 3; // TODO: keccak256("EXECUTOR_ROLE");
const ROLE_BYPASSER = 4; // TODO: keccak256("BYPASSER_ROLE");

struct Timelock {}

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs: slice = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    // TODO: not available in tolk 0.99
    // if (isMessageBounced(flags)) { // ignore all bounced messages
    //     return;
    // }

    // Load the contract storage
    var s = loadData();

    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();

    val senderAddress: address = cs.loadAddress();
    cs.loadAddress(); // skip dst
    cs.loadCoins(); // skip value
    cs.skipBits(1); // skip extracurrency collection
    cs.loadCoins(); // skip ihr_fee
    var fwdFee = cs.loadCoins();

    forceChain(WORKCHAIN, senderAddress, ERROR_WRONG_WORKCHAIN);

    if (rbac.hasRole(ROLE_ADMIN, senderAddress)) {
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
            debug.printString("Admin message handled");
            // Map from underlying trait storage to contract storage
            s.minDelay = timelockAdmin.minDelay;
            s.timestampCount = timelockAdmin.timestampCount;
            s.timestamps = timelockAdmin.timestamps;
            s.rbac = rbac.data.toCell();
            // Save the updated storage
            saveData(s);
            return;
        }
    }

    val op = msgBody.loadMessageOp();
    debug.print(op);
    val queryID = msgBody.loadMessageQueryId();
    if (rbac.hasRole(ROLE_PROPOSER, senderAddress)) {
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
            saveData(s);
            return;
        }
    }

    if (rbac.hasRole(ROLE_CANCELLER, senderAddress)) {
        if (op == OP_CANCEL) {
            val id = msgBody.loadUint(256);
            msgBody.assertEnd();

            var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
            assert(exists, ERROR_OPERATION_NOT_EXISTS);
            val timestamp = timestampSlice!.loadUint(32);
            assert(timestamp != DONE_TIMESTAMP, ERROR_INVALID_OPERATION_STATE);

            s.timestamps.uDictDelete(256, id);
            s.timestampCount -= 1;
            saveData(s);
            return;
        }
    }

    if (rbac.hasRole(ROLE_EXECUTOR, senderAddress)) {
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
            saveData(s);
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
fun Timelock.hookTrait__AccessControl(self): AccessControl<Timelock>{
    // Load the contract storage
    var s = loadData();

    // Construct trait instance (with AccessControl<Timelock>)
    return {
        data: AccessControl_Data.fromCell(s.rbac),
        // no runtime extensions
        context: null,
        hooks: null,
    };
}

// --- Getters ---

// --- Getters - <AccessControl<T>> extension ---

/// @see <AccessControl<T>.hasRole>
get hasRole(role: int, account: address): bool {
    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.hasRole(role, account);
}

/// @see <AccessControl<T>.getRoleAdmin>
get getRoleAdmin(role: int): int {
    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleAdmin(role);
}

// --- Getters - <AccessControl<T>> enumerable extension ---

/// @see <AccessControl<T>.getRoleMember>
get getRoleMember(role: int, index: uint32): address {
    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMember(role, index);
}

/// @see <AccessControl<T>.getRoleMemberCount>
get getRoleMemberCount(role: int): int {
    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMemberCount(role);
}

/// @see <AccessControl<T>.getRoleMembers>
get getRoleMembers(role: int): dict {
    var timelock: Timelock = {};
    var rbac = timelock.hookTrait__AccessControl();
    return rbac.getRoleMembers(role);
}
