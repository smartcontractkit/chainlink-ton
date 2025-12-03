tolk 1.2

import "@stdlib/lisp-lists"

fun onInternalMessage(in: InMessage) {
    return;
}

get fun list(): tuple? {
    var list: tuple? = null;
    list = listPrepend(beginCell().toSlice(), list);
    list = listPrepend(beginCell().toSlice(), list);
    // This also fails returning an address e.g.:
    // list = listPrepend(beginCell().toSlice(), contract.getAddress());
    return list;
}