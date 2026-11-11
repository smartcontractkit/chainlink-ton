const CrossChainAddress_FACILITY_NAME = "link.chain.ton.ccip.lib.CrossChainAddress";
const CrossChainAddress_FACILITY_ID = CrossChainAddress_FACILITY_NAME.crc32() % 640 + 10;  // 298

enum CrossChainAddress_Error {
    InvalidBitLength = CrossChainAddress_FACILITY_ID,
    TooManyBytes,
}

/// 1-byte length prefixed byte slice (up to 64 bytes)
/// 1-byte length prefixed byte slice (up to 64 bytes)
/// Almost all uses need to Cell<> box this type because it can be sized up to 8+512 bits
/// abi.serialization = (8, 520, 0, 0)
type CrossChainAddress = slice;

fun CrossChainAddress.packToBuilder(self, mutate b: builder) {
    val nBits = self.remainingBitsCount();
    assert(nBits % 8 == 0) throw (CrossChainAddress_Error.InvalidBitLength);
    val nBytes = nBits / 8;
    assert(nBytes <= 64) throw (CrossChainAddress_Error.TooManyBytes);
    b.storeUint(nBytes, 8);
    b.storeSlice(self);
}

fun CrossChainAddress.unpackFromSlice(mutate s: slice): slice {
    val nBytes= s.loadUint(8);
    assert(nBytes <= 64) throw (CrossChainAddress_Error.TooManyBytes);
    return s.loadBits(nBytes * 8);
}