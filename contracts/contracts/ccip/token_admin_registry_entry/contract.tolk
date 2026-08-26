// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"

tolk 1.4.1

// The state-bearing shard of TokenAdminRegistry. Its message ABI intentionally
// remains TokenRegistry_* until all consumers have migrated.
contract TokenAdminRegistryEntry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistryEntry"

    storage: TokenRegistry_Storage
    incomingMessages: TokenRegistry_InMessage
    thrownErrors: TokenAdminRegistryEntry_Error
}

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenRegistry_InMessage.fromSlice(in.body);

    match (msg) {
        TokenRegistry_GetTokenInfo => {
            // TODO: min value assertion
            onGetTokenInfo(in.senderAddress);
        }
        TokenRegistry_SetTokenInfo => {
            onSetTokenInfo(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_ProposeAdministrator => {
            onProposeAdministrator(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_TransferAdminRole => {
            onTransferAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistryEntry_AcceptAdminRole => {
            onAcceptAdminRole(in.senderAddress);
        }
        TokenAdminRegistryEntry_SetPool => {
            onSetPool(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onSetTokenInfo(msg: TokenRegistry_SetTokenInfo, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    assert(sender == st.tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
    st.tokenInfo = msg.info;
    st.store();
}

fun onProposeAdministrator(msg: TokenAdminRegistryEntry_ProposeAdministrator, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    assert(sender == st.tokenAdminRegistry) throw TokenAdminRegistryEntry_Error.Unauthorized;
    assert(st.administrator == null) throw TokenAdminRegistryEntry_Error.AlreadyRegistered;
    assert(msg.administrator != createAddressNone()) throw TokenAdminRegistryEntry_Error.InvalidAdministrator;
    st.pendingAdministrator = msg.administrator;
    st.store();

    // TODO: emit AdministratorTransferRequested.
}

fun onTransferAdminRole(msg: TokenAdminRegistryEntry_TransferAdminRole, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    assert(st.administrator != null && sender == st.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;
    st.pendingAdministrator = msg.newAdministrator;
    st.store();

    // TODO: emit AdministratorTransferRequested.
}

fun onAcceptAdminRole(sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    assert(st.pendingAdministrator != null && sender == st.pendingAdministrator) throw TokenAdminRegistryEntry_Error.OnlyPendingAdministrator;
    st.administrator = sender;
    st.pendingAdministrator = null;
    st.store();

    // TODO: emit AdministratorTransferred.
}

fun onSetPool(msg: TokenAdminRegistryEntry_SetPool, sender: address) {
    var st = lazy TokenRegistry_Storage.load();
    assert(st.administrator != null && sender == st.administrator) throw TokenAdminRegistryEntry_Error.Unauthorized;

    // TODO: validate that tokenPool is a CCIP pool for st.tokenAddress before enabling it.
    // TODO: reject enabled pools with addr_none once the pool-validation interface exists.
    st.tokenInfo.tokenPool = msg.tokenPool;
    st.tokenInfo.enabled = msg.enabled;
    st.store();

    // TODO: emit PoolSet with the previous and new pool.
}

fun onGetTokenInfo(sender: address) {
    val st = TokenRegistry_Storage.load();
    var tokenPool: address? = null;
    if (st.tokenInfo.enabled) {
        tokenPool = st.tokenInfo.tokenPool;
    }
    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: false,
        body: TokenRegistry_ReturnTokenInfo {
            minterAddress: st.tokenInfo.minterAddress,
            tokenPool,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
