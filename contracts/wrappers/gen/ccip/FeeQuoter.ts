// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a FeeQuoter contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

type array<T> = T[]

// TypeScript wrappers flatten a TVM linked list `[1 [2 [3 null]]]` to `[1 2 3]`
type lisp_list<T> = T[]

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkRemaining(v: RemainingBitsAndRefs, b: c.Builder): void {
    b.storeSlice(v);
}

function loadTolkRemaining(s: c.Slice): RemainingBitsAndRefs {
    let rest = s.clone();
    s.loadBits(s.remainingBits);
    while (s.remainingRefs) {
        s.loadRef();
    }
    return rest;
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

function storeArrayOf<T>(v: array<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    // the compiler stores array<T> in chunks; in TypeScript, for simplicity, store "1 elem = 1 ref"
    let tail = null as c.Cell | null;
    for (let i = 0; i < v.length; ++i) {
        let chunkB = beginCell().storeMaybeRef(tail);
        storeFn_T(v[v.length - 1 - i], chunkB);
        tail = chunkB.endCell();
    }
    b.storeUint(v.length, 8);
    b.storeMaybeRef(tail);
}

function loadArrayOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): array<T> {
    let len = s.loadUint(8);
    let head = s.loadMaybeRef();
    let outArr = [] as array<T>;
    while (head != null) {
        let s = head.beginParse();
        head = s.loadMaybeRef();
        while (s.remainingBits || s.remainingRefs) {
            outArr.push(loadFn_T(s));
        }
    }
    if (len !== outArr.length) {
        throw new Error(`mismatch array binary data: expected ${len} elements, got ${outArr.length}`);
    }
    return outArr;
}

function storeLispListOf<T>(v: lisp_list<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let tail = c.Cell.EMPTY;
    for (let i = 0; i < v.length; ++i) {
        let itemB = beginCell();
        storeFn_T(v[i], itemB);
        tail = itemB.storeRef(tail).endCell();
    }
    b.storeRef(tail);
}

function loadLispListOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): lisp_list<T> {
    let outArr = [] as lisp_list<T>;
    let head = s.loadRef().beginParse();
    while (head.remainingRefs) {
        let tailSnaked = head.loadRef();
        let headValue = loadFn_T(head);
        head.endParse();    // ensure no data is present besides T
        outArr.unshift(headValue);
        head = tailSnaked.beginParse();
    }
    return outArr;
}

function createDictionaryValue<V>(loadFn_V: LoadCallback<V>, storeFn_V: StoreCallback<V>): c.DictionaryValue<V> {
    return {
        serialize(self: V, b: c.Builder) {
            storeFn_V(self, b);
        },
        parse(s: c.Slice): V {
            const value = loadFn_V(s);
            s.endParse();
            return value;
        }
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }

    readArrayOf<T>(readFn_T: (nestedReader: StackReader) => T): T[] {
        const subItems = this.popExpecting<c.Tuple>('tuple').items;
        const subReader = new StackReader(subItems);
        // array len N => N subItems => N calls to readFn_T
        return [...subItems].map(_ => readFn_T(subReader));
    }

    readLispListOf<T>(readFn_T: (nestedReader: StackReader) => T): T[] {
        // read `[1 [2 [3 null]]]` to `[1 2 3]`
        let pairReader: StackReader = this;
        let outArr = [] as T[];
        while (true) {
            if (pairReader.tuple[0].type === 'null') {
                pairReader.tuple.shift();
                break;
            }
            let headAndTail = pairReader.popExpecting<c.Tuple>('tuple').items;
            if (headAndTail.length !== 2) {
                throw new Error(`malformed lisp_list, expected 2 stack width, got ${headAndTail.length}`);
            }
            pairReader = new StackReader(headAndTail);
            outArr.push(readFn_T(pairReader));
        }
        return outArr;
    }

    readTuple<T>(expectedN: number, readFn_T: (nestedReader: StackReader) => T): T {
        const subItems = this.popExpecting<c.Tuple>('tuple').items;
        if (subItems.length !== expectedN) {
            throw new Error(`expected ${expectedN} items in a tuple, got ${subItems.length}`);
        }
        return readFn_T(new StackReader(subItems));
    }

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
    }

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
    }

    readDictionary<K extends c.DictionaryKeyTypes, V>(keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<V>): c.Dictionary<K, V> {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return c.Dictionary.empty<K, V>(keySerializer, valueSerializer);
        }
        return c.Dictionary.loadDirect<K, V>(keySerializer, valueSerializer, this.readCell());
    }
}

// ————————————————————————————————————————————
//   custom packToBuilder and unpackFromSlice
//

type CustomPackToBuilderFn<T> = (self: T, b: c.Builder) => void
type CustomUnpackFromSliceFn<T> = (s: c.Slice) => T

let customSerializersRegistry: Map<string, [CustomPackToBuilderFn<any> | null, CustomUnpackFromSliceFn<any> | null]> = new Map;

function ensureCustomSerializerRegistered(typeName: string) {
    if (!customSerializersRegistry.has(typeName)) {
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'FeeQuoter.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > FeeQuoter.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
    }
}

function invokeCustomPackToBuilder<T>(typeName: string, self: T, b: c.Builder) {
    ensureCustomSerializerRegistered(typeName);
    customSerializersRegistry.get(typeName)![0]!(self, b);
}

