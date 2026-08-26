// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "types"

import "../../lib/access/ownable_2step"
import "../../lib/deployable/types"
import "../token_admin_registry_entry/messages"
import "../token_admin_registry_entry/storage"
import "../token_admin_registry_entry/types"

tolk 1.4.1

/// Root contract for the sharded token-admin registry. It owns deployment
/// configuration for deterministic entries and is the future replacement for
/// the Router's token-registry administration surface.
contract TokenAdminRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistry"

    storage: TokenAdminRegistry_Storage
    incomingMessages: TokenAdminRegistry_InMessage | Ownable2Step_Messages
    thrownErrors: Ownable2Step_Error
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

/// Deploys a deterministic shard with an unclaimed administrator proposal, or
/// replaces an unaccepted proposal on an existing shard. Once claimed, the
/// entry rejects further root proposals.
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

    if (msg.isNewEntry) {
        val deployMsg = createMessage({
            bounce: false,
            value: ton("0.015"),
            dest: entryAddress,
            body: Deployable_Initialize {
                stateInit: {
                    code: deployment.entryCode,
                    data: TokenRegistry_Storage {
                        tokenAdminRegistry: contract.getAddress(),
                        tokenAddress: msg.tokenAddress,
                        tokenInfo: msg.tokenInfo,
                        administrator: null,
                        pendingAdministrator: msg.administrator,
                    }.toCell(),
                }
            },
        });
        deployMsg.send(SEND_MODE_REGULAR);
    }

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

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.ccip.TokenAdminRegistry".literalSlice(), CONTRACT_VERSION);
}
