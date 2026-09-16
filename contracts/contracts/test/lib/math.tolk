// SPDX-License-Identifier: MIT
import "../../lib/math.tolk"

contract TestLibMath {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.0.0"
    description: "link.chain.ton.test.lib.math"
}

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

get fun get_safePow10(n: uint8): (uint256, int) {
    return safePow10(n);
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

get fun get_mustPow10(n: uint8, errCode: int): uint256 {
    return mustPow10(n, errCode);
}
