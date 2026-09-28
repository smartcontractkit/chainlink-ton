// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"
import "../../lib/utils"
import "events"

import "../../lib/access/ownable_2step"
import "../../lib/versioning/upgradeable"
import "../../lib/deployable/types"
import "../token_admin_registry_entry/messages"
import "../token_admin_registry_entry/storage"
import "../token_admin_registry_entry/types"

tolk 1.4.2

/// Root contract for the sharded token-admin registry. It owns deployment
/// configuration for deterministic entries and is the future replacement for
/// the Router's token-registry administration surface.
///
/// Entries are upgraded on demand to the entry code compiled into this
/// contract: every request to an entry declares a minimum entry version, and a
/// stale entry round-trips the request through the root to get the new code.
contract TokenAdminRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistry"

    storage: TokenAdminRegistry_Storage
    incomingMessages: TokenAdminRegistry_InMessage | Ownable2Step_Messages
    thrownErrors: Ownable2Step_Error | TokenAdminRegistry_Error | Upgradeable_Error
}

const CONTRACT_VERSION = "1.6.0".literalSlice();

fun requireSupportedVersion(version: slice) {
    assert (version.bitsEqual(CONTRACT_VERSION)) throw Upgradeable_Error.VersionMismatch;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistry_InMessage.fromSlice(in.body);
    match (msg) {
        TokenAdminRegistry_RegisterToken => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            registerToken(st, msg);
        }
        TokenAdminRegistry_OverridePendingAdministrator => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            requireForwardValue(in.valueCoins);
            overridePendingAdministrator(msg);
        }
        TokenAdminRegistry_TransferAdminRole => {
            requireForwardValue(in.valueCoins);
            transferAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_AcceptAdminRole => {
            requireForwardValue(in.valueCoins);
            acceptAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_SetPool => {
            requireForwardValue(in.valueCoins);
            setPool(msg, in.senderAddress);
        }
        TokenAdminRegistry_EntryUpgradeRequest => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            sendUpgradeAndResume(in.senderAddress, msg.queryId, msg.pending);
        }
        TokenAdminRegistry_UpgradeEntry => {
            assert(in.valueCoins >= TokenAdminRegistryEntry_UpgradeAndResume.cost()) throw TokenAdminRegistry_Error.InsufficientValue;
            sendUpgradeAndResume(entryAddress(msg.tokenAddress).calculateAddress(), msg.queryId, null);
        }
        Upgradeable_Upgrade => {
            val st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Upgradeable{ migrate, version }.upgrade(msg);
        }
        TokenAdminRegistry_AdministratorTransferRequested => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitAdministratorTransferRequested(msg);
        }
        TokenAdminRegistry_AdministratorTransferred => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitAdministratorTransferred(msg);
        }
        TokenAdminRegistry_PoolSet => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitPoolSet(msg);
        }
        else => {
            var st = lazy TokenAdminRegistry_Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Every entry event is relayed through the root. The token in the payload is
/// sufficient to recompute the only entry address that may send that event.
fun requireEntrySender(st: TokenAdminRegistry_Storage, token: address, sender: address) {
    val expectedEntry = entryAddress(token).calculateAddress();
    assert(sender == expectedEntry) throw TokenAdminRegistry_Error.UnauthorizedEntry;
}

fun entryAddress(token: address): AutoDeployAddress {
    return TokenAdminRegistryEntry.deriveAddress(deployableCode(), token, contract.getAddress());
}

fun requireForwardValue(value: coins) {
    assert(value >= TokenAdminRegistry_forwardCost()) throw TokenAdminRegistry_Error.InsufficientValue;
}

/// Forwards to an entry carrying all value, so a stale entry can fund its
/// upgrade round trip before handling the request.
fun forwardToEntry(token: address, body: cell) {
    createMessage({
        bounce: false,
        value: 0,
        dest: entryAddress(token),
        body,
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun sendUpgradeAndResume(dest: address, queryId: uint64, pending: Cell<TokenAdminRegistryEntry_Pending>?) {
    createMessage({
        bounce: true,
        value: 0,
        dest,
        body: TokenAdminRegistryEntry_UpgradeAndResume {
            queryId,
            code: entryCode(),
            pending,
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun emitAdministratorTransferRequested(event: TokenAdminRegistry_AdministratorTransferRequested) {
    emit(ADMINISTRATOR_TRANSFER_REQUESTED_TOPIC, event);
}

fun emitAdministratorTransferred(event: TokenAdminRegistry_AdministratorTransferred) {
    emit(ADMINISTRATOR_TRANSFERRED_TOPIC, event);
}

fun emitPoolSet(event: TokenAdminRegistry_PoolSet) {
    emit(POOL_SET_TOPIC, event);
}

/// Deploys a deterministic shard with an unclaimed administrator proposal.
///
/// This is intentionally create-only. Callers resolve the outcome by deriving
/// the entry address and reading its config after finality; retrying this
/// message against an existing entry is expected to fail in Deployable.
fun registerToken(st: TokenAdminRegistry_Storage, msg: TokenAdminRegistry_RegisterToken) {
    // TODO: add self-service registration once TON has a canonical,
    // independently verifiable proof that the sender controls the token minter.
    // Until then, the root owner is the trusted registration module.
    assert(msg.administrator != createAddressNone()) throw Ownable2Step_Error.OnlyCallableByOwner;

    val deployMsg = createMessage({
        bounce: false,
        // Covers Deployable initialization and the event self-message below.
        // The former Router flow only initialized the shard; this path also
        // emits the initial administrator-proposal event atomically.
        value: grams("0.05"),
        dest: entryAddress(msg.tokenAddress),
        body: Deployable_InitializeAndSend {
            stateInit: {
                code: entryCode(),
                data: TokenRegistry_Storage {
                    tokenAddress: msg.tokenAddress,
                    tokenInfo: msg.tokenInfo.load(),
                    adminConfig: TokenRegistry_AdminConfig {
                        tokenAdminRegistry: contract.getAddress(),
                        administrator: null,
                        pendingAdministrator: msg.administrator,
                    }.toCell(),
                }.toCell(),
            },
            // The entry emits the initial proposal event after its state is
            // installed. This is not a second root-to-entry operation.
            selfMessage: {
                value: grams("0.015"),
                body: TokenAdminRegistryEntry_RegistrationInitialized {
                    queryId: msg.queryId,
                }.toCell(),
            },
        },
    });
    deployMsg.send(SEND_MODE_REGULAR);
}

/// Replaces an unaccepted administrator proposal. The shard enforces that no
/// active administrator exists, so this cannot reclaim a configured token.
fun overridePendingAdministrator(msg: TokenAdminRegistry_OverridePendingAdministrator) {
    assert(msg.administrator != createAddressNone()) throw Ownable2Step_Error.OnlyCallableByOwner;
    forwardToEntry(msg.tokenAddress, TokenAdminRegistryEntry_ProposeAdministrator {
        queryId: msg.queryId,
        minEntryVersion: TokenAdminRegistryEntry_VERSION,
        administrator: msg.administrator,
    }.toCell());
}

/// The root is the only public ingress for entry administration. It derives
/// the shard and forwards the original caller as `actor`; the entry remains
/// responsible for checking its own active/pending administrator state.
fun transferAdminRole(msg: TokenAdminRegistry_TransferAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, TokenAdminRegistryEntry_TransferAdminRole {
        queryId: msg.queryId,
        minEntryVersion: TokenAdminRegistryEntry_VERSION,
        actor,
        newAdministrator: msg.newAdministrator,
    }.toCell());
}

fun acceptAdminRole(msg: TokenAdminRegistry_AcceptAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, TokenAdminRegistryEntry_AcceptAdminRole {
        queryId: msg.queryId,
        minEntryVersion: TokenAdminRegistryEntry_VERSION,
        actor,
    }.toCell());
}

fun setPool(msg: TokenAdminRegistry_SetPool, actor: address) {
    forwardToEntry(msg.tokenAddress, TokenAdminRegistryEntry_SetPool {
        queryId: msg.queryId,
        minEntryVersion: TokenAdminRegistryEntry_VERSION,
        actor,
        tokenPool: msg.tokenPool,
    }.toCell());
}

import "../../../gen/Deployable.code"
import "../../../gen/TokenAdminRegistryEntry.code"

fun deployableCode(): cell {
    return deployableCompiledCode();
}

fun entryCode(): cell {
    return tokenAdminRegistryEntryCompiledCode();
}

/// Gets the current owner of the registry root.
get fun owner(): address {
    val st = lazy TokenAdminRegistry_Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the registry root, if any.
get fun pendingOwner(): address? {
    val st = lazy TokenAdminRegistry_Storage.load();
    return st.ownable.get_pendingOwner();
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    requireSupportedVersion(version);
    return storage;
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun typeAndVersion(): (slice, slice) {
    return (TokenAdminRegistry_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}
