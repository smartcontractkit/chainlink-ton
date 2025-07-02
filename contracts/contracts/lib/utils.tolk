const ERROR_INVALID_DATA = 0x77;

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

// Iterates over arrays stored as snake data.
struct Iterator<T> {
    data: slice;
}

@inline
fun Iterator<T>.new(data: cell) {
    return Iterator<T> { data: data.beginParse() };
}

@inline
fun Iterator<T>.empty(self): bool {
    return self.data.isEnd()
}


@inline
fun Iterator<T>.next(mutate self): T {
    var (bits, refs) = self.data.remainingBitsAndRefsCount();
    if (bits == 0) {
        // TODO: assert refs == 1
        // TODO: load vs preload?
        self.data = self.data.loadRef().beginParse();
    }
    return self.data.loadAny<T>();
}

// Expensive to calculate
@inline
fun Iterator<T>. countBytes(self): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs) = self.data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_DATA);
    return dataBitsSize / 8;
}

