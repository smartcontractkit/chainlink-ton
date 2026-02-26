// SPDX-License-Identifier: MIT
tolk 1.2

/// This Contract is a malicious CCIPReceiver that forwards a message to itself, decreasing its value by 1 each time, until it reaches 0, replying Router_CCIPReceiveConfirm only after the last tick.

import "@stdlib/common.tolk"
// import "../lib/access/ownable_2step"
import "../lib/receiver/messages"
import "../lib/receiver/errors"
import "../ccip/router/messages"


const CONTRACT_VERSION = "1.0.0";

/// Message to start the ticker.
struct (0xd4834e00) Ticker_Tick {
    queryID: uint64 // Standard query_id field
    times: uint32 // Number of ticks to perform before stopping.
}

/// Message to continue ticking.
struct (0x46033C09) Ticker_TickRec {
    queryID: uint64 // Standard query_id field
    execID: uint192 // execID to correlate with the original CCIPReceive message
    times: uint32 // Number of ticks to perform before stopping.
}

struct Storage {
    id: uint32
    router: address
    allowedSender: cell
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

enum TickerReceiver_Error {
    Unauthorized = 10000,
}

type Msg =
    | Ticker_TickRec
    | Receiver_CCIPReceive

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body); // 63 error code is thrown if the message opcode is unknown
    match (msg) {
        Receiver_CCIPReceive => {
            val st = lazy Storage.load();

            // Malicious receiver doesn't implement validateAndConfirm properly:

            // 1. Check CCIPReceive only comes from router
            assert( in.senderAddress == st.router) throw (Receiver_Error.Unauthorized as int);

            // 2. Check that enough value is sent
            assert( in.valueCoins >= ton("0.1")) throw (Receiver_Error.LowValue as int);

            // 3. Note: Skip enqueue CCIPReceiveConfirm to msg.callback

            assert (msg.message.sender.bitsEqual(st.allowedSender.beginParse())) throw (TickerReceiver_Error.Unauthorized as int);

            val tick = Ticker_Tick.fromCell(msg.message.data);

            val reply = createMessage({
                bounce: false,
                value: 0,
                dest: contract.getAddress(),
                body: Ticker_TickRec {
                    queryID: tick.queryID,
                    execID: msg.execId,
                    times: tick.times - 1,
                },
            });
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

        },
        Ticker_TickRec => {
            if (msg.times <= 0) {
                val st = lazy Storage.load();
                // Reply receiveConfirm only after the last tick
                val receiveConfirm = createMessage({
                    bounce: true,
                    value: 0,
                    dest: st.router,
                    body: Router_CCIPReceiveConfirm {
                        execId: msg.execID,
                    }
                });
                receiveConfirm.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
                return;
            }

            var outMsg = msg; // copy to modify the times field
            outMsg.times -= 1; // decrease the times to eventually stop the chain of messages

            // send tick to itself
            val reply = createMessage({
                bounce: false,
                value: 0,
                dest: contract.getAddress(),
                body: outMsg,
            });
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}
/// Gets the current id of the contract.
get fun id(): int {
    val s = lazy Storage.load();
    return s.id;
}

/// Gets the current type and version of the contract.
get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.examples.Ticker", CONTRACT_VERSION)
}
