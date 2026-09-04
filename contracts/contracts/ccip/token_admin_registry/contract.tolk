// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "types"
import "errors"

import "../../lib/access/ownable_2step"
import "../../lib/deployable/types"
import "../token_admin_registry_entry/messages"
import "../token_admin_registry_entry/storage"
import "../token_admin_registry_entry/types"

tolk 1.4.1

/// Root contract for the sharded token-admin registry. It owns deployment
/// configuration for deterministic entries and is the future replacement for
/// the Router's token-registry administration surface.
// TODO: define a controlled shard code/storage migration protocol for a
// deployed entry if an entry bug or storage-layout change requires one.
contract TokenAdminRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistry"

    storage: TokenAdminRegistry_Storage
    incomingMessages: TokenAdminRegistry_InMessage | Ownable2Step_Messages
    thrownErrors: Ownable2Step_Error | TokenAdminRegistry_Error
}

const CONTRACT_VERSION = "1.6.0".literalSlice();

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistry_InMessage.fromSlice(in.body);
    match (msg) {
        TokenAdminRegistry_SetEntryDeployment => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.entryDeployment = msg.entryDeployment;
            st.store();
        }
        TokenAdminRegistry_RegisterToken => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            registerToken(st, msg);
        }
        TokenAdminRegistry_OverridePendingAdministrator => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            overridePendingAdministrator(st, msg);
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
    val expectedEntry = TokenAdminRegistryEntry.deriveAddress(
        st.entryDeployment.deployableCode,
        token,
        contract.getAddress(),
    ).calculateAddress();
    assert(sender == expectedEntry) throw TokenAdminRegistry_Error.UnauthorizedEntry;
}

fun emitAdministratorTransferRequested(event: TokenAdminRegistry_AdministratorTransferRequested) {
    createExternalLogMessage({ dest: createAddressNone(), body: event }).send(SEND_MODE_REGULAR);
}

fun emitAdministratorTransferred(event: TokenAdminRegistry_AdministratorTransferred) {
    createExternalLogMessage({ dest: createAddressNone(), body: event }).send(SEND_MODE_REGULAR);
}

fun emitPoolSet(event: TokenAdminRegistry_PoolSet) {
    createExternalLogMessage({ dest: createAddressNone(), body: event }).send(SEND_MODE_REGULAR);
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

    val deployment = st.entryDeployment;
    val entryAddress = TokenAdminRegistryEntry.deriveAddress(
        deployment.deployableCode,
        msg.tokenAddress,
        contract.getAddress(),
    );

    val deployMsg = createMessage({
        bounce: false,
        // Covers Deployable initialization and the event self-message below.
        // The former Router flow only initialized the shard; this path also
        // emits the initial administrator-proposal event atomically.
        value: ton("0.05"),
        dest: entryAddress,
        body: Deployable_InitializeAndSend {
            stateInit: {
                code: deployment.entryCode,
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
                value: ton("0.015"),
                body: TokenAdminRegistryEntry_RegistrationInitialized {}.toCell(),
            },
        },
    });
    deployMsg.send(SEND_MODE_REGULAR);
}

/// Replaces an unaccepted administrator proposal. The shard enforces that no
/// active administrator exists, so this cannot reclaim a configured token.
fun overridePendingAdministrator(st: TokenAdminRegistry_Storage, msg: TokenAdminRegistry_OverridePendingAdministrator) {
    assert(msg.administrator != createAddressNone()) throw Ownable2Step_Error.OnlyCallableByOwner;
    val deployment = st.entryDeployment;
    val entryAddress = TokenAdminRegistryEntry.deriveAddress(
        deployment.deployableCode,
        msg.tokenAddress,
        contract.getAddress(),
    );
    val proposeMsg = createMessage({
        bounce: false,
        value: ton("0.015"),
        dest: entryAddress,
        body: TokenAdminRegistryEntry_ProposeAdministrator {
            administrator: msg.administrator,
        },
    });
    proposeMsg.send(SEND_MODE_REGULAR);
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

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.ccip.TokenAdminRegistry".literalSlice(), CONTRACT_VERSION);
}
