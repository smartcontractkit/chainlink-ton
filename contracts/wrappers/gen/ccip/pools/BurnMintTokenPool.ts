// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a BurnMintTokenPool contract in Tolk.
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

function storeCellRef<T>(value: T, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(value, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): T {
    let s_ref = s.loadRef().beginParse();
    return loadFn_T(s_ref);
}

function dictToMap<K extends c.DictionaryKeyTypes, V>(d: c.Dictionary<K, V>): Map<K, V> {
    const map = new Map<K, V>();
    for (const [k, v] of d) {
        map.set(k, v);
    }
    return map;
}

function mapToDict<K extends c.DictionaryKeyTypes, V>(m: Map<K, V>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<V>): c.Dictionary<K, V> {
    const d = c.Dictionary.empty<K, V>(keySerializer, valueSerializer);
    for (const [k, v] of m) {
        d.set(k, v);
    }
    return d;
}


function dictToSet<K extends c.DictionaryKeyTypes>(d: c.Dictionary<K, []>): Set<K> {
    const set = new Set<K>();
    for (const k of d.keys()) {
        set.add(k);
    }
    return set;
}

function setToDict<K extends c.DictionaryKeyTypes>(s: Set<K>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<[]>): c.Dictionary<K, []> {
    const d = c.Dictionary.empty<K, []>(keySerializer, valueSerializer);
    for (const k of s) {
        d.set(k, []);
    }
    return d;
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
            itemB.storeRef(tail);
            storeFn_T(v[i], itemB);
            tail = itemB.endCell();
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

    readWideNullable<T>(stackW: number, readFn_T: (r: StackReader) => T): T | null {
        const slotTypeId = this.tuple[stackW - 1];
        if (slotTypeId?.type !== 'int') {
            throw new Error(`not 'int' on a stack`);
        }
        if (slotTypeId.value === 0n) {
            this.tuple = this.tuple.slice(stackW);
            return null;
        }
        const valueT = readFn_T(this);
        this.tuple.shift();
        return valueT;
    }

    readCellRef<T>(loadFn_T: LoadCallback<T>): T {
        return loadFn_T(this.readCell().beginParse());
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'BurnMintTokenPool.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > BurnMintTokenPool.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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

type int32 = bigint

type uint8 = bigint
type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint120 = bigint
type uint128 = bigint
type uint256 = bigint

type varuint32 = bigint

/**
 > type ExtraCurrenciesMap = map<int32, varuint32>
 */
export type ExtraCurrenciesMap = Map<int32, varuint32>

export const ExtraCurrenciesMap = {
    fromSlice(s: c.Slice): ExtraCurrenciesMap {
        return dictToMap(c.Dictionary.load<int32, varuint32>(c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
                    (s) => s.loadVarUintBig(5),
                    (v,b) => b.storeVarUint(v, 5)
                ), s));
    },
    store(self: ExtraCurrenciesMap, b: c.Builder): void {
        b.storeDict<int32, varuint32>(mapToDict(self, c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
                        (s) => s.loadVarUintBig(5),
                        (v,b) => b.storeVarUint(v, 5)
                    )), c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
            (s) => s.loadVarUintBig(5),
            (v,b) => b.storeVarUint(v, 5)
        ));
    },
    toCell(self: ExtraCurrenciesMap): c.Cell {
        return makeCellFrom<ExtraCurrenciesMap>(self, ExtraCurrenciesMap.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = T[]

function buildSnakedCellOf<T>(v: SnakedCell<T>, storeFn_T: StoreCallback<T>): c.Cell {
    if (v.length === 0) {
        return c.Cell.EMPTY;
    }
    const cells: c.Builder[] = [];
    let builder = c.beginCell();
    for (const value of v) {
        let itemB = c.beginCell();
        storeFn_T(value, itemB);
        if (builder.availableBits < itemB.bits || builder.availableRefs <= 1) {
            cells.push(builder);
            builder = c.beginCell();
        }
        builder.storeBuilder(itemB);
    }
    cells.push(builder);
    let current = cells[cells.length - 1].endCell();
    for (let i = cells.length - 2; i >= 0; i--) {
        cells[i].storeRef(current);
        current = cells[i].endCell();
    }
    return current;
}

function storeSnakedCellOf<T>(v: SnakedCell<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    b.storeRef(buildSnakedCellOf(v, storeFn_T));
}

function loadSnakedCellOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): SnakedCell<T> {
    let outArr = [] as T[];
    let head = s.loadRef().beginParse();
    while (head.remainingBits > 0 || head.remainingRefs > 0) {
        if (head.remainingBits > 0) {
            outArr.push(loadFn_T(head));
        }
        if (head.remainingRefs > 0) {
            head = head.loadRef().beginParse();
        } else {
            break;
        }
    }
    return outArr;
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
    pendingOwner: c.Address | null /* = null */
}

export const Ownable2Step = {
    create(args: {
        owner: c.Address
        pendingOwner?: c.Address | null /* = null */
    }): Ownable2Step {
        return {
            $: 'Ownable2Step',
            pendingOwner: null,
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
        queryId?: uint64
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            ...args,
            queryId: args.queryId ?? 0n
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
        queryId?: uint64
        oldOwner: c.Address
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            ...args,
            queryId: args.queryId ?? 0n
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
 > type ForwardPayloadRemainder = RemainingBitsAndRefs
 */
export type ForwardPayloadRemainder = RemainingBitsAndRefs

export const ForwardPayloadRemainder = {
    fromSlice(s: c.Slice): ForwardPayloadRemainder {
        return loadTolkRemaining(s);
    },
    store(self: ForwardPayloadRemainder, b: c.Builder): void {
        storeTolkRemaining(self, b);
    },
    toCell(self: ForwardPayloadRemainder): c.Cell {
        return makeCellFrom<ForwardPayloadRemainder>(self, ForwardPayloadRemainder.store);
    }
}

/**
 > struct (0x0f8a7ea5) AskToTransfer {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferRecipient: address
 >     sendExcessesTo: address?
 >     customPayload: cell?
 >     forwardTonAmount: coins
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface AskToTransfer {
    readonly $: 'AskToTransfer'
    queryId: uint64
    jettonAmount: coins
    transferRecipient: c.Address
    sendExcessesTo: c.Address | null
    customPayload: c.Cell | null
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

export const AskToTransfer = {
    PREFIX: 0x0f8a7ea5,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AskToTransfer {
        loadAndCheckPrefix32(s, 0x0f8a7ea5, 'AskToTransfer');
        return {
            $: 'AskToTransfer',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferRecipient: s.loadAddress(),
            sendExcessesTo: s.loadMaybeAddress(),
            customPayload: s.loadBoolean() ? s.loadRef() : null,
            forwardTonAmount: s.loadCoins(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: AskToTransfer, b: c.Builder): void {
        b.storeUint(0x0f8a7ea5, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferRecipient);
        b.storeAddress(self.sendExcessesTo);
        storeTolkNullable<c.Cell>(self.customPayload, b,
            (v,b) => b.storeRef(v)
        );
        b.storeCoins(self.forwardTonAmount);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: AskToTransfer): c.Cell {
        return makeCellFrom<AskToTransfer>(self, AskToTransfer.store);
    }
}

/**
 > struct (0x7362d09c) TransferNotificationForRecipient {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferInitiator: address?
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface TransferNotificationForRecipient {
    readonly $: 'TransferNotificationForRecipient'
    queryId: uint64
    jettonAmount: coins
    transferInitiator: c.Address | null
    forwardPayload: ForwardPayloadRemainder
}

export const TransferNotificationForRecipient = {
    PREFIX: 0x7362d09c,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TransferNotificationForRecipient {
        loadAndCheckPrefix32(s, 0x7362d09c, 'TransferNotificationForRecipient');
        return {
            $: 'TransferNotificationForRecipient',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferInitiator: s.loadMaybeAddress(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: TransferNotificationForRecipient, b: c.Builder): void {
        b.storeUint(0x7362d09c, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferInitiator);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: TransferNotificationForRecipient): c.Cell {
        return makeCellFrom<TransferNotificationForRecipient>(self, TransferNotificationForRecipient.store);
    }
}

/**
 > struct (0x178d4519) InternalTransferStep {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferInitiator: address?
 >     sendExcessesTo: address?
 >     forwardTonAmount: coins
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface InternalTransferStep {
    readonly $: 'InternalTransferStep'
    queryId: uint64
    jettonAmount: coins
    transferInitiator: c.Address | null
    sendExcessesTo: c.Address | null
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

export const InternalTransferStep = {
    PREFIX: 0x178d4519,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        sendExcessesTo: c.Address | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): InternalTransferStep {
        return {
            $: 'InternalTransferStep',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): InternalTransferStep {
        loadAndCheckPrefix32(s, 0x178d4519, 'InternalTransferStep');
        return {
            $: 'InternalTransferStep',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferInitiator: s.loadMaybeAddress(),
            sendExcessesTo: s.loadMaybeAddress(),
            forwardTonAmount: s.loadCoins(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: InternalTransferStep, b: c.Builder): void {
        b.storeUint(0x178d4519, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferInitiator);
        b.storeAddress(self.sendExcessesTo);
        b.storeCoins(self.forwardTonAmount);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: InternalTransferStep): c.Cell {
        return makeCellFrom<InternalTransferStep>(self, InternalTransferStep.store);
    }
}

/**
 > struct (0x00000015) MintNewJettons {
 >     queryId: uint64
 >     mintRecipient: address
 >     tonAmount: coins
 >     internalTransferMsg: Cell<InternalTransferStep>
 > }
 */
export interface MintNewJettons {
    readonly $: 'MintNewJettons'
    queryId: uint64
    mintRecipient: c.Address
    tonAmount: coins
    internalTransferMsg: InternalTransferStep
}

export const MintNewJettons = {
    PREFIX: 0x00000015,

    create(args: {
        queryId?: uint64
        mintRecipient: c.Address
        tonAmount: coins
        internalTransferMsg: InternalTransferStep
    }): MintNewJettons {
        return {
            $: 'MintNewJettons',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): MintNewJettons {
        loadAndCheckPrefix32(s, 0x00000015, 'MintNewJettons');
        return {
            $: 'MintNewJettons',
            queryId: s.loadUintBig(64),
            mintRecipient: s.loadAddress(),
            tonAmount: s.loadCoins(),
            internalTransferMsg: loadCellRef<InternalTransferStep>(s, InternalTransferStep.fromSlice),
        }
    },
    store(self: MintNewJettons, b: c.Builder): void {
        b.storeUint(0x00000015, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.mintRecipient);
        b.storeCoins(self.tonAmount);
        storeCellRef<InternalTransferStep>(self.internalTransferMsg, b, InternalTransferStep.store);
    },
    toCell(self: MintNewJettons): c.Cell {
        return makeCellFrom<MintNewJettons>(self, MintNewJettons.store);
    }
}

/**
 > struct (0xfb88e119) ClaimMinterAdmin {
 >     queryId: uint64
 > }
 */
export interface ClaimMinterAdmin {
    readonly $: 'ClaimMinterAdmin'
    queryId: uint64
}

export const ClaimMinterAdmin = {
    PREFIX: 0xfb88e119,

    create(args: {
        queryId?: uint64
    }): ClaimMinterAdmin {
        return {
            $: 'ClaimMinterAdmin',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ClaimMinterAdmin {
        loadAndCheckPrefix32(s, 0xfb88e119, 'ClaimMinterAdmin');
        return {
            $: 'ClaimMinterAdmin',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: ClaimMinterAdmin, b: c.Builder): void {
        b.storeUint(0xfb88e119, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: ClaimMinterAdmin): c.Cell {
        return makeCellFrom<ClaimMinterAdmin>(self, ClaimMinterAdmin.store);
    }
}

/**
 > struct JettonClient {
 >     masterAddress: address
 >     jettonWalletCode: cell
 > }
 */
export interface JettonClient {
    readonly $: 'JettonClient'
    masterAddress: c.Address
    jettonWalletCode: c.Cell
}

export const JettonClient = {
    create(args: {
        masterAddress: c.Address
        jettonWalletCode: c.Cell
    }): JettonClient {
        return {
            $: 'JettonClient',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonClient {
        return {
            $: 'JettonClient',
            masterAddress: s.loadAddress(),
            jettonWalletCode: s.loadRef(),
        }
    },
    store(self: JettonClient, b: c.Builder): void {
        b.storeAddress(self.masterAddress);
        b.storeRef(self.jettonWalletCode);
    },
    toCell(self: JettonClient): c.Cell {
        return makeCellFrom<JettonClient>(self, JettonClient.store);
    }
}

/**
 > struct JettonWithdrawable_WithdrawFeeTransfer {
 >     wallet: address
 >     value: coins
 >     msg: AskToTransfer
 > }
 */
export interface JettonWithdrawable_WithdrawFeeTransfer {
    readonly $: 'JettonWithdrawable_WithdrawFeeTransfer'
    wallet: c.Address
    value: coins
    msg: AskToTransfer
}

export const JettonWithdrawable_WithdrawFeeTransfer = {
    create(args: {
        wallet: c.Address
        value: coins
        msg: AskToTransfer
    }): JettonWithdrawable_WithdrawFeeTransfer {
        return {
            $: 'JettonWithdrawable_WithdrawFeeTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_WithdrawFeeTransfer {
        return {
            $: 'JettonWithdrawable_WithdrawFeeTransfer',
            wallet: s.loadAddress(),
            value: s.loadCoins(),
            msg: AskToTransfer.fromSlice(s),
        }
    },
    store(self: JettonWithdrawable_WithdrawFeeTransfer, b: c.Builder): void {
        b.storeAddress(self.wallet);
        b.storeCoins(self.value);
        AskToTransfer.store(self.msg, b);
    },
    toCell(self: JettonWithdrawable_WithdrawFeeTransfer): c.Cell {
        return makeCellFrom<JettonWithdrawable_WithdrawFeeTransfer>(self, JettonWithdrawable_WithdrawFeeTransfer.store);
    }
}

/**
 > struct (0x0d00995c) JettonWithdrawable_Withdraw {
 >     queryId: uint64
 >     transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
 > }
 */
export interface JettonWithdrawable_Withdraw {
    readonly $: 'JettonWithdrawable_Withdraw'
    queryId: uint64
    transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
}

export const JettonWithdrawable_Withdraw = {
    PREFIX: 0x0d00995c,

    create(args: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }): JettonWithdrawable_Withdraw {
        return {
            $: 'JettonWithdrawable_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_Withdraw {
        loadAndCheckPrefix32(s, 0x0d00995c, 'JettonWithdrawable_Withdraw');
        return {
            $: 'JettonWithdrawable_Withdraw',
            queryId: s.loadUintBig(64),
            transfers: loadArrayOf<JettonWithdrawable_WithdrawFeeTransfer>(s, JettonWithdrawable_WithdrawFeeTransfer.fromSlice),
        }
    },
    store(self: JettonWithdrawable_Withdraw, b: c.Builder): void {
        b.storeUint(0x0d00995c, 32);
        b.storeUint(self.queryId, 64);
        storeArrayOf<JettonWithdrawable_WithdrawFeeTransfer>(self.transfers, b, JettonWithdrawable_WithdrawFeeTransfer.store);
    },
    toCell(self: JettonWithdrawable_Withdraw): c.Cell {
        return makeCellFrom<JettonWithdrawable_Withdraw>(self, JettonWithdrawable_Withdraw.store);
    }
}

/**
 > struct JettonWithdrawable_FeeTokenWithdrawn {
 >     wallet: address
 >     amount: coins
 > }
 */
export interface JettonWithdrawable_FeeTokenWithdrawn {
    readonly $: 'JettonWithdrawable_FeeTokenWithdrawn'
    wallet: c.Address
    amount: coins
}

export const JettonWithdrawable_FeeTokenWithdrawn = {
    create(args: {
        wallet: c.Address
        amount: coins
    }): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            wallet: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonWithdrawable_FeeTokenWithdrawn, b: c.Builder): void {
        b.storeAddress(self.wallet);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonWithdrawable_FeeTokenWithdrawn): c.Cell {
        return makeCellFrom<JettonWithdrawable_FeeTokenWithdrawn>(self, JettonWithdrawable_FeeTokenWithdrawn.store);
    }
}

/**
 > struct JettonWithdrawable_WithdrawFailed {
 >     wallet: address
 >     ask: AskToTransfer
 > }
 */
export interface JettonWithdrawable_WithdrawFailed {
    readonly $: 'JettonWithdrawable_WithdrawFailed'
    wallet: c.Address
    ask: AskToTransfer
}

export const JettonWithdrawable_WithdrawFailed = {
    create(args: {
        wallet: c.Address
        ask: AskToTransfer
    }): JettonWithdrawable_WithdrawFailed {
        return {
            $: 'JettonWithdrawable_WithdrawFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_WithdrawFailed {
        return {
            $: 'JettonWithdrawable_WithdrawFailed',
            wallet: s.loadAddress(),
            ask: AskToTransfer.fromSlice(s),
        }
    },
    store(self: JettonWithdrawable_WithdrawFailed, b: c.Builder): void {
        b.storeAddress(self.wallet);
        AskToTransfer.store(self.ask, b);
    },
    toCell(self: JettonWithdrawable_WithdrawFailed): c.Cell {
        return makeCellFrom<JettonWithdrawable_WithdrawFailed>(self, JettonWithdrawable_WithdrawFailed.store);
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
 > struct (0x6890a205) DepositAccount_Init {
 >     queryId: uint64
 >     forwardPayload: cell?
 > }
 */
export interface DepositAccount_Init {
    readonly $: 'DepositAccount_Init'
    queryId: uint64
    forwardPayload: c.Cell | null
}

export const DepositAccount_Init = {
    PREFIX: 0x6890a205,

    create(args: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }): DepositAccount_Init {
        return {
            $: 'DepositAccount_Init',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Init {
        loadAndCheckPrefix32(s, 0x6890a205, 'DepositAccount_Init');
        return {
            $: 'DepositAccount_Init',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Init, b: c.Builder): void {
        b.storeUint(0x6890a205, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Init): c.Cell {
        return makeCellFrom<DepositAccount_Init>(self, DepositAccount_Init.store);
    }
}

/**
 > struct (0xda04630c) DepositAccount_Reply {
 >     queryId: uint64
 >     forwardPayload: cell?
 > }
 */
export interface DepositAccount_Reply {
    readonly $: 'DepositAccount_Reply'
    queryId: uint64
    forwardPayload: c.Cell | null
}

export const DepositAccount_Reply = {
    PREFIX: 0xda04630c,

    create(args: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }): DepositAccount_Reply {
        return {
            $: 'DepositAccount_Reply',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Reply {
        loadAndCheckPrefix32(s, 0xda04630c, 'DepositAccount_Reply');
        return {
            $: 'DepositAccount_Reply',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Reply, b: c.Builder): void {
        b.storeUint(0xda04630c, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Reply): c.Cell {
        return makeCellFrom<DepositAccount_Reply>(self, DepositAccount_Reply.store);
    }
}

/**
 > struct (0xb4fe5c0c) DepositAccount_ForwardNotification {
 >     message: Cell<DepositAccount_InMessageForward>
 > }
 */
export interface DepositAccount_ForwardNotification {
    readonly $: 'DepositAccount_ForwardNotification'
    message: DepositAccount_InMessageForward
}

export const DepositAccount_ForwardNotification = {
    PREFIX: 0xb4fe5c0c,

    create(args: {
        message: DepositAccount_InMessageForward
    }): DepositAccount_ForwardNotification {
        return {
            $: 'DepositAccount_ForwardNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_ForwardNotification {
        loadAndCheckPrefix32(s, 0xb4fe5c0c, 'DepositAccount_ForwardNotification');
        return {
            $: 'DepositAccount_ForwardNotification',
            message: loadCellRef<DepositAccount_InMessageForward>(s, DepositAccount_InMessageForward.fromSlice),
        }
    },
    store(self: DepositAccount_ForwardNotification, b: c.Builder): void {
        b.storeUint(0xb4fe5c0c, 32);
        storeCellRef<DepositAccount_InMessageForward>(self.message, b, DepositAccount_InMessageForward.store);
    },
    toCell(self: DepositAccount_ForwardNotification): c.Cell {
        return makeCellFrom<DepositAccount_ForwardNotification>(self, DepositAccount_ForwardNotification.store);
    }
}

/**
 > struct DepositAccount_InMessageForward {
 >     senderAddress: address
 >     valueCoins: coins
 >     valueExtra: ExtraCurrenciesMap
 >     originalForwardFee: coins
 >     createdLt: uint64
 >     createdAt: uint32
 >     body: cell
 > }
 */
export interface DepositAccount_InMessageForward {
    readonly $: 'DepositAccount_InMessageForward'
    senderAddress: c.Address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: c.Cell
}

export const DepositAccount_InMessageForward = {
    create(args: {
        senderAddress: c.Address
        valueCoins: coins
        valueExtra: ExtraCurrenciesMap
        originalForwardFee: coins
        createdLt: uint64
        createdAt: uint32
        body: c.Cell
    }): DepositAccount_InMessageForward {
        return {
            $: 'DepositAccount_InMessageForward',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_InMessageForward {
        return {
            $: 'DepositAccount_InMessageForward',
            senderAddress: s.loadAddress(),
            valueCoins: s.loadCoins(),
            valueExtra: ExtraCurrenciesMap.fromSlice(s),
            originalForwardFee: s.loadCoins(),
            createdLt: s.loadUintBig(64),
            createdAt: s.loadUintBig(32),
            body: s.loadRef(),
        }
    },
    store(self: DepositAccount_InMessageForward, b: c.Builder): void {
        b.storeAddress(self.senderAddress);
        b.storeCoins(self.valueCoins);
        ExtraCurrenciesMap.store(self.valueExtra, b);
        b.storeCoins(self.originalForwardFee);
        b.storeUint(self.createdLt, 64);
        b.storeUint(self.createdAt, 32);
        b.storeRef(self.body);
    },
    toCell(self: DepositAccount_InMessageForward): c.Cell {
        return makeCellFrom<DepositAccount_InMessageForward>(self, DepositAccount_InMessageForward.store);
    }
}

/**
 > struct (0x595f07bc) CCT_AskToBurn {
 >     queryId: uint64
 >     jettonAmount: coins
 >     sendExcessesTo: address?
 >     customPayload: cell?
 >     forwardPayload: cell?
 > }
 */
export interface CCT_AskToBurn {
    readonly $: 'CCT_AskToBurn'
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: c.Address | null
    customPayload: c.Cell | null
    forwardPayload: c.Cell | null
}

export const CCT_AskToBurn = {
    PREFIX: 0x595f07bc,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardPayload: c.Cell | null
    }): CCT_AskToBurn {
        return {
            $: 'CCT_AskToBurn',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): CCT_AskToBurn {
        loadAndCheckPrefix32(s, 0x595f07bc, 'CCT_AskToBurn');
        return {
            $: 'CCT_AskToBurn',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            sendExcessesTo: s.loadMaybeAddress(),
            customPayload: s.loadBoolean() ? s.loadRef() : null,
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: CCT_AskToBurn, b: c.Builder): void {
        b.storeUint(0x595f07bc, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.sendExcessesTo);
        storeTolkNullable<c.Cell>(self.customPayload, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: CCT_AskToBurn): c.Cell {
        return makeCellFrom<CCT_AskToBurn>(self, CCT_AskToBurn.store);
    }
}

/**
 > struct (0xd53276db) CCT_ReturnExcessesBack {
 >     queryId: uint64
 >     initiator: address
 >     forwardPayload: cell?
 > }
 */
export interface CCT_ReturnExcessesBack {
    readonly $: 'CCT_ReturnExcessesBack'
    queryId: uint64
    initiator: c.Address
    forwardPayload: c.Cell | null /* = null */
}

export const CCT_ReturnExcessesBack = {
    PREFIX: 0xd53276db,

    create(args: {
        queryId?: uint64
        initiator: c.Address
        forwardPayload?: c.Cell | null /* = null */
    }): CCT_ReturnExcessesBack {
        return {
            $: 'CCT_ReturnExcessesBack',
            forwardPayload: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): CCT_ReturnExcessesBack {
        loadAndCheckPrefix32(s, 0xd53276db, 'CCT_ReturnExcessesBack');
        return {
            $: 'CCT_ReturnExcessesBack',
            queryId: s.loadUintBig(64),
            initiator: s.loadAddress(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: CCT_ReturnExcessesBack, b: c.Builder): void {
        b.storeUint(0xd53276db, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.initiator);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: CCT_ReturnExcessesBack): c.Cell {
        return makeCellFrom<CCT_ReturnExcessesBack>(self, CCT_ReturnExcessesBack.store);
    }
}

/**
 > struct CursedSubjects {
 >     data: map<uint128, ()>
 > }
 */
export interface CursedSubjects {
    readonly $: 'CursedSubjects'
    data: Set<uint128> /* = [] as map<uint128, ()> */
}

export const CursedSubjects = {
    create(args: {
        data: Set<uint128> /* = [] as map<uint128, ()> */
    }): CursedSubjects {
        return {
            $: 'CursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): CursedSubjects {
        return {
            $: 'CursedSubjects',
            data: dictToSet(c.Dictionary.load<uint128, []>(c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
        }
    },
    store(self: CursedSubjects, b: c.Builder): void {
        b.storeDict<uint128, []>(setToDict(self.data, c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: CursedSubjects): c.Cell {
        return makeCellFrom<CursedSubjects>(self, CursedSubjects.store);
    }
}

/**
 > struct CursePolicy {
 >     rbac: Cell<AccessControl_Data>
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface CursePolicy {
    readonly $: 'CursePolicy'
    rbac: AccessControl_Data
    cursedSubjects: CursedSubjects
}

export const CursePolicy = {
    create(args: {
        rbac: AccessControl_Data
        cursedSubjects: CursedSubjects
    }): CursePolicy {
        return {
            $: 'CursePolicy',
            ...args
        }
    },
    fromSlice(s: c.Slice): CursePolicy {
        return {
            $: 'CursePolicy',
            rbac: loadCellRef<AccessControl_Data>(s, AccessControl_Data.fromSlice),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: CursePolicy, b: c.Builder): void {
        storeCellRef<AccessControl_Data>(self.rbac, b, AccessControl_Data.store);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: CursePolicy): c.Cell {
        return makeCellFrom<CursePolicy>(self, CursePolicy.store);
    }
}

/**
 > struct (0xf3388046) CursePolicy_Curse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface CursePolicy_Curse {
    readonly $: 'CursePolicy_Curse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const CursePolicy_Curse = {
    PREFIX: 0xf3388046,

    create(args: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }): CursePolicy_Curse {
        return {
            $: 'CursePolicy_Curse',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): CursePolicy_Curse {
        loadAndCheckPrefix32(s, 0xf3388046, 'CursePolicy_Curse');
        return {
            $: 'CursePolicy_Curse',
            queryId: s.loadUintBig(64),
            subjects: loadSnakedCellOf(s, (s) => s.loadUintBig(128)),
        }
    },
    store(self: CursePolicy_Curse, b: c.Builder): void {
        b.storeUint(0xf3388046, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.subjects, b, (v, b) => b.storeUint(v, 128));
    },
    toCell(self: CursePolicy_Curse): c.Cell {
        return makeCellFrom<CursePolicy_Curse>(self, CursePolicy_Curse.store);
    }
}

/**
 > struct (0x3f153a31) CursePolicy_Uncurse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface CursePolicy_Uncurse {
    readonly $: 'CursePolicy_Uncurse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const CursePolicy_Uncurse = {
    PREFIX: 0x3f153a31,

    create(args: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }): CursePolicy_Uncurse {
        return {
            $: 'CursePolicy_Uncurse',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): CursePolicy_Uncurse {
        loadAndCheckPrefix32(s, 0x3f153a31, 'CursePolicy_Uncurse');
        return {
            $: 'CursePolicy_Uncurse',
            queryId: s.loadUintBig(64),
            subjects: loadSnakedCellOf(s, (s) => s.loadUintBig(128)),
        }
    },
    store(self: CursePolicy_Uncurse, b: c.Builder): void {
        b.storeUint(0x3f153a31, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.subjects, b, (v, b) => b.storeUint(v, 128));
    },
    toCell(self: CursePolicy_Uncurse): c.Cell {
        return makeCellFrom<CursePolicy_Uncurse>(self, CursePolicy_Uncurse.store);
    }
}

/**
 > struct TokenPool_AdminConfig {
 >     ownable: Cell<Ownable2Step>
 >     dynamicConfig: Cell<TokenPool_DynamicConfig>
 >     jettonClient: JettonClient
 >     allowedFinalityConfig: uint32
 >     advancedPoolHooks: address?
 >     deployableCode: cell?
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: Ownable2Step
    dynamicConfig: TokenPool_DynamicConfig
    jettonClient: JettonClient
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
    advancedPoolHooks: c.Address | null /* = null */
    deployableCode: c.Cell | null /* = null */
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: Ownable2Step
        dynamicConfig: TokenPool_DynamicConfig
        jettonClient: JettonClient
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
        advancedPoolHooks?: c.Address | null /* = null */
        deployableCode?: c.Cell | null /* = null */
    }): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            allowedFinalityConfig: 0n,
            advancedPoolHooks: null,
            deployableCode: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            ownable: loadCellRef<Ownable2Step>(s, Ownable2Step.fromSlice),
            dynamicConfig: loadCellRef<TokenPool_DynamicConfig>(s, TokenPool_DynamicConfig.fromSlice),
            jettonClient: JettonClient.fromSlice(s),
            allowedFinalityConfig: s.loadUintBig(32),
            advancedPoolHooks: s.loadMaybeAddress(),
            deployableCode: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
        JettonClient.store(self.jettonClient, b);
        b.storeUint(self.allowedFinalityConfig, 32);
        b.storeAddress(self.advancedPoolHooks);
        storeTolkNullable<c.Cell>(self.deployableCode, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_AdminConfig): c.Cell {
        return makeCellFrom<TokenPool_AdminConfig>(self, TokenPool_AdminConfig.store);
    }
}

/**
 > struct TokenPool_Data {
 >     adminConfig: Cell<TokenPool_AdminConfig>
 >     localPolicy: Cell<TokenPool_LocalPolicy>
 >     tokenDecimals: uint8
 >     remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>
 >     tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: TokenPool_AdminConfig
    localPolicy: TokenPool_LocalPolicy
    tokenDecimals: uint8
    remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
    tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: TokenPool_AdminConfig
        localPolicy: TokenPool_LocalPolicy
        tokenDecimals: uint8
        remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
        tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
    }): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            adminConfig: loadCellRef<TokenPool_AdminConfig>(s, TokenPool_AdminConfig.fromSlice),
            localPolicy: loadCellRef<TokenPool_LocalPolicy>(s, TokenPool_LocalPolicy.fromSlice),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: dictToMap(c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s)),
            tokenTransferFeeConfigs: dictToMap(c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s)),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_LocalPolicy>(self.localPolicy, b, TokenPool_LocalPolicy.store);
        b.storeUint(self.tokenDecimals, 8);
        b.storeDict<uint64, TokenPool_RemoteChainConfig>(mapToDict(self.remoteChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store));
        b.storeDict<uint64, TokenPool_TokenTransferFeeConfig>(mapToDict(self.tokenTransferFeeConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store));
    },
    toCell(self: TokenPool_Data): c.Cell {
        return makeCellFrom<TokenPool_Data>(self, TokenPool_Data.store);
    }
}

/**
 > struct TokenPool_DynamicConfig {
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 >     allowedDepositNamespaces: map<uint32, ()>
 > }
 */
export interface TokenPool_DynamicConfig {
    readonly $: 'TokenPool_DynamicConfig'
    router: c.Address
    rateLimitAdmin: c.Address | null /* = null */
    feeAdmin: c.Address | null
    allowedDepositNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
}

export const TokenPool_DynamicConfig = {
    create(args: {
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin: c.Address | null
        allowedDepositNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
    }): TokenPool_DynamicConfig {
        return {
            $: 'TokenPool_DynamicConfig',
            rateLimitAdmin: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_DynamicConfig {
        return {
            $: 'TokenPool_DynamicConfig',
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
            allowedDepositNamespaces: dictToSet(c.Dictionary.load<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
        }
    },
    store(self: TokenPool_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
        b.storeDict<uint32, []>(setToDict(self.allowedDepositNamespaces, c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: TokenPool_DynamicConfig): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfig>(self, TokenPool_DynamicConfig.store);
    }
}

/**
 > struct TokenPool_LocalPolicy {
 >     cursePolicy: CursePolicy
 > }
 */
export interface TokenPool_LocalPolicy {
    readonly $: 'TokenPool_LocalPolicy'
    cursePolicy: CursePolicy
}

export const TokenPool_LocalPolicy = {
    create(args: {
        cursePolicy: CursePolicy
    }): TokenPool_LocalPolicy {
        return {
            $: 'TokenPool_LocalPolicy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LocalPolicy {
        return {
            $: 'TokenPool_LocalPolicy',
            cursePolicy: CursePolicy.fromSlice(s),
        }
    },
    store(self: TokenPool_LocalPolicy, b: c.Builder): void {
        CursePolicy.store(self.cursePolicy, b);
    },
    toCell(self: TokenPool_LocalPolicy): c.Cell {
        return makeCellFrom<TokenPool_LocalPolicy>(self, TokenPool_LocalPolicy.store);
    }
}

/**
 > struct TokenPool_RateLimiterPair {
 >     outbound: Cell<RateLimiter_TokenBucket>
 >     inbound: Cell<RateLimiter_TokenBucket>
 > }
 */
export interface TokenPool_RateLimiterPair {
    readonly $: 'TokenPool_RateLimiterPair'
    outbound: RateLimiter_TokenBucket
    inbound: RateLimiter_TokenBucket
}

export const TokenPool_RateLimiterPair = {
    create(args: {
        outbound: RateLimiter_TokenBucket
        inbound: RateLimiter_TokenBucket
    }): TokenPool_RateLimiterPair {
        return {
            $: 'TokenPool_RateLimiterPair',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimiterPair {
        return {
            $: 'TokenPool_RateLimiterPair',
            outbound: loadCellRef<RateLimiter_TokenBucket>(s, RateLimiter_TokenBucket.fromSlice),
            inbound: loadCellRef<RateLimiter_TokenBucket>(s, RateLimiter_TokenBucket.fromSlice),
        }
    },
    store(self: TokenPool_RateLimiterPair, b: c.Builder): void {
        storeCellRef<RateLimiter_TokenBucket>(self.outbound, b, RateLimiter_TokenBucket.store);
        storeCellRef<RateLimiter_TokenBucket>(self.inbound, b, RateLimiter_TokenBucket.store);
    },
    toCell(self: TokenPool_RateLimiterPair): c.Cell {
        return makeCellFrom<TokenPool_RateLimiterPair>(self, TokenPool_RateLimiterPair.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigPair {
 >     outbound: Cell<RateLimiter_Config>
 >     inbound: Cell<RateLimiter_Config>
 > }
 */
export interface TokenPool_RateLimitConfigPair {
    readonly $: 'TokenPool_RateLimitConfigPair'
    outbound: RateLimiter_Config
    inbound: RateLimiter_Config
}

export const TokenPool_RateLimitConfigPair = {
    create(args: {
        outbound: RateLimiter_Config
        inbound: RateLimiter_Config
    }): TokenPool_RateLimitConfigPair {
        return {
            $: 'TokenPool_RateLimitConfigPair',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigPair {
        return {
            $: 'TokenPool_RateLimitConfigPair',
            outbound: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
            inbound: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
        }
    },
    store(self: TokenPool_RateLimitConfigPair, b: c.Builder): void {
        storeCellRef<RateLimiter_Config>(self.outbound, b, RateLimiter_Config.store);
        storeCellRef<RateLimiter_Config>(self.inbound, b, RateLimiter_Config.store);
    },
    toCell(self: TokenPool_RateLimitConfigPair): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigPair>(self, TokenPool_RateLimitConfigPair.store);
    }
}

/**
 > struct TokenPool_ChainUpdate {
 >     remoteChainSelector: uint64
 >     remotePoolAddresses: SnakedCell<CrossChainAddress>
 >     remoteTokenAddress: Cell<CrossChainAddress>
 >     rateLimitConfigs: Cell<TokenPool_RateLimitConfigPair>
 > }
 */
export interface TokenPool_ChainUpdate {
    readonly $: 'TokenPool_ChainUpdate'
    remoteChainSelector: uint64
    remotePoolAddresses: SnakedCell<CrossChainAddress>
    remoteTokenAddress: CrossChainAddress
    rateLimitConfigs: TokenPool_RateLimitConfigPair
}

export const TokenPool_ChainUpdate = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddresses: SnakedCell<CrossChainAddress>
        remoteTokenAddress: CrossChainAddress
        rateLimitConfigs: TokenPool_RateLimitConfigPair
    }): TokenPool_ChainUpdate {
        return {
            $: 'TokenPool_ChainUpdate',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainUpdate {
        return {
            $: 'TokenPool_ChainUpdate',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddresses: loadSnakedCellOf(s, CrossChainAddress.fromSlice),
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            rateLimitConfigs: loadCellRef<TokenPool_RateLimitConfigPair>(s, TokenPool_RateLimitConfigPair.fromSlice),
        }
    },
    store(self: TokenPool_ChainUpdate, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeSnakedCellOf(self.remotePoolAddresses, b, CrossChainAddress.store);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        storeCellRef<TokenPool_RateLimitConfigPair>(self.rateLimitConfigs, b, TokenPool_RateLimitConfigPair.store);
    },
    toCell(self: TokenPool_ChainUpdate): c.Cell {
        return makeCellFrom<TokenPool_ChainUpdate>(self, TokenPool_ChainUpdate.store);
    }
}

/**
 > struct TokenPool_RemoteChainConfig {
 >     remoteTokenAddress: Cell<CrossChainAddress>
 >     remotePools: map<uint256, Cell<CrossChainAddress>>
 >     rateLimiters: Cell<TokenPool_RateLimiterPair>
 >     fastFinalityRateLimiters: Cell<TokenPool_RateLimiterPair>
 > }
 */
export interface TokenPool_RemoteChainConfig {
    readonly $: 'TokenPool_RemoteChainConfig'
    remoteTokenAddress: CrossChainAddress
    remotePools: Map<uint256, CrossChainAddress> /* = [] as map<uint256, Cell<CrossChainAddress>> */
    rateLimiters: TokenPool_RateLimiterPair
    fastFinalityRateLimiters: TokenPool_RateLimiterPair
}

export const TokenPool_RemoteChainConfig = {
    create(args: {
        remoteTokenAddress: CrossChainAddress
        remotePools: Map<uint256, CrossChainAddress> /* = [] as map<uint256, Cell<CrossChainAddress>> */
        rateLimiters: TokenPool_RateLimiterPair
        fastFinalityRateLimiters: TokenPool_RateLimiterPair
    }): TokenPool_RemoteChainConfig {
        return {
            $: 'TokenPool_RemoteChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemoteChainConfig {
        return {
            $: 'TokenPool_RemoteChainConfig',
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remotePools: dictToMap(c.Dictionary.load<uint256, CrossChainAddress>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CrossChainAddress>(
                            (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
                        ), s)),
            rateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
            fastFinalityRateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
        }
    },
    store(self: TokenPool_RemoteChainConfig, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        b.storeDict<uint256, CrossChainAddress>(mapToDict(self.remotePools, c.Dictionary.Keys.BigUint(256), createDictionaryValue<CrossChainAddress>(
                        (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                        (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
                    )), c.Dictionary.Keys.BigUint(256), createDictionaryValue<CrossChainAddress>(
            (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
        ));
        storeCellRef<TokenPool_RateLimiterPair>(self.rateLimiters, b, TokenPool_RateLimiterPair.store);
        storeCellRef<TokenPool_RateLimiterPair>(self.fastFinalityRateLimiters, b, TokenPool_RateLimiterPair.store);
    },
    toCell(self: TokenPool_RemoteChainConfig): c.Cell {
        return makeCellFrom<TokenPool_RemoteChainConfig>(self, TokenPool_RemoteChainConfig.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigArgs {
 >     remoteChainSelector: uint64
 >     fastFinality: bool
 >     outboundRateLimiterConfig: Cell<RateLimiter_Config>
 >     inboundRateLimiterConfig: Cell<RateLimiter_Config>
 > }
 */
export interface TokenPool_RateLimitConfigArgs {
    readonly $: 'TokenPool_RateLimitConfigArgs'
    remoteChainSelector: uint64
    fastFinality: boolean
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}

export const TokenPool_RateLimitConfigArgs = {
    create(args: {
        remoteChainSelector: uint64
        fastFinality: boolean
        outboundRateLimiterConfig: RateLimiter_Config
        inboundRateLimiterConfig: RateLimiter_Config
    }): TokenPool_RateLimitConfigArgs {
        return {
            $: 'TokenPool_RateLimitConfigArgs',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigArgs {
        return {
            $: 'TokenPool_RateLimitConfigArgs',
            remoteChainSelector: s.loadUintBig(64),
            fastFinality: s.loadBoolean(),
            outboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
            inboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
        }
    },
    store(self: TokenPool_RateLimitConfigArgs, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeBit(self.fastFinality);
        storeCellRef<RateLimiter_Config>(self.outboundRateLimiterConfig, b, RateLimiter_Config.store);
        storeCellRef<RateLimiter_Config>(self.inboundRateLimiterConfig, b, RateLimiter_Config.store);
    },
    toCell(self: TokenPool_RateLimitConfigArgs): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigArgs>(self, TokenPool_RateLimitConfigArgs.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigArgs {
 >     destChainSelector: uint64
 >     tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
 > }
 */
export interface TokenPool_TokenTransferFeeConfigArgs {
    readonly $: 'TokenPool_TokenTransferFeeConfigArgs'
    destChainSelector: uint64
    tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
}

export const TokenPool_TokenTransferFeeConfigArgs = {
    create(args: {
        destChainSelector: uint64
        tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
    }): TokenPool_TokenTransferFeeConfigArgs {
        return {
            $: 'TokenPool_TokenTransferFeeConfigArgs',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigArgs {
        return {
            $: 'TokenPool_TokenTransferFeeConfigArgs',
            destChainSelector: s.loadUintBig(64),
            tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.fromSlice(s),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigArgs, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        TokenPool_TokenTransferFeeConfig.store(self.tokenTransferFeeConfig, b);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigArgs): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigArgs>(self, TokenPool_TokenTransferFeeConfigArgs.store);
    }
}

/**
 > struct TokenPool_LockOrBurnPrepared {
 >     feeAmount: coins
 >     destTokenAmount: coins
 >     out: TokenPool_LockOrBurnOutV1
 > }
 */
export interface TokenPool_LockOrBurnPrepared {
    readonly $: 'TokenPool_LockOrBurnPrepared'
    feeAmount: coins
    destTokenAmount: coins
    out: TokenPool_LockOrBurnOutV1
}

export const TokenPool_LockOrBurnPrepared = {
    create(args: {
        feeAmount: coins
        destTokenAmount: coins
        out: TokenPool_LockOrBurnOutV1
    }): TokenPool_LockOrBurnPrepared {
        return {
            $: 'TokenPool_LockOrBurnPrepared',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnPrepared {
        return {
            $: 'TokenPool_LockOrBurnPrepared',
            feeAmount: s.loadCoins(),
            destTokenAmount: s.loadCoins(),
            out: TokenPool_LockOrBurnOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnPrepared, b: c.Builder): void {
        b.storeCoins(self.feeAmount);
        b.storeCoins(self.destTokenAmount);
        TokenPool_LockOrBurnOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_LockOrBurnPrepared): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnPrepared>(self, TokenPool_LockOrBurnPrepared.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintPrepared {
 >     requestedFinalityConfig: uint32
 >     localAmount: coins
 >     out: TokenPool_ReleaseOrMintOutV1
 > }
 */
export interface TokenPool_ReleaseOrMintPrepared {
    readonly $: 'TokenPool_ReleaseOrMintPrepared'
    requestedFinalityConfig: uint32
    localAmount: coins
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintPrepared = {
    create(args: {
        requestedFinalityConfig: uint32
        localAmount: coins
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintPrepared {
        return {
            $: 'TokenPool_ReleaseOrMintPrepared',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintPrepared {
        return {
            $: 'TokenPool_ReleaseOrMintPrepared',
            requestedFinalityConfig: s.loadUintBig(32),
            localAmount: s.loadCoins(),
            out: TokenPool_ReleaseOrMintOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_ReleaseOrMintPrepared, b: c.Builder): void {
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeCoins(self.localAmount);
        TokenPool_ReleaseOrMintOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_ReleaseOrMintPrepared): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintPrepared>(self, TokenPool_ReleaseOrMintPrepared.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfig {
 >     destGasOverhead: uint32
 >     destBytesOverhead: uint32
 >     finalityFeeUSDCents: coins
 >     fastFinalityFeeUSDCents: coins
 >     finalityTransferFeeBps: uint16
 >     fastFinalityTransferFeeBps: uint16
 >     isEnabled: bool
 > }
 */
export interface TokenPool_TokenTransferFeeConfig {
    readonly $: 'TokenPool_TokenTransferFeeConfig'
    destGasOverhead: uint32
    destBytesOverhead: uint32
    finalityFeeUSDCents: coins
    fastFinalityFeeUSDCents: coins
    finalityTransferFeeBps: uint16
    fastFinalityTransferFeeBps: uint16
    isEnabled: boolean
}

export const TokenPool_TokenTransferFeeConfig = {
    create(args: {
        destGasOverhead: uint32
        destBytesOverhead: uint32
        finalityFeeUSDCents: coins
        fastFinalityFeeUSDCents: coins
        finalityTransferFeeBps: uint16
        fastFinalityTransferFeeBps: uint16
        isEnabled: boolean
    }): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            destGasOverhead: s.loadUintBig(32),
            destBytesOverhead: s.loadUintBig(32),
            finalityFeeUSDCents: s.loadCoins(),
            fastFinalityFeeUSDCents: s.loadCoins(),
            finalityTransferFeeBps: s.loadUintBig(16),
            fastFinalityTransferFeeBps: s.loadUintBig(16),
            isEnabled: s.loadBoolean(),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfig, b: c.Builder): void {
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
        b.storeCoins(self.finalityFeeUSDCents);
        b.storeCoins(self.fastFinalityFeeUSDCents);
        b.storeUint(self.finalityTransferFeeBps, 16);
        b.storeUint(self.fastFinalityTransferFeeBps, 16);
        b.storeBit(self.isEnabled);
    },
    toCell(self: TokenPool_TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfig>(self, TokenPool_TokenTransferFeeConfig.store);
    }
}

/**
 > enum TokenPool_MessageDirection { 2 variants }
 */
export type TokenPool_MessageDirection = bigint

export const TokenPool_MessageDirection = {
    Outbound: 0n,
    Inbound: 1n,

    fromSlice(s: c.Slice): TokenPool_MessageDirection {
        return s.loadUintBig(8);
    },
    store(self: TokenPool_MessageDirection, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: TokenPool_MessageDirection): c.Cell {
        return makeCellFrom<TokenPool_MessageDirection>(self, TokenPool_MessageDirection.store);
    }
}

/**
 > struct TokenPool_Transfer<S, R, C> {
 >     id: uint256
 >     details: Cell<TokenPool_TransferDetails<S, R, C>>
 > }
 */
export interface TokenPool_Transfer<S, R, C> {
    readonly $: 'TokenPool_Transfer'
    id: uint256
    details: TokenPool_TransferDetails<S, R, C>
}

export const TokenPool_Transfer = {
    create<S, R, C>(args: {
        id: uint256
        details: TokenPool_TransferDetails<S, R, C>
    }): TokenPool_Transfer<S, R, C> {
        return {
            $: 'TokenPool_Transfer',
            ...args
        }
    },
}

/**
 > struct TokenPool_TransferDetails<S, R, C> {
 >     receiver: R
 >     remoteChainSelector: uint64
 >     originalSender: S
 >     amount: C
 >     localToken: address
 > }
 */
export interface TokenPool_TransferDetails<S, R, C> {
    readonly $: 'TokenPool_TransferDetails'
    receiver: R
    remoteChainSelector: uint64
    originalSender: S
    amount: C
    localToken: c.Address
}

export const TokenPool_TransferDetails = {
    create<S, R, C>(args: {
        receiver: R
        remoteChainSelector: uint64
        originalSender: S
        amount: C
        localToken: c.Address
    }): TokenPool_TransferDetails<S, R, C> {
        return {
            $: 'TokenPool_TransferDetails',
            ...args
        }
    },
}

/**
 > type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<address, Cell<CrossChainAddress>, coins>
 */
export type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<c.Address, CrossChainAddress, coins>

export const TokenPool_LockOrBurnTransfer = {
    fromSlice(s: c.Slice): TokenPool_LockOrBurnTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<c.Address, CrossChainAddress, coins>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: s.loadAddress(),
                            amount: s.loadCoins(),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_LockOrBurnTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<c.Address, CrossChainAddress, coins>>(self.details, b,
            (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
            b.storeUint(v.remoteChainSelector, 64);
            b.storeAddress(v.originalSender);
            b.storeCoins(v.amount);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_LockOrBurnTransfer): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnTransfer>(self, TokenPool_LockOrBurnTransfer.store);
    }
}

/**
 > type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<Cell<CrossChainAddress>, address, uint256>
 */
export type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<CrossChainAddress, c.Address, uint256>

export const TokenPool_ReleaseOrMintTransfer = {
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<CrossChainAddress, c.Address, uint256>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: s.loadAddress(),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            amount: s.loadUintBig(256),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_ReleaseOrMintTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<CrossChainAddress, c.Address, uint256>>(self.details, b,
            (v,b) => { b.storeAddress(v.receiver);
            b.storeUint(v.remoteChainSelector, 64);
            storeCellRef<CrossChainAddress>(v.originalSender, b, CrossChainAddress.store);
            b.storeUint(v.amount, 256);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_ReleaseOrMintTransfer): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintTransfer>(self, TokenPool_ReleaseOrMintTransfer.store);
    }
}

/**
 > struct TokenPool_LockOrBurnInV1 {
 >     transfer: TokenPool_LockOrBurnTransfer
 > }
 */
export interface TokenPool_LockOrBurnInV1 {
    readonly $: 'TokenPool_LockOrBurnInV1'
    transfer: TokenPool_LockOrBurnTransfer
}

export const TokenPool_LockOrBurnInV1 = {
    create(args: {
        transfer: TokenPool_LockOrBurnTransfer
    }): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            transfer: TokenPool_LockOrBurnTransfer.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnInV1, b: c.Builder): void {
        TokenPool_LockOrBurnTransfer.store(self.transfer, b);
    },
    toCell(self: TokenPool_LockOrBurnInV1): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnInV1>(self, TokenPool_LockOrBurnInV1.store);
    }
}

/**
 > struct TokenPool_LockOrBurnOutV1 {
 >     destTokenAddress: Cell<CrossChainAddress>
 >     destPoolData: cell
 > }
 */
export interface TokenPool_LockOrBurnOutV1 {
    readonly $: 'TokenPool_LockOrBurnOutV1'
    destTokenAddress: CrossChainAddress
    destPoolData: c.Cell
}

export const TokenPool_LockOrBurnOutV1 = {
    create(args: {
        destTokenAddress: CrossChainAddress
        destPoolData: c.Cell
    }): TokenPool_LockOrBurnOutV1 {
        return {
            $: 'TokenPool_LockOrBurnOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnOutV1 {
        return {
            $: 'TokenPool_LockOrBurnOutV1',
            destTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            destPoolData: s.loadRef(),
        }
    },
    store(self: TokenPool_LockOrBurnOutV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.destTokenAddress, b, CrossChainAddress.store);
        b.storeRef(self.destPoolData);
    },
    toCell(self: TokenPool_LockOrBurnOutV1): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnOutV1>(self, TokenPool_LockOrBurnOutV1.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintInV1 {
 >     transfer: TokenPool_ReleaseOrMintTransfer
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     sourcePoolData: cell?
 >     offchainTokenData: cell?
 > }
 */
export interface TokenPool_ReleaseOrMintInV1 {
    readonly $: 'TokenPool_ReleaseOrMintInV1'
    transfer: TokenPool_ReleaseOrMintTransfer
    sourcePoolAddress: CrossChainAddress
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        transfer: TokenPool_ReleaseOrMintTransfer
        sourcePoolAddress: CrossChainAddress
        sourcePoolData: c.Cell | null
        offchainTokenData: c.Cell | null
    }): TokenPool_ReleaseOrMintInV1 {
        return {
            $: 'TokenPool_ReleaseOrMintInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintInV1 {
        return {
            $: 'TokenPool_ReleaseOrMintInV1',
            transfer: TokenPool_ReleaseOrMintTransfer.fromSlice(s),
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            sourcePoolData: s.loadBoolean() ? s.loadRef() : null,
            offchainTokenData: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_ReleaseOrMintInV1, b: c.Builder): void {
        TokenPool_ReleaseOrMintTransfer.store(self.transfer, b);
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        storeTolkNullable<c.Cell>(self.sourcePoolData, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.offchainTokenData, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_ReleaseOrMintInV1): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintInV1>(self, TokenPool_ReleaseOrMintInV1.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintOutV1 {
 >     destinationAmount: coins
 > }
 */
export interface TokenPool_ReleaseOrMintOutV1 {
    readonly $: 'TokenPool_ReleaseOrMintOutV1'
    destinationAmount: coins
}

export const TokenPool_ReleaseOrMintOutV1 = {
    create(args: {
        destinationAmount: coins
    }): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            destinationAmount: s.loadCoins(),
        }
    },
    store(self: TokenPool_ReleaseOrMintOutV1, b: c.Builder): void {
        b.storeCoins(self.destinationAmount);
    },
    toCell(self: TokenPool_ReleaseOrMintOutV1): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintOutV1>(self, TokenPool_ReleaseOrMintOutV1.store);
    }
}

/**
 > struct (0x56f73d37) TokenPool_ApplyChainUpdates {
 >     queryId: uint64
 >     remoteChainSelectorsToRemove: SnakedCell<uint64>
 >     chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
 > }
 */
export interface TokenPool_ApplyChainUpdates {
    readonly $: 'TokenPool_ApplyChainUpdates'
    queryId: uint64
    remoteChainSelectorsToRemove: SnakedCell<uint64>
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
}

export const TokenPool_ApplyChainUpdates = {
    PREFIX: 0x56f73d37,

    create(args: {
        queryId?: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }): TokenPool_ApplyChainUpdates {
        return {
            $: 'TokenPool_ApplyChainUpdates',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyChainUpdates {
        loadAndCheckPrefix32(s, 0x56f73d37, 'TokenPool_ApplyChainUpdates');
        return {
            $: 'TokenPool_ApplyChainUpdates',
            queryId: s.loadUintBig(64),
            remoteChainSelectorsToRemove: loadSnakedCellOf(s, (s) => s.loadUintBig(64)),
            chainsToAdd: loadSnakedCellOf(s, TokenPool_ChainUpdate.fromSlice),
        }
    },
    store(self: TokenPool_ApplyChainUpdates, b: c.Builder): void {
        b.storeUint(0x56f73d37, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.remoteChainSelectorsToRemove, b, (v, b) => b.storeUint(v, 64));
        storeSnakedCellOf(self.chainsToAdd, b, TokenPool_ChainUpdate.store);
    },
    toCell(self: TokenPool_ApplyChainUpdates): c.Cell {
        return makeCellFrom<TokenPool_ApplyChainUpdates>(self, TokenPool_ApplyChainUpdates.store);
    }
}

/**
 > struct (0x17c242dc) TokenPool_AddRemotePool {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_AddRemotePool {
    readonly $: 'TokenPool_AddRemotePool'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_AddRemotePool = {
    PREFIX: 0x17c242dc,

    create(args: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_AddRemotePool {
        return {
            $: 'TokenPool_AddRemotePool',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_AddRemotePool {
        loadAndCheckPrefix32(s, 0x17c242dc, 'TokenPool_AddRemotePool');
        return {
            $: 'TokenPool_AddRemotePool',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_AddRemotePool, b: c.Builder): void {
        b.storeUint(0x17c242dc, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_AddRemotePool): c.Cell {
        return makeCellFrom<TokenPool_AddRemotePool>(self, TokenPool_AddRemotePool.store);
    }
}

/**
 > struct (0x426b8cc4) TokenPool_RemoveRemotePool {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemoveRemotePool {
    readonly $: 'TokenPool_RemoveRemotePool'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_RemoveRemotePool = {
    PREFIX: 0x426b8cc4,

    create(args: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_RemoveRemotePool {
        return {
            $: 'TokenPool_RemoveRemotePool',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemoveRemotePool {
        loadAndCheckPrefix32(s, 0x426b8cc4, 'TokenPool_RemoveRemotePool');
        return {
            $: 'TokenPool_RemoveRemotePool',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemoveRemotePool, b: c.Builder): void {
        b.storeUint(0x426b8cc4, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemoveRemotePool): c.Cell {
        return makeCellFrom<TokenPool_RemoveRemotePool>(self, TokenPool_RemoveRemotePool.store);
    }
}

/**
 > struct (0xd7712810) TokenPool_SetDynamicConfig {
 >     queryId: uint64
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_SetDynamicConfig {
    readonly $: 'TokenPool_SetDynamicConfig'
    queryId: uint64
    router: c.Address
    rateLimitAdmin: c.Address | null /* = null */
    feeAdmin: c.Address | null /* = null */
}

export const TokenPool_SetDynamicConfig = {
    PREFIX: 0xd7712810,

    create(args: {
        queryId?: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }): TokenPool_SetDynamicConfig {
        return {
            $: 'TokenPool_SetDynamicConfig',
            rateLimitAdmin: null,
            feeAdmin: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetDynamicConfig {
        loadAndCheckPrefix32(s, 0xd7712810, 'TokenPool_SetDynamicConfig');
        return {
            $: 'TokenPool_SetDynamicConfig',
            queryId: s.loadUintBig(64),
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_SetDynamicConfig, b: c.Builder): void {
        b.storeUint(0xd7712810, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_SetDynamicConfig): c.Cell {
        return makeCellFrom<TokenPool_SetDynamicConfig>(self, TokenPool_SetDynamicConfig.store);
    }
}

/**
 > struct (0x3c50a39b) TokenPool_SetAllowedFinalityConfig {
 >     queryId: uint64
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_SetAllowedFinalityConfig {
    readonly $: 'TokenPool_SetAllowedFinalityConfig'
    queryId: uint64
    allowedFinalityConfig: uint32
}

export const TokenPool_SetAllowedFinalityConfig = {
    PREFIX: 0x3c50a39b,

    create(args: {
        queryId?: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_SetAllowedFinalityConfig {
        return {
            $: 'TokenPool_SetAllowedFinalityConfig',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetAllowedFinalityConfig {
        loadAndCheckPrefix32(s, 0x3c50a39b, 'TokenPool_SetAllowedFinalityConfig');
        return {
            $: 'TokenPool_SetAllowedFinalityConfig',
            queryId: s.loadUintBig(64),
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_SetAllowedFinalityConfig, b: c.Builder): void {
        b.storeUint(0x3c50a39b, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_SetAllowedFinalityConfig): c.Cell {
        return makeCellFrom<TokenPool_SetAllowedFinalityConfig>(self, TokenPool_SetAllowedFinalityConfig.store);
    }
}

/**
 > struct (0x3f5c9f57) TokenPool_SetAdvancedPoolHooks {
 >     queryId: uint64
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_SetAdvancedPoolHooks {
    readonly $: 'TokenPool_SetAdvancedPoolHooks'
    queryId: uint64
    advancedPoolHooks: c.Address | null
}

export const TokenPool_SetAdvancedPoolHooks = {
    PREFIX: 0x3f5c9f57,

    create(args: {
        queryId?: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_SetAdvancedPoolHooks {
        return {
            $: 'TokenPool_SetAdvancedPoolHooks',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetAdvancedPoolHooks {
        loadAndCheckPrefix32(s, 0x3f5c9f57, 'TokenPool_SetAdvancedPoolHooks');
        return {
            $: 'TokenPool_SetAdvancedPoolHooks',
            queryId: s.loadUintBig(64),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_SetAdvancedPoolHooks, b: c.Builder): void {
        b.storeUint(0x3f5c9f57, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.advancedPoolHooks);
    },
    toCell(self: TokenPool_SetAdvancedPoolHooks): c.Cell {
        return makeCellFrom<TokenPool_SetAdvancedPoolHooks>(self, TokenPool_SetAdvancedPoolHooks.store);
    }
}

/**
 > struct (0x3868e309) TokenPool_SetDeployableCode {
 >     queryId: uint64
 >     deployableCode: cell?
 > }
 */
export interface TokenPool_SetDeployableCode {
    readonly $: 'TokenPool_SetDeployableCode'
    queryId: uint64
    deployableCode: c.Cell | null
}

export const TokenPool_SetDeployableCode = {
    PREFIX: 0x3868e309,

    create(args: {
        queryId?: uint64
        deployableCode: c.Cell | null
    }): TokenPool_SetDeployableCode {
        return {
            $: 'TokenPool_SetDeployableCode',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetDeployableCode {
        loadAndCheckPrefix32(s, 0x3868e309, 'TokenPool_SetDeployableCode');
        return {
            $: 'TokenPool_SetDeployableCode',
            queryId: s.loadUintBig(64),
            deployableCode: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_SetDeployableCode, b: c.Builder): void {
        b.storeUint(0x3868e309, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.deployableCode, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_SetDeployableCode): c.Cell {
        return makeCellFrom<TokenPool_SetDeployableCode>(self, TokenPool_SetDeployableCode.store);
    }
}

/**
 > struct (0x89d602e5) TokenPool_DeployableCodeSet {
 >     queryId: uint64
 >     deployableCode: cell?
 > }
 */
export interface TokenPool_DeployableCodeSet {
    readonly $: 'TokenPool_DeployableCodeSet'
    queryId: uint64
    deployableCode: c.Cell | null
}

export const TokenPool_DeployableCodeSet = {
    PREFIX: 0x89d602e5,

    create(args: {
        queryId?: uint64
        deployableCode: c.Cell | null
    }): TokenPool_DeployableCodeSet {
        return {
            $: 'TokenPool_DeployableCodeSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_DeployableCodeSet {
        loadAndCheckPrefix32(s, 0x89d602e5, 'TokenPool_DeployableCodeSet');
        return {
            $: 'TokenPool_DeployableCodeSet',
            queryId: s.loadUintBig(64),
            deployableCode: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_DeployableCodeSet, b: c.Builder): void {
        b.storeUint(0x89d602e5, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.deployableCode, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_DeployableCodeSet): c.Cell {
        return makeCellFrom<TokenPool_DeployableCodeSet>(self, TokenPool_DeployableCodeSet.store);
    }
}

/**
 > struct (0x84384142) TokenPool_SetAllowedDepositNamespaces {
 >     queryId: uint64
 >     allowedDepositNamespaces: map<uint32, ()>
 > }
 */
export interface TokenPool_SetAllowedDepositNamespaces {
    readonly $: 'TokenPool_SetAllowedDepositNamespaces'
    queryId: uint64
    allowedDepositNamespaces: Set<uint32>
}

export const TokenPool_SetAllowedDepositNamespaces = {
    PREFIX: 0x84384142,

    create(args: {
        queryId?: uint64
        allowedDepositNamespaces: Set<uint32>
    }): TokenPool_SetAllowedDepositNamespaces {
        return {
            $: 'TokenPool_SetAllowedDepositNamespaces',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetAllowedDepositNamespaces {
        loadAndCheckPrefix32(s, 0x84384142, 'TokenPool_SetAllowedDepositNamespaces');
        return {
            $: 'TokenPool_SetAllowedDepositNamespaces',
            queryId: s.loadUintBig(64),
            allowedDepositNamespaces: dictToSet(c.Dictionary.load<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
        }
    },
    store(self: TokenPool_SetAllowedDepositNamespaces, b: c.Builder): void {
        b.storeUint(0x84384142, 32);
        b.storeUint(self.queryId, 64);
        b.storeDict<uint32, []>(setToDict(self.allowedDepositNamespaces, c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: TokenPool_SetAllowedDepositNamespaces): c.Cell {
        return makeCellFrom<TokenPool_SetAllowedDepositNamespaces>(self, TokenPool_SetAllowedDepositNamespaces.store);
    }
}

/**
 > struct (0xc1ffe3a6) TokenPool_AllowedDepositNamespacesSet {
 >     queryId: uint64
 > }
 */
export interface TokenPool_AllowedDepositNamespacesSet {
    readonly $: 'TokenPool_AllowedDepositNamespacesSet'
    queryId: uint64
}

export const TokenPool_AllowedDepositNamespacesSet = {
    PREFIX: 0xc1ffe3a6,

    create(args: {
        queryId?: uint64
    }): TokenPool_AllowedDepositNamespacesSet {
        return {
            $: 'TokenPool_AllowedDepositNamespacesSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_AllowedDepositNamespacesSet {
        loadAndCheckPrefix32(s, 0xc1ffe3a6, 'TokenPool_AllowedDepositNamespacesSet');
        return {
            $: 'TokenPool_AllowedDepositNamespacesSet',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_AllowedDepositNamespacesSet, b: c.Builder): void {
        b.storeUint(0xc1ffe3a6, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_AllowedDepositNamespacesSet): c.Cell {
        return makeCellFrom<TokenPool_AllowedDepositNamespacesSet>(self, TokenPool_AllowedDepositNamespacesSet.store);
    }
}

/**
 > struct (0x4fe2d26c) TokenPool_SetRateLimitConfig {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_RateLimitConfigArgs>
 > }
 */
export interface TokenPool_SetRateLimitConfig {
    readonly $: 'TokenPool_SetRateLimitConfig'
    queryId: uint64
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>
}

export const TokenPool_SetRateLimitConfig = {
    PREFIX: 0x4fe2d26c,

    create(args: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }): TokenPool_SetRateLimitConfig {
        return {
            $: 'TokenPool_SetRateLimitConfig',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRateLimitConfig {
        loadAndCheckPrefix32(s, 0x4fe2d26c, 'TokenPool_SetRateLimitConfig');
        return {
            $: 'TokenPool_SetRateLimitConfig',
            queryId: s.loadUintBig(64),
            updates: loadSnakedCellOf(s, TokenPool_RateLimitConfigArgs.fromSlice),
        }
    },
    store(self: TokenPool_SetRateLimitConfig, b: c.Builder): void {
        b.storeUint(0x4fe2d26c, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.updates, b, TokenPool_RateLimitConfigArgs.store);
    },
    toCell(self: TokenPool_SetRateLimitConfig): c.Cell {
        return makeCellFrom<TokenPool_SetRateLimitConfig>(self, TokenPool_SetRateLimitConfig.store);
    }
}

/**
 > struct (0x30a1d1f7) TokenPool_ApplyTokenTransferFeeConfigUpdates {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
 >     disableChainSelectors: SnakedCell<uint64>
 > }
 */
export interface TokenPool_ApplyTokenTransferFeeConfigUpdates {
    readonly $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates'
    queryId: uint64
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
    disableChainSelectors: SnakedCell<uint64>
}

export const TokenPool_ApplyTokenTransferFeeConfigUpdates = {
    PREFIX: 0x30a1d1f7,

    create(args: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        loadAndCheckPrefix32(s, 0x30a1d1f7, 'TokenPool_ApplyTokenTransferFeeConfigUpdates');
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            queryId: s.loadUintBig(64),
            updates: loadSnakedCellOf(s, TokenPool_TokenTransferFeeConfigArgs.fromSlice),
            disableChainSelectors: loadSnakedCellOf(s, (s) => s.loadUintBig(64)),
        }
    },
    store(self: TokenPool_ApplyTokenTransferFeeConfigUpdates, b: c.Builder): void {
        b.storeUint(0x30a1d1f7, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.updates, b, TokenPool_TokenTransferFeeConfigArgs.store);
        storeSnakedCellOf(self.disableChainSelectors, b, (v, b) => b.storeUint(v, 64));
    },
    toCell(self: TokenPool_ApplyTokenTransferFeeConfigUpdates): c.Cell {
        return makeCellFrom<TokenPool_ApplyTokenTransferFeeConfigUpdates>(self, TokenPool_ApplyTokenTransferFeeConfigUpdates.store);
    }
}

/**
 > struct (0xfa7da444) TokenPool_LockOrBurn {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     replyTo: address?
 > }
 */
export interface TokenPool_LockOrBurn {
    readonly $: 'TokenPool_LockOrBurn'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address | null
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }): TokenPool_LockOrBurn {
        return {
            $: 'TokenPool_LockOrBurn',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurn {
        loadAndCheckPrefix32(s, 0xfa7da444, 'TokenPool_LockOrBurn');
        return {
            $: 'TokenPool_LockOrBurn',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            tokenArgs: s.loadBoolean() ? s.loadRef() : null,
            replyTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_LockOrBurn, b: c.Builder): void {
        b.storeUint(0xfa7da444, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeTolkNullable<c.Cell>(self.tokenArgs, b,
            (v,b) => b.storeRef(v)
        );
        b.storeAddress(self.replyTo);
    },
    toCell(self: TokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurn>(self, TokenPool_LockOrBurn.store);
    }
}

/**
 > struct TokenPool_LockOrBurnForwardPayload {
 >     originalSender: address
 >     requestMsg: Cell<TokenPool_LockOrBurn>
 >     prepared: Cell<TokenPool_LockOrBurnPrepared>
 > }
 */
export interface TokenPool_LockOrBurnForwardPayload {
    readonly $: 'TokenPool_LockOrBurnForwardPayload'
    originalSender: c.Address
    requestMsg: TokenPool_LockOrBurn
    prepared: TokenPool_LockOrBurnPrepared
}

export const TokenPool_LockOrBurnForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: TokenPool_LockOrBurn
        prepared: TokenPool_LockOrBurnPrepared
    }): TokenPool_LockOrBurnForwardPayload {
        return {
            $: 'TokenPool_LockOrBurnForwardPayload',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnForwardPayload {
        return {
            $: 'TokenPool_LockOrBurnForwardPayload',
            originalSender: s.loadAddress(),
            requestMsg: loadCellRef<TokenPool_LockOrBurn>(s, TokenPool_LockOrBurn.fromSlice),
            prepared: loadCellRef<TokenPool_LockOrBurnPrepared>(s, TokenPool_LockOrBurnPrepared.fromSlice),
        }
    },
    store(self: TokenPool_LockOrBurnForwardPayload, b: c.Builder): void {
        b.storeAddress(self.originalSender);
        storeCellRef<TokenPool_LockOrBurn>(self.requestMsg, b, TokenPool_LockOrBurn.store);
        storeCellRef<TokenPool_LockOrBurnPrepared>(self.prepared, b, TokenPool_LockOrBurnPrepared.store);
    },
    toCell(self: TokenPool_LockOrBurnForwardPayload): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnForwardPayload>(self, TokenPool_LockOrBurnForwardPayload.store);
    }
}

/**
 > struct (0x351f77e3) TokenPool_ReleaseOrMint {
 >     queryId: uint64
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     requestedFinalityConfig: uint32
 >     replyTo: address?
 > }
 */
export interface TokenPool_ReleaseOrMint {
    readonly $: 'TokenPool_ReleaseOrMint'
    queryId: uint64
    request: TokenPool_ReleaseOrMintInV1
    requestedFinalityConfig: uint32
    replyTo: c.Address | null /* = null */
}

export const TokenPool_ReleaseOrMint = {
    PREFIX: 0x351f77e3,

    create(args: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }): TokenPool_ReleaseOrMint {
        return {
            $: 'TokenPool_ReleaseOrMint',
            replyTo: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMint {
        loadAndCheckPrefix32(s, 0x351f77e3, 'TokenPool_ReleaseOrMint');
        return {
            $: 'TokenPool_ReleaseOrMint',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            replyTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x351f77e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
    },
    toCell(self: TokenPool_ReleaseOrMint): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMint>(self, TokenPool_ReleaseOrMint.store);
    }
}

/**
 > struct (0x08f2ffb7) TokenPool_PreflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface TokenPool_PreflightCheckFinished {
    readonly $: 'TokenPool_PreflightCheckFinished'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PreflightCheckFinished = {
    PREFIX: 0x08f2ffb7,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PreflightCheckFinished {
        return {
            $: 'TokenPool_PreflightCheckFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFinished {
        loadAndCheckPrefix32(s, 0x08f2ffb7, 'TokenPool_PreflightCheckFinished');
        return {
            $: 'TokenPool_PreflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PreflightCheckFinished, b: c.Builder): void {
        b.storeUint(0x08f2ffb7, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: TokenPool_PreflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFinished>(self, TokenPool_PreflightCheckFinished.store);
    }
}

/**
 > struct (0xa6dfa623) TokenPool_PreflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface TokenPool_PreflightCheckFailed {
    readonly $: 'TokenPool_PreflightCheckFailed'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PreflightCheckFailed = {
    PREFIX: 0xa6dfa623,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PreflightCheckFailed {
        return {
            $: 'TokenPool_PreflightCheckFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFailed {
        loadAndCheckPrefix32(s, 0xa6dfa623, 'TokenPool_PreflightCheckFailed');
        return {
            $: 'TokenPool_PreflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PreflightCheckFailed, b: c.Builder): void {
        b.storeUint(0xa6dfa623, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: TokenPool_PreflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFailed>(self, TokenPool_PreflightCheckFailed.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintForwardPayload {
 >     originalSender: address
 >     requestMsg: Cell<TokenPool_ReleaseOrMint>
 >     prepared: Cell<TokenPool_ReleaseOrMintPrepared>
 > }
 */
export interface TokenPool_ReleaseOrMintForwardPayload {
    readonly $: 'TokenPool_ReleaseOrMintForwardPayload'
    originalSender: c.Address
    requestMsg: TokenPool_ReleaseOrMint
    prepared: TokenPool_ReleaseOrMintPrepared
}

export const TokenPool_ReleaseOrMintForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: TokenPool_ReleaseOrMint
        prepared: TokenPool_ReleaseOrMintPrepared
    }): TokenPool_ReleaseOrMintForwardPayload {
        return {
            $: 'TokenPool_ReleaseOrMintForwardPayload',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintForwardPayload {
        return {
            $: 'TokenPool_ReleaseOrMintForwardPayload',
            originalSender: s.loadAddress(),
            requestMsg: loadCellRef<TokenPool_ReleaseOrMint>(s, TokenPool_ReleaseOrMint.fromSlice),
            prepared: loadCellRef<TokenPool_ReleaseOrMintPrepared>(s, TokenPool_ReleaseOrMintPrepared.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintForwardPayload, b: c.Builder): void {
        b.storeAddress(self.originalSender);
        storeCellRef<TokenPool_ReleaseOrMint>(self.requestMsg, b, TokenPool_ReleaseOrMint.store);
        storeCellRef<TokenPool_ReleaseOrMintPrepared>(self.prepared, b, TokenPool_ReleaseOrMintPrepared.store);
    },
    toCell(self: TokenPool_ReleaseOrMintForwardPayload): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintForwardPayload>(self, TokenPool_ReleaseOrMintForwardPayload.store);
    }
}

/**
 > struct (0x9e2a6b66) TokenPool_PostflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface TokenPool_PostflightCheckFinished {
    readonly $: 'TokenPool_PostflightCheckFinished'
    queryId: uint64
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload
}

export const TokenPool_PostflightCheckFinished = {
    PREFIX: 0x9e2a6b66,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }): TokenPool_PostflightCheckFinished {
        return {
            $: 'TokenPool_PostflightCheckFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFinished {
        loadAndCheckPrefix32(s, 0x9e2a6b66, 'TokenPool_PostflightCheckFinished');
        return {
            $: 'TokenPool_PostflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PostflightCheckFinished, b: c.Builder): void {
        b.storeUint(0x9e2a6b66, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: TokenPool_PostflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFinished>(self, TokenPool_PostflightCheckFinished.store);
    }
}

/**
 > struct (0x21e71d87) TokenPool_PostflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface TokenPool_PostflightCheckFailed {
    readonly $: 'TokenPool_PostflightCheckFailed'
    queryId: uint64
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload
}

export const TokenPool_PostflightCheckFailed = {
    PREFIX: 0x21e71d87,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }): TokenPool_PostflightCheckFailed {
        return {
            $: 'TokenPool_PostflightCheckFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFailed {
        loadAndCheckPrefix32(s, 0x21e71d87, 'TokenPool_PostflightCheckFailed');
        return {
            $: 'TokenPool_PostflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PostflightCheckFailed, b: c.Builder): void {
        b.storeUint(0x21e71d87, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: TokenPool_PostflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFailed>(self, TokenPool_PostflightCheckFailed.store);
    }
}

/**
 > struct (0x4129d109) TokenPool_PreflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     amountPostFee: coins
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PreflightCheck {
    readonly $: 'TokenPool_PreflightCheck'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    amountPostFee: coins
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PreflightCheck = {
    PREFIX: 0x4129d109,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        amountPostFee: coins
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PreflightCheck {
        return {
            $: 'TokenPool_PreflightCheck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheck {
        loadAndCheckPrefix32(s, 0x4129d109, 'TokenPool_PreflightCheck');
        return {
            $: 'TokenPool_PreflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            tokenArgs: s.loadBoolean() ? s.loadRef() : null,
            amountPostFee: s.loadCoins(),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PreflightCheck, b: c.Builder): void {
        b.storeUint(0x4129d109, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeTolkNullable<c.Cell>(self.tokenArgs, b,
            (v,b) => b.storeRef(v)
        );
        b.storeCoins(self.amountPostFee);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PreflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheck>(self, TokenPool_PreflightCheck.store);
    }
}

/**
 > struct (0x703c2b58) TokenPool_PostflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     localAmount: coins
 >     requestedFinalityConfig: uint32
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PostflightCheck {
    readonly $: 'TokenPool_PostflightCheck'
    queryId: uint64
    request: TokenPool_ReleaseOrMintInV1
    localAmount: coins
    requestedFinalityConfig: uint32
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PostflightCheck = {
    PREFIX: 0x703c2b58,

    create(args: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        localAmount: coins
        requestedFinalityConfig: uint32
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PostflightCheck {
        return {
            $: 'TokenPool_PostflightCheck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheck {
        loadAndCheckPrefix32(s, 0x703c2b58, 'TokenPool_PostflightCheck');
        return {
            $: 'TokenPool_PostflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            localAmount: s.loadCoins(),
            requestedFinalityConfig: s.loadUintBig(32),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PostflightCheck, b: c.Builder): void {
        b.storeUint(0x703c2b58, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeCoins(self.localAmount);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PostflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheck>(self, TokenPool_PostflightCheck.store);
    }
}

/**
 > struct (0xc5476d2b) TokenPool_GetCCVs {
 >     queryId: uint64
 >     localToken: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     requestedFinalityConfig: uint32
 >     direction: TokenPool_MessageDirection
 >     extraData: cell?
 >     replyTo: address
 >     forwardPayload: cell?
 > }
 */
export interface TokenPool_GetCCVs {
    readonly $: 'TokenPool_GetCCVs'
    queryId: uint64
    localToken: c.Address
    remoteChainSelector: uint64
    amount: coins
    requestedFinalityConfig: uint32
    direction: TokenPool_MessageDirection
    extraData: c.Cell | null
    replyTo: c.Address
    forwardPayload: c.Cell | null
}

export const TokenPool_GetCCVs = {
    PREFIX: 0xc5476d2b,

    create(args: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        replyTo: c.Address
        forwardPayload: c.Cell | null
    }): TokenPool_GetCCVs {
        return {
            $: 'TokenPool_GetCCVs',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetCCVs {
        loadAndCheckPrefix32(s, 0xc5476d2b, 'TokenPool_GetCCVs');
        return {
            $: 'TokenPool_GetCCVs',
            queryId: s.loadUintBig(64),
            localToken: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            requestedFinalityConfig: s.loadUintBig(32),
            direction: TokenPool_MessageDirection.fromSlice(s),
            extraData: s.loadBoolean() ? s.loadRef() : null,
            replyTo: s.loadAddress(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_GetCCVs, b: c.Builder): void {
        b.storeUint(0xc5476d2b, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.localToken);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeUint(self.requestedFinalityConfig, 32);
        TokenPool_MessageDirection.store(self.direction, b);
        storeTolkNullable<c.Cell>(self.extraData, b,
            (v,b) => b.storeRef(v)
        );
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_GetCCVs): c.Cell {
        return makeCellFrom<TokenPool_GetCCVs>(self, TokenPool_GetCCVs.store);
    }
}

/**
 > struct (0xd22944d5) TokenPool_GetCCVsAndFees {
 >     queryId: uint64
 >     localToken: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     requestedFinalityConfig: uint32
 >     direction: TokenPool_MessageDirection
 >     extraData: cell?
 >     forwardPayload: cell?
 > }
 */
export interface TokenPool_GetCCVsAndFees {
    readonly $: 'TokenPool_GetCCVsAndFees'
    queryId: uint64
    localToken: c.Address
    remoteChainSelector: uint64
    amount: coins
    requestedFinalityConfig: uint32
    direction: TokenPool_MessageDirection
    extraData: c.Cell | null
    forwardPayload: c.Cell | null
}

export const TokenPool_GetCCVsAndFees = {
    PREFIX: 0xd22944d5,

    create(args: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        forwardPayload: c.Cell | null
    }): TokenPool_GetCCVsAndFees {
        return {
            $: 'TokenPool_GetCCVsAndFees',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetCCVsAndFees {
        loadAndCheckPrefix32(s, 0xd22944d5, 'TokenPool_GetCCVsAndFees');
        return {
            $: 'TokenPool_GetCCVsAndFees',
            queryId: s.loadUintBig(64),
            localToken: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            requestedFinalityConfig: s.loadUintBig(32),
            direction: TokenPool_MessageDirection.fromSlice(s),
            extraData: s.loadBoolean() ? s.loadRef() : null,
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_GetCCVsAndFees, b: c.Builder): void {
        b.storeUint(0xd22944d5, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.localToken);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeUint(self.requestedFinalityConfig, 32);
        TokenPool_MessageDirection.store(self.direction, b);
        storeTolkNullable<c.Cell>(self.extraData, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_GetCCVsAndFees): c.Cell {
        return makeCellFrom<TokenPool_GetCCVsAndFees>(self, TokenPool_GetCCVsAndFees.store);
    }
}

/**
 > struct (0x0449d467) TokenPool_GetCCVsFailed {
 >     queryId: uint64
 >     errorCode: int32
 >     fwdPayload: cell?
 > }
 */
export interface TokenPool_GetCCVsFailed {
    readonly $: 'TokenPool_GetCCVsFailed'
    queryId: uint64
    errorCode: int32
    fwdPayload: c.Cell | null
}

export const TokenPool_GetCCVsFailed = {
    PREFIX: 0x0449d467,

    create(args: {
        queryId?: uint64
        errorCode: int32
        fwdPayload: c.Cell | null
    }): TokenPool_GetCCVsFailed {
        return {
            $: 'TokenPool_GetCCVsFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetCCVsFailed {
        loadAndCheckPrefix32(s, 0x0449d467, 'TokenPool_GetCCVsFailed');
        return {
            $: 'TokenPool_GetCCVsFailed',
            queryId: s.loadUintBig(64),
            errorCode: s.loadIntBig(32),
            fwdPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_GetCCVsFailed, b: c.Builder): void {
        b.storeUint(0x0449d467, 32);
        b.storeUint(self.queryId, 64);
        b.storeInt(self.errorCode, 32);
        storeTolkNullable<c.Cell>(self.fwdPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_GetCCVsFailed): c.Cell {
        return makeCellFrom<TokenPool_GetCCVsFailed>(self, TokenPool_GetCCVsFailed.store);
    }
}

/**
 > struct (0x30612b17) TokenPool_QueryCCVsReply {
 >     queryId: uint64
 >     requiredCCVs: array<address>
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_QueryCCVsReply {
    readonly $: 'TokenPool_QueryCCVsReply'
    queryId: uint64
    requiredCCVs: array<c.Address>
    replyPayload: c.Cell | null
}

export const TokenPool_QueryCCVsReply = {
    PREFIX: 0x30612b17,

    create(args: {
        queryId?: uint64
        requiredCCVs: array<c.Address>
        replyPayload: c.Cell | null
    }): TokenPool_QueryCCVsReply {
        return {
            $: 'TokenPool_QueryCCVsReply',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_QueryCCVsReply {
        loadAndCheckPrefix32(s, 0x30612b17, 'TokenPool_QueryCCVsReply');
        return {
            $: 'TokenPool_QueryCCVsReply',
            queryId: s.loadUintBig(64),
            requiredCCVs: loadArrayOf<c.Address>(s,
                (s) => s.loadAddress()
            ),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_QueryCCVsReply, b: c.Builder): void {
        b.storeUint(0x30612b17, 32);
        b.storeUint(self.queryId, 64);
        storeArrayOf<c.Address>(self.requiredCCVs, b,
            (v,b) => b.storeAddress(v)
        );
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_QueryCCVsReply): c.Cell {
        return makeCellFrom<TokenPool_QueryCCVsReply>(self, TokenPool_QueryCCVsReply.store);
    }
}

/**
 > struct (0xe7a35041) TokenPool_LockOrBurnWithdraw {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_LockOrBurnWithdraw {
    readonly $: 'TokenPool_LockOrBurnWithdraw'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_LockOrBurnWithdraw = {
    PREFIX: 0xe7a35041,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_LockOrBurnWithdraw {
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnWithdraw {
        loadAndCheckPrefix32(s, 0xe7a35041, 'TokenPool_LockOrBurnWithdraw');
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnWithdraw, b: c.Builder): void {
        b.storeUint(0xe7a35041, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_LockOrBurnWithdraw): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnWithdraw>(self, TokenPool_LockOrBurnWithdraw.store);
    }
}

/**
 > struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: coins
 > }
 */
export interface TokenPool_LockOrBurnFinished {
    readonly $: 'TokenPool_LockOrBurnFinished'
    queryId: uint64
    out: TokenPool_LockOrBurnOutV1
    destTokenAmount: coins
}

export const TokenPool_LockOrBurnFinished = {
    PREFIX: 0xf432a4e3,

    create(args: {
        queryId?: uint64
        out: TokenPool_LockOrBurnOutV1
        destTokenAmount: coins
    }): TokenPool_LockOrBurnFinished {
        return {
            $: 'TokenPool_LockOrBurnFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFinished {
        loadAndCheckPrefix32(s, 0xf432a4e3, 'TokenPool_LockOrBurnFinished');
        return {
            $: 'TokenPool_LockOrBurnFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadCoins(),
        }
    },
    store(self: TokenPool_LockOrBurnFinished, b: c.Builder): void {
        b.storeUint(0xf432a4e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeCoins(self.destTokenAmount);
    },
    toCell(self: TokenPool_LockOrBurnFinished): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFinished>(self, TokenPool_LockOrBurnFinished.store);
    }
}

/**
 > struct (0x3476ea72) TokenPool_LockOrBurnFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_LockOrBurnFailure {
    readonly $: 'TokenPool_LockOrBurnFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_LockOrBurnFailure = {
    PREFIX: 0x3476ea72,

    create(args: {
        queryId?: uint64
        errorCode: uint16
    }): TokenPool_LockOrBurnFailure {
        return {
            $: 'TokenPool_LockOrBurnFailure',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFailure {
        loadAndCheckPrefix32(s, 0x3476ea72, 'TokenPool_LockOrBurnFailure');
        return {
            $: 'TokenPool_LockOrBurnFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_LockOrBurnFailure, b: c.Builder): void {
        b.storeUint(0x3476ea72, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_LockOrBurnFailure): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFailure>(self, TokenPool_LockOrBurnFailure.store);
    }
}

/**
 > struct (0xe0e882f5) TokenPool_ReleaseOrMintFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface TokenPool_ReleaseOrMintFinished {
    readonly $: 'TokenPool_ReleaseOrMintFinished'
    queryId: uint64
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintFinished = {
    PREFIX: 0xe0e882f5,

    create(args: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintFinished {
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFinished {
        loadAndCheckPrefix32(s, 0xe0e882f5, 'TokenPool_ReleaseOrMintFinished');
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintFinished, b: c.Builder): void {
        b.storeUint(0xe0e882f5, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintFinished): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFinished>(self, TokenPool_ReleaseOrMintFinished.store);
    }
}

/**
 > struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_ReleaseOrMintFailure {
    readonly $: 'TokenPool_ReleaseOrMintFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_ReleaseOrMintFailure = {
    PREFIX: 0xef0cb36e,

    create(args: {
        queryId?: uint64
        errorCode: uint16
    }): TokenPool_ReleaseOrMintFailure {
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFailure {
        loadAndCheckPrefix32(s, 0xef0cb36e, 'TokenPool_ReleaseOrMintFailure');
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_ReleaseOrMintFailure, b: c.Builder): void {
        b.storeUint(0xef0cb36e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_ReleaseOrMintFailure): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFailure>(self, TokenPool_ReleaseOrMintFailure.store);
    }
}

/**
 > struct (0x12cc4985) TokenPool_RemotePoolAddedNotification {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolAddedNotification {
    readonly $: 'TokenPool_RemotePoolAddedNotification'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_RemotePoolAddedNotification = {
    PREFIX: 0x12cc4985,

    create(args: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_RemotePoolAddedNotification {
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolAddedNotification {
        loadAndCheckPrefix32(s, 0x12cc4985, 'TokenPool_RemotePoolAddedNotification');
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolAddedNotification, b: c.Builder): void {
        b.storeUint(0x12cc4985, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolAddedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolAddedNotification>(self, TokenPool_RemotePoolAddedNotification.store);
    }
}

/**
 > struct (0xe17bf3cc) TokenPool_RemotePoolRemovedNotification {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolRemovedNotification {
    readonly $: 'TokenPool_RemotePoolRemovedNotification'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_RemotePoolRemovedNotification = {
    PREFIX: 0xe17bf3cc,

    create(args: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_RemotePoolRemovedNotification {
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolRemovedNotification {
        loadAndCheckPrefix32(s, 0xe17bf3cc, 'TokenPool_RemotePoolRemovedNotification');
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolRemovedNotification, b: c.Builder): void {
        b.storeUint(0xe17bf3cc, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolRemovedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolRemovedNotification>(self, TokenPool_RemotePoolRemovedNotification.store);
    }
}

/**
 > struct (0x426a713b) TokenPool_FinalityConfigSet {
 >     queryId: uint64
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_FinalityConfigSet {
    readonly $: 'TokenPool_FinalityConfigSet'
    queryId: uint64
    allowedFinalityConfig: uint32
}

export const TokenPool_FinalityConfigSet = {
    PREFIX: 0x426a713b,

    create(args: {
        queryId?: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_FinalityConfigSet {
        return {
            $: 'TokenPool_FinalityConfigSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_FinalityConfigSet {
        loadAndCheckPrefix32(s, 0x426a713b, 'TokenPool_FinalityConfigSet');
        return {
            $: 'TokenPool_FinalityConfigSet',
            queryId: s.loadUintBig(64),
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_FinalityConfigSet, b: c.Builder): void {
        b.storeUint(0x426a713b, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_FinalityConfigSet): c.Cell {
        return makeCellFrom<TokenPool_FinalityConfigSet>(self, TokenPool_FinalityConfigSet.store);
    }
}

/**
 > struct (0xb735e30c) TokenPool_DynamicConfigSet {
 >     queryId: uint64
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_DynamicConfigSet {
    readonly $: 'TokenPool_DynamicConfigSet'
    queryId: uint64
    router: c.Address
    rateLimitAdmin: c.Address | null
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfigSet = {
    PREFIX: 0xb735e30c,

    create(args: {
        queryId?: uint64
        router: c.Address
        rateLimitAdmin: c.Address | null
        feeAdmin: c.Address | null
    }): TokenPool_DynamicConfigSet {
        return {
            $: 'TokenPool_DynamicConfigSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_DynamicConfigSet {
        loadAndCheckPrefix32(s, 0xb735e30c, 'TokenPool_DynamicConfigSet');
        return {
            $: 'TokenPool_DynamicConfigSet',
            queryId: s.loadUintBig(64),
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_DynamicConfigSet, b: c.Builder): void {
        b.storeUint(0xb735e30c, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_DynamicConfigSet): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfigSet>(self, TokenPool_DynamicConfigSet.store);
    }
}

/**
 > struct (0xdd7b0c71) TokenPool_RateLimitConfiguredNotification {
 >     queryId: uint64
 > }
 */
export interface TokenPool_RateLimitConfiguredNotification {
    readonly $: 'TokenPool_RateLimitConfiguredNotification'
    queryId: uint64
}

export const TokenPool_RateLimitConfiguredNotification = {
    PREFIX: 0xdd7b0c71,

    create(args: {
        queryId?: uint64
    }): TokenPool_RateLimitConfiguredNotification {
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfiguredNotification {
        loadAndCheckPrefix32(s, 0xdd7b0c71, 'TokenPool_RateLimitConfiguredNotification');
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_RateLimitConfiguredNotification, b: c.Builder): void {
        b.storeUint(0xdd7b0c71, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_RateLimitConfiguredNotification): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfiguredNotification>(self, TokenPool_RateLimitConfiguredNotification.store);
    }
}

/**
 > struct (0xad7833d7) TokenPool_ChainUpdatesApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_ChainUpdatesApplied {
    readonly $: 'TokenPool_ChainUpdatesApplied'
    queryId: uint64
}

export const TokenPool_ChainUpdatesApplied = {
    PREFIX: 0xad7833d7,

    create(args: {
        queryId?: uint64
    }): TokenPool_ChainUpdatesApplied {
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainUpdatesApplied {
        loadAndCheckPrefix32(s, 0xad7833d7, 'TokenPool_ChainUpdatesApplied');
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_ChainUpdatesApplied, b: c.Builder): void {
        b.storeUint(0xad7833d7, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_ChainUpdatesApplied): c.Cell {
        return makeCellFrom<TokenPool_ChainUpdatesApplied>(self, TokenPool_ChainUpdatesApplied.store);
    }
}

/**
 > struct (0x28cbcc64) TokenPool_FeeConfigApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_FeeConfigApplied {
    readonly $: 'TokenPool_FeeConfigApplied'
    queryId: uint64
}

export const TokenPool_FeeConfigApplied = {
    PREFIX: 0x28cbcc64,

    create(args: {
        queryId?: uint64
    }): TokenPool_FeeConfigApplied {
        return {
            $: 'TokenPool_FeeConfigApplied',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_FeeConfigApplied {
        loadAndCheckPrefix32(s, 0x28cbcc64, 'TokenPool_FeeConfigApplied');
        return {
            $: 'TokenPool_FeeConfigApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_FeeConfigApplied, b: c.Builder): void {
        b.storeUint(0x28cbcc64, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_FeeConfigApplied): c.Cell {
        return makeCellFrom<TokenPool_FeeConfigApplied>(self, TokenPool_FeeConfigApplied.store);
    }
}

/**
 > struct (0x3c869d80) TokenPool_AdvancedPoolHooksSet {
 >     queryId: uint64
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_AdvancedPoolHooksSet {
    readonly $: 'TokenPool_AdvancedPoolHooksSet'
    queryId: uint64
    advancedPoolHooks: c.Address | null
}

export const TokenPool_AdvancedPoolHooksSet = {
    PREFIX: 0x3c869d80,

    create(args: {
        queryId?: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_AdvancedPoolHooksSet {
        return {
            $: 'TokenPool_AdvancedPoolHooksSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdvancedPoolHooksSet {
        loadAndCheckPrefix32(s, 0x3c869d80, 'TokenPool_AdvancedPoolHooksSet');
        return {
            $: 'TokenPool_AdvancedPoolHooksSet',
            queryId: s.loadUintBig(64),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_AdvancedPoolHooksSet, b: c.Builder): void {
        b.storeUint(0x3c869d80, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.advancedPoolHooks);
    },
    toCell(self: TokenPool_AdvancedPoolHooksSet): c.Cell {
        return makeCellFrom<TokenPool_AdvancedPoolHooksSet>(self, TokenPool_AdvancedPoolHooksSet.store);
    }
}

/**
 > struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
 >     queryId: uint64
 > }
 */
export interface BurnMintTokenPool_ClaimMinterAdmin {
    readonly $: 'BurnMintTokenPool_ClaimMinterAdmin'
    queryId: uint64
}

export const BurnMintTokenPool_ClaimMinterAdmin = {
    PREFIX: 0x39898e4d,

    create(args: {
        queryId?: uint64
    }): BurnMintTokenPool_ClaimMinterAdmin {
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_ClaimMinterAdmin {
        loadAndCheckPrefix32(s, 0x39898e4d, 'BurnMintTokenPool_ClaimMinterAdmin');
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: BurnMintTokenPool_ClaimMinterAdmin, b: c.Builder): void {
        b.storeUint(0x39898e4d, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: BurnMintTokenPool_ClaimMinterAdmin): c.Cell {
        return makeCellFrom<BurnMintTokenPool_ClaimMinterAdmin>(self, BurnMintTokenPool_ClaimMinterAdmin.store);
    }
}

/**
 > struct (0xba302a47) BurnMintTokenPool_BurnContext {
 >     wallet: address
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface BurnMintTokenPool_BurnContext {
    readonly $: 'BurnMintTokenPool_BurnContext'
    wallet: c.Address
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const BurnMintTokenPool_BurnContext = {
    PREFIX: 0xba302a47,

    create(args: {
        wallet: c.Address
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): BurnMintTokenPool_BurnContext {
        return {
            $: 'BurnMintTokenPool_BurnContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_BurnContext {
        loadAndCheckPrefix32(s, 0xba302a47, 'BurnMintTokenPool_BurnContext');
        return {
            $: 'BurnMintTokenPool_BurnContext',
            wallet: s.loadAddress(),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: BurnMintTokenPool_BurnContext, b: c.Builder): void {
        b.storeUint(0xba302a47, 32);
        b.storeAddress(self.wallet);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: BurnMintTokenPool_BurnContext): c.Cell {
        return makeCellFrom<BurnMintTokenPool_BurnContext>(self, BurnMintTokenPool_BurnContext.store);
    }
}

/**
 > struct (0xb3d52361) BurnMintTokenPool_MintContext {
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface BurnMintTokenPool_MintContext {
    readonly $: 'BurnMintTokenPool_MintContext'
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload
}

export const BurnMintTokenPool_MintContext = {
    PREFIX: 0xb3d52361,

    create(args: {
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }): BurnMintTokenPool_MintContext {
        return {
            $: 'BurnMintTokenPool_MintContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_MintContext {
        loadAndCheckPrefix32(s, 0xb3d52361, 'BurnMintTokenPool_MintContext');
        return {
            $: 'BurnMintTokenPool_MintContext',
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: BurnMintTokenPool_MintContext, b: c.Builder): void {
        b.storeUint(0xb3d52361, 32);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: BurnMintTokenPool_MintContext): c.Cell {
        return makeCellFrom<BurnMintTokenPool_MintContext>(self, BurnMintTokenPool_MintContext.store);
    }
}

/**
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 >     offRampAccountCode: cell
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: TokenPool_Data
    offRampAccountCode: c.Cell
}

export const Storage = {
    create(args: {
        poolData: TokenPool_Data
        offRampAccountCode: c.Cell
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            poolData: loadCellRef<TokenPool_Data>(s, TokenPool_Data.fromSlice),
            offRampAccountCode: s.loadRef(),
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
        b.storeRef(self.offRampAccountCode);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct (0x95cd540f) AccessControl_GrantRole {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 > }
 */
export interface AccessControl_GrantRole {
    readonly $: 'AccessControl_GrantRole'
    queryId: uint64
    role: uint256
    account: c.Address
}

export const AccessControl_GrantRole = {
    PREFIX: 0x95cd540f,

    create(args: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }): AccessControl_GrantRole {
        return {
            $: 'AccessControl_GrantRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_GrantRole {
        loadAndCheckPrefix32(s, 0x95cd540f, 'AccessControl_GrantRole');
        return {
            $: 'AccessControl_GrantRole',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
        }
    },
    store(self: AccessControl_GrantRole, b: c.Builder): void {
        b.storeUint(0x95cd540f, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
    },
    toCell(self: AccessControl_GrantRole): c.Cell {
        return makeCellFrom<AccessControl_GrantRole>(self, AccessControl_GrantRole.store);
    }
}

/**
 > struct (0x969b0db9) AccessControl_RevokeRole {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 > }
 */
export interface AccessControl_RevokeRole {
    readonly $: 'AccessControl_RevokeRole'
    queryId: uint64
    role: uint256
    account: c.Address
}

export const AccessControl_RevokeRole = {
    PREFIX: 0x969b0db9,

    create(args: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }): AccessControl_RevokeRole {
        return {
            $: 'AccessControl_RevokeRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RevokeRole {
        loadAndCheckPrefix32(s, 0x969b0db9, 'AccessControl_RevokeRole');
        return {
            $: 'AccessControl_RevokeRole',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
        }
    },
    store(self: AccessControl_RevokeRole, b: c.Builder): void {
        b.storeUint(0x969b0db9, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
    },
    toCell(self: AccessControl_RevokeRole): c.Cell {
        return makeCellFrom<AccessControl_RevokeRole>(self, AccessControl_RevokeRole.store);
    }
}

/**
 > struct (0x39452c46) AccessControl_RenounceRole {
 >     queryId: uint64
 >     role: uint256
 >     callerConfirmation: address
 > }
 */
export interface AccessControl_RenounceRole {
    readonly $: 'AccessControl_RenounceRole'
    queryId: uint64
    role: uint256
    callerConfirmation: c.Address
}

export const AccessControl_RenounceRole = {
    PREFIX: 0x39452c46,

    create(args: {
        queryId?: uint64
        role: uint256
        callerConfirmation: c.Address
    }): AccessControl_RenounceRole {
        return {
            $: 'AccessControl_RenounceRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RenounceRole {
        loadAndCheckPrefix32(s, 0x39452c46, 'AccessControl_RenounceRole');
        return {
            $: 'AccessControl_RenounceRole',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            callerConfirmation: s.loadAddress(),
        }
    },
    store(self: AccessControl_RenounceRole, b: c.Builder): void {
        b.storeUint(0x39452c46, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.callerConfirmation);
    },
    toCell(self: AccessControl_RenounceRole): c.Cell {
        return makeCellFrom<AccessControl_RenounceRole>(self, AccessControl_RenounceRole.store);
    }
}

/**
 > struct (0xcf3ca837) AccessControl_RoleGranted {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleGranted {
    readonly $: 'AccessControl_RoleGranted'
    queryId: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleGranted = {
    PREFIX: 0xcf3ca837,

    create(args: {
        queryId?: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleGranted {
        return {
            $: 'AccessControl_RoleGranted',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleGranted {
        loadAndCheckPrefix32(s, 0xcf3ca837, 'AccessControl_RoleGranted');
        return {
            $: 'AccessControl_RoleGranted',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleGranted, b: c.Builder): void {
        b.storeUint(0xcf3ca837, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
        b.storeAddress(self.sender);
    },
    toCell(self: AccessControl_RoleGranted): c.Cell {
        return makeCellFrom<AccessControl_RoleGranted>(self, AccessControl_RoleGranted.store);
    }
}

/**
 > struct (0x990fe1c7) AccessControl_RoleRevoked {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleRevoked {
    readonly $: 'AccessControl_RoleRevoked'
    queryId: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleRevoked = {
    PREFIX: 0x990fe1c7,

    create(args: {
        queryId?: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleRevoked {
        return {
            $: 'AccessControl_RoleRevoked',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleRevoked {
        loadAndCheckPrefix32(s, 0x990fe1c7, 'AccessControl_RoleRevoked');
        return {
            $: 'AccessControl_RoleRevoked',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleRevoked, b: c.Builder): void {
        b.storeUint(0x990fe1c7, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
        b.storeAddress(self.sender);
    },
    toCell(self: AccessControl_RoleRevoked): c.Cell {
        return makeCellFrom<AccessControl_RoleRevoked>(self, AccessControl_RoleRevoked.store);
    }
}

/**
 > struct AccessControl_Data {
 >     roles: map<uint256, Cell<AccessControl_RoleData>>
 > }
 */
export interface AccessControl_Data {
    readonly $: 'AccessControl_Data'
    roles: Map<uint256, AccessControl_RoleData> /* = [] as map<uint256, Cell<AccessControl_RoleData>> */
}

export const AccessControl_Data = {
    create(args: {
        roles: Map<uint256, AccessControl_RoleData> /* = [] as map<uint256, Cell<AccessControl_RoleData>> */
    }): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            roles: dictToMap(c.Dictionary.load<uint256, AccessControl_RoleData>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
                            (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                            (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
                        ), s)),
        }
    },
    store(self: AccessControl_Data, b: c.Builder): void {
        b.storeDict<uint256, AccessControl_RoleData>(mapToDict(self.roles, c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
                        (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                        (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
                    )), c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
            (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
            (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
        ));
    },
    toCell(self: AccessControl_Data): c.Cell {
        return makeCellFrom<AccessControl_Data>(self, AccessControl_Data.store);
    }
}

/**
 > struct AccessControl_RoleData {
 >     adminRole: uint256
 >     membersLen: uint64
 >     hasRole: map<address, bool>
 > }
 */
export interface AccessControl_RoleData {
    readonly $: 'AccessControl_RoleData'
    adminRole: uint256
    membersLen: uint64
    hasRole: Map<c.Address, boolean> /* = [] as map<address, bool> */
}

export const AccessControl_RoleData = {
    create(args: {
        adminRole: uint256
        membersLen: uint64
        hasRole: Map<c.Address, boolean> /* = [] as map<address, bool> */
    }): AccessControl_RoleData {
        return {
            $: 'AccessControl_RoleData',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleData {
        return {
            $: 'AccessControl_RoleData',
            adminRole: s.loadUintBig(256),
            membersLen: s.loadUintBig(64),
            hasRole: dictToMap(c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s)),
        }
    },
    store(self: AccessControl_RoleData, b: c.Builder): void {
        b.storeUint(self.adminRole, 256);
        b.storeUint(self.membersLen, 64);
        b.storeDict<c.Address, boolean>(mapToDict(self.hasRole, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool()), c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: AccessControl_RoleData): c.Cell {
        return makeCellFrom<AccessControl_RoleData>(self, AccessControl_RoleData.store);
    }
}

/**
 > struct TokenPool_LockedOrBurned {
 >     remoteChainSelector: uint64
 >     details: Cell<TokenPool_LockedOrBurnedDetails>
 > }
 */
export interface TokenPool_LockedOrBurned {
    readonly $: 'TokenPool_LockedOrBurned'
    remoteChainSelector: uint64
    details: TokenPool_LockedOrBurnedDetails
}

export const TokenPool_LockedOrBurned = {
    create(args: {
        remoteChainSelector: uint64
        details: TokenPool_LockedOrBurnedDetails
    }): TokenPool_LockedOrBurned {
        return {
            $: 'TokenPool_LockedOrBurned',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockedOrBurned {
        return {
            $: 'TokenPool_LockedOrBurned',
            remoteChainSelector: s.loadUintBig(64),
            details: loadCellRef<TokenPool_LockedOrBurnedDetails>(s, TokenPool_LockedOrBurnedDetails.fromSlice),
        }
    },
    store(self: TokenPool_LockedOrBurned, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<TokenPool_LockedOrBurnedDetails>(self.details, b, TokenPool_LockedOrBurnedDetails.store);
    },
    toCell(self: TokenPool_LockedOrBurned): c.Cell {
        return makeCellFrom<TokenPool_LockedOrBurned>(self, TokenPool_LockedOrBurned.store);
    }
}

/**
 > struct TokenPool_LockedOrBurnedDetails {
 >     token: address
 >     sender: address
 >     amount: coins
 > }
 */
export interface TokenPool_LockedOrBurnedDetails {
    readonly $: 'TokenPool_LockedOrBurnedDetails'
    token: c.Address
    sender: c.Address
    amount: coins
}

export const TokenPool_LockedOrBurnedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        amount: coins
    }): TokenPool_LockedOrBurnedDetails {
        return {
            $: 'TokenPool_LockedOrBurnedDetails',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockedOrBurnedDetails {
        return {
            $: 'TokenPool_LockedOrBurnedDetails',
            token: s.loadAddress(),
            sender: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_LockedOrBurnedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_LockedOrBurnedDetails): c.Cell {
        return makeCellFrom<TokenPool_LockedOrBurnedDetails>(self, TokenPool_LockedOrBurnedDetails.store);
    }
}

/**
 > struct TokenPool_ReleasedOrMinted {
 >     remoteChainSelector: uint64
 >     details: Cell<TokenPool_ReleasedOrMintedDetails>
 > }
 */
export interface TokenPool_ReleasedOrMinted {
    readonly $: 'TokenPool_ReleasedOrMinted'
    remoteChainSelector: uint64
    details: TokenPool_ReleasedOrMintedDetails
}

export const TokenPool_ReleasedOrMinted = {
    create(args: {
        remoteChainSelector: uint64
        details: TokenPool_ReleasedOrMintedDetails
    }): TokenPool_ReleasedOrMinted {
        return {
            $: 'TokenPool_ReleasedOrMinted',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleasedOrMinted {
        return {
            $: 'TokenPool_ReleasedOrMinted',
            remoteChainSelector: s.loadUintBig(64),
            details: loadCellRef<TokenPool_ReleasedOrMintedDetails>(s, TokenPool_ReleasedOrMintedDetails.fromSlice),
        }
    },
    store(self: TokenPool_ReleasedOrMinted, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<TokenPool_ReleasedOrMintedDetails>(self.details, b, TokenPool_ReleasedOrMintedDetails.store);
    },
    toCell(self: TokenPool_ReleasedOrMinted): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMinted>(self, TokenPool_ReleasedOrMinted.store);
    }
}

/**
 > struct TokenPool_ReleasedOrMintedDetails {
 >     token: address
 >     sender: address
 >     amount: coins
 >     recipient: Cell<address>
 > }
 */
export interface TokenPool_ReleasedOrMintedDetails {
    readonly $: 'TokenPool_ReleasedOrMintedDetails'
    token: c.Address
    sender: c.Address
    amount: coins
    recipient: c.Address
}

export const TokenPool_ReleasedOrMintedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        amount: coins
        recipient: c.Address
    }): TokenPool_ReleasedOrMintedDetails {
        return {
            $: 'TokenPool_ReleasedOrMintedDetails',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleasedOrMintedDetails {
        return {
            $: 'TokenPool_ReleasedOrMintedDetails',
            token: s.loadAddress(),
            sender: s.loadAddress(),
            amount: s.loadCoins(),
            recipient: loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ),
        }
    },
    store(self: TokenPool_ReleasedOrMintedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        b.storeCoins(self.amount);
        storeCellRef<c.Address>(self.recipient, b,
            (v,b) => b.storeAddress(v)
        );
    },
    toCell(self: TokenPool_ReleasedOrMintedDetails): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMintedDetails>(self, TokenPool_ReleasedOrMintedDetails.store);
    }
}

/**
 > struct TokenPool_ChainAdded {
 >     remoteChainSelector: uint64
 >     remoteTokenAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_ChainAdded {
    readonly $: 'TokenPool_ChainAdded'
    remoteChainSelector: uint64
    remoteTokenAddress: CrossChainAddress
}

export const TokenPool_ChainAdded = {
    create(args: {
        remoteChainSelector: uint64
        remoteTokenAddress: CrossChainAddress
    }): TokenPool_ChainAdded {
        return {
            $: 'TokenPool_ChainAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainAdded {
        return {
            $: 'TokenPool_ChainAdded',
            remoteChainSelector: s.loadUintBig(64),
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_ChainAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_ChainAdded): c.Cell {
        return makeCellFrom<TokenPool_ChainAdded>(self, TokenPool_ChainAdded.store);
    }
}

/**
 > struct TokenPool_ChainRemoved {
 >     remoteChainSelector: uint64
 > }
 */
export interface TokenPool_ChainRemoved {
    readonly $: 'TokenPool_ChainRemoved'
    remoteChainSelector: uint64
}

export const TokenPool_ChainRemoved = {
    create(args: {
        remoteChainSelector: uint64
    }): TokenPool_ChainRemoved {
        return {
            $: 'TokenPool_ChainRemoved',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainRemoved {
        return {
            $: 'TokenPool_ChainRemoved',
            remoteChainSelector: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_ChainRemoved, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
    },
    toCell(self: TokenPool_ChainRemoved): c.Cell {
        return makeCellFrom<TokenPool_ChainRemoved>(self, TokenPool_ChainRemoved.store);
    }
}

/**
 > struct TokenPool_RemotePoolAdded {
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolAdded {
    readonly $: 'TokenPool_RemotePoolAdded'
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_RemotePoolAdded = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_RemotePoolAdded {
        return {
            $: 'TokenPool_RemotePoolAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolAdded {
        return {
            $: 'TokenPool_RemotePoolAdded',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolAdded): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolAdded>(self, TokenPool_RemotePoolAdded.store);
    }
}

/**
 > struct TokenPool_RemotePoolRemoved {
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolRemoved {
    readonly $: 'TokenPool_RemotePoolRemoved'
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}

export const TokenPool_RemotePoolRemoved = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }): TokenPool_RemotePoolRemoved {
        return {
            $: 'TokenPool_RemotePoolRemoved',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolRemoved {
        return {
            $: 'TokenPool_RemotePoolRemoved',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolRemoved, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolRemoved): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolRemoved>(self, TokenPool_RemotePoolRemoved.store);
    }
}

/**
 > struct TokenPool_OutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_OutboundRateLimitConsumed {
    readonly $: 'TokenPool_OutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_OutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_OutboundRateLimitConsumed {
        return {
            $: 'TokenPool_OutboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_OutboundRateLimitConsumed {
        return {
            $: 'TokenPool_OutboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_OutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_OutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitConsumed>(self, TokenPool_OutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_InboundRateLimitConsumed {
    readonly $: 'TokenPool_InboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_InboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_InboundRateLimitConsumed {
        return {
            $: 'TokenPool_InboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_InboundRateLimitConsumed {
        return {
            $: 'TokenPool_InboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_InboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_InboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitConsumed>(self, TokenPool_InboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityOutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_FastFinalityOutboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityOutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_FastFinalityOutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_FastFinalityOutboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityOutboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_FastFinalityOutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_FastFinalityOutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityOutboundRateLimitConsumed>(self, TokenPool_FastFinalityOutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityInboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_FastFinalityInboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityInboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_FastFinalityInboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_FastFinalityInboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityInboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_FastFinalityInboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_FastFinalityInboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityInboundRateLimitConsumed>(self, TokenPool_FastFinalityInboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_OutboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_OutboundRateLimitRefunded {
    readonly $: 'TokenPool_OutboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_OutboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_OutboundRateLimitRefunded {
        return {
            $: 'TokenPool_OutboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_OutboundRateLimitRefunded {
        return {
            $: 'TokenPool_OutboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_OutboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_OutboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitRefunded>(self, TokenPool_OutboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_InboundRateLimitRefunded {
    readonly $: 'TokenPool_InboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_InboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_InboundRateLimitRefunded {
        return {
            $: 'TokenPool_InboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_InboundRateLimitRefunded {
        return {
            $: 'TokenPool_InboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_InboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_InboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitRefunded>(self, TokenPool_InboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_FastFinalityOutboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_FastFinalityOutboundRateLimitRefunded {
    readonly $: 'TokenPool_FastFinalityOutboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_FastFinalityOutboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_FastFinalityOutboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityOutboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_FastFinalityOutboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_FastFinalityOutboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityOutboundRateLimitRefunded>(self, TokenPool_FastFinalityOutboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_FastFinalityInboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: coins
 > }
 */
export interface TokenPool_FastFinalityInboundRateLimitRefunded {
    readonly $: 'TokenPool_FastFinalityInboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: coins
}

export const TokenPool_FastFinalityInboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: coins
    }): TokenPool_FastFinalityInboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityInboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_FastFinalityInboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_FastFinalityInboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityInboundRateLimitRefunded>(self, TokenPool_FastFinalityInboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigUpdated {
 >     destChainSelector: uint64
 >     tokenTransferFeeConfig: Cell<TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_TokenTransferFeeConfigUpdated {
    readonly $: 'TokenPool_TokenTransferFeeConfigUpdated'
    destChainSelector: uint64
    tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
}

export const TokenPool_TokenTransferFeeConfigUpdated = {
    create(args: {
        destChainSelector: uint64
        tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
    }): TokenPool_TokenTransferFeeConfigUpdated {
        return {
            $: 'TokenPool_TokenTransferFeeConfigUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigUpdated {
        return {
            $: 'TokenPool_TokenTransferFeeConfigUpdated',
            destChainSelector: s.loadUintBig(64),
            tokenTransferFeeConfig: loadCellRef<TokenPool_TokenTransferFeeConfig>(s, TokenPool_TokenTransferFeeConfig.fromSlice),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigUpdated, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        storeCellRef<TokenPool_TokenTransferFeeConfig>(self.tokenTransferFeeConfig, b, TokenPool_TokenTransferFeeConfig.store);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigUpdated): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigUpdated>(self, TokenPool_TokenTransferFeeConfigUpdated.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigDeleted {
 >     destChainSelector: uint64
 > }
 */
export interface TokenPool_TokenTransferFeeConfigDeleted {
    readonly $: 'TokenPool_TokenTransferFeeConfigDeleted'
    destChainSelector: uint64
}

export const TokenPool_TokenTransferFeeConfigDeleted = {
    create(args: {
        destChainSelector: uint64
    }): TokenPool_TokenTransferFeeConfigDeleted {
        return {
            $: 'TokenPool_TokenTransferFeeConfigDeleted',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigDeleted {
        return {
            $: 'TokenPool_TokenTransferFeeConfigDeleted',
            destChainSelector: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigDeleted, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigDeleted): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigDeleted>(self, TokenPool_TokenTransferFeeConfigDeleted.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigured {
 >     args: TokenPool_RateLimitConfigArgs
 > }
 */
export interface TokenPool_RateLimitConfigured {
    readonly $: 'TokenPool_RateLimitConfigured'
    args: TokenPool_RateLimitConfigArgs
}

export const TokenPool_RateLimitConfigured = {
    create(args: {
        args: TokenPool_RateLimitConfigArgs
    }): TokenPool_RateLimitConfigured {
        return {
            $: 'TokenPool_RateLimitConfigured',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigured {
        return {
            $: 'TokenPool_RateLimitConfigured',
            args: TokenPool_RateLimitConfigArgs.fromSlice(s),
        }
    },
    store(self: TokenPool_RateLimitConfigured, b: c.Builder): void {
        TokenPool_RateLimitConfigArgs.store(self.args, b);
    },
    toCell(self: TokenPool_RateLimitConfigured): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigured>(self, TokenPool_RateLimitConfigured.store);
    }
}

/**
 > struct RateLimiter_Config {
 >     isEnabled: bool
 >     capacity: uint120
 >     rate: uint120
 > }
 */
export interface RateLimiter_Config {
    readonly $: 'RateLimiter_Config'
    isEnabled: boolean
    capacity: uint120
    rate: uint120
}

export const RateLimiter_Config = {
    create(args: {
        isEnabled: boolean
        capacity: uint120
        rate: uint120
    }): RateLimiter_Config {
        return {
            $: 'RateLimiter_Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_Config {
        return {
            $: 'RateLimiter_Config',
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(120),
            rate: s.loadUintBig(120),
        }
    },
    store(self: RateLimiter_Config, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 120);
        b.storeUint(self.rate, 120);
    },
    toCell(self: RateLimiter_Config): c.Cell {
        return makeCellFrom<RateLimiter_Config>(self, RateLimiter_Config.store);
    }
}

/**
 > struct RateLimiter_TokenBucket {
 >     tokens: uint120
 >     lastUpdated: uint64
 >     isEnabled: bool
 >     capacity: uint120
 >     rate: uint120
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint120
    lastUpdated: uint64
    isEnabled: boolean
    capacity: uint120
    rate: uint120
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint120
        lastUpdated: uint64
        isEnabled: boolean
        capacity: uint120
        rate: uint120
    }): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            tokens: s.loadUintBig(120),
            lastUpdated: s.loadUintBig(64),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(120),
            rate: s.loadUintBig(120),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 120);
        b.storeUint(self.lastUpdated, 64);
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 120);
        b.storeUint(self.rate, 120);
    },
    toCell(self: RateLimiter_TokenBucket): c.Cell {
        return makeCellFrom<RateLimiter_TokenBucket>(self, RateLimiter_TokenBucket.store);
    }
}

// ————————————————————————————————————————————
//    class BurnMintTokenPool
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

export class BurnMintTokenPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'RateLimiter_Error.BucketOverfilled': 16300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 16301,
        'RateLimiter_Error.TokenRateLimitReached': 16302,
        'BurnMintTokenPool_Error.UnexpectedBurnBounce': 45000,
        'BurnMintTokenPool_Error.UnexpectedMintBounce': 45001,
        'BurnMintTokenPool_Error.InvalidOffRampAccountReply': 45002,
        'BurnMintTokenPool_Error.InvalidOffRampAccountNotification': 45003,
        'BurnMintTokenPool_Error.OffRampAccountDeployFailed': 45004,
        'AccessControl_Error.UnauthorizedAccount': 47400,
        'AccessControl_Error.BadConfirmation': 47401,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'TokenPool_Error.InvalidTransferFeeBps': 51700,
        'TokenPool_Error.InvalidTokenTransferFeeConfig': 51701,
        'TokenPool_Error.ZeroAddressInvalid': 51703,
        'TokenPool_Error.NonExistentChain': 51704,
        'TokenPool_Error.ChainNotAllowed': 51705,
        'TokenPool_Error.CursedByRMN': 51706,
        'TokenPool_Error.ChainAlreadyExists': 51707,
        'TokenPool_Error.InvalidToken': 51709,
        'TokenPool_Error.Unauthorized': 51710,
        'TokenPool_Error.PoolAlreadyAdded': 51711,
        'TokenPool_Error.InvalidRemotePoolForChain': 51712,
        'TokenPool_Error.InvalidRemoteChainDecimals': 51713,
        'TokenPool_Error.OverflowDetected': 51714,
        'TokenPool_Error.CallerIsNotOwnerOrFeeAdmin': 51716,
        'TokenPool_Error.UnsupportedOperation': 51717,
        'TokenPool_Error.MissingForwardPayload': 51718,
        'TokenPool_Error.MissingTransferInitiator': 51719,
        'TokenPool_Error.AmountMismatch': 51720,
        'TokenPool_Error.InvalidRequestedFinality': 51721,
        'JettonWithdrawable_Error.ZeroAddressNotAllowed': 55700,
        'JettonWithdrawable_Error.UnallowedRecipient': 55701,
        'JettonWithdrawable_Error.MaxAmountExceeded': 55702,
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
            throw new Error(`Custom pack/unpack for 'BurnMintTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new BurnMintTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: TokenPool_Data
        offRampAccountCode: c.Cell
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BurnMintTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BurnMintTokenPool(address, initialState);
    }

    static createCellOfTokenPoolLockOrBurn(body: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }) {
        return TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFinished(body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }) {
        return TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFailed(body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }) {
        return TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolReleaseOrMint(body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }) {
        return TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFinished(body: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }) {
        return TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFailed(body: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }) {
        return TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolGetCCVs(body: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        replyTo: c.Address
        forwardPayload: c.Cell | null
    }) {
        return TokenPool_GetCCVs.toCell(TokenPool_GetCCVs.create(body));
    }

    static createCellOfTokenPoolGetCCVsAndFees(body: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        forwardPayload: c.Cell | null
    }) {
        return TokenPool_GetCCVsAndFees.toCell(TokenPool_GetCCVsAndFees.create(body));
    }

    static createCellOfTokenPoolQueryCCVsReply(body: {
        queryId?: uint64
        requiredCCVs: array<c.Address>
        replyPayload: c.Cell | null
    }) {
        return TokenPool_QueryCCVsReply.toCell(TokenPool_QueryCCVsReply.create(body));
    }

    static createCellOfTokenPoolApplyChainUpdates(body: {
        queryId?: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }) {
        return TokenPool_ApplyChainUpdates.toCell(TokenPool_ApplyChainUpdates.create(body));
    }

    static createCellOfTokenPoolAddRemotePool(body: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }) {
        return TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body));
    }

    static createCellOfTokenPoolRemoveRemotePool(body: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }) {
        return TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body));
    }

    static createCellOfTokenPoolSetDynamicConfig(body: {
        queryId?: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }) {
        return TokenPool_SetDynamicConfig.toCell(TokenPool_SetDynamicConfig.create(body));
    }

    static createCellOfTokenPoolSetAllowedFinalityConfig(body: {
        queryId?: uint64
        allowedFinalityConfig: uint32
    }) {
        return TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body));
    }

    static createCellOfTokenPoolSetAdvancedPoolHooks(body: {
        queryId?: uint64
        advancedPoolHooks: c.Address | null
    }) {
        return TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body));
    }

    static createCellOfTokenPoolSetDeployableCode(body: {
        queryId?: uint64
        deployableCode: c.Cell | null
    }) {
        return TokenPool_SetDeployableCode.toCell(TokenPool_SetDeployableCode.create(body));
    }

    static createCellOfTokenPoolSetAllowedDepositNamespaces(body: {
        queryId?: uint64
        allowedDepositNamespaces: Set<uint32>
    }) {
        return TokenPool_SetAllowedDepositNamespaces.toCell(TokenPool_SetAllowedDepositNamespaces.create(body));
    }

    static createCellOfTokenPoolSetRateLimitConfig(body: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }) {
        return TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body));
    }

    static createCellOfTokenPoolApplyTokenTransferFeeConfigUpdates(body: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }) {
        return TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body));
    }

    static createCellOfCursePolicyCurse(body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }) {
        return CursePolicy_Curse.toCell(CursePolicy_Curse.create(body));
    }

    static createCellOfCursePolicyUncurse(body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }) {
        return CursePolicy_Uncurse.toCell(CursePolicy_Uncurse.create(body));
    }

    static createCellOfAccessControlGrantRole(body: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }) {
        return AccessControl_GrantRole.toCell(AccessControl_GrantRole.create(body));
    }

    static createCellOfAccessControlRevokeRole(body: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }) {
        return AccessControl_RevokeRole.toCell(AccessControl_RevokeRole.create(body));
    }

    static createCellOfAccessControlRenounceRole(body: {
        queryId?: uint64
        role: uint256
        callerConfirmation: c.Address
    }) {
        return AccessControl_RenounceRole.toCell(AccessControl_RenounceRole.create(body));
    }

    static createCellOfJettonWithdrawableWithdraw(body: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }) {
        return JettonWithdrawable_Withdraw.toCell(JettonWithdrawable_Withdraw.create(body));
    }

    static createCellOfBurnMintTokenPoolClaimMinterAdmin(body: {
        queryId?: uint64
    }) {
        return BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body));
    }

    static createCellOfCCTReturnExcessesBack(body: {
        queryId?: uint64
        initiator: c.Address
        forwardPayload?: c.Cell | null /* = null */
    }) {
        return CCT_ReturnExcessesBack.toCell(CCT_ReturnExcessesBack.create(body));
    }

    static createCellOfDepositAccountReply(body: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }) {
        return DepositAccount_Reply.toCell(DepositAccount_Reply.create(body));
    }

    static createCellOfDepositAccountForwardNotification(body: {
        message: DepositAccount_InMessageForward
    }) {
        return DepositAccount_ForwardNotification.toCell(DepositAccount_ForwardNotification.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    send(provider: ContractProvider, via: Sender, msgValue: coins, body: c.Cell, extraOptions?: ExtraSendOptions): Promise<void> {
        return provider.internal(via, {
            value: msgValue,
            body,
            ...extraOptions
        });
    }

    async sendTokenPoolLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolGetCCVs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        replyTo: c.Address
        forwardPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_GetCCVs.toCell(TokenPool_GetCCVs.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolGetCCVsAndFees(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        localToken: c.Address
        remoteChainSelector: uint64
        amount: coins
        requestedFinalityConfig: uint32
        direction: TokenPool_MessageDirection
        extraData: c.Cell | null
        forwardPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_GetCCVsAndFees.toCell(TokenPool_GetCCVsAndFees.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolQueryCCVsReply(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        requiredCCVs: array<c.Address>
        replyPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_QueryCCVsReply.toCell(TokenPool_QueryCCVsReply.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyChainUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ApplyChainUpdates.toCell(TokenPool_ApplyChainUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolAddRemotePool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolRemoveRemotePool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CrossChainAddress
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetDynamicConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetDynamicConfig.toCell(TokenPool_SetDynamicConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAllowedFinalityConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        allowedFinalityConfig: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAdvancedPoolHooks(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        advancedPoolHooks: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetDeployableCode(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        deployableCode: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetDeployableCode.toCell(TokenPool_SetDeployableCode.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAllowedDepositNamespaces(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        allowedDepositNamespaces: Set<uint32>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAllowedDepositNamespaces.toCell(TokenPool_SetAllowedDepositNamespaces.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetRateLimitConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyTokenTransferFeeConfigUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendCursePolicyCurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CursePolicy_Curse.toCell(CursePolicy_Curse.create(body)),
            ...extraOptions
        });
    }

    async sendCursePolicyUncurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CursePolicy_Uncurse.toCell(CursePolicy_Uncurse.create(body)),
            ...extraOptions
        });
    }

    async sendAccessControlGrantRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: AccessControl_GrantRole.toCell(AccessControl_GrantRole.create(body)),
            ...extraOptions
        });
    }

    async sendAccessControlRevokeRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        role: uint256
        account: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: AccessControl_RevokeRole.toCell(AccessControl_RevokeRole.create(body)),
            ...extraOptions
        });
    }

    async sendAccessControlRenounceRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        role: uint256
        callerConfirmation: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: AccessControl_RenounceRole.toCell(AccessControl_RenounceRole.create(body)),
            ...extraOptions
        });
    }

    async sendJettonWithdrawableWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonWithdrawable_Withdraw.toCell(JettonWithdrawable_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendBurnMintTokenPoolClaimMinterAdmin(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body)),
            ...extraOptions
        });
    }

    async sendCCTReturnExcessesBack(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        initiator: c.Address
        forwardPayload?: c.Cell | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CCT_ReturnExcessesBack.toCell(CCT_ReturnExcessesBack.create(body)),
            ...extraOptions
        });
    }

    async sendDepositAccountReply(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_Reply.toCell(DepositAccount_Reply.create(body)),
            ...extraOptions
        });
    }

    async sendDepositAccountForwardNotification(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: DepositAccount_InMessageForward
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_ForwardNotification.toCell(DepositAccount_ForwardNotification.create(body)),
            ...extraOptions
        });
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

    async getToken(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('token', []));
        return r.readSlice().loadAddress();
    }

    async getTokenDecimals(provider: ContractProvider): Promise<uint8> {
        const r = StackReader.fromGetMethod(1, await provider.get('tokenDecimals', []));
        return r.readBigInt();
    }

    async getIsSupportedChain(provider: ContractProvider, remoteChainSelector: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isSupportedChain', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readBoolean();
    }

    async getVerifyNotCursed(provider: ContractProvider, subject: uint128): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('verifyNotCursed', [
            { type: 'int', value: subject },
        ]));
        return r.readBoolean();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getCurrentRateLimiterState(provider: ContractProvider, remoteChainSelector: uint64, fastFinality: boolean): Promise<TokenPool_RateLimiterPair> {
        const r = StackReader.fromGetMethod(2, await provider.get('getCurrentRateLimiterState', [
            { type: 'int', value: remoteChainSelector },
            { type: 'int', value: (fastFinality ? -1n : 0n) },
        ]));
        return ({
            $: 'TokenPool_RateLimiterPair',
            outbound: r.readCellRef<RateLimiter_TokenBucket>(RateLimiter_TokenBucket.fromSlice),
            inbound: r.readCellRef<RateLimiter_TokenBucket>(RateLimiter_TokenBucket.fromSlice),
        });
    }

    async getIsSupportedToken(provider: ContractProvider, token: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isSupportedToken', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getDynamicConfig(provider: ContractProvider): Promise<TokenPool_DynamicConfig> {
        const r = StackReader.fromGetMethod(4, await provider.get('getDynamicConfig', []));
        return ({
            $: 'TokenPool_DynamicConfig',
            router: r.readSlice().loadAddress(),
            rateLimitAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            feeAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            allowedDepositNamespaces: dictToSet(r.readDictionary<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ))),
        });
    }

    async getAllowedFinalityConfig(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAllowedFinalityConfig', []));
        return r.readBigInt();
    }

    async getAdvancedPoolHooks(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAdvancedPoolHooks', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getSupportedChains(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getSupportedChains', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
    }

    async getIsRemotePool(provider: ContractProvider, remoteChainSelector: uint64, remotePoolAddress: CrossChainAddress): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isRemotePool', [
            { type: 'int', value: remoteChainSelector },
            { type: 'cell', cell: CrossChainAddress.toCell(remotePoolAddress) },
        ]));
        return r.readBoolean();
    }

    async getRemoteToken(provider: ContractProvider, remoteChainSelector: uint64): Promise<CrossChainAddress> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemoteToken', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice);
    }

    async getRemotePools(provider: ContractProvider, remoteChainSelector: uint64): Promise<lisp_list<CrossChainAddress>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemotePools', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readLispListOf<CrossChainAddress>(
            (r) => r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice)
        );
    }

    async getTokenTransferFeeConfig(provider: ContractProvider, destChainSelector: uint64): Promise<TokenPool_TokenTransferFeeConfig | null> {
        const r = StackReader.fromGetMethod(8, await provider.get('getTokenTransferFeeConfig', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readWideNullable<TokenPool_TokenTransferFeeConfig>(8,
            (r) => ({
                $: 'TokenPool_TokenTransferFeeConfig',
                destGasOverhead: r.readBigInt(),
                destBytesOverhead: r.readBigInt(),
                finalityFeeUSDCents: r.readBigInt(),
                fastFinalityFeeUSDCents: r.readBigInt(),
                finalityTransferFeeBps: r.readBigInt(),
                fastFinalityTransferFeeBps: r.readBigInt(),
                isEnabled: r.readBoolean(),
            })
        );
    }

    async getFee(provider: ContractProvider, localToken: c.Address, destChainSelector: uint64, amount: coins, feeToken: c.Address, requestedFinalityConfig: uint32, tokenArgs: c.Cell | null): Promise<[
        coins,
        uint32,
        uint32,
        uint16,
        boolean,
    ]> {
        const r = StackReader.fromGetMethod(5, await provider.get('getFee', [
            { type: 'slice', cell: makeCellFrom<c.Address>(localToken,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: destChainSelector },
            { type: 'int', value: amount },
            { type: 'slice', cell: makeCellFrom<c.Address>(feeToken,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: requestedFinalityConfig },
            tokenArgs === null ? { type: 'null' } : { type: 'cell', cell: tokenArgs },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
        ];
    }

    async getFeeAmount(provider: ContractProvider, transfer: TokenPool_LockOrBurnTransfer, requestedFinalityConfig: uint32): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('getFeeAmount', [
            { type: 'int', value: transfer.id },
            { type: 'cell', cell: makeCellFrom<TokenPool_TransferDetails<c.Address, CrossChainAddress, coins>>(transfer.details,
                (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
                b.storeUint(v.remoteChainSelector, 64);
                b.storeAddress(v.originalSender);
                b.storeCoins(v.amount);
                b.storeAddress(v.localToken); }
            ) },
            { type: 'int', value: requestedFinalityConfig },
        ]));
        return r.readBigInt();
    }

    async getCCVAmount(provider: ContractProvider, remoteChainSelector: uint64, sourceDenominatedAmount: coins, requestedFinalityConfig: uint32, direction: TokenPool_MessageDirection, extraData: c.Cell | null): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('getCCVAmount', [
            { type: 'int', value: remoteChainSelector },
            { type: 'int', value: sourceDenominatedAmount },
            { type: 'int', value: requestedFinalityConfig },
            { type: 'int', value: direction },
            extraData === null ? { type: 'null' } : { type: 'cell', cell: extraData },
        ]));
        return r.readBigInt();
    }
}
