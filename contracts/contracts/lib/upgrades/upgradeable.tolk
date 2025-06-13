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
    requireUpgrade: Closure<T>?; // This method requires the sender to be the contract owner by default. It can be overridden to bypass it or implement custom logic.
    // TODO on ownable2step:
    // ownable2Step: Ownable2Step;
}

struct Upgradeable_Impl {}

struct Closure<A> {
    call: (A, Upgradeable_Impl) -> void;
    autoArgs: A;
}

fun Closure<A>.Run(self, args: Upgradeable_Impl) {
    self.call(self.autoArgs, args);
}

/// Message for upgrading a contract.
struct (0x78db4d86) Upgradeable_Upgrade {
    queryId: uint64;
    code: cell;
}

fun Upgradeable<T>.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {
    try {
        var upgrade = Upgradeable_Upgrade.fromSlice(msgBody);
        if (self.requireUpgrade != null) {
            self.requireUpgrade.Run(Upgradeable_Impl{});
        } else {
            Upgradeable_Impl{}.requireUpgrade();
        }
        self.doUpgrade(upgrade.code);
        return true;
    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }
}

fun Upgradeable_Impl.requireUpgrade(self) {
    // TODO on ownable2step: throw error if sender is not the contract owner
    // self.ownable2Step.requireOwner();
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
    contract.setCodePostponed(code);
    var cont = transformSliceToContinuation(code.beginParse());
    setTvmRegisterC3(cont);
    var c = contract.getData();
    var newStorage = self.migrateStorage(c);
    contract.setData(newStorage);
    emit(UPGRADED_EVENT, UpgradedEvent{
        code: code,
        sha: code.hash(),
        version: UnsafeBodyNoRef {
            bodyForceNoRef: self.version(),
            },
        });
}
