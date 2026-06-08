// This type works as a wrapper for RemainingBitsAndRefs that implements
// automatic serialization/deserialization. It determines whether to store the
// data directly as bits or as a reference to a cell, depending on available
// space.
type RemainingBitsOrRef<T> = T;

fun RemainingBitsOrRef<T>.packToBuilder(self, mutate b: builder): void {
    val contentCell = (self as T).toCell();
    val (contentBits, contentRefs) = contentCell.beginParse().remainingBitsAndRefsCount();
    val availableBits = 1023 - b.bitsCount();
    val availableRefs = 4 - b.refsCount();
    if (availableBits < contentBits + 1 || availableRefs < contentRefs) {
        // not enough space, create a new cell
        b.storeBool(true);
        b.storeRef(contentCell);
    } else {
        // can be inlined
        b.storeBool(false);
        b.storeSlice(contentCell.beginParse());
    }
}

fun RemainingBitsOrRef<T>.unpackFromSlice(mutate s: slice): RemainingBitsOrRef<T> {
    val isRef = s.loadBool();
    var result: RemainingBitsOrRef<T>;
    if (isRef) {
        val c = s.loadRef();
        result = T.fromCell(c) as RemainingBitsOrRef<T>;
    } else {
        result = T.fromSlice(s) as RemainingBitsOrRef<T>;
    }
    return result;
}