// SPDX-License-Identifier: MIT

import "jetton_client"
import "messages"

/// Generic processor context wrapper for a jetton transfer's `forwardPayload`. TEP-74
/// forwards `forwardPayload` to the destination as-is, so a processor can tag an outbound
/// `AskToTransfer` with bounce-handling context while the caller's original payload is
/// preserved and still delivered.
struct (0x2d61600c) Jetton_ForwardPayloadWrap {
    /// The address the tagged operation is reported back to on failure.
    initiator: address
    /// Opaque processor context (e.g. `JettonWithdrawable_WithdrawContext`), `null` if none.
    context: cell?
    /// The caller's original `forwardPayload`, preserved as the remainder.
    forwardPayload: ForwardPayloadRemainder
}

@inline
fun Jetton_ForwardPayloadWrap.asForwardPayload(self): ForwardPayloadRemainder {
    return beginCell().storeMaybeRef(self.toCell()).endCell().beginParse();
}

/// Parses a `Jetton_ForwardPayloadWrap` from a `forwardPayload`, or `null`
@inline
fun Jetton_ForwardPayloadWrap.from(forwardPayload: ForwardPayloadRemainder): Jetton_ForwardPayloadWrap? {
    val s = loadForwardPayloadAsSlice(forwardPayload);
    if (s == null) {
        return null;
    }

    val wrap = lazy Jetton_ForwardPayloadWrap.fromSlice(s!);
    match (wrap) {
        Jetton_ForwardPayloadWrap => { return wrap; }
        else => { return null; }
    }
}
