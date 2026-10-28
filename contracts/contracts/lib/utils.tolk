// SPDX-License-Identifier: MIT
import "@stdlib/lisp-lists"
import "@stdlib/exotic-cells"
import "@stdlib/gas-payments";

const Utils_FACILITY_NAME = "link.chain.ton.lib.Utils";
const Utils_FACILITY_ID = Utils_FACILITY_NAME.crc32() % 640 + 10; // 135
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

enum Utils_Error {
    InvalidData = Utils_FACILITY_ID * 100
    BitmapOutOfBounds
}

/// Returns the facility ID for the given CRC32 key (e.g. "link.chain.ton.mcms.Timelock".crc32()).
/// Returns a value in range 10..649 (640 values).
fun getFacilityId(crc32Key: int): uint16 {
    return (crc32Key % 640) + 10;
}

/// Returns an error code composed from facility and local code (max 2^16-1).
fun getErrorCode(crc32Key: int, local: uint16): uint16 {
    val code = getFacilityId(crc32Key) * 100 + local;
    assert(code <= 65535, 4); // exit code 4: Integer overflow
    return code
}

/// Largest variable-size payload (CCIP message data, address lists) the contracts walk;
/// the CCIP min values are calibrated for a message of this size.
const MAX_DATA_CELLS = 256;

/// Returns the number of bytes encoded in a snake cell chain, matching how the Go
/// bindings encode/decode snake data (cciplib `common.SnakeBytes`/`common.SnakedCell`,
/// see packByteArrayToCell/unloadCellToByteArray): a strict linear chain of cells,
/// each holding whole bytes, linked by a single ref to the next cell.
///
/// Throws Utils_Error.InvalidData if the cell is not a strict snake chain:
/// - any cell has more than one ref (the chain branches),
/// - any cell holds a non-whole number of bytes (the Go decoder pads partial
///   bytes per cell, so the count would not match),
/// - the chain is deeper than MAX_DATA_CELLS.
fun snakedBytesLen(data: cell): int {
    val maxCells = MAX_DATA_CELLS;
    var s = data.beginParse();
    var totalBits = 0;
    var cellsCount = 0;
    var done = false;
    while (!done) {
        cellsCount += 1;
        assert(cellsCount <= maxCells, Utils_Error.InvalidData);
        val (bits, refs) = s.remainingBitsAndRefsCount();
        assert(bits % 8 == 0, Utils_Error.InvalidData);
        totalBits += bits;
        if (refs == 0) {
            done = true;
        } else {
            // Strict chain: exactly one ref, pointing to the next cell.
            assert(refs == 1, Utils_Error.InvalidData);
            s = s.loadRef().beginParse();
        }
    }
    return totalBits / 8;
}

/// Maximum size of a bounced message
///
/// Notice: documentation for in.bouncedBody is off, as it states the bounced body
/// will be 0xffffffff + 224 bits, but the actual size is 0xffffffff + 256 bits.
/// Confimred with TON team: 256 is "original body size", so in.bouncedBody is 288 in total
/// Note: In TVM 12, "rich bounced messages" will be added — containing all the original message that was sent
const BOUNCE_MSG_SIZE_MAX = 256;

// Represents the default blockchain (chain ID) - when configParam(19) not set
const GLOBAL_ID_UNSET = -1;

/// Returns the global ID of the current blockchain (chain ID).
fun globalId(): int {
    // Notice: configParam(19) should be available (TVM upgrade 04/24)
    val param = blockchain.configParam(19);
    return param != null
        ? param!.beginParse().loadInt(32)
        : GLOBAL_ID_UNSET;
}

/// Extracts the (potential) bounced body from the given slice (message body).
fun extractBouncedBody(body: slice): uint256 {
    val remainingBits = body.remainingBitsCount();
    return remainingBits < BOUNCE_MSG_SIZE_MAX
        ? body.loadUint(remainingBits)
        : body.loadUint(BOUNCE_MSG_SIZE_MAX);
}

/// The zero internal (standard) address: workchain 0 with an all-zero 256-bit hash.
/// This is the TON analog of EVM's `address(0)`.
const ZERO_ADDRESS = address("0:0000000000000000000000000000000000000000000000000000000000000000");

/// Returns true if the given address is the zero address.
@pure
fun isZeroAddress(addr: address): bool {
    return addr == ZERO_ADDRESS;
}

/// Computes the Keccak-256 hash of the given data.
fun keccak256(data: builder): uint256
    asm "1 PUSHINT HASHEXT_KECCAK256";

@inline
fun emit<T>(topic: int, body: T, sendMode: int = SEND_MODE_REGULAR) {
    val emitMsg = createExternalLogMessage({
        dest: ExtOutLogBucket { topic },
        body
    });
    emitMsg.send(sendMode);
}

