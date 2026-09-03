// SPDX-License-Identifier: MIT
//
// EVM ABI cell-tree reading utilities.
//
// TON cells hold at most 1023 bits (~127 bytes), so large EVM ABI payloads
// span multiple cells linked via refs. These helpers navigate that tree by
// byte offset, mirroring the Solidity indexing used in report verification.

import "../../lib/utils"
import "errors"

// ─── Low-level slice helpers ─────────────────────────────────────────────────

// Skip `toSkip` bits through a cell tree, following refs as needed.
// TVM loadUint accepts at most 256 bits, so large skips are chunked.
fun skipBits(root: cell, toSkip: int): slice {
    var s = root.beginParse();
    var remaining = toSkip;
    while (remaining > 0) {
        val avail = s.remainingBitsCount();
        if (avail >= remaining) {
            var n = remaining;
            while (n > 256) { s.loadUint(256); n -= 256; }
            if (n > 0) { s.loadUint(n); }
            remaining = 0;
        } else {
            var n = avail;
            while (n > 256) { s.loadUint(256); n -= 256; }
            if (n > 0) { s.loadUint(n); }
            remaining -= avail;
            assert(s.remainingRefsCount() > 0, Verifier_Error.MalformedPayload);
            s = s.loadRef().beginParse();
        }
    }
    return s;
}

// Load a uint256 from a slice, crossing into the next ref cell if needed.
fun loadUint256CrossCell(s: slice): int {
    val bits = s.remainingBitsCount();
    if (bits >= 256) {
        return s.loadUint(256);
    }
    val hiCount = bits;
    val hi = hiCount > 0 ? s.loadUint(hiCount) : 0;
    assert(s.remainingRefsCount() > 0, Verifier_Error.MalformedPayload);
    val lo = 256 - hiCount;
    return (hi << lo) | s.loadRef().beginParse().loadUint(lo);
}

// ─── Public ABI reading functions ─────────────────────────────────────────────

// Read a uint256 at a byte offset inside a cell tree.
fun readUint256At(root: cell, byteOffset: int): int {
    val s = skipBits(root, byteOffset * 8);
    return loadUint256CrossCell(s);
}

// Read `length` bytes starting at `byteOffset` from a cell tree, returning
// them packed into a snake-encoded cell chain (each cell ≤ 1016 bits, next
// cell stored as the single ref). This matches the input format expected by
// keccak256SnakeCell.
fun readBytesAt(root: cell, byteOffset: int, length: int): cell {
    var s = skipBits(root, byteOffset * 8);
    val maxBits = 1016;  // leave room for one ref per cell

    // We build cells in order and chain them last-to-first (snake encoding).
    // Use a fixed-size array: max cells = ceil(length*8 / 1016) + 1.
    // For realistic report sizes this stays small.
    var cells: map<uint32, cell> = [];
    var cellIdx: uint32 = 0;
    var b = beginCell();
    var stored = 0;
    var remaining = length * 8;

    while (remaining > 0) {
        if (s.remainingBitsCount() == 0) {
            assert(s.remainingRefsCount() > 0, Verifier_Error.MalformedPayload);
            s = s.loadRef().beginParse();
        }

        val canRead = min(s.remainingBitsCount(), remaining);
        val space = maxBits - stored;

        if (canRead <= space) {
            var n = canRead;
            while (n > 256) { b.storeUint(s.loadUint(256), 256); n -= 256; }
            if (n > 0) { b.storeUint(s.loadUint(n), n); }
            stored += canRead;
            remaining -= canRead;
        } else {
            // Fill current cell to capacity, then open a new one.
            var n = space;
            while (n > 256) { b.storeUint(s.loadUint(256), 256); n -= 256; }
            if (n > 0) { b.storeUint(s.loadUint(n), n); }
            remaining -= space;
            cells.set(cellIdx, b.endCell());
            cellIdx += 1;
            b = beginCell();
            stored = 0;
        }
    }

    // Flush the last (possibly partial) cell.
    cells.set(cellIdx, b.endCell());

    // Chain cells last-to-first to form snake encoding.
    var result = cells.get(cellIdx).loadValue();
    var ci = cellIdx - 1;
    while (ci >= 0) {
        var src = cells.get(ci).loadValue().beginParse();
        var outer = beginCell();
        var n = src.remainingBitsCount();
        while (n > 256) { outer.storeUint(src.loadUint(256), 256); n -= 256; }
        if (n > 0) { outer.storeUint(src.loadUint(n), n); }
        result = outer.storeRef(result).endCell();
        ci -= 1;
    }

    return result;
}

