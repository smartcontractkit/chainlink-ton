// NOTE: This test receiver is located in contracts/ccip/test/ (not in examples/) 
// because it needs to be included in GitHub release artifacts for integration tests.
// Contracts with the "examples.*" prefix are excluded from published releases.
// See: .github/workflows/contracts-publish-compiled-artifacts.yml

import "../../ccip/types";
import "../../lib/utils";

const RECEIVED_MESSAGE = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

struct Storage {
    offRamp: address; //TODO: should be router?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

type Msg = CCIPReceive;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        CCIPReceive => {
            // Standard for every receiver to implement:
            // - Check CCIPReceive only comes from offRamp/ router
            // - Send CCIPReceiveConfirm to msg.callback
            assert(in.senderAddress == Storage.load().offRamp) throw 0x7777;
            val receiveConfirm = createMessage({
                bounce: true,
                value: ton("0.05"), //TODO how much do we need to send
                dest: in.senderAddress,
                body: OffRamp_CCIPReceiveConfirm {
                    rootId: msg.rootId,
                }
            });
            receiveConfirm.send(SEND_MODE_REGULAR);

            emit(RECEIVED_MESSAGE, CCIPMessageReceived{
                message: msg.message,
            });
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}
