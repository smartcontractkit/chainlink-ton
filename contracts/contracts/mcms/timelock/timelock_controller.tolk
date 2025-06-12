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
    var rbac = RBACAccessControl.fromCell(s.rbac);

    val senderAddress: address = cs.loadAddress();
    cs.loadAddress(); // skip dst
    cs.loadCoins(); // skip value
    cs.skipBits(1); // skip extracurrency collection
    cs.loadCoins(); // skip ihr_fee
    var fwdFee = cs.loadCoins();

    forceChain(WORKCHAIN, senderAddress, ERROR_WRONG_WORKCHAIN);

    val op = msgBody.loadMessageOp();
    val queryID = msgBody.loadMessageQueryId();

    val (_, adminExists) = accountExists(rbac.adminAccounts, senderAddress);
    if (adminExists) {
        // Map from underlying contract storage to trait storage
        // RBACTimelockAdmin operations handler
        var timelockAdmin: RBACTimelockAdmin = {
            minDelay: s.minDelay,
            timestampCount: s.timestampCount,
            timestamps: s.timestamps,
        };

        var msgHandeled = 0
          || rbac.onInternalMessage(op, myBalance, msgValue, msgFull, msgBody)
          || timelockAdmin.onInternalMessage(op, myBalance, msgValue, msgFull, msgBody);
        if (msgHandeled) {
            // Map from underlying trait storage to contract storage
            s.minDelay = timelockAdmin.minDelay;
            s.timestampCount = timelockAdmin.timestampCount;
            s.timestamps = timelockAdmin.timestamps;
            s.rbac = rbac.toCell();
            // Save the updated storage
            saveData(s);
            return;
        }
    }

    val (_, proposerExists) = accountExists(rbac.proposerAccounts, senderAddress);
    if (proposerExists) {
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

    val (_, cancellerExists) = accountExists(rbac.cancellerAccounts, senderAddress);
    if (cancellerExists) {
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

    var (_, executorExists) = accountExists(rbac.executorAccounts, senderAddress);
    if (executorExists) {
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