// ─── Keccak helpers ───────────────────────────────────────────────────────────

// Fixed-arity HASHEXT_KECCAK256 helpers.
// HASHEXT_KECCAK256 concatenates the data bits of N slices natively, so refs
// in the slices are ignored. The asm(a b ...) annotation controls push order:
// first-listed argument goes deepest → first in the concatenation.
fun _keccak256x1(s0: slice): uint256
    asm "1 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x2(s0: slice, s1: slice): uint256
    asm(s0 s1) "2 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x3(s0: slice, s1: slice, s2: slice): uint256
    asm(s0 s1 s2) "3 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x4(s0: slice, s1: slice, s2: slice, s3: slice): uint256
    asm(s0 s1 s2 s3) "4 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x5(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice): uint256
    asm(s0 s1 s2 s3 s4) "5 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x6(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice, s5: slice): uint256
    asm(s0 s1 s2 s3 s4 s5) "6 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x7(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice, s5: slice, s6: slice): uint256
    asm(s0 s1 s2 s3 s4 s5 s6) "7 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x8(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice, s5: slice, s6: slice, s7: slice): uint256
    asm(s0 s1 s2 s3 s4 s5 s6 s7) "8 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x9(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice, s5: slice, s6: slice, s7: slice, s8: slice): uint256
    asm(s0 s1 s2 s3 s4 s5 s6 s7 s8) "9 PUSHINT HASHEXT_KECCAK256";
fun _keccak256x10(s0: slice, s1: slice, s2: slice, s3: slice, s4: slice, s5: slice, s6: slice, s7: slice, s8: slice, s9: slice): uint256
    asm(s0 s1 s2 s3 s4 s5 s6 s7 s8 s9) "10 PUSHINT HASHEXT_KECCAK256";

// Compute keccak256 over a snake-encoded cell chain.
// Walks the chain consuming refs (so each slice retains only its data bits),
// then dispatches to the matching fixed-arity HASHEXT_KECCAK256 helper.
// Supports chains of up to 10 cells (~1270 bytes of payload data).
fun keccak256SnakeCell(root: cell): uint256 {
    var s0 = root.beginParse();
    if (s0.remainingRefsCount() == 0) { return _keccak256x1(s0); }
    var s1 = s0.loadRef().beginParse();
    if (s1.remainingRefsCount() == 0) { return _keccak256x2(s0, s1); }
    var s2 = s1.loadRef().beginParse();
    if (s2.remainingRefsCount() == 0) { return _keccak256x3(s0, s1, s2); }
    var s3 = s2.loadRef().beginParse();
    if (s3.remainingRefsCount() == 0) { return _keccak256x4(s0, s1, s2, s3); }
    var s4 = s3.loadRef().beginParse();
    if (s4.remainingRefsCount() == 0) { return _keccak256x5(s0, s1, s2, s3, s4); }
    var s5 = s4.loadRef().beginParse();
    if (s5.remainingRefsCount() == 0) { return _keccak256x6(s0, s1, s2, s3, s4, s5); }
    var s6 = s5.loadRef().beginParse();
    if (s6.remainingRefsCount() == 0) { return _keccak256x7(s0, s1, s2, s3, s4, s5, s6); }
    var s7 = s6.loadRef().beginParse();
    if (s7.remainingRefsCount() == 0) { return _keccak256x8(s0, s1, s2, s3, s4, s5, s6, s7); }
    var s8 = s7.loadRef().beginParse();
    if (s8.remainingRefsCount() == 0) { return _keccak256x9(s0, s1, s2, s3, s4, s5, s6, s7, s8); }
    var s9 = s8.loadRef().beginParse();
    return _keccak256x10(s0, s1, s2, s3, s4, s5, s6, s7, s8, s9);
}

// Compute keccak256 over exactly two slices concatenated.
// Used for the signing hash: 768 bits (reportHash || c0 || c1) in s1, 256 bits (c2) in s2.
// The 2 PUSHINT HASHEXT_KECCAK256 opcode hashes across multiple cells natively.
fun keccak256x2(s1: slice, s2: slice): uint256
    asm(s1 s2) "2 PUSHINT HASHEXT_KECCAK256";
