// SPDX-License-Identifier: MIT
import "errors"
import "types"

struct (0x5b4bc7a6) Receiver_CCIPReceiveV2 {
    // execId lets us calculate where to send CCIPReceiveConfirm and CCIPReceiveFailed
    // it fits in the body of a bounced message
    execId: uint192;
    queryID: uint64;
    /// Value to attach to Router_CCIPReceiveConfirm, set by the Router.
    confirmValue: coins;
    message: Cell<Any2TVMMessage>;
}

struct Receiver_InMessagePartial { // Tolk compiler doesn't allow passing builtin InMessage as argument of a function
    senderAddress: address;
    valueCoins: coins;
}

struct Receiver_ValidateOptions {
    // Router address
    router: address;
    // Minimum value that must be sent along with the message to cover all gas, forward and action
    // fees, including the confirmation's value and forward fee.
    minValue: coins;
    // Original incoming message
    inMsg: Receiver_InMessagePartial;
    // Options for sending the confirmation message
    confirmationMsg: Receiver_ConfirmOpts;
};

struct Receiver_ConfirmOpts {
    // Value to attach to the confirmation message, defaults to the message's `confirmValue`
    value: coins? = null;
    // Send mode for the confirmation message
    sendMode: uint8 = SEND_MODE_PAY_FEES_SEPARATELY;
}

/// Call before any other action so the confirmation's value is set aside first. A rejected
/// confirmation leaves the message in progress; the receiver can claim it later by resending
/// Router_CCIPReceiveConfirm with the same `queryId` and `execId`.
fun Receiver_CCIPReceiveV2.validateAndConfirm(self, opts: Receiver_ValidateOptions) {
    // Standard for every receiver to implement:

    // 1. Check Receiver_CCIPReceiveV2 only comes from router
    assert( opts.inMsg.senderAddress == opts.router) throw (Receiver_Error.Unauthorized);

    // 2. Check that enough value is sent
    assert( opts.inMsg.valueCoins >= opts.minValue) throw (Receiver_Error.LowValue);

    // 3. Enqueue CCIPReceiveConfirm to msg.callback
    val receiveConfirm = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: opts.confirmationMsg.value ?? self.confirmValue,
        dest: opts.inMsg.senderAddress,
        body: Router_CCIPReceiveConfirm {
            queryID: self.queryID,
            execId: self.execId,
        }
    });
    receiveConfirm.send(opts.confirmationMsg.sendMode);
}

/// Confirmation message sent back to the router after accepting a CCIP message
struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
    queryID: uint64;
    execId: ReceiveExecutorId;
}