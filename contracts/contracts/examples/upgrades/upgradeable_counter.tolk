import "./../../lib/upgrades/upgradeable.tolk";

// TODO opcode from hashed name
/// Instructs the contract to step the counter.
struct (0x00000001) Step {
    queryId: uint64;
}

fun upgradeableCounter$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice, migrate: () -> void): bool {    
    // Upgradeable Handlers
    return upgradeable$handleMessage(myBalance, msgValue, msgFull, msgBody, migrate);
}