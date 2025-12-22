import "../../lib/math.tolk"

// Test wrapper for math library functions
fun onInternalMessage(in: InMessage) {
    // ignore empty messages, "wrong opcode" for others
    assert (in.body.isEmpty()) throw 0xFFFF
}

get fun get_safeAdd(a: int, b: int): (int, int) {
    return safeAdd(a, b);
}

get fun get_safeProd(a: int, b: int): (int, int) {
    return safeProd(a, b);
}

get fun get_mustAdd(a: int, b: int, errCode: int): int {
    return mustAdd(a, b, errCode);
}

get fun get_mustProd(a: int, b: int, errCode: int): int {
    return mustProd(a, b, errCode);
}

get fun get_mustCastToCoin(value: coins, errCode: int): coins {
    return mustCastToCoin(value, errCode);
}
