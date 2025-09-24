const ERROR_OUT_OF_RANGE = 5;

const LEAF_DOMAIN_SEPARATOR: slice = stringHexToSlice("0000000000000000000000000000000000000000000000000000000000000000");

// 1-byte length prefixed byte slice (up to 64 bytes)
// Almost all uses need to Cell<> box this type because it can be sized up to 8+512 bits
type CrossChainAddress = slice;

fun CrossChainAddress.packToBuilder(self, mutate b: builder) {
    val nBits = self.remainingBitsCount();
    assert(nBits % 8 == 0, ERROR_OUT_OF_RANGE);
    val nBytes = nBits / 8;
    assert(nBytes <= 64, ERROR_OUT_OF_RANGE);
    b.storeUint(nBytes, 8);
    b.storeSlice(self);
}

fun CrossChainAddress.unpackFromSlice(mutate s: slice) {
    val nBytes= s.loadUint(8);
    assert(nBytes <= 64, ERROR_OUT_OF_RANGE);
    return s.loadBits(nBytes * 8);
}

struct RampMessageHeader { // 512
    messageId: uint256;
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    sequenceNumber: uint64;
    nonce: uint64;
}