function invokeCustomUnpackFromSlice<T>(typeName: string, s: c.Slice): T {
    ensureCustomSerializerRegistered(typeName);
    return customSerializersRegistry.get(typeName)![1]!(s);
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint8 = bigint
type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint96 = bigint
type uint112 = bigint
type uint224 = bigint
type uint256 = bigint

/**
 > struct UnsafeBodyNoRef<T> {
 >     forceInline: T
 > }
 */
export interface UnsafeBodyNoRef<T> {
    readonly $: 'UnsafeBodyNoRef'
    forceInline: T
}

export const UnsafeBodyNoRef = {
    create<T>(args: {
        forceInline: T
    }): UnsafeBodyNoRef<T> {
        return {
            $: 'UnsafeBodyNoRef',
            ...args
        }
    },
}

/**
 > struct UsdPerTokenUpdated {
 >     sourceToken: address
 >     usdPerToken: uint224
 >     timestamp: uint64
 > }
 */
export interface UsdPerTokenUpdated {
    readonly $: 'UsdPerTokenUpdated'
    sourceToken: c.Address
    usdPerToken: uint224
    timestamp: uint64
}

export const UsdPerTokenUpdated = {
    create(args: {
        sourceToken: c.Address
        usdPerToken: uint224
        timestamp: uint64
    }): UsdPerTokenUpdated {
        return {
            $: 'UsdPerTokenUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): UsdPerTokenUpdated {
        return {
            $: 'UsdPerTokenUpdated',
            sourceToken: s.loadAddress(),
            usdPerToken: s.loadUintBig(224),
            timestamp: s.loadUintBig(64),
        }
    },
    store(self: UsdPerTokenUpdated, b: c.Builder): void {
        b.storeAddress(self.sourceToken);
        b.storeUint(self.usdPerToken, 224);
        b.storeUint(self.timestamp, 64);
    },
    toCell(self: UsdPerTokenUpdated): c.Cell {
        return makeCellFrom<UsdPerTokenUpdated>(self, UsdPerTokenUpdated.store);
    }
}

/**
 > struct UsdPerUnitGasUpdated {
 >     destChainSelector: uint64
 >     executionGasPrice: uint112
 >     dataAvailabilityGasPrice: uint112
 >     timestamp: uint64
 > }
 */
export interface UsdPerUnitGasUpdated {
    readonly $: 'UsdPerUnitGasUpdated'
    destChainSelector: uint64
    executionGasPrice: uint112
    dataAvailabilityGasPrice: uint112
    timestamp: uint64
}

export const UsdPerUnitGasUpdated = {
    create(args: {
        destChainSelector: uint64
        executionGasPrice: uint112
        dataAvailabilityGasPrice: uint112
        timestamp: uint64
    }): UsdPerUnitGasUpdated {
        return {
            $: 'UsdPerUnitGasUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): UsdPerUnitGasUpdated {
        return {
            $: 'UsdPerUnitGasUpdated',
            destChainSelector: s.loadUintBig(64),
            executionGasPrice: s.loadUintBig(112),
            dataAvailabilityGasPrice: s.loadUintBig(112),
            timestamp: s.loadUintBig(64),
        }
    },
    store(self: UsdPerUnitGasUpdated, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        b.storeUint(self.executionGasPrice, 112);
        b.storeUint(self.dataAvailabilityGasPrice, 112);
        b.storeUint(self.timestamp, 64);
    },
    toCell(self: UsdPerUnitGasUpdated): c.Cell {
        return makeCellFrom<UsdPerUnitGasUpdated>(self, UsdPerUnitGasUpdated.store);
    }
}

/**
 > struct (0xde852b1b) FeeQuoter_UpdatePrices {
 >     updates: PriceUpdates
 >     sendExcessesTo: address?
 > }
 */
export interface FeeQuoter_UpdatePrices {
    readonly $: 'FeeQuoter_UpdatePrices'
    updates: PriceUpdates
    sendExcessesTo: c.Address | null
}

export const FeeQuoter_UpdatePrices = {
    PREFIX: 0xde852b1b,

    create(args: {
        updates: PriceUpdates
        sendExcessesTo: c.Address | null
    }): FeeQuoter_UpdatePrices {
        return {
            $: 'FeeQuoter_UpdatePrices',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_UpdatePrices {
        loadAndCheckPrefix32(s, 0xde852b1b, 'FeeQuoter_UpdatePrices');
        return {
            $: 'FeeQuoter_UpdatePrices',
            updates: PriceUpdates.fromSlice(s),
            sendExcessesTo: s.loadMaybeAddress(),
        }
    },
    store(self: FeeQuoter_UpdatePrices, b: c.Builder): void {
        b.storeUint(0xde852b1b, 32);
        PriceUpdates.store(self.updates, b);
        b.storeAddress(self.sendExcessesTo);
    },
    toCell(self: FeeQuoter_UpdatePrices): c.Cell {
        return makeCellFrom<FeeQuoter_UpdatePrices>(self, FeeQuoter_UpdatePrices.store);
    }
}

/**
 > struct (0x7496ff56) FeeQuoter_GetValidatedFee<T> {
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_GetValidatedFee<T> {
    readonly $: 'FeeQuoter_GetValidatedFee'
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_GetValidatedFee = {
    PREFIX: 0x7496ff56,

    create<T>(args: {
        msg: CellRef<Router_CCIPSend>
        context: T
    }): FeeQuoter_GetValidatedFee<T> {
        return {
            $: 'FeeQuoter_GetValidatedFee',
            ...args
        }
    },
}

/**
 > struct (0xd0984986) FeeQuoter_UpdateFeeTokens {
 >     add: map<address, FeeToken>
 >     remove: SnakedCell<address>
 > }
 */
export interface FeeQuoter_UpdateFeeTokens {
    readonly $: 'FeeQuoter_UpdateFeeTokens'
    add: c.Dictionary<c.Address, FeeToken>
    remove: SnakedCell<c.Address>
}

export const FeeQuoter_UpdateFeeTokens = {
    PREFIX: 0xd0984986,

    create(args: {
        add: c.Dictionary<c.Address, FeeToken>
        remove: SnakedCell<c.Address>
    }): FeeQuoter_UpdateFeeTokens {
        return {
            $: 'FeeQuoter_UpdateFeeTokens',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_UpdateFeeTokens {
        loadAndCheckPrefix32(s, 0xd0984986, 'FeeQuoter_UpdateFeeTokens');
        return {
            $: 'FeeQuoter_UpdateFeeTokens',
            add: c.Dictionary.load<c.Address, FeeToken>(c.Dictionary.Keys.Address(), createDictionaryValue<FeeToken>(FeeToken.fromSlice, FeeToken.store), s),
            remove: s.loadRef(),
        }
    },
    store(self: FeeQuoter_UpdateFeeTokens, b: c.Builder): void {
        b.storeUint(0xd0984986, 32);
        b.storeDict<c.Address, FeeToken>(self.add, c.Dictionary.Keys.Address(), createDictionaryValue<FeeToken>(FeeToken.fromSlice, FeeToken.store));
        b.storeRef(self.remove);
    },
    toCell(self: FeeQuoter_UpdateFeeTokens): c.Cell {
        return makeCellFrom<FeeQuoter_UpdateFeeTokens>(self, FeeQuoter_UpdateFeeTokens.store);
    }
}

/**
 > struct (0x1fa60374) FeeQuoter_MessageValidated<T> {
 >     fee: Fee
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_MessageValidated<T> {
    readonly $: 'FeeQuoter_MessageValidated'
    fee: Fee
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_MessageValidated = {
    PREFIX: 0x1fa60374,

    create<T>(args: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        context: T
    }): FeeQuoter_MessageValidated<T> {
        return {
            $: 'FeeQuoter_MessageValidated',
            ...args
        }
    },
}

/**
 > struct (0xbcf0ab0f) FeeQuoter_MessageValidationFailed<T> {
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_MessageValidationFailed<T> {
    readonly $: 'FeeQuoter_MessageValidationFailed'
    error: uint256
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_MessageValidationFailed = {
    PREFIX: 0xbcf0ab0f,

    create<T>(args: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: T
    }): FeeQuoter_MessageValidationFailed<T> {
        return {
            $: 'FeeQuoter_MessageValidationFailed',
            ...args
        }
    },
}

/**
 > struct (0xb2826316) FeeQuoter_UpdateTokenTransferFeeConfigs {
 >     updates: map<uint64, UpdateTokenTransferFeeConfig>
 > }
 */
export interface FeeQuoter_UpdateTokenTransferFeeConfigs {
    readonly $: 'FeeQuoter_UpdateTokenTransferFeeConfigs'
    updates: c.Dictionary<uint64, UpdateTokenTransferFeeConfig>
}

export const FeeQuoter_UpdateTokenTransferFeeConfigs = {
    PREFIX: 0xb2826316,

    create(args: {
        updates: c.Dictionary<uint64, UpdateTokenTransferFeeConfig>
    }): FeeQuoter_UpdateTokenTransferFeeConfigs {
        return {
            $: 'FeeQuoter_UpdateTokenTransferFeeConfigs',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_UpdateTokenTransferFeeConfigs {
        loadAndCheckPrefix32(s, 0xb2826316, 'FeeQuoter_UpdateTokenTransferFeeConfigs');
        return {
            $: 'FeeQuoter_UpdateTokenTransferFeeConfigs',
            updates: c.Dictionary.load<uint64, UpdateTokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<UpdateTokenTransferFeeConfig>(UpdateTokenTransferFeeConfig.fromSlice, UpdateTokenTransferFeeConfig.store), s),
        }
    },
    store(self: FeeQuoter_UpdateTokenTransferFeeConfigs, b: c.Builder): void {
        b.storeUint(0xb2826316, 32);
        b.storeDict<uint64, UpdateTokenTransferFeeConfig>(self.updates, c.Dictionary.Keys.BigUint(64), createDictionaryValue<UpdateTokenTransferFeeConfig>(UpdateTokenTransferFeeConfig.fromSlice, UpdateTokenTransferFeeConfig.store));
    },
    toCell(self: FeeQuoter_UpdateTokenTransferFeeConfigs): c.Cell {
        return makeCellFrom<FeeQuoter_UpdateTokenTransferFeeConfigs>(self, FeeQuoter_UpdateTokenTransferFeeConfigs.store);
    }
}

/**
 > struct (0x2d2410f6) FeeQuoter_UpdateDestChainConfigs {
 >     updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>
 > }
 */
export interface FeeQuoter_UpdateDestChainConfigs {
    readonly $: 'FeeQuoter_UpdateDestChainConfigs'
    updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>
}

export const FeeQuoter_UpdateDestChainConfigs = {
    PREFIX: 0x2d2410f6,

    create(args: {
        updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>
    }): FeeQuoter_UpdateDestChainConfigs {
        return {
            $: 'FeeQuoter_UpdateDestChainConfigs',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_UpdateDestChainConfigs {
        loadAndCheckPrefix32(s, 0x2d2410f6, 'FeeQuoter_UpdateDestChainConfigs');
        return {
            $: 'FeeQuoter_UpdateDestChainConfigs',
            updates: s.loadRef(),
        }
    },
    store(self: FeeQuoter_UpdateDestChainConfigs, b: c.Builder): void {
        b.storeUint(0x2d2410f6, 32);
        b.storeRef(self.updates);
    },
    toCell(self: FeeQuoter_UpdateDestChainConfigs): c.Cell {
        return makeCellFrom<FeeQuoter_UpdateDestChainConfigs>(self, FeeQuoter_UpdateDestChainConfigs.store);
    }
}

/**
 > struct (0x71df848a) FeeQuoter_AddPriceUpdater {
 >     priceUpdater: address
 > }
 */
export interface FeeQuoter_AddPriceUpdater {
    readonly $: 'FeeQuoter_AddPriceUpdater'
    priceUpdater: c.Address
}

export const FeeQuoter_AddPriceUpdater = {
    PREFIX: 0x71df848a,

    create(args: {
        priceUpdater: c.Address
    }): FeeQuoter_AddPriceUpdater {
        return {
            $: 'FeeQuoter_AddPriceUpdater',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_AddPriceUpdater {
        loadAndCheckPrefix32(s, 0x71df848a, 'FeeQuoter_AddPriceUpdater');
        return {
            $: 'FeeQuoter_AddPriceUpdater',
            priceUpdater: s.loadAddress(),
        }
    },
    store(self: FeeQuoter_AddPriceUpdater, b: c.Builder): void {
        b.storeUint(0x71df848a, 32);
        b.storeAddress(self.priceUpdater);
    },
    toCell(self: FeeQuoter_AddPriceUpdater): c.Cell {
        return makeCellFrom<FeeQuoter_AddPriceUpdater>(self, FeeQuoter_AddPriceUpdater.store);
    }
}

/**
 > struct (0x5dfbb1bc) FeeQuoter_RemovePriceUpdater {
 >     priceUpdater: address
 > }
 */
export interface FeeQuoter_RemovePriceUpdater {
    readonly $: 'FeeQuoter_RemovePriceUpdater'
    priceUpdater: c.Address
}

export const FeeQuoter_RemovePriceUpdater = {
    PREFIX: 0x5dfbb1bc,

    create(args: {
        priceUpdater: c.Address
    }): FeeQuoter_RemovePriceUpdater {
        return {
            $: 'FeeQuoter_RemovePriceUpdater',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_RemovePriceUpdater {
        loadAndCheckPrefix32(s, 0x5dfbb1bc, 'FeeQuoter_RemovePriceUpdater');
        return {
            $: 'FeeQuoter_RemovePriceUpdater',
            priceUpdater: s.loadAddress(),
        }
    },
    store(self: FeeQuoter_RemovePriceUpdater, b: c.Builder): void {
        b.storeUint(0x5dfbb1bc, 32);
        b.storeAddress(self.priceUpdater);
    },
    toCell(self: FeeQuoter_RemovePriceUpdater): c.Cell {
        return makeCellFrom<FeeQuoter_RemovePriceUpdater>(self, FeeQuoter_RemovePriceUpdater.store);
    }
}

/**
 > struct TimestampedPrice {
 >     value: uint224
 >     timestamp: uint32
 > }
 */
export interface TimestampedPrice {
    readonly $: 'TimestampedPrice'
    value: uint224
    timestamp: uint32
}

export const TimestampedPrice = {
    create(args: {
        value: uint224
        timestamp: uint32
    }): TimestampedPrice {
        return {
            $: 'TimestampedPrice',
            ...args
        }
    },
    fromSlice(s: c.Slice): TimestampedPrice {
        return {
            $: 'TimestampedPrice',
            value: s.loadUintBig(224),
            timestamp: s.loadUintBig(32),
        }
    },
    store(self: TimestampedPrice, b: c.Builder): void {
        b.storeUint(self.value, 224);
        b.storeUint(self.timestamp, 32);
    },
    toCell(self: TimestampedPrice): c.Cell {
        return makeCellFrom<TimestampedPrice>(self, TimestampedPrice.store);
    }
}

/**
 > struct PriceUpdates {
 >     tokenPriceUpdates: SnakedCell<TokenPriceUpdate>
 >     gasPriceUpdates: SnakedCell<GasPriceUpdate>
 > }
 */
export interface PriceUpdates {
    readonly $: 'PriceUpdates'
    tokenPriceUpdates: SnakedCell<TokenPriceUpdate>
    gasPriceUpdates: SnakedCell<GasPriceUpdate>
}

export const PriceUpdates = {
    create(args: {
        tokenPriceUpdates: SnakedCell<TokenPriceUpdate>
        gasPriceUpdates: SnakedCell<GasPriceUpdate>
    }): PriceUpdates {
        return {
            $: 'PriceUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): PriceUpdates {
        return {
            $: 'PriceUpdates',
            tokenPriceUpdates: s.loadRef(),
            gasPriceUpdates: s.loadRef(),
        }
    },
    store(self: PriceUpdates, b: c.Builder): void {
        b.storeRef(self.tokenPriceUpdates);
        b.storeRef(self.gasPriceUpdates);
    },
    toCell(self: PriceUpdates): c.Cell {
        return makeCellFrom<PriceUpdates>(self, PriceUpdates.store);
    }
}

/**
 > struct TokenPriceUpdate {
 >     sourceToken: address
 >     usdPerToken: uint224
 > }
 */
export interface TokenPriceUpdate {
    readonly $: 'TokenPriceUpdate'
    sourceToken: c.Address
    usdPerToken: uint224
}

export const TokenPriceUpdate = {
    create(args: {
        sourceToken: c.Address
        usdPerToken: uint224
    }): TokenPriceUpdate {
        return {
            $: 'TokenPriceUpdate',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPriceUpdate {
        return {
            $: 'TokenPriceUpdate',
            sourceToken: s.loadAddress(),
            usdPerToken: s.loadUintBig(224),
        }
    },
    store(self: TokenPriceUpdate, b: c.Builder): void {
        b.storeAddress(self.sourceToken);
        b.storeUint(self.usdPerToken, 224);
    },
    toCell(self: TokenPriceUpdate): c.Cell {
        return makeCellFrom<TokenPriceUpdate>(self, TokenPriceUpdate.store);
    }
}

/**
 > struct GasPriceUpdate {
 >     destChainSelector: uint64
 >     executionGasPrice: uint112
 >     dataAvailabilityGasPrice: uint112
 > }
 */
export interface GasPriceUpdate {
    readonly $: 'GasPriceUpdate'
    destChainSelector: uint64
    executionGasPrice: uint112
    dataAvailabilityGasPrice: uint112
}

export const GasPriceUpdate = {
    create(args: {
        destChainSelector: uint64
        executionGasPrice: uint112
        dataAvailabilityGasPrice: uint112
    }): GasPriceUpdate {
        return {
            $: 'GasPriceUpdate',
            ...args
        }
    },
    fromSlice(s: c.Slice): GasPriceUpdate {
        return {
            $: 'GasPriceUpdate',
            destChainSelector: s.loadUintBig(64),
            executionGasPrice: s.loadUintBig(112),
            dataAvailabilityGasPrice: s.loadUintBig(112),
        }
    },
    store(self: GasPriceUpdate, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        b.storeUint(self.executionGasPrice, 112);
        b.storeUint(self.dataAvailabilityGasPrice, 112);
    },
    toCell(self: GasPriceUpdate): c.Cell {
        return makeCellFrom<GasPriceUpdate>(self, GasPriceUpdate.store);
    }
}

/**
 > struct FeeQuoterDestChainConfig {
 >     isEnabled: bool
 >     maxNumberOfTokensPerMsg: uint16
 >     maxDataBytes: uint32
 >     maxPerMsgGasLimit: uint32
 >     destGasOverhead: uint32
 >     destGasPerPayloadByteBase: uint8
 >     destGasPerPayloadByteHigh: uint8
 >     destGasPerPayloadByteThreshold: uint16
 >     destDataAvailabilityOverheadGas: uint32
 >     destGasPerDataAvailabilityByte: uint16
 >     destDataAvailabilityMultiplierBps: uint16
 >     chainFamilySelector: uint32
 >     defaultTokenFeeUsdCents: uint16
 >     defaultTokenDestGasOverhead: uint32
 >     defaultTxGasLimit: uint32
 >     gasMultiplierWeiPerEth: uint64
 >     gasPriceStalenessThreshold: uint32
 >     networkFeeUsdCents: uint32
 > }
 */
export interface FeeQuoterDestChainConfig {
    readonly $: 'FeeQuoterDestChainConfig'
    isEnabled: boolean
    maxNumberOfTokensPerMsg: uint16
    maxDataBytes: uint32
    maxPerMsgGasLimit: uint32
    destGasOverhead: uint32
    destGasPerPayloadByteBase: uint8
    destGasPerPayloadByteHigh: uint8
    destGasPerPayloadByteThreshold: uint16
    destDataAvailabilityOverheadGas: uint32
    destGasPerDataAvailabilityByte: uint16
    destDataAvailabilityMultiplierBps: uint16
    chainFamilySelector: uint32
    defaultTokenFeeUsdCents: uint16
    defaultTokenDestGasOverhead: uint32
    defaultTxGasLimit: uint32
    gasMultiplierWeiPerEth: uint64
    gasPriceStalenessThreshold: uint32
    networkFeeUsdCents: uint32
}

export const FeeQuoterDestChainConfig = {
    create(args: {
        isEnabled: boolean
        maxNumberOfTokensPerMsg: uint16
        maxDataBytes: uint32
        maxPerMsgGasLimit: uint32
        destGasOverhead: uint32
        destGasPerPayloadByteBase: uint8
        destGasPerPayloadByteHigh: uint8
        destGasPerPayloadByteThreshold: uint16
        destDataAvailabilityOverheadGas: uint32
        destGasPerDataAvailabilityByte: uint16
        destDataAvailabilityMultiplierBps: uint16
        chainFamilySelector: uint32
        defaultTokenFeeUsdCents: uint16
        defaultTokenDestGasOverhead: uint32
        defaultTxGasLimit: uint32
        gasMultiplierWeiPerEth: uint64
        gasPriceStalenessThreshold: uint32
        networkFeeUsdCents: uint32
    }): FeeQuoterDestChainConfig {
        return {
            $: 'FeeQuoterDestChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoterDestChainConfig {
        return {
            $: 'FeeQuoterDestChainConfig',
            isEnabled: s.loadBoolean(),
            maxNumberOfTokensPerMsg: s.loadUintBig(16),
            maxDataBytes: s.loadUintBig(32),
            maxPerMsgGasLimit: s.loadUintBig(32),
            destGasOverhead: s.loadUintBig(32),
            destGasPerPayloadByteBase: s.loadUintBig(8),
            destGasPerPayloadByteHigh: s.loadUintBig(8),
            destGasPerPayloadByteThreshold: s.loadUintBig(16),
            destDataAvailabilityOverheadGas: s.loadUintBig(32),
            destGasPerDataAvailabilityByte: s.loadUintBig(16),
            destDataAvailabilityMultiplierBps: s.loadUintBig(16),
            chainFamilySelector: s.loadUintBig(32),
            defaultTokenFeeUsdCents: s.loadUintBig(16),
            defaultTokenDestGasOverhead: s.loadUintBig(32),
            defaultTxGasLimit: s.loadUintBig(32),
            gasMultiplierWeiPerEth: s.loadUintBig(64),
            gasPriceStalenessThreshold: s.loadUintBig(32),
            networkFeeUsdCents: s.loadUintBig(32),
        }
    },
    store(self: FeeQuoterDestChainConfig, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.maxNumberOfTokensPerMsg, 16);
        b.storeUint(self.maxDataBytes, 32);
        b.storeUint(self.maxPerMsgGasLimit, 32);
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destGasPerPayloadByteBase, 8);
        b.storeUint(self.destGasPerPayloadByteHigh, 8);
        b.storeUint(self.destGasPerPayloadByteThreshold, 16);
        b.storeUint(self.destDataAvailabilityOverheadGas, 32);
        b.storeUint(self.destGasPerDataAvailabilityByte, 16);
        b.storeUint(self.destDataAvailabilityMultiplierBps, 16);
        b.storeUint(self.chainFamilySelector, 32);
        b.storeUint(self.defaultTokenFeeUsdCents, 16);
        b.storeUint(self.defaultTokenDestGasOverhead, 32);
        b.storeUint(self.defaultTxGasLimit, 32);
        b.storeUint(self.gasMultiplierWeiPerEth, 64);
        b.storeUint(self.gasPriceStalenessThreshold, 32);
        b.storeUint(self.networkFeeUsdCents, 32);
    },
    toCell(self: FeeQuoterDestChainConfig): c.Cell {
        return makeCellFrom<FeeQuoterDestChainConfig>(self, FeeQuoterDestChainConfig.store);
    }
}

/**
 > struct GasPrice {
 >     executionGasPrice: uint112
 >     dataAvailabilityGasPrice: uint112
 >     timestamp: uint64
 > }
 */
export interface GasPrice {
    readonly $: 'GasPrice'
    executionGasPrice: uint112
    dataAvailabilityGasPrice: uint112
    timestamp: uint64
}

export const GasPrice = {
    create(args: {
        executionGasPrice: uint112
        dataAvailabilityGasPrice: uint112
        timestamp: uint64
    }): GasPrice {
        return {
            $: 'GasPrice',
            ...args
        }
    },
    fromSlice(s: c.Slice): GasPrice {
        return {
            $: 'GasPrice',
            executionGasPrice: s.loadUintBig(112),
            dataAvailabilityGasPrice: s.loadUintBig(112),
            timestamp: s.loadUintBig(64),
        }
    },
    store(self: GasPrice, b: c.Builder): void {
        b.storeUint(self.executionGasPrice, 112);
        b.storeUint(self.dataAvailabilityGasPrice, 112);
        b.storeUint(self.timestamp, 64);
    },
    toCell(self: GasPrice): c.Cell {
        return makeCellFrom<GasPrice>(self, GasPrice.store);
    }
}

/**
 > struct TokenTransferFeeConfig {
 >     isEnabled: bool
 >     minFeeUsdCents: uint32
 >     maxFeeUsdCents: uint32
 >     deciBps: uint16
 >     destGasOverhead: uint32
 >     destBytesOverhead: uint32
 > }
 */
export interface TokenTransferFeeConfig {
    readonly $: 'TokenTransferFeeConfig'
    isEnabled: boolean
    minFeeUsdCents: uint32
    maxFeeUsdCents: uint32
    deciBps: uint16
    destGasOverhead: uint32
    destBytesOverhead: uint32
}

export const TokenTransferFeeConfig = {
    create(args: {
        isEnabled: boolean
        minFeeUsdCents: uint32
        maxFeeUsdCents: uint32
        deciBps: uint16
        destGasOverhead: uint32
        destBytesOverhead: uint32
    }): TokenTransferFeeConfig {
        return {
            $: 'TokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenTransferFeeConfig {
        return {
            $: 'TokenTransferFeeConfig',
            isEnabled: s.loadBoolean(),
            minFeeUsdCents: s.loadUintBig(32),
            maxFeeUsdCents: s.loadUintBig(32),
            deciBps: s.loadUintBig(16),
            destGasOverhead: s.loadUintBig(32),
            destBytesOverhead: s.loadUintBig(32),
        }
    },
    store(self: TokenTransferFeeConfig, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.minFeeUsdCents, 32);
        b.storeUint(self.maxFeeUsdCents, 32);
        b.storeUint(self.deciBps, 16);
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
    },
    toCell(self: TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenTransferFeeConfig>(self, TokenTransferFeeConfig.store);
    }
}

/**
 > struct DestChainConfig {
 >     config: FeeQuoterDestChainConfig
 >     usdPerUnitGas: Cell<GasPrice>
 >     tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig>
 > }
 */
export interface DestChainConfig {
    readonly $: 'DestChainConfig'
    config: FeeQuoterDestChainConfig
    usdPerUnitGas: CellRef<GasPrice>
    tokenTransferFeeConfigs: c.Dictionary<c.Address, TokenTransferFeeConfig>
}

export const DestChainConfig = {
    create(args: {
        config: FeeQuoterDestChainConfig
        usdPerUnitGas: CellRef<GasPrice>
        tokenTransferFeeConfigs: c.Dictionary<c.Address, TokenTransferFeeConfig>
    }): DestChainConfig {
        return {
            $: 'DestChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): DestChainConfig {
        return {
            $: 'DestChainConfig',
            config: FeeQuoterDestChainConfig.fromSlice(s),
            usdPerUnitGas: loadCellRef<GasPrice>(s, GasPrice.fromSlice),
            tokenTransferFeeConfigs: c.Dictionary.load<c.Address, TokenTransferFeeConfig>(c.Dictionary.Keys.Address(), createDictionaryValue<TokenTransferFeeConfig>(TokenTransferFeeConfig.fromSlice, TokenTransferFeeConfig.store), s),
        }
    },
    store(self: DestChainConfig, b: c.Builder): void {
        FeeQuoterDestChainConfig.store(self.config, b);
        storeCellRef<GasPrice>(self.usdPerUnitGas, b, GasPrice.store);
        b.storeDict<c.Address, TokenTransferFeeConfig>(self.tokenTransferFeeConfigs, c.Dictionary.Keys.Address(), createDictionaryValue<TokenTransferFeeConfig>(TokenTransferFeeConfig.fromSlice, TokenTransferFeeConfig.store));
    },
    toCell(self: DestChainConfig): c.Cell {
        return makeCellFrom<DestChainConfig>(self, DestChainConfig.store);
    }
}

/**
 > struct UpdateTokenTransferFeeConfig {
 >     add: map<address, TokenTransferFeeConfig>
 >     remove: SnakedCell<address>
 > }
 */
export interface UpdateTokenTransferFeeConfig {
    readonly $: 'UpdateTokenTransferFeeConfig'
    add: c.Dictionary<c.Address, TokenTransferFeeConfig>
    remove: SnakedCell<c.Address>
}

export const UpdateTokenTransferFeeConfig = {
    create(args: {
        add: c.Dictionary<c.Address, TokenTransferFeeConfig>
        remove: SnakedCell<c.Address>
    }): UpdateTokenTransferFeeConfig {
        return {
            $: 'UpdateTokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateTokenTransferFeeConfig {
        return {
            $: 'UpdateTokenTransferFeeConfig',
            add: c.Dictionary.load<c.Address, TokenTransferFeeConfig>(c.Dictionary.Keys.Address(), createDictionaryValue<TokenTransferFeeConfig>(TokenTransferFeeConfig.fromSlice, TokenTransferFeeConfig.store), s),
            remove: s.loadRef(),
        }
    },
    store(self: UpdateTokenTransferFeeConfig, b: c.Builder): void {
        b.storeDict<c.Address, TokenTransferFeeConfig>(self.add, c.Dictionary.Keys.Address(), createDictionaryValue<TokenTransferFeeConfig>(TokenTransferFeeConfig.fromSlice, TokenTransferFeeConfig.store));
        b.storeRef(self.remove);
    },
    toCell(self: UpdateTokenTransferFeeConfig): c.Cell {
        return makeCellFrom<UpdateTokenTransferFeeConfig>(self, UpdateTokenTransferFeeConfig.store);
    }
}

/**
 > struct FeeToken {
 >     premiumMultiplierWeiPerEth: uint64
 > }
 */
export interface FeeToken {
    readonly $: 'FeeToken'
    premiumMultiplierWeiPerEth: uint64
}

export const FeeToken = {
    create(args: {
        premiumMultiplierWeiPerEth: uint64
    }): FeeToken {
        return {
            $: 'FeeToken',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeToken {
        return {
            $: 'FeeToken',
            premiumMultiplierWeiPerEth: s.loadUintBig(64),
        }
    },
    store(self: FeeToken, b: c.Builder): void {
        b.storeUint(self.premiumMultiplierWeiPerEth, 64);
    },
    toCell(self: FeeToken): c.Cell {
        return makeCellFrom<FeeToken>(self, FeeToken.store);
    }
}

/**
 > struct FeeQuoter_UpdateDestChainConfig {
 >     destChainSelector: uint64
 >     destChainConfig: FeeQuoterDestChainConfig
 > }
 */
export interface FeeQuoter_UpdateDestChainConfig {
    readonly $: 'FeeQuoter_UpdateDestChainConfig'
    destChainSelector: uint64
    destChainConfig: FeeQuoterDestChainConfig
}

export const FeeQuoter_UpdateDestChainConfig = {
    create(args: {
        destChainSelector: uint64
        destChainConfig: FeeQuoterDestChainConfig
    }): FeeQuoter_UpdateDestChainConfig {
        return {
            $: 'FeeQuoter_UpdateDestChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): FeeQuoter_UpdateDestChainConfig {
        return {
            $: 'FeeQuoter_UpdateDestChainConfig',
            destChainSelector: s.loadUintBig(64),
            destChainConfig: FeeQuoterDestChainConfig.fromSlice(s),
        }
    },
    store(self: FeeQuoter_UpdateDestChainConfig, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        FeeQuoterDestChainConfig.store(self.destChainConfig, b);
    },
    toCell(self: FeeQuoter_UpdateDestChainConfig): c.Cell {
        return makeCellFrom<FeeQuoter_UpdateDestChainConfig>(self, FeeQuoter_UpdateDestChainConfig.store);
    }
}

/**
 > struct Fee {
 >     feeTokenAmount: coins
 >     feeValueJuels: uint96
 > }
 */
export interface Fee {
    readonly $: 'Fee'
    feeTokenAmount: coins
    feeValueJuels: uint96
}

export const Fee = {
    create(args: {
        feeTokenAmount: coins
        feeValueJuels: uint96
    }): Fee {
        return {
            $: 'Fee',
            ...args
        }
    },
    fromSlice(s: c.Slice): Fee {
        return {
            $: 'Fee',
            feeTokenAmount: s.loadCoins(),
            feeValueJuels: s.loadUintBig(96),
        }
    },
    store(self: Fee, b: c.Builder): void {
        b.storeCoins(self.feeTokenAmount);
        b.storeUint(self.feeValueJuels, 96);
    },
    toCell(self: Fee): c.Cell {
        return makeCellFrom<Fee>(self, Fee.store);
    }
}

/**
 > struct Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     allowedPriceUpdaters: map<address, ()>
 >     maxFeeJuelsPerMsg: uint96
 >     linkToken: address
 >     tokenPriceStalenessThreshold: uint32
 >     usdPerToken: map<address, TimestampedPrice>
 >     premiumMultiplierWeiPerEth: map<address, uint64>
 >     destChainConfigs: map<uint64, DestChainConfig>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint32
    ownable: Ownable2Step
    allowedPriceUpdaters: c.Dictionary<c.Address, []>
    maxFeeJuelsPerMsg: uint96
    linkToken: c.Address
    tokenPriceStalenessThreshold: uint32
    usdPerToken: c.Dictionary<c.Address, TimestampedPrice>
    premiumMultiplierWeiPerEth: c.Dictionary<c.Address, uint64>
    destChainConfigs: c.Dictionary<uint64, DestChainConfig>
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        allowedPriceUpdaters: c.Dictionary<c.Address, []>
        maxFeeJuelsPerMsg: uint96
        linkToken: c.Address
        tokenPriceStalenessThreshold: uint32
        usdPerToken: c.Dictionary<c.Address, TimestampedPrice>
        premiumMultiplierWeiPerEth: c.Dictionary<c.Address, uint64>
        destChainConfigs: c.Dictionary<uint64, DestChainConfig>
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
            allowedPriceUpdaters: c.Dictionary.load<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                (s) => [],
                (v,b) => { {} }
            ), s),
            maxFeeJuelsPerMsg: s.loadUintBig(96),
            linkToken: s.loadAddress(),
            tokenPriceStalenessThreshold: s.loadUintBig(32),
            usdPerToken: c.Dictionary.load<c.Address, TimestampedPrice>(c.Dictionary.Keys.Address(), createDictionaryValue<TimestampedPrice>(TimestampedPrice.fromSlice, TimestampedPrice.store), s),
            premiumMultiplierWeiPerEth: c.Dictionary.load<c.Address, uint64>(c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(64), s),
            destChainConfigs: c.Dictionary.load<uint64, DestChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<DestChainConfig>(DestChainConfig.fromSlice, DestChainConfig.store), s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        b.storeDict<c.Address, []>(self.allowedPriceUpdaters, c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
        b.storeUint(self.maxFeeJuelsPerMsg, 96);
        b.storeAddress(self.linkToken);
        b.storeUint(self.tokenPriceStalenessThreshold, 32);
        b.storeDict<c.Address, TimestampedPrice>(self.usdPerToken, c.Dictionary.Keys.Address(), createDictionaryValue<TimestampedPrice>(TimestampedPrice.fromSlice, TimestampedPrice.store));
        b.storeDict<c.Address, uint64>(self.premiumMultiplierWeiPerEth, c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(64));
        b.storeDict<uint64, DestChainConfig>(self.destChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<DestChainConfig>(DestChainConfig.fromSlice, DestChainConfig.store));
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > type CrossChainAddress = slice
 */
export type CrossChainAddress = c.Slice

export const CrossChainAddress = {
    fromSlice(s: c.Slice): CrossChainAddress {
        return invokeCustomUnpackFromSlice<CrossChainAddress>('CrossChainAddress', s);
    },
    store(self: CrossChainAddress, b: c.Builder): void {
        invokeCustomPackToBuilder<CrossChainAddress>('CrossChainAddress', self, b);
    },
    toCell(self: CrossChainAddress): c.Cell {
        return makeCellFrom<CrossChainAddress>(self, CrossChainAddress.store);
    }
}

/**
 > struct (0x181dcf10) GenericExtraArgsV2 {
 >     gasLimit: uint256?
 >     allowOutOfOrderExecution: bool
 > }
 */
export interface GenericExtraArgsV2 {
    readonly $: 'GenericExtraArgsV2'
    gasLimit: uint256 | null
    allowOutOfOrderExecution: boolean
}

export const GenericExtraArgsV2 = {
    PREFIX: 0x181dcf10,

    create(args: {
        gasLimit: uint256 | null
        allowOutOfOrderExecution: boolean
    }): GenericExtraArgsV2 {
        return {
            $: 'GenericExtraArgsV2',
            ...args
        }
    },
    fromSlice(s: c.Slice): GenericExtraArgsV2 {
        loadAndCheckPrefix32(s, 0x181dcf10, 'GenericExtraArgsV2');
        return {
            $: 'GenericExtraArgsV2',
            gasLimit: s.loadBoolean() ? s.loadUintBig(256) : null,
            allowOutOfOrderExecution: s.loadBoolean(),
        }
    },
    store(self: GenericExtraArgsV2, b: c.Builder): void {
        b.storeUint(0x181dcf10, 32);
        storeTolkNullable<uint256>(self.gasLimit, b,
            (v,b) => b.storeUint(v, 256)
        );
        b.storeBit(self.allowOutOfOrderExecution);
    },
    toCell(self: GenericExtraArgsV2): c.Cell {
        return makeCellFrom<GenericExtraArgsV2>(self, GenericExtraArgsV2.store);
    }
}

/**
 > struct (0x1f3b3aba) SVMExtraArgsV1 {
 >     computeUnits: uint32
 >     accountIsWritableBitmap: uint64
 >     allowOutOfOrderExecution: bool
 >     tokenReceiver: uint256
 >     accounts: SnakedCell<uint256>
 > }
 */
export interface SVMExtraArgsV1 {
    readonly $: 'SVMExtraArgsV1'
    computeUnits: uint32
    accountIsWritableBitmap: uint64
    allowOutOfOrderExecution: boolean
    tokenReceiver: uint256
    accounts: SnakedCell<uint256>
}

export const SVMExtraArgsV1 = {
    PREFIX: 0x1f3b3aba,

    create(args: {
        computeUnits: uint32
        accountIsWritableBitmap: uint64
        allowOutOfOrderExecution: boolean
        tokenReceiver: uint256
        accounts: SnakedCell<uint256>
    }): SVMExtraArgsV1 {
        return {
            $: 'SVMExtraArgsV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): SVMExtraArgsV1 {
        loadAndCheckPrefix32(s, 0x1f3b3aba, 'SVMExtraArgsV1');
        return {
            $: 'SVMExtraArgsV1',
            computeUnits: s.loadUintBig(32),
            accountIsWritableBitmap: s.loadUintBig(64),
            allowOutOfOrderExecution: s.loadBoolean(),
            tokenReceiver: s.loadUintBig(256),
            accounts: s.loadRef(),
        }
    },
    store(self: SVMExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x1f3b3aba, 32);
        b.storeUint(self.computeUnits, 32);
        b.storeUint(self.accountIsWritableBitmap, 64);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        b.storeRef(self.accounts);
    },
    toCell(self: SVMExtraArgsV1): c.Cell {
        return makeCellFrom<SVMExtraArgsV1>(self, SVMExtraArgsV1.store);
    }
}

/**
 > struct (0x21ea4ca9) SuiExtraArgsV1 {
 >     gasLimit: uint256
 >     allowOutOfOrderExecution: bool
 >     tokenReceiver: uint256
 >     receiverObjectIds: SnakedCell<uint256>
 > }
 */
export interface SuiExtraArgsV1 {
    readonly $: 'SuiExtraArgsV1'
    gasLimit: uint256
    allowOutOfOrderExecution: boolean
    tokenReceiver: uint256
    receiverObjectIds: SnakedCell<uint256>
}

export const SuiExtraArgsV1 = {
    PREFIX: 0x21ea4ca9,

    create(args: {
        gasLimit: uint256
        allowOutOfOrderExecution: boolean
        tokenReceiver: uint256
        receiverObjectIds: SnakedCell<uint256>
    }): SuiExtraArgsV1 {
        return {
            $: 'SuiExtraArgsV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): SuiExtraArgsV1 {
        loadAndCheckPrefix32(s, 0x21ea4ca9, 'SuiExtraArgsV1');
        return {
            $: 'SuiExtraArgsV1',
            gasLimit: s.loadUintBig(256),
            allowOutOfOrderExecution: s.loadBoolean(),
            tokenReceiver: s.loadUintBig(256),
            receiverObjectIds: s.loadRef(),
        }
    },
    store(self: SuiExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x21ea4ca9, 32);
        b.storeUint(self.gasLimit, 256);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        b.storeRef(self.receiverObjectIds);
    },
    toCell(self: SuiExtraArgsV1): c.Cell {
        return makeCellFrom<SuiExtraArgsV1>(self, SuiExtraArgsV1.store);
    }
}

/**
 > struct TokenAmount {
 >     amount: coins
 >     token: address
 > }
 */
export interface TokenAmount {
    readonly $: 'TokenAmount'
    amount: coins
    token: c.Address
}

export const TokenAmount = {
    create(args: {
        amount: coins
        token: c.Address
    }): TokenAmount {
        return {
            $: 'TokenAmount',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAmount {
        return {
            $: 'TokenAmount',
            amount: s.loadCoins(),
            token: s.loadAddress(),
        }
    },
    store(self: TokenAmount, b: c.Builder): void {
        b.storeCoins(self.amount);
        b.storeAddress(self.token);
    },
    toCell(self: TokenAmount): c.Cell {
        return makeCellFrom<TokenAmount>(self, TokenAmount.store);
    }
}

/**
 > struct Ownable2Step {
 >     owner: address
 >     pendingOwner: address?
 > }
 */
export interface Ownable2Step {
    readonly $: 'Ownable2Step'
    owner: c.Address
    pendingOwner: c.Address | null
}

export const Ownable2Step = {
    create(args: {
        owner: c.Address
        pendingOwner: c.Address | null
    }): Ownable2Step {
        return {
            $: 'Ownable2Step',
            ...args
        }
    },
    fromSlice(s: c.Slice): Ownable2Step {
        return {
            $: 'Ownable2Step',
            owner: s.loadAddress(),
            pendingOwner: s.loadMaybeAddress(),
        }
    },
    store(self: Ownable2Step, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.pendingOwner);
    },
    toCell(self: Ownable2Step): c.Cell {
        return makeCellFrom<Ownable2Step>(self, Ownable2Step.store);
    }
}

/**
 > struct Ownable2Step_OwnershipTransferRequested {
 >     queryId: uint64
 >     newOwner: address
 > }
 */
export interface Ownable2Step_OwnershipTransferRequested {
    readonly $: 'Ownable2Step_OwnershipTransferRequested'
    queryId: uint64
    newOwner: c.Address
}

export const Ownable2Step_OwnershipTransferRequested = {
    create(args: {
        queryId: uint64
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            ...args
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_OwnershipTransferRequested, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_OwnershipTransferRequested): c.Cell {
        return makeCellFrom<Ownable2Step_OwnershipTransferRequested>(self, Ownable2Step_OwnershipTransferRequested.store);
    }
}

/**
 > struct Ownable2Step_OwnershipTransferred {
 >     queryId: uint64
 >     oldOwner: address
 >     newOwner: address
 > }
 */
export interface Ownable2Step_OwnershipTransferred {
    readonly $: 'Ownable2Step_OwnershipTransferred'
    queryId: uint64
    oldOwner: c.Address
    newOwner: c.Address
}

export const Ownable2Step_OwnershipTransferred = {
    create(args: {
        queryId: uint64
        oldOwner: c.Address
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            ...args
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            queryId: s.loadUintBig(64),
            oldOwner: s.loadAddress(),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_OwnershipTransferred, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.oldOwner);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_OwnershipTransferred): c.Cell {
        return makeCellFrom<Ownable2Step_OwnershipTransferred>(self, Ownable2Step_OwnershipTransferred.store);
    }
}

/**
 > struct (0xf343fc1b) Withdrawable_Withdraw {
 >     queryId: uint64
 >     destination: address
 >     amount: coins
 >     reserve: coins?
 >     drainAllAvailable: bool
 > }
 */
export interface Withdrawable_Withdraw {
    readonly $: 'Withdrawable_Withdraw'
    queryId: uint64
    destination: c.Address
    amount: coins
    reserve: coins | null
    drainAllAvailable: boolean
}

export const Withdrawable_Withdraw = {
    PREFIX: 0xf343fc1b,

    create(args: {
        queryId: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }): Withdrawable_Withdraw {
        return {
            $: 'Withdrawable_Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): Withdrawable_Withdraw {
        loadAndCheckPrefix32(s, 0xf343fc1b, 'Withdrawable_Withdraw');
        return {
            $: 'Withdrawable_Withdraw',
            queryId: s.loadUintBig(64),
            destination: s.loadAddress(),
            amount: s.loadCoins(),
            reserve: s.loadBoolean() ? s.loadCoins() : null,
            drainAllAvailable: s.loadBoolean(),
        }
    },
    store(self: Withdrawable_Withdraw, b: c.Builder): void {
        b.storeUint(0xf343fc1b, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.destination);
        b.storeCoins(self.amount);
        storeTolkNullable<coins>(self.reserve, b,
            (v,b) => b.storeCoins(v)
        );
        b.storeBit(self.drainAllAvailable);
    },
    toCell(self: Withdrawable_Withdraw): c.Cell {
        return makeCellFrom<Withdrawable_Withdraw>(self, Withdrawable_Withdraw.store);
    }
}

/**
 > struct (0x0aa811ed) Upgradeable_Upgrade {
 >     queryId: uint64
 >     code: cell
 > }
 */
export interface Upgradeable_Upgrade {
    readonly $: 'Upgradeable_Upgrade'
    queryId: uint64
    code: c.Cell
}

export const Upgradeable_Upgrade = {
    PREFIX: 0x0aa811ed,

    create(args: {
        queryId: uint64
        code: c.Cell
    }): Upgradeable_Upgrade {
        return {
            $: 'Upgradeable_Upgrade',
            ...args
        }
    },
    fromSlice(s: c.Slice): Upgradeable_Upgrade {
        loadAndCheckPrefix32(s, 0x0aa811ed, 'Upgradeable_Upgrade');
        return {
            $: 'Upgradeable_Upgrade',
            queryId: s.loadUintBig(64),
            code: s.loadRef(),
        }
    },
    store(self: Upgradeable_Upgrade, b: c.Builder): void {
        b.storeUint(0x0aa811ed, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.code);
    },
    toCell(self: Upgradeable_Upgrade): c.Cell {
        return makeCellFrom<Upgradeable_Upgrade>(self, Upgradeable_Upgrade.store);
    }
}

/**
 > struct Upgradeable_UpgradedEvent {
 >     code: cell
 >     hash: uint256
 >     version: UnsafeBodyNoRef<slice>
 > }
 */
export interface Upgradeable_UpgradedEvent {
    readonly $: 'Upgradeable_UpgradedEvent'
    code: c.Cell
    hash: uint256
    version: UnsafeBodyNoRef<c.Slice>
}

export const Upgradeable_UpgradedEvent = {
    create(args: {
        code: c.Cell
        hash: uint256
        version: UnsafeBodyNoRef<c.Slice>
    }): Upgradeable_UpgradedEvent {
        return {
            $: 'Upgradeable_UpgradedEvent',
            ...args
        }
    },
    fromSlice(s: c.Slice): Upgradeable_UpgradedEvent {
        throw new Error(`Can't unpack 'Upgradeable_UpgradedEvent' from cell, because 'UnsafeBodyNoRef.forceInline' is 'slice' (it can be used for writing only)`);
    },
    store(self: Upgradeable_UpgradedEvent, b: c.Builder): void {
        b.storeRef(self.code);
        b.storeUint(self.hash, 256);
        b.storeSlice(self.version.forceInline);
    },
    toCell(self: Upgradeable_UpgradedEvent): c.Cell {
        return makeCellFrom<Upgradeable_UpgradedEvent>(self, Upgradeable_UpgradedEvent.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

/**
 > struct (0x31768d95) Router_CCIPSend {
 >     queryID: uint64
 >     destChainSelector: uint64
 >     receiver: CrossChainAddress
 >     data: cell
 >     tokenAmounts: SnakedCell<TokenAmount>
 >     feeToken: address?
 >     extraArgs: cell
 > }
 */
export interface Router_CCIPSend {
    readonly $: 'Router_CCIPSend'
    queryID: uint64
    destChainSelector: uint64
    receiver: CrossChainAddress
    data: c.Cell
    tokenAmounts: SnakedCell<TokenAmount>
    feeToken: c.Address | null
    extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
}

export const Router_CCIPSend = {
    PREFIX: 0x31768d95,

    create(args: {
        queryID: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
    }): Router_CCIPSend {
        return {
            $: 'Router_CCIPSend',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_CCIPSend {
        loadAndCheckPrefix32(s, 0x31768d95, 'Router_CCIPSend');
        return {
            $: 'Router_CCIPSend',
            queryID: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            receiver: CrossChainAddress.fromSlice(s),
            data: s.loadRef(),
            tokenAmounts: s.loadRef(),
            feeToken: s.loadMaybeAddress(),
            extraArgs: loadCellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>(s,
                (s) => lookupPrefix(s, 0x181dcf10, 32) ? GenericExtraArgsV2.fromSlice(s) :
                    lookupPrefix(s, 0x1f3b3aba, 32) ? SVMExtraArgsV1.fromSlice(s) :
                    lookupPrefix(s, 0x21ea4ca9, 32) ? SuiExtraArgsV1.fromSlice(s) :
                    throwNonePrefixMatch('Router_CCIPSend.extraArgs')
            ),
        }
    },
    store(self: Router_CCIPSend, b: c.Builder): void {
        b.storeUint(0x31768d95, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.destChainSelector, 64);
        CrossChainAddress.store(self.receiver, b);
        b.storeRef(self.data);
        b.storeRef(self.tokenAmounts);
        b.storeAddress(self.feeToken);
        storeCellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>(self.extraArgs, b,
            (v,b) => { switch (v.$) {
                case 'GenericExtraArgsV2':
                    GenericExtraArgsV2.store(v, b);
                    break;
                case 'SVMExtraArgsV1':
                    SVMExtraArgsV1.store(v, b);
                    break;
                case 'SuiExtraArgsV1':
                    SuiExtraArgsV1.store(v, b);
                    break;
            } }
        );
    },
    toCell(self: Router_CCIPSend): c.Cell {
        return makeCellFrom<Router_CCIPSend>(self, Router_CCIPSend.store);
    }
}

// ————————————————————————————————————————————
//    class FeeQuoter
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class FeeQuoter implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'Upgradeable_Error.VersionMismatch': 19900,
        'FeeQuoter_Error.UnsupportedChainFamilySelector': 34400,
        'FeeQuoter_Error.GasLimitTooHigh': 34401,
        'FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue': 34402,
        'FeeQuoter_Error.InvalidExtraArgsData': 34403,
        'FeeQuoter_Error.InvalidSuiReceiverAddress': 34407,
        'FeeQuoter_Error.InvalidSVMReceiverAddress': 34408,
        'FeeQuoter_Error.TooManySuiExtraArgsReceiverObjectIds': 34410,
        'FeeQuoter_Error.MsgDataTooLarge': 34411,
        'FeeQuoter_Error.StaleGasPrice': 34412,
        'FeeQuoter_Error.DestChainNotEnabled': 34413,
        'FeeQuoter_Error.FeeTokenNotSupported': 34414,
        'FeeQuoter_Error.InvalidMsgData': 34415,
        'FeeQuoter_Error.TokenNotSupported': 34416,
        'FeeQuoter_Error.UnknownDestChainSelector': 34417,
        'FeeQuoter_Error.InsufficientFee': 34418,
        'FeeQuoter_Error.TokenTransfersNotSupported': 34419,
        'FeeQuoter_Error.UnauthorizedPriceUpdater': 34420,
        'FeeQuoter_Error.TokenPriceTooLow': 34425,
        'FeeQuoter_Error.MessageFeeTooHigh': 34427,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'Withdrawable_Error.InsufficientBalance': 57100,
        'Withdrawable_Error.HitReserve': 57101,
        'Withdrawable_Error.InvalidRequest': 57102,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static registerCustomPackUnpack<T>(
        typeName: string,
        packToBuilderFn: CustomPackToBuilderFn<T> | null,
        unpackFromSliceFn: CustomUnpackFromSliceFn<T> | null,
    ) {
        if (customSerializersRegistry.has(typeName)) {
            throw new Error(`Custom pack/unpack for 'FeeQuoter.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new FeeQuoter(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        allowedPriceUpdaters: c.Dictionary<c.Address, []>
        maxFeeJuelsPerMsg: uint96
        linkToken: c.Address
        tokenPriceStalenessThreshold: uint32
        usdPerToken: c.Dictionary<c.Address, TimestampedPrice>
        premiumMultiplierWeiPerEth: c.Dictionary<c.Address, uint64>
        destChainConfigs: c.Dictionary<uint64, DestChainConfig>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? FeeQuoter.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new FeeQuoter(address, initialState);
    }

    static createCellOfFeeQuoterAddPriceUpdater(body: {
        priceUpdater: c.Address
    }) {
        return FeeQuoter_AddPriceUpdater.toCell(FeeQuoter_AddPriceUpdater.create(body));
    }

    static createCellOfFeeQuoterRemovePriceUpdater(body: {
        priceUpdater: c.Address
    }) {
        return FeeQuoter_RemovePriceUpdater.toCell(FeeQuoter_RemovePriceUpdater.create(body));
    }

    static createCellOfFeeQuoterUpdatePrices(body: {
        updates: PriceUpdates
        sendExcessesTo: c.Address | null
    }) {
        return FeeQuoter_UpdatePrices.toCell(FeeQuoter_UpdatePrices.create(body));
    }

    static createCellOfFeeQuoterUpdateFeeTokens(body: {
        add: c.Dictionary<c.Address, FeeToken>
        remove: SnakedCell<c.Address>
    }) {
        return FeeQuoter_UpdateFeeTokens.toCell(FeeQuoter_UpdateFeeTokens.create(body));
    }

    static createCellOfFeeQuoterUpdateTokenTransferFeeConfigs(body: {
        updates: c.Dictionary<uint64, UpdateTokenTransferFeeConfig>
    }) {
        return FeeQuoter_UpdateTokenTransferFeeConfigs.toCell(FeeQuoter_UpdateTokenTransferFeeConfigs.create(body));
    }

    static createCellOfFeeQuoterUpdateDestChainConfigs(body: {
        updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>
    }) {
        return FeeQuoter_UpdateDestChainConfigs.toCell(FeeQuoter_UpdateDestChainConfigs.create(body));
    }

    static createCellOfFeeQuoterGetValidatedFeeRemainingBitsAndRefs_(body: {
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }) {
        return makeCellFrom<FeeQuoter_GetValidatedFee<RemainingBitsAndRefs>>(FeeQuoter_GetValidatedFee.create<RemainingBitsAndRefs>(body),
            (v,b) => { b.storeUint(0x7496ff56, 32);
            storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
            storeTolkRemaining(v.context, b); }
        );
    }

    static createCellOfWithdrawableWithdraw(body: {
        queryId: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }) {
        return Withdrawable_Withdraw.toCell(Withdrawable_Withdraw.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendFeeQuoterAddPriceUpdater(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        priceUpdater: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_AddPriceUpdater.toCell(FeeQuoter_AddPriceUpdater.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterRemovePriceUpdater(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        priceUpdater: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_RemovePriceUpdater.toCell(FeeQuoter_RemovePriceUpdater.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterUpdatePrices(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        updates: PriceUpdates
        sendExcessesTo: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_UpdatePrices.toCell(FeeQuoter_UpdatePrices.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterUpdateFeeTokens(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        add: c.Dictionary<c.Address, FeeToken>
        remove: SnakedCell<c.Address>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_UpdateFeeTokens.toCell(FeeQuoter_UpdateFeeTokens.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterUpdateTokenTransferFeeConfigs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        updates: c.Dictionary<uint64, UpdateTokenTransferFeeConfig>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_UpdateTokenTransferFeeConfigs.toCell(FeeQuoter_UpdateTokenTransferFeeConfigs.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterUpdateDestChainConfigs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        updates: SnakedCell<FeeQuoter_UpdateDestChainConfig>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_UpdateDestChainConfigs.toCell(FeeQuoter_UpdateDestChainConfigs.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterGetValidatedFeeRemainingBitsAndRefs_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<FeeQuoter_GetValidatedFee<RemainingBitsAndRefs>>(FeeQuoter_GetValidatedFee.create<RemainingBitsAndRefs>(body),
                (v,b) => { b.storeUint(0x7496ff56, 32);
                storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
                storeTolkRemaining(v.context, b); }
            ),
            ...extraOptions
        });
    }

    async sendWithdrawableWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Withdrawable_Withdraw.toCell(Withdrawable_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendUpgradeableUpgrade(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        code: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body)),
            ...extraOptions
        });
    }

    async getValidatedFeeCell(provider: ContractProvider, msg: CellRef<Router_CCIPSend>): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('validatedFeeCell', [
            { type: 'cell', cell: Router_CCIPSend.toCell(msg.ref) },
        ]));
        return r.readBigInt();
    }

    async getValidatedFee(provider: ContractProvider, msg: {
        readonly $: 'Router_CCIPSend'
        queryID: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: c.Cell
    }): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('validatedFee', [
            { type: 'int', value: msg.queryID },
            { type: 'int', value: msg.destChainSelector },
            { type: 'slice', cell: beginCell().storeSlice(msg.receiver).endCell() },
            { type: 'cell', cell: msg.data },
            { type: 'cell', cell: msg.tokenAmounts },
            msg.feeToken === null ? { type: 'null' } : { type: 'slice', cell: makeCellFrom<c.Address | null>(msg.feeToken,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'cell', cell: msg.extraArgs },
        ]));
        return r.readBigInt();
    }

    async getTokenPrice(provider: ContractProvider, token: c.Address): Promise<TimestampedPrice> {
        const r = StackReader.fromGetMethod(2, await provider.get('tokenPrice', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return ({
            $: 'TimestampedPrice',
            value: r.readBigInt(),
            timestamp: r.readBigInt(),
        });
    }

    async getTokenPrices(provider: ContractProvider, tokens: array<c.Address>): Promise<array<CellRef<TimestampedPrice> | null>> {
        const r = StackReader.fromGetMethod(1, await provider.get('tokenPrices', [
            { type: 'tuple', items: tokens.map(
                (ith) => ({ type: 'slice', cell: makeCellFrom<c.Address>(ith,
                    (v,b) => b.storeAddress(v)
                ) })
            )},
        ]));
        return r.readArrayOf<CellRef<TimestampedPrice> | null>(
            (r) => r.readNullable<CellRef<TimestampedPrice>>(
                (r) => r.readCellRef<TimestampedPrice>(TimestampedPrice.fromSlice)
            )
        );
    }

    async getDestinationChainGasPrice(provider: ContractProvider, destChainSelector: uint64): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('destinationChainGasPrice', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readCell();
    }

    async getTokenAndGasPrices(provider: ContractProvider, token: c.Address, destChainSelector: uint64): Promise<void> {
        const r = StackReader.fromGetMethod(0, await provider.get('tokenAndGasPrices', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: destChainSelector },
        ]));
        return void 0;
    }

    async getPremiumMultiplierWeiPerEth(provider: ContractProvider, token: c.Address): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('premiumMultiplierWeiPerEth', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBigInt();
    }

    async getFeeTokens(provider: ContractProvider): Promise<lisp_list<c.Address>> {
        const r = StackReader.fromGetMethod(1, await provider.get('feeTokens', []));
        return r.readLispListOf<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getTokenTransferFeeConfig(provider: ContractProvider, destChainSelector: uint64, token: c.Address): Promise<TokenTransferFeeConfig> {
        const r = StackReader.fromGetMethod(6, await provider.get('tokenTransferFeeConfig', [
            { type: 'int', value: destChainSelector },
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return ({
            $: 'TokenTransferFeeConfig',
            isEnabled: r.readBoolean(),
            minFeeUsdCents: r.readBigInt(),
            maxFeeUsdCents: r.readBigInt(),
            deciBps: r.readBigInt(),
            destGasOverhead: r.readBigInt(),
            destBytesOverhead: r.readBigInt(),
        });
    }

    async getDestChainConfig(provider: ContractProvider, destChainSelector: uint64): Promise<DestChainConfig> {
        const r = StackReader.fromGetMethod(20, await provider.get('destChainConfig', [
            { type: 'int', value: destChainSelector },
        ]));
        return ({
            $: 'DestChainConfig',
            config: ({
                $: 'FeeQuoterDestChainConfig',
                isEnabled: r.readBoolean(),
                maxNumberOfTokensPerMsg: r.readBigInt(),
                maxDataBytes: r.readBigInt(),
                maxPerMsgGasLimit: r.readBigInt(),
                destGasOverhead: r.readBigInt(),
                destGasPerPayloadByteBase: r.readBigInt(),
                destGasPerPayloadByteHigh: r.readBigInt(),
                destGasPerPayloadByteThreshold: r.readBigInt(),
                destDataAvailabilityOverheadGas: r.readBigInt(),
                destGasPerDataAvailabilityByte: r.readBigInt(),
                destDataAvailabilityMultiplierBps: r.readBigInt(),
                chainFamilySelector: r.readBigInt(),
                defaultTokenFeeUsdCents: r.readBigInt(),
                defaultTokenDestGasOverhead: r.readBigInt(),
                defaultTxGasLimit: r.readBigInt(),
                gasMultiplierWeiPerEth: r.readBigInt(),
                gasPriceStalenessThreshold: r.readBigInt(),
                networkFeeUsdCents: r.readBigInt(),
            }),
            usdPerUnitGas: r.readCellRef<GasPrice>(GasPrice.fromSlice),
            tokenTransferFeeConfigs: r.readDictionary<c.Address, TokenTransferFeeConfig>(c.Dictionary.Keys.Address(), createDictionaryValue<TokenTransferFeeConfig>(TokenTransferFeeConfig.fromSlice, TokenTransferFeeConfig.store)),
        });
    }

    async getStaticConfig(provider: ContractProvider): Promise<[
        uint96,
        c.Address,
        uint32,
    ]> {
        const r = StackReader.fromGetMethod(3, await provider.get('staticConfig', []));
        return [
            r.readBigInt(),
            r.readSlice().loadAddress(),
            r.readBigInt(),
        ];
    }

    async getDataAvailabilityCost(provider: ContractProvider, destChainSelector: uint64, dataAvailabilityGasPrice: uint112, calldataLen: uint256, tokenCount: uint256, tokenTransferBytesOverhead: uint256): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('dataAvailabilityCost', [
            { type: 'int', value: destChainSelector },
            { type: 'int', value: dataAvailabilityGasPrice },
            { type: 'int', value: calldataLen },
            { type: 'int', value: tokenCount },
            { type: 'int', value: tokenTransferBytesOverhead },
        ]));
        return r.readBigInt();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getPendingOwner(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('pendingOwner', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getTypeAndVersion(provider: ContractProvider): Promise<[
        c.Slice,
        c.Slice,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('typeAndVersion', []));
        return [
            r.readSlice(),
            r.readSlice(),
        ];
    }

    async getFacilityId(provider: ContractProvider): Promise<uint16> {
        const r = StackReader.fromGetMethod(1, await provider.get('facilityId', []));
        return r.readBigInt();
    }

    async getErrorCode(provider: ContractProvider, local: uint16): Promise<uint16> {
        const r = StackReader.fromGetMethod(1, await provider.get('errorCode', [
            { type: 'int', value: local },
        ]));
        return r.readBigInt();
    }

    async getDestChainSelectors(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('destChainSelectors', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
    }

    async getReserve(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('reserve', []));
        return r.readBigInt();
    }
}
