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

struct JettonMessageOptions {
    /// whether a message will bounce back on error
    bounce: bool
    /// message value: attached tons (or tons + extra currencies)
    value: coins | (coins, ExtraCurrenciesMap)
}

@inline
fun JettonClient.sendSimple(
    self,
    sendOptions: JettonMessageOptions,
    sendMode: int,
    queryId: uint64,
    amount: coins,
    destination: address,
    responseDestination: address,
) {
    createMessage({
        bounce: sendOptions.bounce,
        value: sendOptions.value,
        dest: self.walletAddress(),
        body: AskToTransfer {
            queryId: queryId,
            jettonAmount: amount,
            transferRecipient: destination,
            sendExcessesTo: responseDestination,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    })
        .send(sendMode);
}

@inline
fun JettonClient.sendExtended(
    self,
    sendOptions: JettonMessageOptions,
    sendMode: int,
    queryId: uint64,
    amount: coins,
    destination: address,
    responseDestination: address,
    customPayload: cell?,
    forwardTonAmount: coins,
    forwardPayload: slice | cell,
) {
    var body = beginCell().storeAny(AskToTransfer {
        queryId: queryId,
        jettonAmount: amount,
        transferRecipient: destination,
        sendExcessesTo: responseDestination,
        customPayload: customPayload,
        forwardTonAmount: forwardTonAmount,
        forwardPayload: createEmptyCell().beginParse(),
    });
    match (forwardPayload) {
        cell => {
            body.storeMaybeRef(forwardPayload);
        }
        slice => {
            body.storeBool(false).storeSlice(forwardPayload);
        }
    }
    createMessage({
        bounce: sendOptions.bounce,
        value: sendOptions.value,
        dest: self.walletAddress(),
        body: body,
    })
        .send(sendMode);
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
