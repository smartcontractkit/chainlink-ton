// SPDX-License-Identifier: MIT
tolk 1.5.0

import "@stdlib/common.tolk"

/// Test contract for testing different cases for trace tracking.

struct Storage {
    queryId: uint64
}

/// Destroys the contract, sending its whole balance back to the sender.
struct (0x34967105) TraceProbe_SelfDestruct {
    queryId: uint64
}

/// Sends `value` to `to`, bounceable or not. The contract pays the forwarding fees, so `value` can
/// be zero.
struct (0x7c76ca03) TraceProbe_Forward {
    queryId: uint64
    to: address
    bounceable: bool
    value: coins
}

type Msg = TraceProbe_SelfDestruct | TraceProbe_Forward

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return; // deployment and top-ups
    }

    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        TraceProbe_SelfDestruct => {
            val refund = createMessage({
                bounce: BounceMode.NoBounce,
                value: 0,
                dest: in.senderAddress,
            });
            refund.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_DESTROY);
        }
        TraceProbe_Forward => {
            val forward = createMessage({
                bounce: msg.bounceable ? BounceMode.RichBounce : BounceMode.NoBounce,
                value: msg.value,
                dest: msg.to,
            });
            forward.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        else => {
            throw 0xFFFF;
        }
    }
}

/// Accepts the bounce of a forwarded message.
fun onBouncedMessage(_in: InMessageBounced) {}

get fun queryId(): uint64 {
    return Storage.fromCell(contract.getData()).queryId;
}
