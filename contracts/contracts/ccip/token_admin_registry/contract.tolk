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
        TokenAdminRegistry_SetTokenInfo => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            setTokenInfo(st, msg);
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

/// Deploys the deterministic shard when requested, then updates its token info.
/// The `isNewEntry` flag mirrors the Router's current behavior and will be
/// removed once registration becomes fully idempotent.
fun setTokenInfo(st: TokenAdminRegistry_Storage, msg: TokenAdminRegistry_SetTokenInfo) {
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
                        tokenAddress: msg.tokenAddress,
                        tokenInfo: msg.tokenInfo,
                    }.toCell(),
                }
            },
        });
        deployMsg.send(SEND_MODE_REGULAR);
    }

    val updateMsg = createMessage({
        bounce: false,
        value: ton("0.015"),
        dest: entryAddress,
        body: TokenRegistry_SetTokenInfo { info: msg.tokenInfo },
    });
    updateMsg.send(SEND_MODE_REGULAR);
}

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.ccip.TokenAdminRegistry".literalSlice(), CONTRACT_VERSION);
}
