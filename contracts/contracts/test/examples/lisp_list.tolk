// SPDX-License-Identifier: MIT
import "@stdlib/lisp-lists"

contract TestLispList {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.0.0"
    description: "link.chain.ton.test.examples.LispList"
    forceAbiExport: (LispListContainer, Byte)
}

struct LispListContainer {
    values: lisp_list<Cell<Byte>>;
}

struct Byte {
    value: uint8;
}

fun onInternalMessage(in: InMessage) {
    assert(in.body.isEmpty()) throw 0xFFFF
}

get fun encodedList(): cell {
    var values: lisp_list<Cell<Byte>> = [];
    values.prependHead(Byte{value: 2}.toCell());
    values.prependHead(Byte{value: 1}.toCell());
    return LispListContainer { values }.toCell();
}

get fun decodeList(encoded: cell): (uint8, uint8) {
    val listContainer = LispListContainer.fromCell(encoded);
    var list = listContainer.values;

    val first = list.popHead().load().value;
    val second = list.popHead().load().value;
    return (first, second);
}
