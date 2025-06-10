import "./../../lib/upgrades/upgradeable.tolk";
import "./../../lib/upgrades/type_and_version.tolk";

/// This is a Step Counter that implements Upgradeable trait.
/// It is able to be upgraded in place and migrate the data layout.
///
/// - V1 adds 1 to the counter on each step.
/// - V2 subtracts 1 to the counter on each step.

/// The implementor is expected to implement a `type_and_version(): cell` getter, wrapping a call to `upgradeableCounter$type_and_version(contract_type, version);`
/// Example:
/// ```tolk
/// const version= "1.0.0";
/// get type_and_version(): cell {
///     return upgradeableCounter$type_and_version(version);
/// }
/// ```
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").

// TODO opcode from hashed name
/// Instructs the contract to step the counter.
struct (0x00000001) Step {
    queryId: uint64;
}

fun upgradeableCounter$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice, migrate: () -> void): bool {    
    // Upgradeable Handlers
    return upgradeable$handleMessage(myBalance, msgValue, msgFull, msgBody, migrate);
}

const typeStr= "com.chainlink.ton.examples.upgrades.UpgradeableCounter";

fun upgradeableCounter$type_and_version(versionStr: slice): cell {
    return typeAndVersion$handle_type_and_version(typeStr, versionStr);
}
