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

type IncomingMessage = Step;

fun upgradeableCounter$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice, migrateStorage: (cell) -> cell, step: (uint64) -> void): bool {    
    // Upgradeable Handlers
    if (upgradeable$handleMessage(myBalance, msgValue, msgFull, msgBody, migrateStorage)) {
        return true;
    }

    try {   
        val msg = IncomingMessage.fromSlice(msgBody);

        match (msg) {
            Step => {
                /// Instructs the contract to step the counter.
                step(msg.queryId);
            }
        }
    } catch (exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }
    return true; // message handled
}

const typeStr= "com.chainlink.ton.examples.upgrades.UpgradeableCounter";

fun upgradeableCounter$type_and_version(versionStr: slice): cell {
    return typeAndVersion$handle_type_and_version(typeStr, versionStr);
}
