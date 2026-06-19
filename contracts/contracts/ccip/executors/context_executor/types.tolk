// SPDX-License-Identifier: BUSL-1.1

struct ContextExecutor_Data<C> {
    id: uint64; // 64bit addr space for a unique identity, for more use context C
    owner: address;
    context: Cell<C>;
    forwardFrom: array<address>;
}

struct ContextExecutor_InMessageForward {
    senderAddress: address          // an internal address from which the message arrived
    valueCoins: coins               // ton amount attached to an incoming message
    valueExtra: ExtraCurrenciesMap  // extra currencies attached to an incoming message
    originalForwardFee: coins       // fee that was paid by the sender
    createdLt: uint64               // logical time when a message was created
    createdAt: uint32               // unixtime when a message was created
    body: cell                      // message body, parse it with `lazy AllowedMsg.fromSlice(in.body)`
}

const ContextExecutor_FACILITY_NAME = "link.chain.ton.lib.executor.ContextExecutor";
const ContextExecutor_FACILITY_ID = ContextExecutor_FACILITY_NAME.crc32() % 640 + 10;
const ContextExecutor_ERROR_CODE = ContextExecutor_FACILITY_ID * 100;

/// Error codes used by the ContextExecutor contract.
enum ContextExecutor_Error {
    /// Thrown when a function is called by an address that is not the owner of the contract.
    OnlyCallableByOwner = ContextExecutor_ERROR_CODE
}
