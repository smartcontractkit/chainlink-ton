import "../../../lib/upgrades/upgradeable.tolk";
import "../../../lib/upgrades/type_and_version.tolk";
import "../../../lib/access/ownable_2step.tolk";

/// This is a Step Counter that implements Upgradeable trait.
/// It is able to be upgraded in place and migrate the data layout.
///
/// - V1 adds 1 to the counter on each step.
/// - V2 subtracts 1 to the counter on each step.
///
/// The implementor is expected to implement a `typeAndVersion(): (slice, slice)` getter, wrapping a call to `UpgradeableCounter.typeAndVersion();`
/// Example:
/// ```tolk
/// get typeAndVersion(): (slice, slice) {
///     val upgradeable = Upgradeable{migrateStorage};
///     val upgradeableCounter = UpgradeableCounter{upgradeable, versionStr};
///     return upgradeableCounter.typeAndVersion();
/// }
/// ```
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").
struct UpgradeableCounter {
    ownable2Step: Ownable2Step;
    /// Required attributes.
    versionStr: slice;
    /// Abstract methods that must be implemented by the contract.
    version: () -> slice;
    migrateStorage: (cell) -> cell;
}

/// Instructs the contract to step the counter.
struct (0x00000001) Step {
    queryId: uint64;
}

struct requireUpgradeAutoArgs {
    ownable2Step: Ownable2Step;
    sender: address;
}

fun requireUpgrade(autoargs: requireUpgradeAutoArgs) {
    autoargs.ownable2Step.requireOwner(autoargs.sender)
}

fun UpgradeableCounter.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {
    var cs: slice = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    var sender: address = cs.loadAddress();
    val upgradeable = Upgradeable<requireUpgradeAutoArgs>{
        version: self.version,
        migrateStorage: self.migrateStorage,
        requireUpgrade: Upgradeable_requireUpgrade<requireUpgradeAutoArgs> {
            call: requireUpgrade,
            autoArgs: requireUpgradeAutoArgs {
                ownable2Step: self.ownable2Step,
                sender: sender,
            },
        },
    };
    return upgradeable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

const typeStr= "com.chainlink.ton.examples.upgrades.UpgradeableCounter";

fun UpgradeableCounter.typeAndVersion(self): (slice, slice) {
    return TypeAndVersion{typeStr, versionStr: self.versionStr}.typeAndVersion();
}
