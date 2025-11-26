import "@stdlib/lisp-lists"
import "@stdlib/gas-payments";

const ERROR_WRONG_OP = 0xffff;
const ERROR_INVALID_DATA = 0x77;
const ERROR_BITMAP_OUT_OF_BOUNDS = 0x78;

/// Returns the facility ID for the given CRC32 key (e.g. stringCrc32("com.chainlink.ton.mcms.Timelock")).
/// Returns a value in range 10..649 (640 values).
fun getFacilityId(crc32Key: int): uint16 {
    return (crc32Key % 640) + 10;
}

/// Returns an error code composed from facility and local code (max 2^16-1).
fun getErrorCode(crc32Key: int, local: uint16): uint16 {
    return getFacilityId(crc32Key) * 100 + local;
}

// Generic unimplemented error code
const ERROR_UNIMPLEMENTED = 0xBBBB; // == 48059

/// The default message forwarding budget fee for messages (replies, notifications, sends)
/// in gas units. The expectation is this is enough to cover the basic transaction costs
/// for the recipient, at least validation and bounces, to avoid out of gas errors (no bounces).
///
/// TL;DR: Today (Q3/25), a basic transaction costs about 0.0025 TON.
/// Current settings in basechain are as follows: 1 unit of gas costs 400 nanotons.
/// Source: https://docs.ton.org/v3/documentation/smart-contracts/transaction-fees/fees
///
/// For comparison, the Jetton contract requires at least 21k gas units + fwd_fee + storage_fee
/// to cover the token transaction costs.
///
const DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS = 30000;  // 0.012 TON at 400 nanotons/unit

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

const FEE_SIZE_SMALL = 1;
const FEE_SIZE_DEFAULT = 2;
const FEE_SIZE_LARGE = 3;

/// Calculates the gas fee for the current workchain and DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS.
fun calculateGasFeeDefault(): coins {
    val workchain = contract.getAddress().getWorkchain();
    return calculateGasFee(workchain, DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS);
}

/// Calculates the gas fee for the given size (small, default, large).
fun calculateGasFeeFor(size: int): coins {
    if (size == FEE_SIZE_SMALL) {
        return calculateGasFeeDefault() / 2
    } else if (size == FEE_SIZE_LARGE) {
        return calculateGasFeeDefault() * 2;
    }
    return calculateGasFeeDefault();
}

@inline
fun sendCarryAllRemainingMessageValueSafe(msg: OutMessage) {
    reserveToncoinsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
    msg.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/// Computes the Keccak-256 hash of the given data.
fun keccak256(data: builder): uint256
    asm "1 PUSHINT HASHEXT_KECCAK256";

@inline
fun emit<T>(topic: int, body: T) {
    val emitMsg = createExternalLogMessage({
        dest: ExtOutLogBucket { topic },
        body
    });
    emitMsg.send(SEND_MODE_REGULAR);
}

type SnakedCell<T> = cell;

fun SnakedCell<T>.iter(self): Iterator<T> {
    return Iterator<T>.new(self)
}

fun SnakedCell<T>.empty(self): bool {
    return self.beginParse().isEmpty();
}

// Iterates over arrays stored as snake data.
struct Iterator<T> {
    data: slice;
}

@inline
fun Iterator<T>.new(data: cell): Iterator<T> {
    return Iterator<T> { data: data.beginParse() };
}

@inline
fun Iterator<T>.empty(self): bool {
    return self.data.isEmpty()
}

@inline
fun Iterator<T>.next(mutate self): T {
    var (bits, refs) = self.data.remainingBitsAndRefsCount();
    if (bits == 0) {
        // for snakeData to be well formed, there should only be one reference
        assert(refs == 1, ERROR_INVALID_DATA);
        self.data = self.data.loadRef().beginParse();
    }
    return self.data.loadAny<T>();
}

// Expensive to calculate
// Unsafe: throws exit code 8 if it exceeds maxCells
@inline
fun Iterator<T>.countBytes(self): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, _cellRefs) = self.data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % 8 == 0, ERROR_INVALID_DATA);
    return dataBitsSize / 8;
}

// Expensive to calculate
// Returns (byteCount, errorCode)
// 
// ExitCodes:
// - 0: no error
// - 8 (cell overflow): exceeded maxCells
// - ERROR_INVALID_DATA: data is invalid (not byte-aligned)
@inline
fun Iterator<T>.countBytesSafe(self): (int, int) {
    try {
        return (self.countBytes(), 0);
    } catch (e) {
        return (0, e);
    }
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

@inline
fun TupleIterator<T>.new(data: tuple) {
    return TupleIterator<T> { data, len: data.size() };
}

@inline
fun TupleIterator<T>.empty(self): bool {
    return self.pos >= self.len
}

@inline
fun TupleIterator<T>.next(mutate self): T {
    var offset = self.pos;
    self.pos += 1;
    return self.data.get<T>(offset);
}

@inline
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

// For address snake data
@inline
fun countAddresses(data: cell): int {
    val maxCells = 128;
    val (cellsCount, dataBitsSize, cellRefs) = data.calculateSizeStrict(maxCells);
    assert(dataBitsSize % ADDR_KEY_LEN == 0, ERROR_INVALID_DATA);
    return dataBitsSize / ADDR_KEY_LEN;
}

// Returns a lisp-list with the keys of the map
fun keysLispList<K, V>(dict: map<K, V>): tuple? {
    var list: tuple? = null;
    var entry = dict.findFirst();
    while (entry.isFound) {
        var key = entry.getKey();
        list = listPrepend(key, list);
        entry = dict.iterateNext(entry);
    } ;
    return list;
}


// This type works as a wrapper for RemainingBitsAndRefs that implements
// automatic serialization/deserialization. It determines whether to store the
// data directly as bits or as a reference to a cell, depending on available
// space.
type RemainingBitsOrRef<T> = T;

fun RemainingBitsOrRef<T>.packToBuilder(self, mutate b: builder): void {
    val serialized = (self as T).toCell();
    val nBits = serialized.remainingBitsCount();
    if (b.remainingSpace() < nBits - 1) {
        // not enough space, create a new cell
        b.storeBit(1);
        b.storeRef(serialized);
    } else {
        b.storeBit(0);
        b.storeSlice(serialized.beginParse());
    }
}

fun RemainingBitsOrRef<T>.unpackFromSlice(mutate s: slice): RemainingBitsOrRef<T> {
    val isRef = s.loadBit();
    if (isRef) {
        val c = s.loadRef();
        return T.fromCell(c) as RemainingBitsOrRef<T>;
    } else {
        return T.fromSlice(s) as RemainingBitsOrRef<T>;
    }
}
