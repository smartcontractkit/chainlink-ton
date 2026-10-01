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
    forceAbiExport: (TokenAdminRegistryEntry_GetTokenInfo, TokenAdminRegistryEntry_ProposeAdministrator, TokenAdminRegistryEntry_TransferAdminRole, TokenAdminRegistryEntry_AcceptAdminRole, TokenAdminRegistryEntry_SetPool)
    thrownErrors: TokenAdminRegistryEntry_Error | Upgradeable_Error
}

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistryEntry_InMessage.fromSlice(in.body);
    match (msg) {
        // TODO: min value assertion throughout
        TokenAdminRegistryEntry_RegistrationInitialized => {
            onRegistrationInitialized(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_MessageFromRoot => {
            requireRoot(in.senderAddress);
            onMessageFromRoot(msg, false);
        }
        Upgradeable_Upgrade => {
            requireRoot(in.senderAddress);
            onUpgrade(msg);
        }
        TokenAdminRegistryEntry_Resume => {
            requireRoot(in.senderAddress);
            onMessageFromRoot(msg.request.load(), true);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Handles a message from the root once this code satisfies its
/// `minEntryVersion`; otherwise defers it to the root for an upgrade. A Resume
/// may not be deferred again, so a failed upgrade or a root that cannot satisfy
/// its own requested version does not cause a loop.
fun onMessageFromRoot(msg: TokenAdminRegistryEntry_MessageFromRoot, replay: bool) {
    if (msg.minEntryVersion > TokenAdminRegistryEntry_VERSION) {
        assert(!replay) throw TokenAdminRegistryEntry_Error.VersionUnavailable;
        return deferToRoot(msg);
    }
    val content = lazy msg.content.load();
    match (content) {
        TokenAdminRegistryEntry_GetTokenInfo => {
            onGetTokenInfo(msg.queryId, content);
        }
        TokenAdminRegistryEntry_ProposeAdministrator => {
            onProposeAdministrator(msg.queryId, content);
        }
        TokenAdminRegistryEntry_TransferAdminRole => {
            onTransferAdminRole(msg.queryId, content);
        }
        TokenAdminRegistryEntry_AcceptAdminRole => {
            onAcceptAdminRole(msg.queryId, content);
        }
        TokenAdminRegistryEntry_SetPool => {
            onSetPool(msg.queryId, content);
        }
    }
}

fun requireRoot(sender: address) {
    val st = lazy TokenRegistry_Storage.load();
    assert(sender == st.adminConfig.load().tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
}

/// Sends the request to the root, which answers with its entry code and the
/// request to resume. All message value is carried.
fun deferToRoot(msg: TokenAdminRegistryEntry_MessageFromRoot) {
    val st = lazy TokenRegistry_Storage.load();
    createMessage({
        bounce: true,
        value: 0,
        dest: st.adminConfig.load().tokenAdminRegistry,
        body: TokenAdminRegistry_EntryUpgradeRequest {
            queryId: msg.queryId,
            token: st.tokenAddress,
            request: msg.toCell(),
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Several requests may be deferred concurrently; only the first one upgrades.
fun onUpgrade(msg: Upgradeable_Upgrade) {
    if (!contract.getCode().hashEqual(msg.code)) {
        Upgradeable { migrate, version }.upgrade(msg);
    }
}

fun onGetTokenInfo(queryId: uint64, msg: TokenAdminRegistryEntry_GetTokenInfo) {
    val st = TokenRegistry_Storage.load();
    createMessage({
        bounce: false,
        value: 0,
        dest: st.adminConfig.load().tokenAdminRegistry,
        body: TokenAdminRegistryEntry_TokenInfo {
            queryId,
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

fun onProposeAdministrator(queryId: uint64, msg: TokenAdminRegistryEntry_ProposeAdministrator) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator == null) throw TokenAdminRegistryEntry_Error.AlreadyRegistered;
    adminConfig.pendingAdministrator = msg.administrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(queryId, st.tokenAddress, adminConfig.administrator, msg.administrator);
}

fun onTransferAdminRole(queryId: uint64, msg: TokenAdminRegistryEntry_TransferAdminRole) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator != null && msg.actor == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;
    val currentAdministrator = adminConfig.administrator;
    adminConfig.pendingAdministrator = msg.newAdministrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(queryId, st.tokenAddress, currentAdministrator, msg.newAdministrator);
}

fun onAcceptAdminRole(queryId: uint64, msg: TokenAdminRegistryEntry_AcceptAdminRole) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(adminConfig.pendingAdministrator != null && msg.actor == adminConfig.pendingAdministrator) throw TokenAdminRegistryEntry_Error.OnlyPendingAdministrator;
    adminConfig.administrator = msg.actor;
    adminConfig.pendingAdministrator = null;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferred(queryId, st.tokenAddress, msg.actor);
}

fun onSetPool(queryId: uint64, msg: TokenAdminRegistryEntry_SetPool) {
    var st = lazy TokenRegistry_Storage.load();
    val adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator != null && msg.actor == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;

    val previousPool = st.tokenInfo.tokenPool;
    st.tokenInfo.tokenPool = msg.tokenPool;
    st.store();

    if (!samePool(previousPool, msg.tokenPool)) {
        notifyPoolSet(queryId, st.tokenAddress, previousPool, msg.tokenPool);
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

// Implement when upgrading the contract
@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    throw Upgradeable_Error.VersionMismatch
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
