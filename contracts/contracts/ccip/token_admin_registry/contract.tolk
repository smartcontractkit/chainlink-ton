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
const RICH_BOUNCE_PREFIX = 0xfffffffe;

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
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw TokenAdminRegistry_Error.InsufficientValue;
            overridePendingAdministrator(msg);
        }
        TokenAdminRegistry_TransferAdminRole => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw TokenAdminRegistry_Error.InsufficientValue;
            transferAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_AcceptAdminRole => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw TokenAdminRegistry_Error.InsufficientValue;
            acceptAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_SetPool => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw TokenAdminRegistry_Error.InsufficientValue;
            setPool(msg, in.senderAddress);
        }
        TokenAdminRegistry_GetTokenInfo => {
            forwardToEntry(msg.token, msg.queryId, TokenAdminRegistryEntry_GetTokenInfo {
                token: msg.token,
                requester: in.senderAddress,
            });
        }
        TokenAdminRegistryEntry_TokenInfo => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            relayTokenInfo(msg);
        }
        TokenAdminRegistry_EntryUpgradeRequest => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            upgradeAndResume(in.senderAddress, msg.queryId, msg.request);
        }
        TokenAdminRegistry_UpgradeEntry => {
            assert(in.valueCoins >= TokenAdminRegistryEntry_upgradeCost()) throw TokenAdminRegistry_Error.InsufficientValue;
            sendUpgrade(entryAddress(msg.tokenAddress).calculateAddress(), msg.queryId, 0, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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

/// Only requests whose sender waits for an answer use rich bounces, either on
/// the first forward or on a Resume; other bounces just return their value to
/// the root. A first forward bounces when the token was never registered.
fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.preloadUint(32) != RICH_BOUNCE_PREFIX) {
        return;
    }
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val bounced = TokenAdminRegistry_BouncedEntryMessage.fromCell(rich.originalBody);
    val request = match (bounced) {
        TokenAdminRegistryEntry_MessageFromRoot => bounced,
        TokenAdminRegistryEntry_Resume => bounced.request.load(),
    };
    val content = request.content.load();
    if (content is TokenAdminRegistryEntry_GetTokenInfo) {
        createMessage({
            bounce: false,
            value: 0,
            dest: content.requester,
            body: TokenAdminRegistry_GetTokenInfoFailed {
                queryId: request.queryId,
                token: content.token,
            },
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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

/// Forwards to an entry carrying all value, so a stale entry can fund its
/// upgrade round trip before handling the request.
fun forwardToEntry(token: address, queryId: uint64, content: TokenAdminRegistryEntry_RootMessage) {
    createMessage({
        bounce: bounceModeFor(content),
        value: 0,
        dest: entryAddress(token).calculateAddress(),
        body: TokenAdminRegistryEntry_MessageFromRoot {
            queryId,
            minEntryVersion: TokenAdminRegistryEntry_VERSION,
            content: content.toCell(),
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Requests whose sender waits for an answer bounce back in full, so the root
/// can report a failure to the requester (see onBouncedMessage).
fun bounceModeFor(content: TokenAdminRegistryEntry_RootMessage): BounceMode {
    if (content is TokenAdminRegistryEntry_GetTokenInfo) {
        return BounceMode.RichBounce;
    }
    return BounceMode.NoBounce;
}

/// Answers a stale entry with an Upgradeable_Upgrade followed by the deferred request as a
/// Resume. TON delivers both in order, and the entry will not defer a Resume
/// again, so a failed upgrade bounces the request instead of looping.
fun upgradeAndResume(entry: address, queryId: uint64, request: Cell<TokenAdminRegistryEntry_MessageFromRoot>) {
    reserveGramsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
    sendUpgrade(entry, queryId, TokenAdminRegistryEntry_upgradeCost(), SEND_MODE_REGULAR);
    createMessage({
        bounce: bounceModeFor(request.load().content.load()),
        value: 0,
        dest: entry,
        body: TokenAdminRegistryEntry_Resume { request },
    }).send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun sendUpgrade(dest: address, queryId: uint64, value: coins, mode: int) {
    createMessage({
        bounce: true,
        value,
        dest,
        body: Upgradeable_Upgrade {
            queryId,
            code: entryCode(),
        },
    }).send(mode);
}

fun relayTokenInfo(msg: TokenAdminRegistryEntry_TokenInfo) {
    val tokenInfo = msg.tokenInfo.load();
    createMessage({
        bounce: false,
        value: 0,
        dest: msg.requester,
        body: TokenAdminRegistry_TokenInfo {
            queryId: msg.queryId,
            token: msg.token,
            minterAddress: tokenInfo.minterAddress,
            tokenPool: tokenInfo.tokenPool,
            version: tokenInfo.version,
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
    forwardToEntry(msg.tokenAddress, msg.queryId, TokenAdminRegistryEntry_ProposeAdministrator {
        administrator: msg.administrator,
    });
}

/// The root is the only public ingress for entry administration. It derives
/// the shard and forwards the original caller as `actor`; the entry remains
/// responsible for checking its own active/pending administrator state.
fun transferAdminRole(msg: TokenAdminRegistry_TransferAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryId, TokenAdminRegistryEntry_TransferAdminRole {
        actor,
        newAdministrator: msg.newAdministrator,
    });
}

fun acceptAdminRole(msg: TokenAdminRegistry_AcceptAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryId, TokenAdminRegistryEntry_AcceptAdminRole {
        actor,
    });
}

fun setPool(msg: TokenAdminRegistry_SetPool, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryId, TokenAdminRegistryEntry_SetPool {
        actor,
        tokenPool: msg.tokenPool,
    });
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

// Implement on future versions to upgrade this contract to
@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    throw Upgradeable_Error.VersionMismatch
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun typeAndVersion(): (slice, slice) {
    return (TokenAdminRegistry_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}
