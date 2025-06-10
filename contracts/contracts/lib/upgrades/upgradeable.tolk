import "@stdlib/tvm-lowlevel";
import "@stdlib/tvm-dicts.tolk";

// TODO opcode from hashed name
struct (0xA) Upgrade {
    code: cell;
}

fun upgradeable$handleMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    try {
        var upgrade = Upgrade.fromSlice(msgBody);

        var data = contract.getData();

        var cont = transformSliceToContinuation(upgrade.code.beginParse());
        debug.print(cont);
        setTvmRegisterC3(cont);
        // var method = cont.get(1666);
        // debug.print(method);

    } catch(exitCode) {
        if (exitCode != 63) { // 63 is the error code for unknown opcode
            throw exitCode; // rethrow other errors
        }
        return; // ignore unknown opcodes
    }

}