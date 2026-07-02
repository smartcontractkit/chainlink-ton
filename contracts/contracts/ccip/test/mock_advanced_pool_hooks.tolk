// SPDX-License-Identifier: BUSL-1.1
// Stateless mock AdvancedPoolHooks for testing async preflight/postflight flows.
// Uses the incoming message queryId to determine reply behavior:
//   queryId % 2 == 0  → Finished  (success)
//   queryId % 2 == 1  → Failed    (failure)

import "../pools/messages"

contract MockAdvancedPoolHooks {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.MockAdvancedPoolHooks"
    storage: MockAdvancedPoolHooks_Data
}

struct MockAdvancedPoolHooks_Data {
    id: uint8;
}

type MockAdvancedPoolHooks_InMessage =
  | AdvancedPoolHooks_PreflightCheck
  | AdvancedPoolHooks_PostflightCheck;

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockAdvancedPoolHooks_InMessage.fromSlice(in.body);

    match (msg) {
        AdvancedPoolHooks_PreflightCheck => {
            replyPreflight(msg);
        }
        AdvancedPoolHooks_PostflightCheck => {
            replyPostflight(msg);
        }
        else => {
            // Accept empty messages (top-up), reject everything else.
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun replyPreflight(msg: AdvancedPoolHooks_PreflightCheck) {
    val queryId = msg.queryId;
    val fwd = msg.replyPayload!;

    var body: cell;
    if (queryId % 2 == 0) {
        body = TokenPool_PreflightCheckFinished {
            queryId: queryId,
            forwardPayload: fwd as Cell<TokenPool_LockOrBurnForwardPayload>,
        }.toCell();
    } else {
        body = TokenPool_PreflightCheckFailed {
            queryId: queryId,
            forwardPayload: fwd as Cell<TokenPool_LockOrBurnForwardPayload>,
        }.toCell();
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: msg.replyTo,
        body: body,
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun replyPostflight(msg: AdvancedPoolHooks_PostflightCheck) {
    val queryId = msg.queryId;
    val fwd = msg.replyPayload!;

    var body: cell;
    if (queryId % 2 == 0) {
        body = TokenPool_PostflightCheckFinished {
            queryId: queryId,
            forwardPayload: fwd as Cell<TokenPool_ReleaseOrMintForwardPayload>,
        }.toCell();
    } else {
        body = TokenPool_PostflightCheckFailed {
            queryId: queryId,
            forwardPayload: fwd as Cell<TokenPool_ReleaseOrMintForwardPayload>,
        }.toCell();
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: msg.replyTo,
        body: body,
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
