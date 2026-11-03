// SPDX-License-Identifier: BUSL-1.1
// NOTE: This test receiver is located in contracts/ccip/test/ 
// because it needs to be included in GitHub release artifacts for integration tests.
// Contracts with the "examples.*" prefix are excluded from published releases.
// See: .github/workflows/contracts-publish-compiled-artifacts.yml

import "../../../lib/utils";
import "../../../lib/access/ownable_2step"
import "../../../lib/versioning/upgradeable"
import "../../lib/client/receiver/messages"
import "../../lib/client/receiver/types";
import "../../lib/client/receiver/errors"
import "../../lib/cross_chain_address/types"

import "storage"
import "errors"
import "messages"
import "types"

tolk 1.4.2

const CONTRACT_VERSION = "1.6.1".literalSlice();

contract TestReceiver {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.Receiver"

    storage: Storage
    incomingMessages: TestReceiver_InMessage
}

const RECEIVED_MESSAGE_TOPIC = 0xc5a40ab3; //crc32('Receiver_CCIPMessageReceived')

/// Only the header: echoing up to 2 KB of data would cost more than the confirmation.
struct CCIPMessageReceived {
    messageId: uint256
    sourceChainSelector: uint64
    sender: CrossChainAddress
}

/// Compute, the event and the confirmation with its forward fee, for a message with 2 KB of data.
const TEST_RECEIVER_MIN_VALUE = grams("0.03");

fun onInternalMessage(in: InMessage) {
    val msg = lazy TestReceiver_InMessage.fromSlice(in.body);
    match (msg) {
        Receiver_CCIPReceiveV2 => {
            var st = lazy Storage.load();
            // Standard way for a receiver to be implemented:

            // 1. Authenticate the router, check the value (benchmark yours) and enqueue
            // CCIPReceiveConfirm before any other action.
            msg.validateAndConfirm({
                router: st.authorizedCaller,
                minValue: TEST_RECEIVER_MIN_VALUE,
                inMsg: { senderAddress: in.senderAddress, valueCoins: in.valueCoins },
                confirmationMsg: {},
            });

            // 2. Process the message according to your product logic
            match (st.behavior) {
                TestReceiver_Behavior.Accept => {
                    processAccept(msg, in.senderAddress)
                },
                TestReceiver_Behavior.RejectAll => {
                    processRejectAll()
                },
                TestReceiver_Behavior.ConsumeAllGas => {
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

fun processAccept(msg: Receiver_CCIPReceiveV2, senderAddress: address) {
    val message = msg.message.load();
    emit(RECEIVED_MESSAGE_TOPIC, CCIPMessageReceived{
        messageId: message.messageId,
        sourceChainSelector: message.sourceChainSelector,
        sender: message.sender,
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
