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
