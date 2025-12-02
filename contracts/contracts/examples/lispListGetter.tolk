tolk 1.2

import "@stdlib/lisp-lists"

fun onInternalMessage(in: InMessage) {
    return;
}

get fun list(): tuple? {
    var list: tuple? = null;
    list = listPrepend(contract.getAddress(), list);
    return list;
}