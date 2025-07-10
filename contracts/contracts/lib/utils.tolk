import "@stdlib/tvm-dicts.tolk";

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
    return self.data.isEmpty()
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

// https://github.com/ton-org/ton-core/blob/213fed91d6f63d978c27588509e15ab53c8bafdb/src/dict/Dictionary.ts#L425
const ADDR_KEY_LEN = 267;

// NOTE: this assumes the slice keys are address values
struct Map<V> {
    value: dict;
}

@inline @pure
fun Map<V>.new(): Map<V> {
    return Map { value: createEmptyDict() }
}

@inline @pure
fun Map<V>.isEmpty(self): bool {
    return self.value.dictIsEmpty();
}

@inline @pure
fun Map<V>.get(self, key: address): (V?, bool) {
    val (value, exists) = self.value.sDictGet(ADDR_KEY_LEN, key as slice);
    if (!exists) {
        return (null, false);
    }
    return (V.fromSlice(value!), true);
}

@inline
fun Map<V>.mustGet(self, key: address, errorCode: int): V {
    val (value, exists) = self.value.sDictGet(ADDR_KEY_LEN, key as slice);
    assert(exists, errorCode);
    return V.fromSlice(value!);
}

@inline @pure
fun Map<V>.set(mutate self, key: address, value: V): void {
    return self.value.sDictSet(ADDR_KEY_LEN, key as slice, value.toCell().beginParse());
}

@pure
fun dict.sDictGetNext(self, keyLen: int, pivot: slice): (slice?, slice?, bool)
    asm(pivot self keyLen -> 1 0 2) "DICTGETNEXT" "NULLSWAPIFNOT2"

@inline @pure
fun Map<V>.min(self): (address?, V?, bool) {
    val (key, value, exists) = self.value.sDictGetFirst(ADDR_KEY_LEN);
    if (!exists) {
        return (null, null, false);
    }
    return (key as address?, V.fromSlice(value!), true);
}

@inline @pure
fun Map<V>.next(self, key: address): (address?, V?, bool) {
    val (nextKey, value, exists) = self.value.sDictGetNext(ADDR_KEY_LEN, key as slice);
    if (!exists) {
        return (null, null, false);
    }
    return (nextKey as address?, V.fromSlice(value!), true);
}

@inline @pure
fun Map<V>.delete(mutate self, key: address): bool {
    return self.value.sDictDelete(ADDR_KEY_LEN, key as slice);
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

@inline @pure
fun UMap<K, V>.get(self, key: K): (V?, bool) {
    val (value, exists) = self.value.uDictGet(self.keyLen, key);
    if (!exists) {
        return (null, false);
    }
    return (V.fromSlice(value!), true);
}

@inline
fun UMap<K, V>.mustGet(self, key: K, errorCode: int): V {
    val (maybeValue, exists) = self.value.uDictGet(self.keyLen, key);
    assert(exists, errorCode);
    return V.fromSlice(maybeValue!);
}

@inline @pure
fun UMap<K, V>.getRef(self, key: K): (V?, bool) {
    val (value, exists) = self.value.uDictGetRef(self.keyLen, key);
    if (!exists) {
        return (null, false);
    }
    return (V.fromCell(value!), true);
}

@inline
fun UMap<K, V>.mustGetRef(self, key: K, errorCode: int): V {
    val (maybeValue, exists) = self.value.uDictGetRef(self.keyLen, key);
    assert(exists, errorCode);
    return V.fromCell(maybeValue!);
}

@inline @pure
fun UMap<K, V>.set(mutate self, key: K, value: V): void {
    return (self.value.uDictSet(self.keyLen, key, value.toCell().beginParse()));
}

@inline @pure
fun UMap<K, V>.setRef(mutate self, key: K, value: V): void {
    return (self.value.uDictSetRef(self.keyLen, key, value.toCell()));
}

@inline @pure
fun UMap<K, V>.min(self): (K?, V?, bool) {
    val (key, value, exists) = self.value.uDictGetFirst(ADDR_KEY_LEN);
    if (!exists) {
        return (null, null, false);
    }
    return (key, V.fromSlice(value!), true);
}

@inline @pure
fun UMap<K, V>.next(self, key: K): (K?, V?, bool) {
    val (nextKey, value, exists) = self.value.uDictGetNext(self.keyLen, key);
    if (!exists) {
        return (null, null, false);
    }
    return (nextKey, V.fromSlice(value!), true);
}

@inline @pure
fun UMap<K, V>.replace(mutate self, key: K, value: V): bool {
    return (self.value.uDictSetIfExists(self.keyLen, key, value.toCell().beginParse()));
}

@inline @pure
fun UMap<K, V>.delete(mutate self, key: K): bool {
    return self.value.sDictDelete(self.keyLen, key);
}