type SnakedCell<T> = cell;

fun SnakedCell<T>.iter(self): Iterator<T> {
    return Iterator<T>.new(self)
}

fun SnakedCell<T>.empty(self): bool {
    return self.beginParse().isEmpty();
}

// Helper to extract the single item from a SnakedCell, and assert that there is only one
fun SnakedCell<T>.asSingle(self): T? {
    var it = self.iter();
    if (it.empty()) {
        return null;
    }
    val token = it.next();
    if (!it.empty()) {
        return null;
    }
    return token
}

// Creates an iterator that iterates over arrays stored as snake data.
// Parsing is lazy: construction never touches the cell, so `iter()` cannot
// throw. Validation errors (exotic cells, malformed snakes) surface from the
// accessors instead.
struct Iterator<T> {
    root: cell
    buffer: slice?
}

@inline
fun Iterator<T>.new(data: cell): Iterator<T> {
    return Iterator<T> { root: data, buffer: null };
}

// The head's slice. Parses on first use.
@inline
fun Iterator<T>.parsed(self): slice {
    if (self.buffer == null) {
        val (data, isExotic) = self.root.beginParseSpecial();
        assert(!isExotic, Utils_Error.InvalidData);
        return data;
    }
    return self.buffer;
}

@inline
fun Iterator<T>.empty(self): bool {
    return self.parsed().isEmpty();
}

@inline
fun Iterator<T>.next(mutate self): T {
    var data = self.parsed();
    val (bits, refs) = data.remainingBitsAndRefsCount();
    if (bits == 0) {
        // for snakeData to be well formed, there should only be one reference
        assert(refs == 1, Utils_Error.InvalidData);
        val (nextSlice, isExotic) = data.loadRef().beginParseSpecial();
        assert(!isExotic, Utils_Error.InvalidData);
        data = nextSlice;
    }
    val value = data.loadAny<T>();
    self.buffer = data;
    return value;
}

// Expensive to calculate
// Unsafe: throws exit code 8 if it exceeds maxCells
@inline
fun Iterator<T>.countBytes(self): int {
    val maxCells = MAX_DATA_CELLS;
    val (_cellsCount, dataBitsSize, _cellRefs) = self.parsed().calculateSizeStrict(maxCells);
    assert(dataBitsSize % 8 == 0, Utils_Error.InvalidData);
    return dataBitsSize / 8;
}

// Expensive to calculate
// Returns (byteCount, errorCode)
// 
// ExitCodes:
// - 0: no error
// - 8 (cell overflow): exceeded maxCells
// - Utils_Error.InvalidData: data is invalid (not byte-aligned)
@inline
fun Iterator<T>.countBytesSafe(self): (int, int) {
    try {
        return (self.countBytes(), 0);
    } catch (e) {
        return (0, e);
    }
}

/// Validates a snake of fixed-width elements (e.g. 256-bit accounts): every cell
/// must hold only whole elements, so none straddles a cell boundary.
///
/// @note EXPENSIVE: iterates over all cells in the snake to count elements.
///
/// @param elemBits the element width in BITS (e.g. 256 for 32-byte accounts).
///
/// Returns the number of complete elements.
fun Iterator<T>.size(self, elemBits: int): int {
    assert (elemBits > 0 && elemBits <= 1023, Utils_Error.InvalidData);
    var curr: slice = self.parsed();
    var totalElements = 0;
    var cells = 0;
    while (true) {
        cells += 1;
        assert (cells <= SNAKE_MAX_CELLS, 8); // cell-overflow exit code

        // a partial trailing element would straddle the cell boundary
        val bits = curr.remainingBitsCount();
        val refs = curr.remainingRefsCount();
        assert (bits % elemBits == 0, Utils_Error.InvalidData);
        assert (refs == 0 || refs == 1, Utils_Error.InvalidData);

        totalElements += bits / elemBits;
        if (refs == 0) {
            return totalElements;
        }
        val next = curr.loadRef();
        val (nextSlice, isExotic) = next.beginParseSpecial();
        assert (!isExotic, Utils_Error.InvalidData);
        curr = nextSlice;
    }
}

/// Maximum number of cells visited when validating a user-supplied snake.
const SNAKE_MAX_CELLS = MAX_DATA_CELLS;

/// Maximum number of data bytes a single TON cell can hold (1023 bits).
const SNAKE_CELL_MAX_BYTES = 127;

