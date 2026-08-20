// SPDX-License-Identifier: BUSL-1.1
// NOTE: This is a stub contract for tooling to generate bindings.
// TODO exclude from published release artifacts

import "messages";

tolk 1.4.1

const CONTRACT_VERSION = "1.6.1".literalSlice();

contract CCIPReceiver {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.7"
    description: "link.chain.ton.ccip.lib.Receiver"

    storage: MockCCIPReceiver_Storage
    incomingMessages: CCIPReceiver_InMessage
}

struct MockCCIPReceiver_Storage {}

type CCIPReceiver_InMessage = Receiver_CCIPReceive

fun onInternalMessage(_: InMessage) {
    throw 0xFFFF; // template for bindings, should not be deployed
}
