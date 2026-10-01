// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"
import "types"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../token_admin_registry/messages"

tolk 1.4.2

// The state-bearing shard of TokenAdminRegistry.
contract TokenAdminRegistryEntry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistryEntry"

    storage: TokenRegistry_Storage
    incomingMessages: TokenAdminRegistryEntry_InMessage
    thrownErrors: TokenAdminRegistryEntry_Error | Upgradeable_Error
}

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    // Check for a Resume self-message before parsing the request
    // and replace body and sender with the pending request and the original sender
    val (body, sender, replay) = unwrapIfResume(in.body, in.senderAddress);
    val msg = lazy TokenAdminRegistryEntry_InMessage.fromSlice(body);
    match (msg) {
        // TODO: min value assertion throughout
        TokenAdminRegistryEntry_GetTokenInfo => {
            onGetTokenInfo(msg, sender);
        }
        TokenAdminRegistryEntry_ResolveTokenInfo => {
            requireRoot(sender);
            if (ensureVersion(msg.queryId, msg.minEntryVersion, sender, body, replay)) {
                onResolveTokenInfo(msg, sender);
            }
        }
        TokenAdminRegistryEntry_RegistrationInitialized => {
            onRegistrationInitialized(msg, sender);
        }
        TokenAdminRegistryEntry_ProposeAdministrator => {
            requireRoot(sender);
            if (ensureVersion(msg.queryId, msg.minEntryVersion, sender, body, replay)) {
                onProposeAdministrator(msg);
            }
        }
        TokenAdminRegistryEntry_TransferAdminRole => {
            requireRoot(sender);
            if (ensureVersion(msg.queryId, msg.minEntryVersion, sender, body, replay)) {
                onTransferAdminRole(msg);
            }
        }
        TokenAdminRegistryEntry_AcceptAdminRole => {
            requireRoot(sender);
            if (ensureVersion(msg.queryId, msg.minEntryVersion, sender, body, replay)) {
                onAcceptAdminRole(msg);
            }
        }
        TokenAdminRegistryEntry_SetPool => {
            requireRoot(sender);
            if (ensureVersion(msg.queryId, msg.minEntryVersion, sender, body, replay)) {
                onSetPool(msg);
            }
        }
        TokenAdminRegistryEntry_UpgradeAndResume => {
            requireRoot(sender);
            onUpgradeAndResume(msg);
        }
        // A Resume nested inside a pending request.
        TokenAdminRegistryEntry_Resume => {
            throw TokenAdminRegistryEntry_Error.Unauthorized;
        }
        else => {
            assert (body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Returns the request to handle, its sender, and whether it is a replay.
///
/// A Resume self-message replays a pending request on this code as if it came
/// from its original sender; any other message is returned unchanged. Replays
/// may not be deferred again, so a root that cannot satisfy its own requested
/// version does not cause a loop.
fun unwrapIfResume(body: slice, sender: address): (slice, address, bool) {
    if (body.remainingBitsCount() < 32 || body.preloadUint(32) != TokenAdminRegistryEntry_RESUME_OPCODE) {
        return (body, sender, false);
    }
    assert(sender == contract.getAddress()) throw TokenAdminRegistryEntry_Error.Unauthorized;
    val pending = TokenAdminRegistryEntry_Resume.fromSlice(body).pending.load();
    return (pending.body.beginParse(), pending.sender, true);
}

fun requireRoot(sender: address) {
    val st = lazy TokenRegistry_Storage.load();
    assert(sender == st.adminConfig.load().tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
}

/// Returns true when this code satisfies `minEntryVersion`. Otherwise the
/// request is deferred: it travels to the root, which answers with its
/// entry code and the request to resume. All message value is carried.
fun ensureVersion(queryId: uint64, minEntryVersion: int, sender: address, body: slice, replay: bool): bool {
    if (minEntryVersion <= TokenAdminRegistryEntry_VERSION) {
        return true;
    }
    assert(!replay) throw TokenAdminRegistryEntry_Error.VersionUnavailable;
    val st = lazy TokenRegistry_Storage.load();
    createMessage({
        bounce: true,
        value: 0,
        dest: st.adminConfig.load().tokenAdminRegistry,
        body: TokenAdminRegistry_EntryUpgradeRequest {
            queryId,
            token: st.tokenAddress,
            pending: TokenAdminRegistryEntry_Pending {
                sender,
                body: beginCell().storeSlice(body).endCell(),
            }.toCell(),
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return false;
}

/// The Resume self-message is queued before the code swap: after
/// `Upgradeable.upgrade` switches c3, only method_id-pinned functions of the
/// new code may be called. Resume then runs entirely on the new code.
fun onUpgradeAndResume(msg: TokenAdminRegistryEntry_UpgradeAndResume) {
    if (msg.pending != null) {
        createMessage({
            bounce: false,
            value: 0,
            dest: contract.getAddress(),
            body: TokenAdminRegistryEntry_Resume { pending: msg.pending! },
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
    // Several requests may be deferred concurrently; only the first one upgrades.
    if (!contract.getCode().hashEqual(msg.code)) {
        Upgradeable { migrate, version }.upgrade(Upgradeable_Upgrade { queryId: msg.queryId, code: msg.code });
    }
}

fun onResolveTokenInfo(msg: TokenAdminRegistryEntry_ResolveTokenInfo, root: address) {
    val st = TokenRegistry_Storage.load();
    createMessage({
        bounce: false,
        value: 0,
        dest: root,
        body: TokenAdminRegistry_TokenInfoResolved {
            queryId: msg.queryId,
            token: st.tokenAddress,
            requester: msg.requester,
            tokenInfo: st.tokenInfo.toCell(),
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Emits the initial proposal after Deployable has atomically installed this
/// shard's state. Only an internal self-message can reach this path.
fun onRegistrationInitialized(msg: TokenAdminRegistryEntry_RegistrationInitialized, sender: address) {
    val st = TokenRegistry_Storage.load();
    val adminConfig = st.adminConfig.load();
    assert(sender == contract.getAddress()) throw TokenAdminRegistryEntry_Error.Unauthorized;
    assert(adminConfig.administrator == null && adminConfig.pendingAdministrator != null)
        throw TokenAdminRegistryEntry_Error.InvalidAdministrator;
    notifyAdministratorTransferRequested(msg.queryId, st.tokenAddress, null, adminConfig.pendingAdministrator);
}

fun onProposeAdministrator(msg: TokenAdminRegistryEntry_ProposeAdministrator) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator == null) throw TokenAdminRegistryEntry_Error.AlreadyRegistered;
    assert(msg.administrator != createAddressNone()) throw TokenAdminRegistryEntry_Error.InvalidAdministrator;
    adminConfig.pendingAdministrator = msg.administrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(msg.queryId, st.tokenAddress, adminConfig.administrator, msg.administrator);
}

fun onTransferAdminRole(msg: TokenAdminRegistryEntry_TransferAdminRole) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator != null && msg.actor == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;
    val currentAdministrator = adminConfig.administrator;
    adminConfig.pendingAdministrator = msg.newAdministrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(msg.queryId, st.tokenAddress, currentAdministrator, msg.newAdministrator);
}

fun onAcceptAdminRole(msg: TokenAdminRegistryEntry_AcceptAdminRole) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.pendingAdministrator != null && msg.actor == adminConfig.pendingAdministrator) throw TokenAdminRegistryEntry_Error.OnlyPendingAdministrator;
    adminConfig.administrator = msg.actor;
    adminConfig.pendingAdministrator = null;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferred(msg.queryId, st.tokenAddress, msg.actor);
}

fun onSetPool(msg: TokenAdminRegistryEntry_SetPool) {
    var st = lazy TokenRegistry_Storage.load();
    val adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator != null && msg.actor == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;

    val previousPool = st.tokenInfo.tokenPool;
    st.tokenInfo.tokenPool = msg.tokenPool;
    st.store();

    if (!samePool(previousPool, msg.tokenPool)) {
        notifyPoolSet(msg.queryId, st.tokenAddress, previousPool, msg.tokenPool);
    }
}

fun samePool(left: address?, right: address?): bool {
    if (left == null) {
        return right == null;
    }
    if (right == null) {
        return false;
    }
    return left! == right!;
}

fun onGetTokenInfo(msg: TokenAdminRegistryEntry_GetTokenInfo, sender: address) {
    val st = TokenRegistry_Storage.load();
    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: false,
        body: TokenAdminRegistryEntry_ReturnTokenInfo {
            queryId: msg.queryId,
            minterAddress: st.tokenInfo.minterAddress,
            tokenPool: st.tokenInfo.tokenPool,
            version: st.tokenInfo.version,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun notifyAdministratorTransferRequested(queryId: uint64, token: address, currentAdministrator: address?, newAdministrator: address?) {
    notifyRoot(TokenAdminRegistry_AdministratorTransferRequested {
            queryId,
            token,
            currentAdministrator,
            newAdministrator,
    }.toCell());
}

fun notifyAdministratorTransferred(queryId: uint64, token: address, newAdministrator: address) {
    notifyRoot(TokenAdminRegistry_AdministratorTransferred {
            queryId,
            token,
            newAdministrator,
    }.toCell());
}

fun notifyPoolSet(queryId: uint64, token: address, previousPool: address?, newPool: address?) {
    notifyRoot(TokenAdminRegistry_PoolSet {
            queryId,
            token,
            previousPool,
            newPool,
    }.toCell());
}

/// The root validates this entry's deterministic address before emitting the
/// payload as an external event. The attached value funds root execution/logging.
fun notifyRoot(body: cell) {
    val st = TokenRegistry_Storage.load();
    createMessage({
        bounce: true,
        value: grams("0.001"),
        dest: st.adminConfig.load().tokenAdminRegistry,
        body,
    }).send(SEND_MODE_REGULAR);
}

/// The storage layout is unchanged since 1.6.0, so reinstalling code of the
/// same layout is an identity migration.
@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    assert (version.bitsEqual(CONTRACT_VERSION.literalSlice())) throw Upgradeable_Error.VersionMismatch;
    return storage;
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION.literalSlice(); }

/// Read this after registration finality to determine whether the proposed
/// administrator has accepted. The root deliberately stores no per-entry state.
get fun tokenAdminRegistryConfig(): TokenRegistry_AdminConfig {
    return TokenRegistry_Storage.load().adminConfig.load();
}

get fun tokenInfo(): TokenRegistry_TokenInfo {
    return TokenRegistry_Storage.load().tokenInfo;
}

get fun entryVersion(): int {
    return TokenAdminRegistryEntry_VERSION;
}

get fun typeAndVersion(): (slice, slice) {
    return (TokenAdminRegistryEntry_FACILITY_NAME.literalSlice(), CONTRACT_VERSION.literalSlice());
}
