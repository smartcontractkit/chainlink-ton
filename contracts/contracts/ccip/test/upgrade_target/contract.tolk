// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/versioning/upgradeable"

tolk 1.4.2

/// Test-only code that token pools and the lockbox can be upgraded to. It keeps the migrated
/// storage so tests can prove the new implementation's `migrate` and `version` ran after the
/// code was swapped.
contract UpgradeTarget {
    author: "SmartContract Chainlink Limited SEZC"
    version: "2.0.0"
    description: "link.chain.ton.ccip.test.UpgradeTarget"

    storage: UpgradeTarget_Storage
}

struct UpgradeTarget_Storage {
    previousStorage: cell
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    assert (version.bitsEqual("0.1.0".literalSlice())) throw (Upgradeable_Error.VersionMismatch);
    return UpgradeTarget_Storage { previousStorage: storage }.toCell();
}

@method_id(1001)
fun version(): slice { return "2.0.0".literalSlice(); }

get fun previousStorage(): cell {
    return UpgradeTarget_Storage.fromCell(contract.getData()).previousStorage;
}
