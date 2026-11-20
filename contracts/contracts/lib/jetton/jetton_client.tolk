// SPDX-License-Identifier: MIT
import "jetton-utils"
import "messages"

struct JettonClient {
    masterAddress: address
    jettonWalletCode: cell
}

@inline
fun JettonClient.walletAddress(self): address {
    return calcAddressOfJettonWallet(
        contract.getAddress(),
        self.masterAddress,
        self.jettonWalletCode
    );
}

/// Cast Cell into ForwardPayloadRemainder by storing as ref
fun Cell<T>.toForwardPayload(self): ForwardPayloadRemainder {
    return beginCell().storeMaybeRef(self).toSlice();
}

// Assert that the sender is the jetton wallet address. Used for validating incoming notifications.
@inline
fun JettonClient.isWallet(self, sender: address): bool {
    return sender == self.walletAddress();
}

/// Forward payload as a cell: ref variant returns the ref itself (no copy), inline variant
/// is materialized into a new cell, empty returns `null`.
@inline
fun loadForwardPayloadAsCell(forwardPayload: ForwardPayloadRemainder): cell? {
    val s = loadForwardPayloadAsSlice(forwardPayload);

    return s != null ? beginCell().storeSlice(s).endCell() : null;
}

/// Forward payload as a slice: ref variant returns the ref contents (asserting nothing
/// follows), inline variant returns the remainder itself, empty returns `null`.
@inline
fun loadForwardPayloadAsSlice(forwardPayload: ForwardPayloadRemainder): slice? {
    val forwardPayloadCell = forwardPayload.loadMaybeRef();
    if (forwardPayloadCell != null) {
        forwardPayload.assertEnd();
        return forwardPayloadCell.beginParse();
    }

    if (forwardPayload.isEmpty()) {
        return null;
    }

    return forwardPayload;
}
