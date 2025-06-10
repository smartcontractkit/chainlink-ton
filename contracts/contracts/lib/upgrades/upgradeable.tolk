import "@stdlib/tvm-lowlevel";
import "@stdlib/tvm-dicts.tolk";

// TODO opcode from hashed name
struct (0x0000000A) Upgrade {
    queryId: uint64;
    code: cell;
}

fun upgradeable$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool {
    try {
        var upgrade = Upgrade.fromSlice(msgBody);

        var data = contract.getData();
        debug.printString("Upgrade received:");
        doUpgrade(upgrade.code);
        return true;
    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return false; // ignore unknown opcodes
    }

}

fun doUpgrade(code: cell) {
    contract.setCodePostponed(code);
    debug.printString("Code postponed, now migrating data...");
    var cont = transformSliceToContinuation(code.beginParse());
    debug.printString("Loading continuation as current code...");
    setTvmRegisterC3(cont);
    debug.printString("Jumping to migration function...");
    wouldBeMigrateFunction();
}

fun wouldBeMigrateFunction(): void asm "1666 JMP";