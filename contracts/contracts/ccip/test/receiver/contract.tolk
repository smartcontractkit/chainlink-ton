// SPDX-License-Identifier: BUSL-1.1
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
import "../../../lib/access/ownable_2step"
import "types"
import "../../../lib/versioning/upgradeable"

const CONTRACT_VERSION = "1.6.0";

const RECEIVED_MESSAGE_TOPIC = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TestReceiver_InMessage.fromSlice(in.body);
    match (msg) {
        Receiver_CCIPReceive => {
            var st = lazy Storage.load();
            msg.validateAndConfirm({
                router: st.authorizedCaller,
                minValue: ton("0.01"),
                inMsg: {
                    senderAddress: in.senderAddress,
                    valueCoins: in.valueCoins,
                },
                confirmationMsg: {
                    sendMode: SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
                }
            });
           
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
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

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
    return (TestReceiver_FACILITY_NAME, CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return TestReceiver_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.ccip.test.Receiver"), local);
}
