// NOTE: This test receiver is located in contracts/ccip/test/ 
// because it needs to be included in GitHub release artifacts for integration tests.
// Contracts with the "examples.*" prefix are excluded from published releases.
// See: .github/workflows/contracts-publish-compiled-artifacts.yml
import "storage"
import "errors"
import "messages"

import "../../../lib/receiver/messages";
import "../../../lib/receiver/types";
import "../../../lib/utils";
import "../../router/messages"
import "../../../lib/access/ownable_2step"

const CONTRACT_VERSION = "1.6.0";

const RECEIVED_MESSAGE_TOPIC = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy Receiver_InMessage.fromSlice(in.body);
    match (msg) {
        Receiver_CCIPReceive => {
            var st = lazy Storage.load();
            // Standard for every receiver to implement:
            // - Check CCIPReceive only comes from router
            // - Send CCIPReceiveConfirm to msg.callback
            assert(in.senderAddress == st.authorizedCaller, Error.Unauthorized);

            match (st.behavior) {
                ReceiverBehavior.Accept => {
                    processAccept(msg, in.senderAddress)
                },
                ReceiverBehavior.RejectAll => {
                    processRejectAll()
                },
                ReceiverBehavior.ConsumeAllGas => {
                    processConsumeAllGas()
                }
            }
        }
        Receiver_UpdateAuthorizedCaller => {
            onUpdateAuthorizedCaller(msg, in.senderAddress)
        }
        Receiver_UpdateBehavior => {
            onUpdateBehavior(msg, in.senderAddress)
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun processAccept(msg: Receiver_CCIPReceive, senderAddress: address) {
    val receiveConfirm = createMessage({
        bounce: true,
        value: 0,
        dest: senderAddress,
        body: Router_CCIPReceiveConfirm {
            execId: msg.execId,
        }
    });
    receiveConfirm.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    emit(RECEIVED_MESSAGE_TOPIC, CCIPMessageReceived{
        message: msg.message,
    });
}

fun processRejectAll() {
    throw Error.Rejected;
}

// This is just for testing purposes
fun processConsumeAllGas() {
    var x: int = 0;
    while (true) { x = x + 1; }
}

fun onUpdateAuthorizedCaller(msg: Receiver_UpdateAuthorizedCaller, senderAddress: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(senderAddress);

    st.authorizedCaller = msg.authorizedCaller;
    st.store();
}

fun onUpdateBehavior(msg: Receiver_UpdateBehavior, senderAddress: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(senderAddress);

    st.behavior = msg.behavior;
    st.store();
}

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
    return ("com.chainlink.ton.ccip.test.Receiver", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.test.Receiver"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.test.Receiver"), local);
}
