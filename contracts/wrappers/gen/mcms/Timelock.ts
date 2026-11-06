// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a Timelock contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

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


function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
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

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
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
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint32 = bigint
type uint64 = bigint
type uint256 = bigint

/**
 > struct (0x4982fcfd) Timelock_Init {
 >     queryID: uint64
 >     minDelay: uint32
 >     admin: address
 >     proposers: SnakedCell<address>
 >     executors: SnakedCell<address>
 >     cancellers: SnakedCell<address>
 >     bypassers: SnakedCell<address>
 >     executorRoleCheckEnabled: bool
 >     opFinalizationTimeout: uint32
 > }
 */
export interface Timelock_Init {
    readonly $: 'Timelock_Init'
    queryID: uint64
    minDelay: uint32
    admin: c.Address
    proposers: SnakedCell<c.Address>
    executors: SnakedCell<c.Address>
    cancellers: SnakedCell<c.Address>
    bypassers: SnakedCell<c.Address>
    executorRoleCheckEnabled: boolean
    opFinalizationTimeout: uint32
}

export const Timelock_Init = {
    PREFIX: 0x4982fcfd,

    create(args: {
        queryID?: uint64
        minDelay: uint32
        admin: c.Address
        proposers: SnakedCell<c.Address>
        executors: SnakedCell<c.Address>
        cancellers: SnakedCell<c.Address>
        bypassers: SnakedCell<c.Address>
        executorRoleCheckEnabled: boolean
        opFinalizationTimeout: uint32
    }): Timelock_Init {
        return {
            $: 'Timelock_Init',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_Init {
        loadAndCheckPrefix32(s, 0x4982fcfd, 'Timelock_Init');
        return {
            $: 'Timelock_Init',
            queryID: s.loadUintBig(64),
            minDelay: s.loadUintBig(32),
            admin: s.loadAddress(),
            proposers: loadSnakedCellOf(s, (s) => s.loadAddress()),
            executors: loadSnakedCellOf(s, (s) => s.loadAddress()),
            cancellers: loadSnakedCellOf(s, (s) => s.loadAddress()),
            bypassers: loadSnakedCellOf(s, (s) => s.loadAddress()),
            executorRoleCheckEnabled: s.loadBoolean(),
            opFinalizationTimeout: s.loadUintBig(32),
        }
    },
    store(self: Timelock_Init, b: c.Builder): void {
        b.storeUint(0x4982fcfd, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.minDelay, 32);
        b.storeAddress(self.admin);
        storeSnakedCellOf(self.proposers, b, (v, b) => b.storeAddress(v));
        storeSnakedCellOf(self.executors, b, (v, b) => b.storeAddress(v));
        storeSnakedCellOf(self.cancellers, b, (v, b) => b.storeAddress(v));
        storeSnakedCellOf(self.bypassers, b, (v, b) => b.storeAddress(v));
        b.storeBit(self.executorRoleCheckEnabled);
        b.storeUint(self.opFinalizationTimeout, 32);
    },
    toCell(self: Timelock_Init): c.Cell {
        return makeCellFrom<Timelock_Init>(self, Timelock_Init.store);
    }
}

/**
 > struct (0x094718f4) Timelock_ScheduleBatch {
 >     queryID: uint64
 >     calls: SnakedCell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 >     delay: uint32
 > }
 */
export interface Timelock_ScheduleBatch {
    readonly $: 'Timelock_ScheduleBatch'
    queryID: uint64
    calls: SnakedCell<Timelock_Call>
    predecessor: uint256
    salt: uint256
    delay: uint32
}

export const Timelock_ScheduleBatch = {
    PREFIX: 0x094718f4,

    create(args: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }): Timelock_ScheduleBatch {
        return {
            $: 'Timelock_ScheduleBatch',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_ScheduleBatch {
        loadAndCheckPrefix32(s, 0x094718f4, 'Timelock_ScheduleBatch');
        return {
            $: 'Timelock_ScheduleBatch',
            queryID: s.loadUintBig(64),
            calls: loadSnakedCellOf(s, Timelock_Call.fromSlice),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
            delay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_ScheduleBatch, b: c.Builder): void {
        b.storeUint(0x094718f4, 32);
        b.storeUint(self.queryID, 64);
        storeSnakedCellOf(self.calls, b, Timelock_Call.store);
        b.storeUint(self.predecessor, 256);
        b.storeUint(self.salt, 256);
        b.storeUint(self.delay, 32);
    },
    toCell(self: Timelock_ScheduleBatch): c.Cell {
        return makeCellFrom<Timelock_ScheduleBatch>(self, Timelock_ScheduleBatch.store);
    }
}

/**
 > struct (0xaf3bf1d0) Timelock_Cancel {
 >     queryID: uint64
 >     id: uint256
 > }
 */
export interface Timelock_Cancel {
    readonly $: 'Timelock_Cancel'
    queryID: uint64
    id: uint256
}

export const Timelock_Cancel = {
    PREFIX: 0xaf3bf1d0,

    create(args: {
        queryID?: uint64
        id: uint256
    }): Timelock_Cancel {
        return {
            $: 'Timelock_Cancel',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_Cancel {
        loadAndCheckPrefix32(s, 0xaf3bf1d0, 'Timelock_Cancel');
        return {
            $: 'Timelock_Cancel',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_Cancel, b: c.Builder): void {
        b.storeUint(0xaf3bf1d0, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_Cancel): c.Cell {
        return makeCellFrom<Timelock_Cancel>(self, Timelock_Cancel.store);
    }
}

/**
 > struct (0x6e9bf263) Timelock_ExecuteBatch {
 >     queryID: uint64
 >     calls: SnakedCell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 > }
 */
export interface Timelock_ExecuteBatch {
    readonly $: 'Timelock_ExecuteBatch'
    queryID: uint64
    calls: SnakedCell<Timelock_Call>
    predecessor: uint256
    salt: uint256
}

export const Timelock_ExecuteBatch = {
    PREFIX: 0x6e9bf263,

    create(args: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }): Timelock_ExecuteBatch {
        return {
            $: 'Timelock_ExecuteBatch',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_ExecuteBatch {
        loadAndCheckPrefix32(s, 0x6e9bf263, 'Timelock_ExecuteBatch');
        return {
            $: 'Timelock_ExecuteBatch',
            queryID: s.loadUintBig(64),
            calls: loadSnakedCellOf(s, Timelock_Call.fromSlice),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
        }
    },
    store(self: Timelock_ExecuteBatch, b: c.Builder): void {
        b.storeUint(0x6e9bf263, 32);
        b.storeUint(self.queryID, 64);
        storeSnakedCellOf(self.calls, b, Timelock_Call.store);
        b.storeUint(self.predecessor, 256);
        b.storeUint(self.salt, 256);
    },
    toCell(self: Timelock_ExecuteBatch): c.Cell {
        return makeCellFrom<Timelock_ExecuteBatch>(self, Timelock_ExecuteBatch.store);
    }
}

/**
 > struct (0x7a57a45c) Timelock_UpdateDelay {
 >     queryID: uint64
 >     newDelay: uint32
 > }
 */
export interface Timelock_UpdateDelay {
    readonly $: 'Timelock_UpdateDelay'
    queryID: uint64
    newDelay: uint32
}

export const Timelock_UpdateDelay = {
    PREFIX: 0x7a57a45c,

    create(args: {
        queryID?: uint64
        newDelay: uint32
    }): Timelock_UpdateDelay {
        return {
            $: 'Timelock_UpdateDelay',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateDelay {
        loadAndCheckPrefix32(s, 0x7a57a45c, 'Timelock_UpdateDelay');
        return {
            $: 'Timelock_UpdateDelay',
            queryID: s.loadUintBig(64),
            newDelay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UpdateDelay, b: c.Builder): void {
        b.storeUint(0x7a57a45c, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.newDelay, 32);
    },
    toCell(self: Timelock_UpdateDelay): c.Cell {
        return makeCellFrom<Timelock_UpdateDelay>(self, Timelock_UpdateDelay.store);
    }
}

/**
 > struct (0x94278d4f) Timelock_UpdateOpFinalizationTimeout {
 >     queryID: uint64
 >     newOpFinalizationTimeout: uint32
 > }
 */
export interface Timelock_UpdateOpFinalizationTimeout {
    readonly $: 'Timelock_UpdateOpFinalizationTimeout'
    queryID: uint64
    newOpFinalizationTimeout: uint32
}

export const Timelock_UpdateOpFinalizationTimeout = {
    PREFIX: 0x94278d4f,

    create(args: {
        queryID?: uint64
        newOpFinalizationTimeout: uint32
    }): Timelock_UpdateOpFinalizationTimeout {
        return {
            $: 'Timelock_UpdateOpFinalizationTimeout',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateOpFinalizationTimeout {
        loadAndCheckPrefix32(s, 0x94278d4f, 'Timelock_UpdateOpFinalizationTimeout');
        return {
            $: 'Timelock_UpdateOpFinalizationTimeout',
            queryID: s.loadUintBig(64),
            newOpFinalizationTimeout: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UpdateOpFinalizationTimeout, b: c.Builder): void {
        b.storeUint(0x94278d4f, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.newOpFinalizationTimeout, 32);
    },
    toCell(self: Timelock_UpdateOpFinalizationTimeout): c.Cell {
        return makeCellFrom<Timelock_UpdateOpFinalizationTimeout>(self, Timelock_UpdateOpFinalizationTimeout.store);
    }
}

/**
 > struct (0x2637af77) Timelock_BlockFunctionSelector {
 >     queryID: uint64
 >     selector: uint32
 > }
 */
export interface Timelock_BlockFunctionSelector {
    readonly $: 'Timelock_BlockFunctionSelector'
    queryID: uint64
    selector: uint32
}

export const Timelock_BlockFunctionSelector = {
    PREFIX: 0x2637af77,

    create(args: {
        queryID?: uint64
        selector: uint32
    }): Timelock_BlockFunctionSelector {
        return {
            $: 'Timelock_BlockFunctionSelector',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BlockFunctionSelector {
        loadAndCheckPrefix32(s, 0x2637af77, 'Timelock_BlockFunctionSelector');
        return {
            $: 'Timelock_BlockFunctionSelector',
            queryID: s.loadUintBig(64),
            selector: s.loadUintBig(32),
        }
    },
    store(self: Timelock_BlockFunctionSelector, b: c.Builder): void {
        b.storeUint(0x2637af77, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.selector, 32);
    },
    toCell(self: Timelock_BlockFunctionSelector): c.Cell {
        return makeCellFrom<Timelock_BlockFunctionSelector>(self, Timelock_BlockFunctionSelector.store);
    }
}

/**
 > struct (0x26f19f4e) Timelock_UnblockFunctionSelector {
 >     queryID: uint64
 >     selector: uint32
 > }
 */
export interface Timelock_UnblockFunctionSelector {
    readonly $: 'Timelock_UnblockFunctionSelector'
    queryID: uint64
    selector: uint32
}

export const Timelock_UnblockFunctionSelector = {
    PREFIX: 0x26f19f4e,

    create(args: {
        queryID?: uint64
        selector: uint32
    }): Timelock_UnblockFunctionSelector {
        return {
            $: 'Timelock_UnblockFunctionSelector',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_UnblockFunctionSelector {
        loadAndCheckPrefix32(s, 0x26f19f4e, 'Timelock_UnblockFunctionSelector');
        return {
            $: 'Timelock_UnblockFunctionSelector',
            queryID: s.loadUintBig(64),
            selector: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UnblockFunctionSelector, b: c.Builder): void {
        b.storeUint(0x26f19f4e, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.selector, 32);
    },
    toCell(self: Timelock_UnblockFunctionSelector): c.Cell {
        return makeCellFrom<Timelock_UnblockFunctionSelector>(self, Timelock_UnblockFunctionSelector.store);
    }
}

/**
 > struct (0xbb0e9f7d) Timelock_BypasserExecuteBatch {
 >     queryID: uint64
 >     calls: SnakedCell<Timelock_Call>
 > }
 */
export interface Timelock_BypasserExecuteBatch {
    readonly $: 'Timelock_BypasserExecuteBatch'
    queryID: uint64
    calls: SnakedCell<Timelock_Call>
}

export const Timelock_BypasserExecuteBatch = {
    PREFIX: 0xbb0e9f7d,

    create(args: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
    }): Timelock_BypasserExecuteBatch {
        return {
            $: 'Timelock_BypasserExecuteBatch',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserExecuteBatch {
        loadAndCheckPrefix32(s, 0xbb0e9f7d, 'Timelock_BypasserExecuteBatch');
        return {
            $: 'Timelock_BypasserExecuteBatch',
            queryID: s.loadUintBig(64),
            calls: loadSnakedCellOf(s, Timelock_Call.fromSlice),
        }
    },
    store(self: Timelock_BypasserExecuteBatch, b: c.Builder): void {
        b.storeUint(0xbb0e9f7d, 32);
        b.storeUint(self.queryID, 64);
        storeSnakedCellOf(self.calls, b, Timelock_Call.store);
    },
    toCell(self: Timelock_BypasserExecuteBatch): c.Cell {
        return makeCellFrom<Timelock_BypasserExecuteBatch>(self, Timelock_BypasserExecuteBatch.store);
    }
}

/**
 > struct (0x34d98baa) Timelock_UpdateExecutorRoleCheck {
 >     queryID: uint64
 >     enabled: bool
 > }
 */
export interface Timelock_UpdateExecutorRoleCheck {
    readonly $: 'Timelock_UpdateExecutorRoleCheck'
    queryID: uint64
    enabled: boolean
}

export const Timelock_UpdateExecutorRoleCheck = {
    PREFIX: 0x34d98baa,

    create(args: {
        queryID?: uint64
        enabled: boolean
    }): Timelock_UpdateExecutorRoleCheck {
        return {
            $: 'Timelock_UpdateExecutorRoleCheck',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateExecutorRoleCheck {
        loadAndCheckPrefix32(s, 0x34d98baa, 'Timelock_UpdateExecutorRoleCheck');
        return {
            $: 'Timelock_UpdateExecutorRoleCheck',
            queryID: s.loadUintBig(64),
            enabled: s.loadBoolean(),
        }
    },
    store(self: Timelock_UpdateExecutorRoleCheck, b: c.Builder): void {
        b.storeUint(0x34d98baa, 32);
        b.storeUint(self.queryID, 64);
        b.storeBit(self.enabled);
    },
    toCell(self: Timelock_UpdateExecutorRoleCheck): c.Cell {
        return makeCellFrom<Timelock_UpdateExecutorRoleCheck>(self, Timelock_UpdateExecutorRoleCheck.store);
    }
}

/**
 > struct (0xf4538b79) Timelock_SubmitErrorReport {
 >     queryID: uint64
 >     opBatch: Cell<Timelock_OperationBatch>
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 > }
 */
export interface Timelock_SubmitErrorReport {
    readonly $: 'Timelock_SubmitErrorReport'
    queryID: uint64
    opBatch: Timelock_OperationBatch
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
}

export const Timelock_SubmitErrorReport = {
    PREFIX: 0xf4538b79,

    create(args: {
        queryID?: uint64
        opBatch: Timelock_OperationBatch
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }): Timelock_SubmitErrorReport {
        return {
            $: 'Timelock_SubmitErrorReport',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_SubmitErrorReport {
        loadAndCheckPrefix32(s, 0xf4538b79, 'Timelock_SubmitErrorReport');
        return {
            $: 'Timelock_SubmitErrorReport',
            queryID: s.loadUintBig(64),
            opBatch: loadCellRef<Timelock_OperationBatch>(s, Timelock_OperationBatch.fromSlice),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
        }
    },
    store(self: Timelock_SubmitErrorReport, b: c.Builder): void {
        b.storeUint(0xf4538b79, 32);
        b.storeUint(self.queryID, 64);
        storeCellRef<Timelock_OperationBatch>(self.opBatch, b, Timelock_OperationBatch.store);
        b.storeUint(self.opTxHash, 256);
        b.storeUint(self.errorTxHash, 256);
        b.storeUint(self.errorCode, 32);
    },
    toCell(self: Timelock_SubmitErrorReport): c.Cell {
        return makeCellFrom<Timelock_SubmitErrorReport>(self, Timelock_SubmitErrorReport.store);
    }
}

/**
 > struct (0x3ed17038) Timelock_BounceHandled {
 >     sender: address
 >     bouncedBody: uint256
 >     opPendingId: uint256
 >     matchesPendingOp: bool
 > }
 */
export interface Timelock_BounceHandled {
    readonly $: 'Timelock_BounceHandled'
    sender: c.Address
    bouncedBody: uint256
    opPendingId: uint256
    matchesPendingOp: boolean
}

export const Timelock_BounceHandled = {
    PREFIX: 0x3ed17038,

    create(args: {
        sender: c.Address
        bouncedBody: uint256
        opPendingId: uint256
        matchesPendingOp: boolean
    }): Timelock_BounceHandled {
        return {
            $: 'Timelock_BounceHandled',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BounceHandled {
        loadAndCheckPrefix32(s, 0x3ed17038, 'Timelock_BounceHandled');
        return {
            $: 'Timelock_BounceHandled',
            sender: s.loadAddress(),
            bouncedBody: s.loadUintBig(256),
            opPendingId: s.loadUintBig(256),
            matchesPendingOp: s.loadBoolean(),
        }
    },
    store(self: Timelock_BounceHandled, b: c.Builder): void {
        b.storeUint(0x3ed17038, 32);
        b.storeAddress(self.sender);
        b.storeUint(self.bouncedBody, 256);
        b.storeUint(self.opPendingId, 256);
        b.storeBit(self.matchesPendingOp);
    },
    toCell(self: Timelock_BounceHandled): c.Cell {
        return makeCellFrom<Timelock_BounceHandled>(self, Timelock_BounceHandled.store);
    }
}

/**
 > struct (0xdf65b59e) Timelock_BatchScheduled {
 >     queryID: uint64
 >     id: uint256
 >     delay: uint32
 > }
 */
export interface Timelock_BatchScheduled {
    readonly $: 'Timelock_BatchScheduled'
    queryID: uint64
    id: uint256
    delay: uint32
}

export const Timelock_BatchScheduled = {
    PREFIX: 0xdf65b59e,

    create(args: {
        queryID?: uint64
        id: uint256
        delay: uint32
    }): Timelock_BatchScheduled {
        return {
            $: 'Timelock_BatchScheduled',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BatchScheduled {
        loadAndCheckPrefix32(s, 0xdf65b59e, 'Timelock_BatchScheduled');
        return {
            $: 'Timelock_BatchScheduled',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
            delay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_BatchScheduled, b: c.Builder): void {
        b.storeUint(0xdf65b59e, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
        b.storeUint(self.delay, 32);
    },
    toCell(self: Timelock_BatchScheduled): c.Cell {
        return makeCellFrom<Timelock_BatchScheduled>(self, Timelock_BatchScheduled.store);
    }
}

/**
 > struct (0xc55fca54) Timelock_CallScheduled {
 >     queryID: uint64
 >     id: uint256
 >     index: uint64
 >     call: Cell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 >     delay: uint32
 > }
 */
export interface Timelock_CallScheduled {
    readonly $: 'Timelock_CallScheduled'
    queryID: uint64
    id: uint256
    index: uint64
    call: Timelock_Call
    predecessor: uint256
    salt: uint256
    delay: uint32
}

export const Timelock_CallScheduled = {
    PREFIX: 0xc55fca54,

    create(args: {
        queryID?: uint64
        id: uint256
        index: uint64
        call: Timelock_Call
        predecessor: uint256
        salt: uint256
        delay: uint32
    }): Timelock_CallScheduled {
        return {
            $: 'Timelock_CallScheduled',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_CallScheduled {
        loadAndCheckPrefix32(s, 0xc55fca54, 'Timelock_CallScheduled');
        return {
            $: 'Timelock_CallScheduled',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
            index: s.loadUintBig(64),
            call: loadCellRef<Timelock_Call>(s, Timelock_Call.fromSlice),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
            delay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_CallScheduled, b: c.Builder): void {
        b.storeUint(0xc55fca54, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
        b.storeUint(self.index, 64);
        storeCellRef<Timelock_Call>(self.call, b, Timelock_Call.store);
        b.storeUint(self.predecessor, 256);
        b.storeUint(self.salt, 256);
        b.storeUint(self.delay, 32);
    },
    toCell(self: Timelock_CallScheduled): c.Cell {
        return makeCellFrom<Timelock_CallScheduled>(self, Timelock_CallScheduled.store);
    }
}

/**
 > struct (0xa941ea1a) Timelock_BatchExecuted {
 >     queryID: uint64
 >     id: uint256
 > }
 */
export interface Timelock_BatchExecuted {
    readonly $: 'Timelock_BatchExecuted'
    queryID: uint64
    id: uint256
}

export const Timelock_BatchExecuted = {
    PREFIX: 0xa941ea1a,

    create(args: {
        queryID?: uint64
        id: uint256
    }): Timelock_BatchExecuted {
        return {
            $: 'Timelock_BatchExecuted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BatchExecuted {
        loadAndCheckPrefix32(s, 0xa941ea1a, 'Timelock_BatchExecuted');
        return {
            $: 'Timelock_BatchExecuted',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_BatchExecuted, b: c.Builder): void {
        b.storeUint(0xa941ea1a, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_BatchExecuted): c.Cell {
        return makeCellFrom<Timelock_BatchExecuted>(self, Timelock_BatchExecuted.store);
    }
}

/**
 > struct (0x49ea5d0e) Timelock_CallExecuted {
 >     queryID: uint64
 >     id: uint256
 >     index: uint64
 >     target: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Timelock_CallExecuted {
    readonly $: 'Timelock_CallExecuted'
    queryID: uint64
    id: uint256
    index: uint64
    target: c.Address
    value: coins
    data: c.Cell
}

export const Timelock_CallExecuted = {
    PREFIX: 0x49ea5d0e,

    create(args: {
        queryID?: uint64
        id: uint256
        index: uint64
        target: c.Address
        value: coins
        data: c.Cell
    }): Timelock_CallExecuted {
        return {
            $: 'Timelock_CallExecuted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_CallExecuted {
        loadAndCheckPrefix32(s, 0x49ea5d0e, 'Timelock_CallExecuted');
        return {
            $: 'Timelock_CallExecuted',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
            index: s.loadUintBig(64),
            target: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Timelock_CallExecuted, b: c.Builder): void {
        b.storeUint(0x49ea5d0e, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
        b.storeUint(self.index, 64);
        b.storeAddress(self.target);
        b.storeCoins(self.value);
        b.storeRef(self.data);
    },
    toCell(self: Timelock_CallExecuted): c.Cell {
        return makeCellFrom<Timelock_CallExecuted>(self, Timelock_CallExecuted.store);
    }
}

/**
 > struct (0x539b4214) Timelock_BypasserBatchExecuted {
 >     queryID: uint64
 > }
 */
export interface Timelock_BypasserBatchExecuted {
    readonly $: 'Timelock_BypasserBatchExecuted'
    queryID: uint64
}

export const Timelock_BypasserBatchExecuted = {
    PREFIX: 0x539b4214,

    create(args: {
        queryID?: uint64
    }): Timelock_BypasserBatchExecuted {
        return {
            $: 'Timelock_BypasserBatchExecuted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserBatchExecuted {
        loadAndCheckPrefix32(s, 0x539b4214, 'Timelock_BypasserBatchExecuted');
        return {
            $: 'Timelock_BypasserBatchExecuted',
            queryID: s.loadUintBig(64),
        }
    },
    store(self: Timelock_BypasserBatchExecuted, b: c.Builder): void {
        b.storeUint(0x539b4214, 32);
        b.storeUint(self.queryID, 64);
    },
    toCell(self: Timelock_BypasserBatchExecuted): c.Cell {
        return makeCellFrom<Timelock_BypasserBatchExecuted>(self, Timelock_BypasserBatchExecuted.store);
    }
}

/**
 > struct (0x9c7f3010) Timelock_BypasserCallExecuted {
 >     queryID: uint64
 >     index: uint64
 >     target: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Timelock_BypasserCallExecuted {
    readonly $: 'Timelock_BypasserCallExecuted'
    queryID: uint64
    index: uint64
    target: c.Address
    value: coins
    data: c.Cell
}

export const Timelock_BypasserCallExecuted = {
    PREFIX: 0x9c7f3010,

    create(args: {
        queryID?: uint64
        index: uint64
        target: c.Address
        value: coins
        data: c.Cell
    }): Timelock_BypasserCallExecuted {
        return {
            $: 'Timelock_BypasserCallExecuted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserCallExecuted {
        loadAndCheckPrefix32(s, 0x9c7f3010, 'Timelock_BypasserCallExecuted');
        return {
            $: 'Timelock_BypasserCallExecuted',
            queryID: s.loadUintBig(64),
            index: s.loadUintBig(64),
            target: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Timelock_BypasserCallExecuted, b: c.Builder): void {
        b.storeUint(0x9c7f3010, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.index, 64);
        b.storeAddress(self.target);
        b.storeCoins(self.value);
        b.storeRef(self.data);
    },
    toCell(self: Timelock_BypasserCallExecuted): c.Cell {
        return makeCellFrom<Timelock_BypasserCallExecuted>(self, Timelock_BypasserCallExecuted.store);
    }
}

/**
 > struct (0x580e80f2) Timelock_Canceled {
 >     queryID: uint64
 >     id: uint256
 > }
 */
export interface Timelock_Canceled {
    readonly $: 'Timelock_Canceled'
    queryID: uint64
    id: uint256
}

export const Timelock_Canceled = {
    PREFIX: 0x580e80f2,

    create(args: {
        queryID?: uint64
        id: uint256
    }): Timelock_Canceled {
        return {
            $: 'Timelock_Canceled',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_Canceled {
        loadAndCheckPrefix32(s, 0x580e80f2, 'Timelock_Canceled');
        return {
            $: 'Timelock_Canceled',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_Canceled, b: c.Builder): void {
        b.storeUint(0x580e80f2, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_Canceled): c.Cell {
        return makeCellFrom<Timelock_Canceled>(self, Timelock_Canceled.store);
    }
}

/**
 > struct (0x904b14e0) Timelock_MinDelayChange {
 >     queryID: uint64
 >     oldDuration: uint32
 >     newDuration: uint32
 > }
 */
export interface Timelock_MinDelayChange {
    readonly $: 'Timelock_MinDelayChange'
    queryID: uint64
    oldDuration: uint32
    newDuration: uint32
}

export const Timelock_MinDelayChange = {
    PREFIX: 0x904b14e0,

    create(args: {
        queryID?: uint64
        oldDuration: uint32
        newDuration: uint32
    }): Timelock_MinDelayChange {
        return {
            $: 'Timelock_MinDelayChange',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_MinDelayChange {
        loadAndCheckPrefix32(s, 0x904b14e0, 'Timelock_MinDelayChange');
        return {
            $: 'Timelock_MinDelayChange',
            queryID: s.loadUintBig(64),
            oldDuration: s.loadUintBig(32),
            newDuration: s.loadUintBig(32),
        }
    },
    store(self: Timelock_MinDelayChange, b: c.Builder): void {
        b.storeUint(0x904b14e0, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.oldDuration, 32);
        b.storeUint(self.newDuration, 32);
    },
    toCell(self: Timelock_MinDelayChange): c.Cell {
        return makeCellFrom<Timelock_MinDelayChange>(self, Timelock_MinDelayChange.store);
    }
}

/**
 > struct (0x1f102718) Timelock_OpFinalizationTimeoutChange {
 >     queryID: uint64
 >     oldDuration: uint32
 >     newDuration: uint32
 > }
 */
export interface Timelock_OpFinalizationTimeoutChange {
    readonly $: 'Timelock_OpFinalizationTimeoutChange'
    queryID: uint64
    oldDuration: uint32
    newDuration: uint32
}

export const Timelock_OpFinalizationTimeoutChange = {
    PREFIX: 0x1f102718,

    create(args: {
        queryID?: uint64
        oldDuration: uint32
        newDuration: uint32
    }): Timelock_OpFinalizationTimeoutChange {
        return {
            $: 'Timelock_OpFinalizationTimeoutChange',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_OpFinalizationTimeoutChange {
        loadAndCheckPrefix32(s, 0x1f102718, 'Timelock_OpFinalizationTimeoutChange');
        return {
            $: 'Timelock_OpFinalizationTimeoutChange',
            queryID: s.loadUintBig(64),
            oldDuration: s.loadUintBig(32),
            newDuration: s.loadUintBig(32),
        }
    },
    store(self: Timelock_OpFinalizationTimeoutChange, b: c.Builder): void {
        b.storeUint(0x1f102718, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.oldDuration, 32);
        b.storeUint(self.newDuration, 32);
    },
    toCell(self: Timelock_OpFinalizationTimeoutChange): c.Cell {
        return makeCellFrom<Timelock_OpFinalizationTimeoutChange>(self, Timelock_OpFinalizationTimeoutChange.store);
    }
}

/**
 > struct (0xc6d451e2) Timelock_ExecutorRoleCheckUpdated {
 >     queryID: uint64
 >     enabled: bool
 > }
 */
export interface Timelock_ExecutorRoleCheckUpdated {
    readonly $: 'Timelock_ExecutorRoleCheckUpdated'
    queryID: uint64
    enabled: boolean
}

export const Timelock_ExecutorRoleCheckUpdated = {
    PREFIX: 0xc6d451e2,

    create(args: {
        queryID?: uint64
        enabled: boolean
    }): Timelock_ExecutorRoleCheckUpdated {
        return {
            $: 'Timelock_ExecutorRoleCheckUpdated',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_ExecutorRoleCheckUpdated {
        loadAndCheckPrefix32(s, 0xc6d451e2, 'Timelock_ExecutorRoleCheckUpdated');
        return {
            $: 'Timelock_ExecutorRoleCheckUpdated',
            queryID: s.loadUintBig(64),
            enabled: s.loadBoolean(),
        }
    },
    store(self: Timelock_ExecutorRoleCheckUpdated, b: c.Builder): void {
        b.storeUint(0xc6d451e2, 32);
        b.storeUint(self.queryID, 64);
        b.storeBit(self.enabled);
    },
    toCell(self: Timelock_ExecutorRoleCheckUpdated): c.Cell {
        return makeCellFrom<Timelock_ExecutorRoleCheckUpdated>(self, Timelock_ExecutorRoleCheckUpdated.store);
    }
}

/**
 > struct (0xdbd4c8ee) Timelock_ErrorReportSubmitted {
 >     queryID: uint64
 >     id: uint256
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 >     matchesPendingOp: bool
 > }
 */
export interface Timelock_ErrorReportSubmitted {
    readonly $: 'Timelock_ErrorReportSubmitted'
    queryID: uint64
    id: uint256
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
    matchesPendingOp: boolean
}

export const Timelock_ErrorReportSubmitted = {
    PREFIX: 0xdbd4c8ee,

    create(args: {
        queryID?: uint64
        id: uint256
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
        matchesPendingOp: boolean
    }): Timelock_ErrorReportSubmitted {
        return {
            $: 'Timelock_ErrorReportSubmitted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Timelock_ErrorReportSubmitted {
        loadAndCheckPrefix32(s, 0xdbd4c8ee, 'Timelock_ErrorReportSubmitted');
        return {
            $: 'Timelock_ErrorReportSubmitted',
            queryID: s.loadUintBig(64),
            id: s.loadUintBig(256),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
            matchesPendingOp: s.loadBoolean(),
        }
    },
    store(self: Timelock_ErrorReportSubmitted, b: c.Builder): void {
        b.storeUint(0xdbd4c8ee, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.id, 256);
        b.storeUint(self.opTxHash, 256);
        b.storeUint(self.errorTxHash, 256);
        b.storeUint(self.errorCode, 32);
        b.storeBit(self.matchesPendingOp);
    },
    toCell(self: Timelock_ErrorReportSubmitted): c.Cell {
        return makeCellFrom<Timelock_ErrorReportSubmitted>(self, Timelock_ErrorReportSubmitted.store);
    }
}

/**
 > struct Timelock_Data {
 >     id: uint32
 >     minDelay: uint32
 >     timestamps: map<uint256, uint64>
 >     blockedFnSelectorsLen: uint32
 >     blockedFnSelectors: map<uint32, bool>
 >     executorRoleCheckEnabled: bool
 >     opPendingInfo: Timelock_OpPendingInfo
 >     rbac: Cell<AccessControl_Data>
 > }
 */
export interface Timelock_Data {
    readonly $: 'Timelock_Data'
    id: uint32
    minDelay: uint32
    timestamps: Map<uint256, uint64>
    blockedFnSelectorsLen: uint32
    blockedFnSelectors: Map<uint32, boolean>
    executorRoleCheckEnabled: boolean
    opPendingInfo: Timelock_OpPendingInfo
    rbac: AccessControl_Data
}

export const Timelock_Data = {
    create(args: {
        id: uint32
        minDelay: uint32
        timestamps: Map<uint256, uint64>
        blockedFnSelectorsLen: uint32
        blockedFnSelectors: Map<uint32, boolean>
        executorRoleCheckEnabled: boolean
        opPendingInfo: Timelock_OpPendingInfo
        rbac: AccessControl_Data
    }): Timelock_Data {
        return {
            $: 'Timelock_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_Data {
        return {
            $: 'Timelock_Data',
            id: s.loadUintBig(32),
            minDelay: s.loadUintBig(32),
            timestamps: dictToMap(c.Dictionary.load<uint256, uint64>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(64), s)),
            blockedFnSelectorsLen: s.loadUintBig(32),
            blockedFnSelectors: dictToMap(c.Dictionary.load<uint32, boolean>(c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool(), s)),
            executorRoleCheckEnabled: s.loadBoolean(),
            opPendingInfo: Timelock_OpPendingInfo.fromSlice(s),
            rbac: loadCellRef<AccessControl_Data>(s, AccessControl_Data.fromSlice),
        }
    },
    store(self: Timelock_Data, b: c.Builder): void {
        b.storeUint(self.id, 32);
        b.storeUint(self.minDelay, 32);
        b.storeDict<uint256, uint64>(mapToDict(self.timestamps, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(64)), c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(64));
        b.storeUint(self.blockedFnSelectorsLen, 32);
        b.storeDict<uint32, boolean>(mapToDict(self.blockedFnSelectors, c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool()), c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool());
        b.storeBit(self.executorRoleCheckEnabled);
        Timelock_OpPendingInfo.store(self.opPendingInfo, b);
        storeCellRef<AccessControl_Data>(self.rbac, b, AccessControl_Data.store);
    },
    toCell(self: Timelock_Data): c.Cell {
        return makeCellFrom<Timelock_Data>(self, Timelock_Data.store);
    }
}

/**
 > struct Timelock_Call {
 >     target: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Timelock_Call {
    readonly $: 'Timelock_Call'
    target: c.Address
    value: coins
    data: c.Cell
}

export const Timelock_Call = {
    create(args: {
        target: c.Address
        value: coins
        data: c.Cell
    }): Timelock_Call {
        return {
            $: 'Timelock_Call',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_Call {
        return {
            $: 'Timelock_Call',
            target: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Timelock_Call, b: c.Builder): void {
        b.storeAddress(self.target);
        b.storeCoins(self.value);
        b.storeRef(self.data);
    },
    toCell(self: Timelock_Call): c.Cell {
        return makeCellFrom<Timelock_Call>(self, Timelock_Call.store);
    }
}

/**
 > struct Timelock_OperationBatch {
 >     calls: SnakedCell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 > }
 */
export interface Timelock_OperationBatch {
    readonly $: 'Timelock_OperationBatch'
    calls: SnakedCell<Timelock_Call>
    predecessor: uint256
    salt: uint256
}

export const Timelock_OperationBatch = {
    create(args: {
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }): Timelock_OperationBatch {
        return {
            $: 'Timelock_OperationBatch',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_OperationBatch {
        return {
            $: 'Timelock_OperationBatch',
            calls: loadSnakedCellOf(s, Timelock_Call.fromSlice),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
        }
    },
    store(self: Timelock_OperationBatch, b: c.Builder): void {
        storeSnakedCellOf(self.calls, b, Timelock_Call.store);
        b.storeUint(self.predecessor, 256);
        b.storeUint(self.salt, 256);
    },
    toCell(self: Timelock_OperationBatch): c.Cell {
        return makeCellFrom<Timelock_OperationBatch>(self, Timelock_OperationBatch.store);
    }
}

/**
 > struct Timelock_OpPendingInfo {
 >     validAfter: uint64
 >     opFinalizationTimeout: uint32
 >     opPendingId: uint256
 >     opPendingCalls: map<uint256, bool>
 > }
 */
export interface Timelock_OpPendingInfo {
    readonly $: 'Timelock_OpPendingInfo'
    validAfter: uint64
    opFinalizationTimeout: uint32
    opPendingId: uint256
    opPendingCalls: Map<uint256, boolean>
}

export const Timelock_OpPendingInfo = {
    create(args: {
        validAfter: uint64
        opFinalizationTimeout: uint32
        opPendingId: uint256
        opPendingCalls: Map<uint256, boolean>
    }): Timelock_OpPendingInfo {
        return {
            $: 'Timelock_OpPendingInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_OpPendingInfo {
        return {
            $: 'Timelock_OpPendingInfo',
            validAfter: s.loadUintBig(64),
            opFinalizationTimeout: s.loadUintBig(32),
            opPendingId: s.loadUintBig(256),
            opPendingCalls: dictToMap(c.Dictionary.load<uint256, boolean>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool(), s)),
        }
    },
    store(self: Timelock_OpPendingInfo, b: c.Builder): void {
        b.storeUint(self.validAfter, 64);
        b.storeUint(self.opFinalizationTimeout, 32);
        b.storeUint(self.opPendingId, 256);
        b.storeDict<uint256, boolean>(mapToDict(self.opPendingCalls, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool()), c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool());
    },
    toCell(self: Timelock_OpPendingInfo): c.Cell {
        return makeCellFrom<Timelock_OpPendingInfo>(self, Timelock_OpPendingInfo.store);
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
 > struct (0xcf3ca837) AccessControl_RoleGranted {
 >     queryID: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleGranted {
    readonly $: 'AccessControl_RoleGranted'
    queryID: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleGranted = {
    PREFIX: 0xcf3ca837,

    create(args: {
        queryID?: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleGranted {
        return {
            $: 'AccessControl_RoleGranted',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleGranted {
        loadAndCheckPrefix32(s, 0xcf3ca837, 'AccessControl_RoleGranted');
        return {
            $: 'AccessControl_RoleGranted',
            queryID: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleGranted, b: c.Builder): void {
        b.storeUint(0xcf3ca837, 32);
        b.storeUint(self.queryID, 64);
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
 >     queryID: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleRevoked {
    readonly $: 'AccessControl_RoleRevoked'
    queryID: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleRevoked = {
    PREFIX: 0x990fe1c7,

    create(args: {
        queryID?: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleRevoked {
        return {
            $: 'AccessControl_RoleRevoked',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleRevoked {
        loadAndCheckPrefix32(s, 0x990fe1c7, 'AccessControl_RoleRevoked');
        return {
            $: 'AccessControl_RoleRevoked',
            queryID: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleRevoked, b: c.Builder): void {
        b.storeUint(0x990fe1c7, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
        b.storeAddress(self.sender);
    },
    toCell(self: AccessControl_RoleRevoked): c.Cell {
        return makeCellFrom<AccessControl_RoleRevoked>(self, AccessControl_RoleRevoked.store);
    }
}

/**
 > struct (0xbd7e8bce) AccessControl_RoleAdminChanged {
 >     queryID: uint64
 >     role: uint256
 >     previousAdminRole: uint256
 >     newAdminRole: uint256
 > }
 */
export interface AccessControl_RoleAdminChanged {
    readonly $: 'AccessControl_RoleAdminChanged'
    queryID: uint64
    role: uint256
    previousAdminRole: uint256
    newAdminRole: uint256
}

export const AccessControl_RoleAdminChanged = {
    PREFIX: 0xbd7e8bce,

    create(args: {
        queryID?: uint64
        role: uint256
        previousAdminRole: uint256
        newAdminRole: uint256
    }): AccessControl_RoleAdminChanged {
        return {
            $: 'AccessControl_RoleAdminChanged',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleAdminChanged {
        loadAndCheckPrefix32(s, 0xbd7e8bce, 'AccessControl_RoleAdminChanged');
        return {
            $: 'AccessControl_RoleAdminChanged',
            queryID: s.loadUintBig(64),
            role: s.loadUintBig(256),
            previousAdminRole: s.loadUintBig(256),
            newAdminRole: s.loadUintBig(256),
        }
    },
    store(self: AccessControl_RoleAdminChanged, b: c.Builder): void {
        b.storeUint(0xbd7e8bce, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.role, 256);
        b.storeUint(self.previousAdminRole, 256);
        b.storeUint(self.newAdminRole, 256);
    },
    toCell(self: AccessControl_RoleAdminChanged): c.Cell {
        return makeCellFrom<AccessControl_RoleAdminChanged>(self, AccessControl_RoleAdminChanged.store);
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

// ————————————————————————————————————————————
//    class Timelock
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

export class Timelock implements c.Contract {
    static Errors = {
        'Utils_Error.InvalidData': 13500,
        'AccessControl_Error.UnauthorizedAccount': 47400,
        'AccessControl_Error.BadConfirmation': 47401,
        'Timelock_Error.SelectorIsBlocked': 60600,
        'Timelock_Error.OperationNotReady': 60601,
        'Timelock_Error.OperationMissingDependency': 60602,
        'Timelock_Error.OperationCanNotBeCancelled': 60603,
        'Timelock_Error.OperationAlreadyScheduled': 60604,
        'Timelock_Error.InsufficientDelay': 60605,
        'Timelock_Error.PendingOperationNotFinal': 60606,
        'Timelock_Error.InsufficientValue': 60607,
        'Timelock_Error.OperationNotDone': 60608,
        'Timelock_Error.ContractAlreadyInitialized': 60609,
        'Timelock_Error.ContractNotInitialized': 60610,
        'Timelock_Error.InsufficientFee': 60611,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new Timelock(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        minDelay: uint32
        timestamps: Map<uint256, uint64>
        blockedFnSelectorsLen: uint32
        blockedFnSelectors: Map<uint32, boolean>
        executorRoleCheckEnabled: boolean
        opPendingInfo: Timelock_OpPendingInfo
        rbac: AccessControl_Data
    }, deployedOptions?: DeployedAddrOptions) {
        if (!deployedOptions?.overrideContractCode) {
            throw new Error('Timelock.fromStorage requires deployedOptions.overrideContractCode');
        }
        const initialState = {
            code: deployedOptions.overrideContractCode,
            data: Timelock_Data.toCell(Timelock_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new Timelock(address, initialState);
    }

    static createCellOfTimelockInit(body: {
        queryID?: uint64
        minDelay: uint32
        admin: c.Address
        proposers: SnakedCell<c.Address>
        executors: SnakedCell<c.Address>
        cancellers: SnakedCell<c.Address>
        bypassers: SnakedCell<c.Address>
        executorRoleCheckEnabled: boolean
        opFinalizationTimeout: uint32
    }) {
        return Timelock_Init.toCell(Timelock_Init.create(body));
    }

    static createCellOfTimelockScheduleBatch(body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }) {
        return Timelock_ScheduleBatch.toCell(Timelock_ScheduleBatch.create(body));
    }

    static createCellOfTimelockCancel(body: {
        queryID?: uint64
        id: uint256
    }) {
        return Timelock_Cancel.toCell(Timelock_Cancel.create(body));
    }

    static createCellOfTimelockExecuteBatch(body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }) {
        return Timelock_ExecuteBatch.toCell(Timelock_ExecuteBatch.create(body));
    }

    static createCellOfTimelockUpdateDelay(body: {
        queryID?: uint64
        newDelay: uint32
    }) {
        return Timelock_UpdateDelay.toCell(Timelock_UpdateDelay.create(body));
    }

    static createCellOfTimelockUpdateOpFinalizationTimeout(body: {
        queryID?: uint64
        newOpFinalizationTimeout: uint32
    }) {
        return Timelock_UpdateOpFinalizationTimeout.toCell(Timelock_UpdateOpFinalizationTimeout.create(body));
    }

    static createCellOfTimelockBlockFunctionSelector(body: {
        queryID?: uint64
        selector: uint32
    }) {
        return Timelock_BlockFunctionSelector.toCell(Timelock_BlockFunctionSelector.create(body));
    }

    static createCellOfTimelockUnblockFunctionSelector(body: {
        queryID?: uint64
        selector: uint32
    }) {
        return Timelock_UnblockFunctionSelector.toCell(Timelock_UnblockFunctionSelector.create(body));
    }

    static createCellOfTimelockBypasserExecuteBatch(body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
    }) {
        return Timelock_BypasserExecuteBatch.toCell(Timelock_BypasserExecuteBatch.create(body));
    }

    static createCellOfTimelockUpdateExecutorRoleCheck(body: {
        queryID?: uint64
        enabled: boolean
    }) {
        return Timelock_UpdateExecutorRoleCheck.toCell(Timelock_UpdateExecutorRoleCheck.create(body));
    }

    static createCellOfTimelockSubmitErrorReport(body: {
        queryID?: uint64
        opBatch: Timelock_OperationBatch
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }) {
        return Timelock_SubmitErrorReport.toCell(Timelock_SubmitErrorReport.create(body));
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

    async sendTimelockInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        minDelay: uint32
        admin: c.Address
        proposers: SnakedCell<c.Address>
        executors: SnakedCell<c.Address>
        cancellers: SnakedCell<c.Address>
        bypassers: SnakedCell<c.Address>
        executorRoleCheckEnabled: boolean
        opFinalizationTimeout: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_Init.toCell(Timelock_Init.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockScheduleBatch(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_ScheduleBatch.toCell(Timelock_ScheduleBatch.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockCancel(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        id: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_Cancel.toCell(Timelock_Cancel.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockExecuteBatch(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_ExecuteBatch.toCell(Timelock_ExecuteBatch.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUpdateDelay(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        newDelay: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateDelay.toCell(Timelock_UpdateDelay.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUpdateOpFinalizationTimeout(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        newOpFinalizationTimeout: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateOpFinalizationTimeout.toCell(Timelock_UpdateOpFinalizationTimeout.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockBlockFunctionSelector(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        selector: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_BlockFunctionSelector.toCell(Timelock_BlockFunctionSelector.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUnblockFunctionSelector(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        selector: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UnblockFunctionSelector.toCell(Timelock_UnblockFunctionSelector.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockBypasserExecuteBatch(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        calls: SnakedCell<Timelock_Call>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_BypasserExecuteBatch.toCell(Timelock_BypasserExecuteBatch.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUpdateExecutorRoleCheck(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        enabled: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateExecutorRoleCheck.toCell(Timelock_UpdateExecutorRoleCheck.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockSubmitErrorReport(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID?: uint64
        opBatch: Timelock_OperationBatch
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_SubmitErrorReport.toCell(Timelock_SubmitErrorReport.create(body)),
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

    async getId(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getId', []));
        return r.readBigInt();
    }

    async getIsOperation(provider: ContractProvider, id: uint256): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isOperation', [
            { type: 'int', value: id },
        ]));
        return r.readBoolean();
    }

    async getIsOperationPending(provider: ContractProvider, id: uint256): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isOperationPending', [
            { type: 'int', value: id },
        ]));
        return r.readBoolean();
    }

    async getIsOperationReady(provider: ContractProvider, id: uint256): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isOperationReady', [
            { type: 'int', value: id },
        ]));
        return r.readBoolean();
    }

    async getIsOperationDone(provider: ContractProvider, id: uint256): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isOperationDone', [
            { type: 'int', value: id },
        ]));
        return r.readBoolean();
    }

    async getIsOperationError(provider: ContractProvider, id: uint256): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isOperationError', [
            { type: 'int', value: id },
        ]));
        return r.readBoolean();
    }

    async getIsPendingOperationFinal(provider: ContractProvider): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isPendingOperationFinal', []));
        return r.readBoolean();
    }

    async getTimestamp(provider: ContractProvider, id: uint256): Promise<uint64> {
        const r = StackReader.fromGetMethod(1, await provider.get('getTimestamp', [
            { type: 'int', value: id },
        ]));
        return r.readBigInt();
    }

    async getMinDelay(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getMinDelay', []));
        return r.readBigInt();
    }

    async getHashOperationBatch(provider: ContractProvider, op: Timelock_OperationBatch): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('hashOperationBatch', [
            { type: 'cell', cell: buildSnakedCellOf<Timelock_Call>(op.calls, Timelock_Call.store) },
            { type: 'int', value: op.predecessor },
            { type: 'int', value: op.salt },
        ]));
        return r.readBigInt();
    }

    async getBlockedFunctionSelectorCount(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBlockedFunctionSelectorCount', []));
        return r.readBigInt();
    }

    async getBlockedFunctionSelectorAt(provider: ContractProvider, index: uint32): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBlockedFunctionSelectorAt', [
            { type: 'int', value: index },
        ]));
        return r.readBigInt();
    }

    async getIsInitialized(provider: ContractProvider): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isInitialized', []));
        return r.readBoolean();
    }

    async getIsExecutorRoleCheckEnabled(provider: ContractProvider): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isExecutorRoleCheckEnabled', []));
        return r.readBoolean();
    }

    async getOpPendingInfo(provider: ContractProvider): Promise<Timelock_OpPendingInfo> {
        const r = StackReader.fromGetMethod(4, await provider.get('getOpPendingInfo', []));
        return ({
            $: 'Timelock_OpPendingInfo',
            validAfter: r.readBigInt(),
            opFinalizationTimeout: r.readBigInt(),
            opPendingId: r.readBigInt(),
            opPendingCalls: dictToMap(r.readDictionary<uint256, boolean>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool())),
        });
    }

    async getHasRole(provider: ContractProvider, role: uint256, account: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasRole', [
            { type: 'int', value: role },
            { type: 'slice', cell: makeCellFrom<c.Address>(account,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getRoleAdmin(provider: ContractProvider, role: uint256): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleAdmin', [
            { type: 'int', value: role },
        ]));
        return r.readBigInt();
    }

    async getRoleMember(provider: ContractProvider, role: uint256, index: uint32): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMember', [
            { type: 'int', value: role },
            { type: 'int', value: index },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMemberFirst(provider: ContractProvider, role: uint256): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberFirst', [
            { type: 'int', value: role },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMemberNext(provider: ContractProvider, role: uint256, pivot: c.Address): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberNext', [
            { type: 'int', value: role },
            { type: 'slice', cell: makeCellFrom<c.Address>(pivot,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMemberCount(provider: ContractProvider, role: uint256): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberCount', [
            { type: 'int', value: role },
        ]));
        return r.readBigInt();
    }

    async getRoleMembers(provider: ContractProvider, role: uint256): Promise<Map<c.Address, boolean>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMembers', [
            { type: 'int', value: role },
        ]));
        return dictToMap(r.readDictionary<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool()));
    }
}
