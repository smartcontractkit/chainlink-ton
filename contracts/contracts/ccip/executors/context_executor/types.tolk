// SPDX-License-Identifier: BUSL-1.1

/// @notice Runtime data stored by each ContextExecutor instance.
/// A pool deploys one executor per async operation with deterministic address.
struct ContextExecutor_Data<C> {
    /// 64bit addr space for a unique identity, for more use context C
    id: uint64;
    /// Address of the owning pool contract (only owner receives forwarded messages).
    owner: address;
    /// Arbitrary context cell encoding operation-specific data for the owner to consume.
    context: Cell<C>;
    /// Whitelist of addresses whose messages will be forwarded to the owner.
    forwardFrom: array<address>;
}

/// @notice Wrapper providing load/store helpers for ContextExecutor instances.
struct ContextExecutor<T> {
    data: ContextExecutor_Data<T>;
}

fun ContextExecutor<T>.getAddress(
    code: cell,
    id: uint64,
    owner: address,
    context: Cell<T>,
    forwardFrom: array<address>,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code,
            data: ContextExecutor_Data<T> {
                id,
                owner,
                context,
                forwardFrom,
            }.toCell(),
        },
    };
}

/// @notice Forwarded message info passed from ContextExecutor to the owner pool.
/// Contains the original message metadata plus the message body cell.
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

/// @notice Error codes used by the ContextExecutor contract.
/// Facility ID: 260 (based on FACILITY_NAME CRC32).
enum ContextExecutor_Error {
    /// Thrown when a function is called by an address that is not the owner of the contract.
    OnlyCallableByOwner = ContextExecutor_ERROR_CODE
}
