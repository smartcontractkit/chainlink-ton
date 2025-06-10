import "@stdlib/tvm-lowlevel";
import "@stdlib/tvm-dicts.tolk";

// TODO opcode from hashed name
struct (0x0000000A) Upgrade {
    queryId: uint64;
    code: cell;
}

fun upgradeable$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice, migrate: (cell) -> cell): bool {
    try {
        var upgrade = Upgrade.fromSlice(msgBody);

        var data = contract.getData();
        debug.printString("Upgrade received:");
        doUpgrade(upgrade.code, migrate);
        return true;
    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }

}

fun doUpgrade(code: cell, migrate: (cell) -> cell) {
    contract.setCodePostponed(code);
    debug.printString("Code postponed, now migrating data...");
    var cont = transformSliceToContinuation(code.beginParse());
    debug.printString("Loading continuation as current code...");
    setTvmRegisterC3(cont);
    debug.printString("Jumping to migration function...");

    debug.printString("Migrating from StorageV1 to StorageV2...");
    // Get storage cell
    var c = contract.getData();
    var newStorage = migrate(c);
    // Save the new storage cell
    contract.setData(newStorage);
    debug.printString("Migration completed successfully.");
}
