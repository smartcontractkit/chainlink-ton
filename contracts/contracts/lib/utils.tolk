import "@stdlib/tvm-dicts.tolk";
import "@stdlib/lisp-lists"

const ERROR_WRONG_OP = 0xffff;
const ERROR_INVALID_DATA = 0x77;
const ERROR_BITMAP_OUT_OF_BOUNDS = 0x78;

/// TODO: is this enough? do we make this configurable?
///
/// The default message budget fee for messages (replies, notifications),
/// for which the value is not explicitly set, and we're not sending
/// the full excess value.
const DEFAULT_MESSAGE_BUDGET_FEE = ton("0.01");

/// Returns the global ID of the current blockchain (chain ID).
fun globalId(): int {
    // Notice: configParam(19)! will be available (non-null)
    return blockchain.configParam(19)!.beginParse().loadInt(32);
}

/// Computes the Keccak-256 hash of the given data.
@pure
fun keccak256(data: slice): uint256
    asm "1 PUSHINT HASHEXT_KECCAK256";

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

// For address snake data
@inline
fun countAddresses(data: cell): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs) = data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % ADDR_KEY_LEN == 0, ERROR_INVALID_DATA);
    return dataBitsSize / ADDR_KEY_LEN;
}

@inline
fun Iterator<T>.has(mutate self, elem: T): bool {
    while (!self.empty()) {
        val current = self.next();
        if (current == elem) {
            return true;
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

@inline
fun Iterator<T>.size(self, elemSize: int): int {
    return self.countBytes() / elemSize
}

// https://github.com/ton-org/ton-core/blob/213fed91d6f63d978c27588509e15ab53c8bafdb/src/dict/Dictionary.ts#L425
const ADDR_KEY_LEN = 267;

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

struct Bitmap256 {
    bits: uint256;
}

@inline
fun Bitmap256.new(): Bitmap256 {
    return Bitmap256 { bits: 0 };
}

@inline
fun Bitmap256.set(mutate self, index: int): void {
    assert(index >= 0 && index < 256, ERROR_BITMAP_OUT_OF_BOUNDS);
    self.bits = self.bits | (1 << index);
}

@inline
fun Bitmap256.has(self, index: int): bool {
    assert(index >= 0 && index < 256, ERROR_BITMAP_OUT_OF_BOUNDS);
    return (self.bits & (1 << index)) != 0;
}
