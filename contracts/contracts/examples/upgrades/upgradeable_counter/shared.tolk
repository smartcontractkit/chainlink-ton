import "../../../lib/upgrades/upgradeable.tolk";
import "../../../lib/upgrades/type_and_version.tolk";

/// This is a Step Counter that implements Upgradeable trait.
/// It is able to be upgraded in place and migrate the data layout.
///
/// - V1 adds 1 to the counter on each step.
/// - V2 subtracts 1 to the counter on each step.
///
/// The implementor is expected to implement a `typeAndVersion(): cell` getter, wrapping a call to `UpgradeableCounter.typeAndVersion();`
/// Example:
/// ```tolk
/// get typeAndVersion(): cell {
///     val upgradeable = Upgradeable{migrateStorage};
///     val upgradeableCounter = UpgradeableCounter{upgradeable, versionStr};
///     return upgradeableCounter.typeAndVersion();
/// }
/// ```
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").
struct UpgradeableCounter {
    upgradeable: Upgradeable,
    versionStr: slice,
}

// TODO opcode from hashed name
/// Instructs the contract to step the counter.
struct (0x00000001) Step {
    queryId: uint64;
}

fun UpgradeableCounter.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {    
    return self.upgradeable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

const typeStr= "com.chainlink.ton.examples.upgrades.UpgradeableCounter";

fun UpgradeableCounter.typeAndVersion(self): cell {
    return TypeAndVersion{typeStr, versionStr: self.versionStr}.typeAndVersion();
}
