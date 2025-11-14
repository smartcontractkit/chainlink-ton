/**
 * This contract is used to test version mismatch during upgrade.
*/

import "../../../../lib/versioning/upgradeable.tolk";

const CONTRACT_VERSION = "invalid_version";

struct Storage {
    id: uint32;
}

type IncomingMessage = Upgradeable_Upgrade;

fun loadData() {
    return Storage.fromCell(contract.getData());
}

fun saveData(data: Storage) {
    contract.setData(data.toCell());
}


fun onInternalMessage(in: InMessage) {
    val msg = lazy  IncomingMessage.fromSlice(in.body);

    match (msg) {
        Upgradeable_Upgrade => {
            // Should check owner here if it was a real contract
            Upgradeable{ migrate, version }.upgrade(msg);
        }
        else => {
            in.body.isEmpty()
        },
    }
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }
@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }
