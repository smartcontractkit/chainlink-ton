import "@stdlib/tvm-dicts";
import "common/workchain.tolk";
import "timelock_controller/error.tolk";
import "common/accounts.tolk";
import "common/message.tolk";
import "timelock_controller/storage.tolk";
import "timelock_controller/op.tolk";
import "timelock_controller/params.tolk";
import "timelock_controller/operation_utils.tolk";
import "timelock_controller/get.tolk";
import "timelock_controller/admin_calls.tolk";

// onInternalMessage is the main entrypoint; it's called when a contract receives an internal message from other contracts
fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs: slice = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    loadStorage();

    val senderAddress: slice = cs.loadAddress();
    cs.loadAddress(); // skip dst
    cs.loadCoins(); // skip value
    cs.skipBits(1); // skip extracurrency collection
    cs.loadCoins(); // skip ihr_fee
    var fwdFee = cs.loadCoins();

    forceChain(WORKCHAIN, senderAddress, ERROR_WRONG_WORKCHAIN);

    val op = msgBody.loadMessageOp();
    val queryID = msgBody.loadMessageQueryId();

    val (_, adminExists) = accountExists(STORAGE_ADMIN_ACCOUNTS, senderAddress);
    if (adminExists) {
        if (handleAdminMessages(op, queryID, myBalance, msgValue, msgBody)) {
            return;
        }
    }

    val (_, proposerExists) = accountExists(STORAGE_PROPOSER_ACCOUNTS, senderAddress);
    if (proposerExists) {
        if (op == OP_SCHEDULE) {
            val delay = msgBody.loadUint(32);
            val tonValue = msgBody.loadCoins();
            val predecessor = msgBody.loadUint(256);
            val salt = msgBody.loadUint(256);
            val targetAccount = msgBody.loadAddress();
            val msgToSend = msgBody.loadRef();
            msgBody.assertEnd();

            assert(delay >= STORAGE_MIN_DELAY, ERROR_INVALID_DELAY);

            val id = hashOperation(tonValue, predecessor, salt, targetAccount, msgToSend);

            val (_, exists) = STORAGE_TIMESTAMPS.uDictGet(256, id);
            assert(!exists, ERROR_OPERATION_EXISTS);
            val timestampSlice = beginCell().storeUint(blockchain.now() + delay, 32).endCell().beginParse();
            STORAGE_TIMESTAMPS.uDictSet(256, id, timestampSlice);
            STORAGE_TIMESTAMP_COUNT += 1;
            saveStorage();
            return;
        }
    }

    val (_, cancellerExists) = accountExists(STORAGE_CANCELLER_ACCOUNTS, senderAddress);
    if (cancellerExists) {
        if (op == OP_CANCEL) {
            val id = msgBody.loadUint(256);
            msgBody.assertEnd();

            var (timestampSlice, exists) = STORAGE_TIMESTAMPS.uDictGet(256, id);
            assert(exists, ERROR_OPERATION_NOT_EXISTS);
            val timestamp = timestampSlice!.loadUint(32);
            assert(timestamp != DONE_TIMESTAMP, ERROR_INVALID_OPERATION_STATE);

            STORAGE_TIMESTAMPS.uDictDelete(256, id);
            STORAGE_TIMESTAMP_COUNT -= 1;
            saveStorage();
            return;
        }
    }

    var (_, executorExists) = accountExists(STORAGE_EXECUTOR_ACCOUNTS, senderAddress);
    if (executorExists) {
        if (op == OP_EXECUTE) {
            val tonValue = msgBody.loadCoins();
            val predecessor = msgBody.loadUint(256);
            val salt = msgBody.loadUint(256);
            val targetAccount = msgBody.loadAddress();
            val msgToSend = msgBody.loadRef();
            msgBody.assertEnd();

            if (predecessor > 0) {
                var (timestampSlice, exists) = STORAGE_TIMESTAMPS.uDictGet(256, predecessor);
                assert(exists, ERROR_PREDECESSOR_NOT_EXISTS);
                val timestamp = timestampSlice!.loadUint(32);
                assert(timestamp == DONE_TIMESTAMP, ERROR_INVALID_PREDECOSSOR_STATE);
            }

            val id = hashOperation(tonValue, predecessor, salt, targetAccount, msgToSend);

            var (timestampSlice, exists) = STORAGE_TIMESTAMPS.uDictGet(256, id);
            assert(exists, ERROR_OPERATION_NOT_EXISTS);
            val timestamp = timestampSlice!.loadUint(32);
            assert(timestamp <= blockchain.now(), ERROR_INVALID_OPERATION_STATE);

            reserveToncoinsOnBalance(MIN_TON_FOR_STORAGE, RESERVE_MODE_EXACT_AMOUNT);

            var msg = beginCell()
                .storeMsgFlagsAndAddressNone(BOUNCEABLE)
                .storeSlice(targetAccount)
                .storeCoins(tonValue)
                .storeOnlyBodyRef(msgToSend);
            sendMessage(msg.endCell(), SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

            timestampSlice = beginCell().storeUint(DONE_TIMESTAMP, 32).endCell().beginParse();
            STORAGE_TIMESTAMPS.uDictSet(256, id, timestampSlice);
            saveStorage();
            return;
        }
    }

    if (op == OP_TOP_UP) {
        return; // just accept tons
    }

    throw ERROR_WRONG_OP;
}
