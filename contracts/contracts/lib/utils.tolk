import "@stdlib/tvm-dicts.tolk";

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
fun Iterator<T>.countBytes(self): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs) = self.data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_DATA);
    return dataBitsSize / 8;
}

// TODO: mark functions as @pure
struct UMap<K, V> {
    value: dict;
    keyLen: uint16; // TODO: get rid of keylen to save storage space, wish we could us a type param
}

@inline
fun UMap<K, V>.new(keyLen: int): UMap<K, V> {
    return UMap { value: createEmptyDict(), keyLen }
}

@inline
fun UMap<K, V>.isEmpty(self): bool {
    return self.value.dictIsEmpty();
}

// TODO: add get! variant that asserts value exists

@inline
fun UMap<K, V>.get(self, key: K): (V?, bool) {
    val (value, exists) = self.value.uDictGet(self.keyLen, key);
    if (!exists) {
        return (null, false);
    }
    return (V.fromSlice(value!), true);
}

@inline
fun UMap<K, V>.set(mutate self, key: K, value: V): void {
    return (self.value.uDictSet(self.keyLen, key, value.toCell().beginParse()));
}

@inline
fun UMap<K, V>.getRef(self, key: K): (V?, bool) {
    val (value, exists) = self.value.uDictGetRef(self.keyLen, key);
    if (!exists) {
        return (null, false);
    }
    return (V.fromCell(value!), true);
}

@inline
fun UMap<K, V>.setRef(mutate self, key: K, value: V): void {
    return (self.value.uDictSetRef(self.keyLen, key, value.toCell()));
}



fun Iterator<T>.has(mutate self, elem: T): bool {
    while (!self.empty()) {
        val current = self.next();
        if (current == elem) {
            return true;
        }
    }
    return false;
}

//TODO: I am not sure if it is more efficient to use a tuple or a dictionary here
//      Using tuple the complexity is O(n^2) but using dictionaries we need to create cells which probably costs more gas
@inline
fun Iterator<T>.hasDuplicates(mutate self): bool {
    var visited = createEmptyTuple();
    while (!self.empty()) {
        val current = self.next();
        if (has(current, visited)) {
            return true;
        } else {
            visited.push<T>(current);
        }
    }
    return false;
}

@inline
fun has<T>(element: T, tuple: tuple) {
    val size = tuple.size();
    var i = 0;
    while(i < size){
        if (tuple.get<T>(i) == element) {
            return true;
        }
    }
    return false;
}
