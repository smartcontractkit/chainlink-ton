
fun isMessageBounced(msgFlags: int): int
    asm "1 PUSHINT" "AND";

@inline
fun emit<T>(topic: int, body: T) {
    val emitMsg = createExternalLogMessage({
        dest: ExtOutLogBucket { topic },
        body
    });
    emitMsg.send(SEND_MODE_REGULAR);
}

// elemSize: haven't found a way to do sizeof(Struct) yet
// fun storeArray<T>(t: tuple, elemSize: int): cell {
//     val len = t.size();
//     if (len == 0) {
//         return createEmptyCell();
//     }

//     var b = beginCell();
//     var i = 0;

//     // TODO: remove this, we can just iterate until no more space left

//     // length prefix
//     b.storeUint(len, 8);

//     // NOTE: it'd probably be most efficient to serialize in reverse by calling `.pop()`
//     while (i < len) {
//         if (1023 - b.bitsCount() < elemSize) {
//             // create a new link
//             val oldCell = b;
//             b = beginCell();
//             oldCell.storeRef(b);
//         }
//         b.storeAny(t.get<T>(i))
//     }
//     return b.endCell();
// }

// Iterates over arrays stored as snake data.
struct Iterator<T> {
    data: slice;
    elemSize: int; // TODO: some type of compile time sizeof()
}

@inline
fun Iterator<T>.new(data: cell, elemSize: int) {
    return Iterator<T> { data: data.beginParse(), elemSize };
}

@inline
fun Iterator<T>.empty(self): bool {
    return self.data.isEndOfBits()
}

@inline
fun Iterator<T>.next(mutate self): T {
    var (bits, refs) = self.data.remainingBitsAndRefsCount();
    if (bits < self.elemSize) {
        // TODO: assert refs == 1
        // TODO: load vs preload?
        self.data = self.data.loadRef().beginParse();
    }
    return self.data.loadAny<T>();
}
