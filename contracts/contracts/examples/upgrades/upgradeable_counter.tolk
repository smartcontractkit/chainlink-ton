import "./../../lib/upgrades/upgradeable.tolk";

// TODO opcode from hashed name
/// Instructs the contract to step the counter.
struct (0x7e8764ef) Step {
    queryId: uint64;
}

fun upgradeableCounter$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {    
    // Upgradeable Handlers
    upgradeable$handleMessage(myBalance, msgValue, msgFull, msgBody);
}