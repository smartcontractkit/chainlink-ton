const ERROR_INVALID_DATA = 0x77;

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

@inline @pure
fun Iterator<T>.new(data: cell): Iterator<T> {
    return Iterator<T> { data: data.beginParse() };
}

@inline @pure
fun Iterator<T>.empty(self): bool {
<<<<<<< HEAD
    return self.data.isEmpty()
=======
    return self.data.isEndOfBits() && self.data.isEndOfRefs();
>>>>>>> 59fe496 (Update contracts to tolk 1.0)
}


@inline @pure
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
fun Iterator<T>.countBytes(self): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs) = self.data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_DATA);
    return dataBitsSize / 8;
}

@inline
fun Iterator<T>.size(self, elemSize: int): int {
    return self.countBytes() / elemSize
}

struct TupleIterator<T> {
    pos: int = 0;
    len: int; // TLEN is 26 gas, we cache the value for minimal savings
    data: tuple;
}

@inline @pure
fun TupleIterator<T>.new(data: tuple) {
    return TupleIterator<T> { data, len: data.size() };
}

@inline @pure
fun TupleIterator<T>.empty(self): bool {
    // TODO: should we cache data.size()?
    return self.pos >= self.len
}


@inline @pure
fun TupleIterator<T>.next(mutate self): T {
    var offset = self.pos;
    self.pos += 1;
    return self.data.get<T>(offset);
}

@inline @pure
fun TupleIterator<T>.size(self, elemSize: int): int {
    // elemSize is ignored since we know exact size,
    // param is there for interface compatibility
    return self.len;
}
