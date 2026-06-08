// SPDX-License-Identifier: BUSL-1.1
// NOTE: This test receiver is located in contracts/ccip/test/ 
// because it needs to be included in GitHub release artifacts for integration tests.
// Contracts with the "examples.*" prefix are excluded from published releases.
// See: .github/workflows/contracts-publish-compiled-artifacts.yml
import "storage"
import "errors"
import "messages"
import "types"

import "../../../lib/receiver/messages";
import "../../../lib/receiver/types";
import "../../../lib/receiver/errors"
import "../../../lib/utils";
import "../../../lib/access/ownable_2step"
import "../../../lib/versioning/upgradeable"

import "../../router/messages"

tolk 1.4.1

const CONTRACT_VERSION = "1.6.1".literalSlice();

contract TestReceiver {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.Receiver"

    storage: Storage
    incomingMessages: TestReceiver_InMessage
}

const RECEIVED_MESSAGE_TOPIC = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TestReceiver_InMessage.fromSlice(in.body);
    match (msg) {
        Receiver_CCIPReceive => {
            var st = lazy Storage.load();
            // Standard way for a receiver to be implemented:

            // 1. Check that enough value is received to process this message (you should benchmark accordingly)
            assert( in.valueCoins >= ton("0.03") ) throw (Receiver_Error.LowValue);

            // 2. Check CCIPReceive only comes from router
            assert( in.senderAddress == st.authorizedCaller) throw (Receiver_Error.Unauthorized);

            // 3. Process the message according to your product logic
            match (st.behavior) {
                TestReceiverBehavior.Accept => {
                    processAccept(msg, in.senderAddress)
                },
                TestReceiverBehavior.RejectAll => {
                    processRejectAll()
                },
                TestReceiverBehavior.ConsumeAllGas => {
                    processConsumeAllGas()
                }
            }

            // 4. Enqueue CCIPReceiveConfirm to msg.callback

            // In this example we are sending all the value remaining from the message after compute costs
            // and action fees from previously emitted events. You should use an appropiate message mode for your own use case.
            // But, consider that a minimum of 0.02 TON is required for the Router to process your confirmation message,
            // and you should probably send more than that (~0.025 TON) to make sure the message goes through
            // even if there are some fluctuations in the fees.
            reserveToncoinsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
            val receiveConfirm = createMessage({
                bounce: true,
                value: 0,
                dest: in.senderAddress,
                body: Router_CCIPReceiveConfirm {
                    execId: msg.execId,
                }
            });
            receiveConfirm.send(SEND_MODE_CARRY_ALL_BALANCE);
           
        }
        TestReceiver_UpdateAuthorizedCaller => {
            onUpdateAuthorizedCaller(msg, in.senderAddress)
        }
        TestReceiver_UpdateBehavior => {
            onUpdateBehavior(msg, in.senderAddress)
        }
        Upgradeable_Upgrade => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onUpgrade(msg);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun processAccept(msg: Receiver_CCIPReceive, senderAddress: address) {
    emit(RECEIVED_MESSAGE_TOPIC, CCIPMessageReceived{
        message: msg.message,
    });
}

fun processRejectAll() {
    throw TestReceiver_Error.Rejected;
}

// This is just for testing purposes
fun processConsumeAllGas() {
    var x: int = 0;
    while (true) { x = x + 1; }
}

fun onUpdateAuthorizedCaller(msg: TestReceiver_UpdateAuthorizedCaller, senderAddress: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(senderAddress);

    st.authorizedCaller = msg.authorizedCaller;
    st.store();
}

fun onUpdateBehavior(msg: TestReceiver_UpdateBehavior, senderAddress: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(senderAddress);

    st.behavior = msg.behavior;
    st.store();
}

fun onUpgrade(msg: Upgradeable_Upgrade) {
    Upgradeable{ migrate, version }.upgrade(msg);
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { 
    assert(version.bitsEqual("1.6.0".literalSlice()), Upgradeable_Error.VersionMismatch);
    return storage;
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun getId(): uint32 {
    val st = lazy Storage.load();
    return st.id;
}

get fun getAuthorizedCaller(): address {
    val st = lazy Storage.load();
    return st.authorizedCaller;
}

get fun getBehavior(): int {
    val st = lazy Storage.load();
    return st.behavior as int;
}

get fun typeAndVersion(): (slice, slice) {
    return (TestReceiver_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return TestReceiver_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(TestReceiver_FACILITY_NAME.crc32(), local);
}
