// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/versioning/upgradeable"

tolk 1.4.2

/// Test-only code that any upgradeable contract can be upgraded to. It records the previous
/// storage and version so tests can prove the new implementation's `migrate` and `version` ran
/// after the code was swapped. It also records the last message body so post-upgrade replay
/// flows can be asserted without teaching the target each contract's message types.
contract UpgradeTarget {
    author: "SmartContract Chainlink Limited SEZC"
    version: "2.0.0"
    description: "link.chain.ton.ccip.test.UpgradeTarget"

    storage: UpgradeTarget_Storage
}

struct UpgradeTarget_Storage {
    previousStorage: cell
    /// The version reported by the code that was upgraded. Recorded instead of validated so one
    /// target works for every contract; each test asserts the expected value.
    previousVersion: cell
    lastSender: address?
    lastBody: cell?
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }

    var st = UpgradeTarget_Storage.fromCell(contract.getData());
    st.lastSender = in.senderAddress;
    st.lastBody = in.body.toCell();
    contract.setData(st.toCell());
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    return UpgradeTarget_Storage {
        previousStorage: storage,
        previousVersion: version.toCell(),
        lastSender: null,
        lastBody: null,
    }.toCell();
}

@method_id(1001)
fun version(): slice { return "2.0.0".literalSlice(); }

get fun previousStorage(): cell {
    return UpgradeTarget_Storage.fromCell(contract.getData()).previousStorage;
}

get fun previousVersion(): cell {
    return UpgradeTarget_Storage.fromCell(contract.getData()).previousVersion;
}

get fun lastSender(): address? {
    return UpgradeTarget_Storage.fromCell(contract.getData()).lastSender;
}

get fun lastBody(): cell? {
    return UpgradeTarget_Storage.fromCell(contract.getData()).lastBody;
}
