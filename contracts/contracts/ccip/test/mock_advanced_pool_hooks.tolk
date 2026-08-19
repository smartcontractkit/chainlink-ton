// SPDX-License-Identifier: BUSL-1.1
// Stateless mock AdvancedPoolHooks for testing async preflight/postflight flows.
// Uses the incoming message queryId to determine reply behavior:
//   queryId % 2 == 0  → Finished  (success)
//   queryId % 2 == 1  → Failed    (failure)

import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"
import "../../lib/utils"

contract MockAdvancedPoolHooks {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.test.MockAdvancedPoolHooks"
    storage: MockAdvancedPoolHooks_Data
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

struct MockAdvancedPoolHooks_Data {
    id: uint8;
}

fun MockAdvancedPoolHooks_Data.load(): MockAdvancedPoolHooks_Data {
    return MockAdvancedPoolHooks_Data.fromCell(contract.getData());
}

type MockAdvancedPoolHooks_InMessage =
  | TokenPool_PreflightCheck
  | TokenPool_PostflightCheck
  | TokenPool_GetCCVs;

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockAdvancedPoolHooks_InMessage.fromSlice(in.body);

    match (msg) {
        TokenPool_PreflightCheck => {
            replyPreflight(msg);
        }
        TokenPool_PostflightCheck => {
            replyPostflight(msg);
        }
        TokenPool_GetCCVs => {
            replyGetCCVs(msg);
        }
        else => {
            // Accept empty messages (top-up), reject everything else.
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Replies to a pool `TokenPool_GetCCVs` with a `TokenPool_QueryCCVsReply`, preserving the
/// context in `replyPayload` so the pool can assemble the final `TokenPool_CCVsAndFees`.
/// The CCV set is driven by the mock's storage `id`:
///   - `id == 0` (default): empty CCV set, signaling "use lane defaults".
///   - `id != 0` and `id != 255`: returns a single hard-coded CCV (the pool itself) so a
///     NON-empty set flows through the pool → hooks → pool → requester round-trip and is
///     observable in replies.
///   - `id == 255`: bounces (throws), finalizing the query with `TokenPool_GetCCVsFailed` on
///     the pool side via its `onBouncedMessage` handler. Used to test hook-bounce finalization.
const MOCK_HOOKS_BOUNCE_ID = 255;

fun replyGetCCVs(msg: TokenPool_GetCCVs) {
    val data = MockAdvancedPoolHooks_Data.load();
    if (data.id == MOCK_HOOKS_BOUNCE_ID) {
        throw 0xFFFF; // bounce the pool's forwarded GetCCVs
    }

    var requiredCCVs = createEmptyCell() as SnakedCell<address>;
    if (data.id != 0) {
        // A single CCV (the pool that queried us) — meaningful enough for a mock and lets tests
        // assert that the non-empty set is echoed back through the pool unchanged.
        val ccv: address = msg.replyTo;
        requiredCCVs = beginCell().storeAddress(ccv).endCell() as SnakedCell<address>;
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: msg.replyTo,
        body: TokenPool_QueryCCVsReply {
            queryId: msg.queryId,
            requiredCCVs: requiredCCVs,
            replyPayload: msg.forwardPayload,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun replyPreflight(msg: TokenPool_PreflightCheck) {
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

fun replyPostflight(msg: TokenPool_PostflightCheck) {
    val queryId = msg.queryId;
    val fwd: cell = msg.replyPayload!;

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
