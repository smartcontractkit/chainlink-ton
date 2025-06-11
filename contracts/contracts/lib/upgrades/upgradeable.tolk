import "@stdlib/tvm-lowlevel";
import "@stdlib/tvm-dicts.tolk";

struct (0x0000000A) Upgrade {
    queryId: uint64;
    code: cell;
}

/// Upgradeable message handler.
///
/// This function is expected to be called from the contract's
/// `onInternalMessage` handler.
/// It processes the Upgrade message and performs the upgrade if applicable.
/// It returns true if the message was handled (i.e., an upgrade was performed),
/// or false if the message was ignored (e.g., due to an unknown opcode).
/// The `migrateStorage` function is expected to be provided by the contract
/// and should handle the migration of the storage data from the old version to
/// the new version. Its method_id must be set explicitly in the contract, and
/// be consistent across versions.
/// 
/// Example usage:
/// ```tolk
/// fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
///     if (msgBody.isEnd()) { // ignore all empty messages
///         return;
///     }
///     var cs = msgFull.beginParse();
///     val flags = cs.loadMessageFlags();
///     if (isMessageBounced(flags)) { // ignore all bounced messages
///         return;
///     }
///     if (upgradeableCounter$handleMessage(myBalance, msgValue, msgFull, msgBody, migrate)) {
///         return;
///     }
///     throw 63; // 63 error code is thrown if the message opcode is unknown
/// }
/// @method_id(1000)
/// fun migrateStorage(c: cell): cell { return beginCell().endCell(); }
///```
///
struct Upgradeable {
    migrateStorage: (cell) -> cell, // This function is expected to be provided by the contract
}

fun Upgradeable.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {
    try {
        var upgrade = Upgrade.fromSlice(msgBody);

        var data = contract.getData();
        doUpgrade(upgrade.code, self.migrateStorage);
        return true;
    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }
}

fun doUpgrade(code: cell, migrateStorage: (cell) -> cell) {
    contract.setCodePostponed(code);
    var cont = transformSliceToContinuation(code.beginParse());
    setTvmRegisterC3(cont);
    var c = contract.getData();
    var newStorage = migrateStorage(c);
    contract.setData(newStorage);
}
