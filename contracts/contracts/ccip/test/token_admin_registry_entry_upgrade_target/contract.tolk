// SPDX-License-Identifier: BUSL-1.1
import "../../token_admin_registry_entry/messages"
import "../../token_admin_registry_entry/types"
import "../../../lib/versioning/upgradeable"

tolk 1.4.2

// Test-only code a TokenAdminRegistryEntry can be upgraded to. It keeps the
// migrated storage and records the request replayed through Resume.
contract TokenAdminRegistryEntryUpgradeTarget {
    author: "SmartContract Chainlink Limited SEZC"
    version: "2.0.0"
    description: "link.chain.ton.ccip.test.TokenAdminRegistryEntryUpgradeTarget"

    storage: UpgradeTarget_Storage
    incomingMessages: TokenAdminRegistryEntry_Resume
}

struct UpgradeTarget_Storage {
    previousStorage: cell
    resumed: Cell<TokenAdminRegistryEntry_MessageFromRoot>?
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistryEntry_Resume.fromSlice(in.body);
    assert(in.senderAddress == contract.getAddress()) throw 0xFFFF;
    var st = UpgradeTarget_Storage.fromCell(contract.getData());
    st.resumed = msg.request;
    contract.setData(st.toCell());
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    assert (version.bitsEqual("1.6.0".literalSlice())) throw Upgradeable_Error.VersionMismatch;
    return UpgradeTarget_Storage { previousStorage: storage, resumed: null }.toCell();
}

@method_id(1001)
fun version(): slice { return "2.0.0".literalSlice(); }

get fun previousStorage(): cell {
    return UpgradeTarget_Storage.fromCell(contract.getData()).previousStorage;
}

get fun resumed(): TokenAdminRegistryEntry_MessageFromRoot? {
    val resumed = UpgradeTarget_Storage.fromCell(contract.getData()).resumed;
    return resumed == null ? null : resumed!.load();
}
