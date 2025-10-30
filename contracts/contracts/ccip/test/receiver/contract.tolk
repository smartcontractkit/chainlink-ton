// NOTE: This test receiver is located in contracts/ccip/test/ 
// because it needs to be included in GitHub release artifacts for integration tests.
// Contracts with the "examples.*" prefix are excluded from published releases.
// See: .github/workflows/contracts-publish-compiled-artifacts.yml
import "storage"
import "errors"

import "../../../lib/receiver/messages";
import "../../../lib/receiver/types";
import "../../../lib/utils";
import "../../../ccip/offramp/messages";

const CONTRACT_VERSION = "0.0.3";

const RECEIVED_MESSAGE_TOPIC = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

struct (0x00000001) SetRejectAll {
    rejectAll: bool;
}

type Msg = Receiver_CCIPReceive | SetRejectAll;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        Receiver_CCIPReceive => {
            // Standard for every receiver to implement:
            // - Check CCIPReceive only comes from offRamp/ router
            // - Send CCIPReceiveConfirm to msg.callback
            val st = Storage.load();
            assert(in.senderAddress == st.offRamp, Error.Unauthorized);
            assert(!st.rejectAll, Error.Rejected);
            val receiveConfirm = createMessage({
                bounce: true,
                value: ton("0.05"), //TODO how much do we need to send
                dest: in.senderAddress,
                body: OffRamp_CCIPReceiveConfirm {
                    execId: msg.execId,
                }
            });
            receiveConfirm.send(SEND_MODE_REGULAR);

            emit(RECEIVED_MESSAGE_TOPIC, CCIPMessageReceived{
                message: msg.message,
            });
        }
        SetRejectAll => {
            var st = Storage.load();
            st.rejectAll = msg.rejectAll;
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

get fun getId(): uint32 {
    val st = lazy Storage.load();
    return st.id;
}

get fun getOfframpAddress(): address {
    val st = lazy Storage.load();
    return st.offRamp;
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
