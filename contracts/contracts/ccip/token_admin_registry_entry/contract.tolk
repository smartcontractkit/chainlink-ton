// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"
import "types"
import "handlers"
import "../../lib/versioning/upgradeable"

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
    TokenAdminRegistryEntry_dispatch(in.body, in.senderAddress, true, TokenAdminRegistryEntry_Code {
        entryVersion: TokenAdminRegistryEntry_VERSION,
        upgradeable: Upgradeable { migrate, version },
    });
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
