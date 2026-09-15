// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"
import "types"
import "../token_admin_registry/messages"

tolk 1.4.1

// The state-bearing shard of TokenAdminRegistry.
contract TokenAdminRegistryEntry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistryEntry"

    storage: TokenRegistry_Storage
    incomingMessages: TokenAdminRegistryEntry_InMessage
    thrownErrors: TokenAdminRegistryEntry_Error
}

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistryEntry_InMessage.fromSlice(in.body);

    match (msg) {

        // TODO: min value assertion throughout
        TokenAdminRegistryEntry_GetTokenInfo => {
            onGetTokenInfo(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_RegistrationInitialized => {
            onRegistrationInitialized(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_ProposeAdministrator => {
            onProposeAdministrator(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_TransferAdminRole => {
            onTransferAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_AcceptAdminRole => {
            onAcceptAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_SetPool => {
            onSetPool(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
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

fun onProposeAdministrator(msg: TokenAdminRegistryEntry_ProposeAdministrator, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(sender == adminConfig.tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
    assert(adminConfig.administrator == null) throw TokenAdminRegistryEntry_Error.AlreadyRegistered;
    assert(msg.administrator != createAddressNone()) throw TokenAdminRegistryEntry_Error.InvalidAdministrator;
    adminConfig.pendingAdministrator = msg.administrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(msg.queryId, st.tokenAddress, adminConfig.administrator, msg.administrator);
}

fun onTransferAdminRole(msg: TokenAdminRegistryEntry_TransferAdminRole, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(sender == adminConfig.tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
    assert(adminConfig.administrator != null && msg.actor == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;
    val currentAdministrator = adminConfig.administrator;
    adminConfig.pendingAdministrator = msg.newAdministrator;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferRequested(msg.queryId, st.tokenAddress, currentAdministrator, msg.newAdministrator);
}

fun onAcceptAdminRole(msg: TokenAdminRegistryEntry_AcceptAdminRole, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    var adminConfig = st.adminConfig.load();
    assert(sender == adminConfig.tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
    assert(adminConfig.pendingAdministrator != null && msg.actor == adminConfig.pendingAdministrator) throw TokenAdminRegistryEntry_Error.OnlyPendingAdministrator;
    adminConfig.administrator = msg.actor;
    adminConfig.pendingAdministrator = null;
    st.adminConfig = adminConfig.toCell();
    st.store();
    notifyAdministratorTransferred(msg.queryId, st.tokenAddress, msg.actor);
}

fun onSetPool(msg: TokenAdminRegistryEntry_SetPool, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    val adminConfig = st.adminConfig.load();
    assert(adminConfig.administrator != null && sender == adminConfig.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;

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
        value: ton("0.001"),
        dest: st.adminConfig.load().tokenAdminRegistry,
        body,
    }).send(SEND_MODE_REGULAR);
}

/// Read this after registration finality to determine whether the proposed
/// administrator has accepted. The root deliberately stores no per-entry state.
get fun tokenAdminRegistryConfig(): TokenRegistry_AdminConfig {
    return TokenRegistry_Storage.load().adminConfig.load();
}

get fun tokenInfo(): TokenRegistry_TokenInfo {
    return TokenRegistry_Storage.load().tokenInfo;
}