/// Validates that a byte snake is exactly what the offchain verifiers reconstruct
/// when reading it with `ldref`/`cds`. Rejects exotic cells (library references
/// carry a 264-bit descriptor, not user content), any non-terminal cell with more
/// than one continuation ref, and non-terminal cells that are not byte-full —
/// the offchain decoder follows only the first branch and pads partial bytes.
/// Returns the total number of bytes.
fun cell.assertCanonicalByteSnake(self): int {
    var curr: cell? = self;
    var totalBytes = 0;
    var cells = 0;
    while (curr != null) {
        cells += 1;
        // Exit code 8 matches the `CDATASIZE` cell-overflow signal used by
        // `Iterator.countBytes`, preserving the caller's error-code mapping.
        assert (cells <= SNAKE_MAX_CELLS, 8);

        var (s, isExotic) = curr.beginParseSpecial();
        assert (!isExotic, Utils_Error.InvalidData);

        val bits = s.remainingBitsCount();
        val refs = s.remainingRefsCount();
        if (refs == 0) {
            // only the terminal cell may be partial, and only by whole bytes
            assert (bits % 8 == 0, Utils_Error.InvalidData);
        } else {
            assert (refs == 1, Utils_Error.InvalidData);
            assert (bits == SNAKE_CELL_MAX_BYTES * 8, Utils_Error.InvalidData);
        }

        totalBytes += bits / 8;
        curr = refs == 1 ? s.loadRef() : null;
    }
    return totalBytes;
}

/// Same as `Iterator.countBytesSafe`: returns (0, errorCode) instead of throwing.
///
/// ExitCodes:
/// - 0: no error
/// - 8 (cell overflow): exceeded `SNAKE_MAX_CELLS`
/// - Utils_Error.InvalidData: not a canonical byte snake
fun cell.canonicalByteSnakeSafe(self): (int, int) {
    try {
        return (self.assertCanonicalByteSnake(), 0);
    } catch (e) {
        return (0, e);
    }
}

/// Same as `Iterator.countBytesSafe`: returns (0, errorCode) instead of throwing.
fun Iterator<T>.sizeSafe(self, elemBits: int): (int, int) {
    try {
        return (self.size(elemBits), 0);
    } catch (e) {
        return (0, e);
    }
}

// https://github.com/ton-org/ton-core/blob/213fed91d6f63d978c27588509e15ab53c8bafdb/src/dict/Dictionary.ts#L425
const ADDR_KEY_LEN = 267;

struct ArrayIterator<T> {
    pos: int = 0;
    len: int; // TLEN is 26 gas, we cache the value for minimal savings
    data: array<T>;
}

@inline
fun ArrayIterator<T>.new(data: array<T>): ArrayIterator<T> {
    return ArrayIterator<T> { data, len: data.size() };
}

@inline
fun ArrayIterator<T>.empty(self): bool {
    return self.pos >= self.len
}

@inline
fun ArrayIterator<T>.next(mutate self): T {
    val offset = self.pos;
    self.pos += 1;
    return self.data.get(offset);
}

@inline
fun ArrayIterator<T>.size(self, _elemSize: int): int {
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
    assert(index >= 0 && index < 256, Utils_Error.BitmapOutOfBounds);
    self.bits = self.bits | (1 << index);
}

@inline
fun Bitmap256.has(self, index: int): bool {
    assert(index >= 0 && index < 256, Utils_Error.BitmapOutOfBounds);
    return (self.bits & (1 << index)) != 0;
}

// For address snake data
@inline
fun countAddresses(data: cell): int {
    val maxCells = MAX_DATA_CELLS;
    val (_cellsCount, dataBitsSize, _cellRefs) = data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % ADDR_KEY_LEN == 0, Utils_Error.InvalidData);
    return dataBitsSize / ADDR_KEY_LEN;
}

// Returns a lisp-list with the keys of the map
fun keysLispList<K, V>(dict: map<K, V>): lisp_list<K> {
    var lisplist: lisp_list<K> = [];
    var entry = dict.findFirst();
    while (entry.isFound) {
        val key = entry.getKey();
        lisplist.prependHead(key);
        entry = dict.iterateNext(entry);
    } ;
    return lisplist;
}

// Serializes T? into Cell<T>?
fun T?.toOptCell(self): Cell<T>? {
    if (self == null) {
        return null;
    }
    return self.toCell();
}

// Deserializes Cell<T>? into T?
fun Cell<T>?.loadOpt(self): T? {
    if (self == null) {
        return null;
    }
    return self.load();
}

// Helper to extract the single item from a lisp_list<T>
// Returns null if the list is empty or contains more than one item.
fun lisp_list<T>.asSingle(mutate self): T? {
    if (self.isEmpty()) {
        return null;
    }
    val item = self.popHead();
    if (!self.isEmpty()) {
        return null
    }
    return item;
}

// Unwraps the optional value or throws the provided error if it is null.
fun T?.unwrap(self, error: int): T {
    if (self == null) {
        throw error;
    }
    return self;
}

// Unwraps the optional value or returns the provided default.
fun T?.unwrapOr(self, default: T): T {
    if (self == null) {
        return default;
    }
    return self;
}
