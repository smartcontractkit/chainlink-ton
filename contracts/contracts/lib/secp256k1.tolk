// SPDX-License-Identifier: MIT
import "./utils.tolk";

/// Signature encoding (expected): 1 byte `v` || 32 bytes `r` || 32 bytes `s`.
/// - `v` can be:
///     - 0 or 1 (raw parity / recid low bit),
///     - 27 or 28 (Ethereum legacy, maps to v-27),
///     - EIP-155 style >=35 (parity = (v-35) & 1).
///   Raw recid 2/3 are rejected on-chain to avoid ambiguity (TON ECRECOVER accepts only parity).
/// - `r`, `s`: 32-byte big-endian unsigned integers stored with `storeUint(..., 256)`.
/// - `keccak256` input for EVM address is X||Y where X and Y are serialized 32-byte big-endian.
/// Normalization: use `parityFrom(sig)` or `normalizeV` to obtain a parity bit (0/1) for ECRECOVER.

/// asm ECRECOVER
///
/// Recovers the public key from a secp256k1 signature, identical to Bitcoin/Ethereum operations. 
/// Takes a 32-byte hash as uint256 hash and a 65-byte signature as uint8 v, uint256 r, and uint256 s.
/// In TON, the v value is strictly 0 or 1; no extra flags or extended values are supported.
/// If the public key cannot be recovered, the instruction returns 0. On success, it returns the recovered
/// 65-byte public key as uint8 h, uint256 x1, and uint256 x2, followed by -1.

/// Inline wrapper for the ECRECOVER instruction.
///
/// Returns a 4-tuple: (h, x, y, status)
/// - `h` is the header byte of the recovered public key (int)
/// - `x` and `y` are the X and Y coordinates (uint256)
/// - `status` is non-zero on success, zero on failure (int)
@inline
fun ecrecover(hash: int, v: int, r: int, s: int): (int, int, int, int)
    asm(hash v r s) "ECRECOVER NULLSWAPIFNOT2 NULLSWAPIFNOT";

/// High-S value for secp256k1 (half order). Signatures with s >= HIGH_S are invalid per BIP-62 / EIP-2.
const HIGH_S = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

/// Mask to extract lower 160 bits (Ethereum address)
const ADDRESS_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

/// Normalize common `v` encodings to TON-compatible parity (0 or 1).
/// Accepts raw v values: 0/1 (raw recid), 27/28 (legacy Ethereum), or EIP-155 style (>=35).
/// Throws if value is not recognizable.
fun normalizeV(v_raw: int): int {
    // Accept TON-style parity already (0/1)
    if (v_raw == 0 || v_raw == 1) {
        return v_raw;
    }
    // Legacy Ethereum v (27/28)
    if (v_raw == 27 || v_raw == 28) {
        return (v_raw - 27);
    }
    // EIP-155 style v (>=35) -> parity = (v-35) & 1
    if (v_raw >= 35) {
        return ((v_raw - 35) & 1);
    }
    // unsupported v format
    return -1;
}

/// Extract parity (0 or 1) directly from a signature slice whose first byte is `v` (uint8).
/// This is a convenience helper for callers that receive Ethereum-style signatures
/// encoded as `v||r||s` where `v` is a full byte (27/28 or EIP-155, or 0/1).
fun parityFrom(sig: slice): int {
    val v_raw = sig.loadUint(8);
    return normalizeV(v_raw);
}

/// Verifies a secp256k1 signature encoded in `sig` (v||r||s) against `pubKey` (expected X coordinate)
/// `parity` is the expected parity (0 or 1) of the recovered Y coordinate.
///
/// Returns true if signature is valid and corresponds to (pubKey, parity).
fun isSignatureValid_secp256k1(hash: int, sig: slice, pubKey: int, parity: int): bool {
    var (_, x, y, status) = ecrecoverFrom(hash, sig);
    if (status != 0) {
        return (parity == (y & 1)) & (x == pubKey);
    }
    return false;
}

/// Recover and return the public key (h, x, y, status) from a signature slice (v||r||s).
/// Returns a 4-tuple: (h, x, y, status)
/// - `h` is the header byte of the recovered public key (int)
/// - `x` and `y` are the X and Y coordinates (uint256)
/// - `status` is non-zero on success, zero on failure (int)
fun ecrecoverFrom(hash: int, sig: slice): (int, int, int, int) {
    val v_raw = sig.loadUint(8);
    val r = sig.loadUint(256);
    val s = sig.loadUint(256);

    // enforce low-S rule
    if (s >= HIGH_S) {
        return (0, 0, 0, 0);
    }

    val v = normalizeV(v_raw);
    if (v < 0) {
        return (0, 0, 0, 0);
    }
    return ecrecover(hash, v, r, s);
}

/// EVM ecrecover: returns the 20-byte address (as low 160 bits of keccak256(uncompressed_pubkey[1:65]))
/// Returns 0 on any failure (invalid signature, low-S, recovery failure).
fun evm_ecrecoverFrom(hash: int, sig: slice): int {
    var (_, x, y, status) = ecrecoverFrom(hash, sig);
    if (status == 0) {
        return 0;
    }

    // Build 64-byte (X||Y) and compute keccak256 over it.
    val b = beginCell().storeUint(x, 256).storeUint(y, 256);
    val digest = keccak256(b);

    // Return lower 160 bits
    return digest & ADDRESS_MASK;
}
