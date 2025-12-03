tolk 1.2

import "../lib/utils"

fun onInternalMessage(in: InMessage) {
    return;
}

get fun list(): tuple? {
    var dict: map<address, bool> = createEmptyMap();
    dict.set(contract.getAddress(), true);
    dict.set(AutoDeployAddress {stateInit: {
        code: createEmptyCell(),
        data: createEmptyCell(),
    }}.calculateAddress(), true);
    return keysLispList(dict);
}