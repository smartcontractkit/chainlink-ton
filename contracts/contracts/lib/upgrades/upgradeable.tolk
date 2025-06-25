import "@stdlib/tvm-lowlevel";
import "@stdlib/tvm-dicts.tolk";
import "../emit.tolk";

/// Upgradeable message handler.
///
/// This function is expected to be called from the contract's
/// `onInternalMessage` handler.
/// It processes the Upgradeable_Upgrade message and performs the upgrade if applicable.
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
///     val this = UpgradeableCounter{
///         versionStr,
///         version,
///         migrateStorage,
///     };
///
///     if (msgBody.isEnd()) { // ignore all empty messages
///         return;
///     }
///
///     var cs = msgFull.beginParse();
///     val flags = cs.loadMessageFlags();
///     if (isMessageBounced(flags)) { // ignore all bounced messages
///         return;
///     }
///
///     if (this.onInternalMessage(myBalance, msgValue, msgFull, msgBody)) {
///         return;
///     }
///
///     throw 63; // 63 error code is thrown if the message opcode is unknown
/// }
/// @method_id(1000)
/// fun migrateStorage(c: cell): cell {
///     var oldStorage = StorageV1.fromCell(c);
///     var newStorage = StorageV2{
///         value: oldStorage.value as uint64,
///         id: oldStorage.id,
///     };
///     return newStorage.toCell();
/// }
/// ```
///
struct Upgradeable<T> {
    /// Abstract methods that must be implemented by the contract.
    migrateStorage: (cell) -> cell;
    version: () -> slice;
    /// Provided methods that can be overridden by the contract.
    requireUpgrade: Upgradeable_requireUpgrade<T>; // This method requires the sender to be the contract owner by default. It can be overridden to bypass it or implement custom logic.
}

struct Upgradeable_requireUpgrade<T> {
    call: (T) -> void;
    autoArgs: T;
}

fun Upgradeable_requireUpgrade<T>.Run(self) {
    self.call(self.autoArgs);
}

/// Message for upgrading a contract.
struct (0x0aa811ed) Upgradeable_Upgrade {
    queryId: uint64;
    code: cell;
}

fun Upgradeable<T>.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {
    try {
        var upgrade = Upgradeable_Upgrade.fromSlice(msgBody);
        self.requireUpgrade.Run();
        self.doUpgrade(upgrade.code);
        return true;
    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }
}

struct UpgradedEvent {
    /// The new code of the contract.
    code: cell;
    /// The SHA256 hash of the new code.
    sha: uint256;
    /// The version of the contract after the upgrade.
    version: UnsafeBodyNoRef<slice>;
}

const UPGRADED_EVENT = 0xa33b498e; // Event topic for the upgrade event

fun Upgradeable<T>.doUpgrade(self, code: cell) {
    // Schedule the code to be changed after the compute phase
    contract.setCodePostponed(code);
    // Load the code dinamically
    var cont = transformSliceToContinuation(code.beginParse());
    setTvmRegisterC3(cont); // After this line, we are running the new code
    // Call the migrateStorage function implemented by the new version
    var c = contract.getData();
    var newStorage = self.migrateStorage(c);
    contract.setData(newStorage);
    emit(UPGRADED_EVENT, UpgradedEvent{
        code: code,
        sha: code.hash(),
        version: UnsafeBodyNoRef {
            bodyForceNoRef: self.version(), // This is expected to be the version of the new code
            },
        });
}
