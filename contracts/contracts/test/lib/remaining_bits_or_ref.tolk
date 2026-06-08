// SPDX-License-Identifier: MIT
tolk 1.4.1

import "../../lib/remaining_bits_or_ref"


contract RemainingBitsOrRefTestWrapper {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "Test wrapper for RemainingBitsOrRef library"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF
}

const MAX_CELLS = 4;

struct IncompleteCell {
    _1: uint256 = 1
}

// 1 bit is used to indicate whether the data is stored inline or as a reference
struct FullCell {
    _1: uint256 = 1
    _2: uint256 = 2
    _3: uint256 = 3
    _4: RemainingBitsOrRef<uint254> = 4
}

struct JustOverFullCell {
    _1: uint256 = 1
    _2: uint256 = 2
    _3: uint256 = 3
    _4: RemainingBitsOrRef<uint255> = 4
}

struct _WithReference {
    _12: uint254 = 12
    _cell: Cell<uint256>
}

fun New_WithReference(): _WithReference {
    return _WithReference { _cell: (34 as uint256).toCell() };
}

struct InlinedWithReference {
    _1: uint256 = 1
    _2: uint256 = 2
    _3: uint256 = 3
    _4: RemainingBitsOrRef<_WithReference>
}

fun NewInlinedWithReference(): InlinedWithReference {
    return InlinedWithReference { _4: New_WithReference() };
}

struct _TooManyReferences {
    _1: Cell<uint256>
    _2: Cell<uint256>
    _3: Cell<uint256>
    _4: Cell<uint256>
}

fun _newTooManyReferences(): _TooManyReferences {
    return _TooManyReferences {
        _1: (11 as uint256).toCell(),
        _2: (12 as uint256).toCell(),
        _3: (13 as uint256).toCell(),
        _4: (14 as uint256).toCell(),
    }
}

struct TooManyReferencesToInline {
    _1: Cell<uint256>
    _2: Cell<uint256>
    _3: Cell<uint256>
    _4: RemainingBitsOrRef<_TooManyReferences>
}

fun NewTooManyReferencesToInline(): TooManyReferencesToInline {
    return TooManyReferencesToInline {
        _1: (1 as uint256).toCell(),
        _2: (2 as uint256).toCell(),
        _3: (3 as uint256).toCell(),
        _4: _newTooManyReferences()
    }
}

/// expected to fit in 256 bits of a single cell
get fun test_incomplete_cell(): cell {
    return RemainingBitsOrRef<IncompleteCell> { }.toCell();
}

/// expected to fit in 1023 bits of a single cell
get fun test_full_cell(): cell {
    return RemainingBitsOrRef<FullCell> { }.toCell();
}

/// expected to require 1024 bits (1 more than full cell), so the 4th field should be stored as a reference
get fun test_just_over_full_cell(): cell {
    return JustOverFullCell { }.toCell();
}

/// expected to fit in 256 bits of a single cell, and the reference come from the root cell
get fun test_inlined_with_reference(): cell {
    return NewInlinedWithReference().toCell();
}

/// expected to be stored as a reference, because inlining would require 5 references which is more than the maximum of 4 allowed 
get fun test_too_many_references_to_inline(): cell {
    return NewTooManyReferencesToInline().toCell();
}