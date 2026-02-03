// SPDX-License-Identifier: MIT
import "./../../lib/secp256k1.tolk";

// Test wrapper for secp256k1 verifier functions
fun onInternalMessage(in: InMessage) {
    // ignore empty messages, "wrong opcode" for others
    assert (in.body.isEmpty()) throw 0xFFFF
}

get fun get_isSignatureValid_secp256k1(hash: int, sig: slice, pubKey: int, parity: int): bool {
    return isSignatureValid_secp256k1(hash, sig, pubKey, parity);
}

get fun get_evm_ecrecoverFrom(hash: int, sig: slice): int {
    return evm_ecrecoverFrom(hash, sig);
}
