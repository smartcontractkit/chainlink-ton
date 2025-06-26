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

const ERROR_INVALID_DATA = 0x77;

// Expensive to calculate
@pure
fun Iterator<T>.countBytes(self): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs, traversed) = self.data.calculateSize(maxCells);
    assert(traversed, ERROR_INVALID_DATA);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_DATA);
    return dataBitsSize / 8;
}

import "@stdlib/tvm-dicts.tolk";

// TODO: mark functions as @pure
struct Map<V> {
    value: dict;
    keyLen: uint16;
}

@inline
fun Map<V>.new(keyLen: int): Map<V> {
    return Map { value: createEmptyDict(), keyLen }
}

@inline
fun Map<V>.isEmpty(self): bool {
    return self.value.dictIsEmpty();
}

@inline
fun Map<V>.get(self, key: slice): (V?, bool) {
    val (value, exists) = self.value.sDictGet(self.keyLen, key);
    if (!exists) {
        return (null, false);
    }
    return (V.fromSlice(value!), true);
}

@inline
fun Map<V>.set(mutate self, key: slice, value: V): void {
    return self.value.sDictSet(self.keyLen, key, value.toCell().beginParse());
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
