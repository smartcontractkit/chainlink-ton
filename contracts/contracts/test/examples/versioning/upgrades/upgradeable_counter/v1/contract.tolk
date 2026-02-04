// SPDX-License-Identifier: MIT
import "../../../../../../lib/utils.tolk";
import "../../../../../../lib/versioning/upgradeable.tolk";
import "../../../../../../lib/access/ownable_2step.tolk";
import "./storage.tolk";

type IncomingMessage = Upgradeable_Upgrade | Step;

fun loadData() {
    return StorageV1.fromCell(contract.getData());
}

fun saveData(data: StorageV1) {
    contract.setData(data.toCell());
}

const FACILITY_NAME= "com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter";
const CONTRACT_VERSION = "1.0.0";

struct (0x00000001) Step {
    queryId: uint64;
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) { // ignore all empty messages
        return;
    }

    val sender = in.senderAddress;
    var storage = loadData();
    var handled = storage.ownable2Step.onInternalMessage(sender, in.body);

    if (handled) {
        saveData(storage);
        return;
    }

    val msg = IncomingMessage.fromSlice(in.body);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        Upgradeable_Upgrade => {
            storage.ownable2Step.requireOwner(sender);
            Upgradeable{ migrate, version }.upgrade(msg);
        }
        Step => {
            /// Instructs the contract to step the counter.
            storage.value += 1;
            saveData(storage);
        }
    }
}

/// Gets the current counter value.
get fun value(): int {
    val storage = loadData();
    return storage.value;
}

/// Gets the current owner of the contract.
get fun owner(): address {
    val storage = loadData();
    return storage.ownable2Step.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val storage = loadData();
    return storage.ownable2Step.get_pendingOwner();
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }
@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter"), local);
}