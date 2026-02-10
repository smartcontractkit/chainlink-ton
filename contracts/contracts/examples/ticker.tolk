// SPDX-License-Identifier: MIT
tolk 1.2

/// This Contract just forwards a message to itself, decreasing its value by 1 each time, until it reaches 0. It is used to mock a long chain of messages.

import "@stdlib/common.tolk"
import "../lib/utils"
import "../lib/access/ownable_2step"

const CONTRACT_VERSION = "1.0.0";

/// Message to start the ticker.
struct (0xd4834e00) Ticker_Tick {
    queryID: uint64 // Standard query_id field
    times: uint32 // Number of ticks to perform before stopping.
}

struct Storage {
    id: uint32
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = Ticker_Tick

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body); // 63 error code is thrown if the message opcode is unknown
    match (msg) {
        Ticker_Tick => {
            if (msg.times == 0) { // We leave negative range out intentionally to allow for unbounded loops if needed
                return;
            }

            // send tick to itself
            val reply = createMessage({
                bounce: false,
                value: 0,
                dest: contract.getAddress(),
                body: Ticker_Tick {
                    queryID: msg.queryID,
                    times: msg.times - 1,
                },
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
