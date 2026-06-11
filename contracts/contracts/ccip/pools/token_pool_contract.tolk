// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "types"
import "errors"
import "messages"
import "events"
import "token_pool"

contract TokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.TokenPool"

    storage: TokenPool_Data
    incomingMessages: TokenPool_InMessage // TODO: all incoming messages should be registered
}

fun onInternalMessage(in: InMessage) {
    throw 0xFFFF; // template for bindings, should not be deployed
}

get fun typeAndVersion(): (slice, slice) {
    throw 0xFFFF;
}

get fun token(): address {
    throw 0xFFFF;
}

get fun tokenDecimals(): uint8 {
    throw 0xFFFF;
}

get fun isSupportedChain(remoteChainSelector: uint64): bool {
    throw 0xFFFF;
}

get fun onRamp(remoteChainSelector: uint64): address? {
    throw 0xFFFF;
}

get fun offRamp(remoteChainSelector: uint64): address? {
    throw 0xFFFF;
}

get fun hasPendingRelease(queryId: uint64): bool {
    throw 0xFFFF;
}

get fun getRMNProxy(): address {
    throw 0xFFFF;
}

get fun verifyNotCursed(subject: uint128): bool {
    throw 0xFFFF;
}

get fun owner(): address {
    throw 0xFFFF;
}

get fun pendingOwner(): address? {
    throw 0xFFFF;
}
