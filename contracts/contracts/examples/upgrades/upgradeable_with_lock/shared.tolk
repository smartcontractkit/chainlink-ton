import "../../../lib/upgrades/upgradeable.tolk";
import "../../../lib/upgrades/type_and_version.tolk";

/// This is a Step Counter that implements Upgradeable trait.
/// It is able to be upgraded in place and migrate the data layout.
///
/// - V1 adds 1 to the counter on each step.
/// - V2 subtracts 1 to the counter on each step.
///
/// The implementor is expected to implement a `typeAndVersion(): cell` getter, wrapping a call to `UpgradeableWithLock.typeAndVersion();`
/// Example:
/// ```tolk
/// get typeAndVersion(): cell {
///     val upgradeable = Upgradeable{migrateStorage};
///     val upgradeableCounter = UpgradeableWithLock{upgradeable, versionStr};
///     return upgradeableCounter.typeAndVersion();
/// }
/// ```
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").
struct UpgradeableWithLock {
    /// Required attributes.
    versionStr: slice;
    /// Abstract methods that must be implemented by the contract.
    version: () -> slice;
    migrateStorage: (cell) -> cell;
    locked: bool;
}

struct (0x00000001) SwitchLock {
    queryId: uint64;
}

struct requireUpgradeClosureArgs {
    // upgradeable: Upgradeable<requireUpgradeClosureArgs>;
    locked: bool;
}

const LOCKED_EXIT_CODE = 1000;

fun requireUpgradeClosureCallable(args: requireUpgradeClosureArgs): void {
    // args.upgradeable.virtual_requireUpgrade();
    assert(args.locked!, LOCKED_EXIT_CODE); // Unlock the contract
}

fun UpgradeableWithLock.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {    
    var upgradeable = Upgradeable<requireUpgradeClosureArgs>{
        version: self.version,
        migrateStorage: self.migrateStorage,
        requireUpgrade: Closure {
        callable: requireUpgradeClosureCallable,
        arg: requireUpgradeClosureArgs{
                // upgradeable: upgradeableCopy,
                locked: self.locked,
            },
        },
    };
    return upgradeable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

const typeStr= "com.chainlink.ton.examples.upgrades.UpgradeableWithLock";

fun UpgradeableWithLock.typeAndVersion(self): cell {
    return TypeAndVersion{typeStr, versionStr: self.versionStr}.typeAndVersion();
}
