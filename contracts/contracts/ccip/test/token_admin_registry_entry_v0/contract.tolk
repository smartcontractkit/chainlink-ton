// SPDX-License-Identifier: BUSL-1.1
import "../../token_admin_registry_entry/storage"
import "../../token_admin_registry_entry/handlers"
import "../../../lib/versioning/upgradeable"

tolk 1.4.2

// Test-only entry build reporting an older entry version with the production
// storage layout, used to exercise the stale-entry upgrade path.
contract TokenAdminRegistryEntryV0 {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.test.TokenAdminRegistryEntryV0"

    storage: TokenRegistry_Storage
}

fun onInternalMessage(in: InMessage) {
    TokenAdminRegistryEntry_dispatch(in.body, in.senderAddress, true, TokenAdminRegistryEntry_Code {
        entryVersion: 0,
        upgradeable: Upgradeable { migrate, version },
    });
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return "1.6.0".literalSlice(); }

get fun entryVersion(): int {
    return 0;
}
