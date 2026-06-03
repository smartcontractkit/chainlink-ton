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
 >     queryId: uint64
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
    queryId: uint64
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
        queryId: uint64
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
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_Init {
        loadAndCheckPrefix32(s, 0x4982fcfd, 'Timelock_Init');
        return {
            $: 'Timelock_Init',
            queryId: s.loadUintBig(64),
            minDelay: s.loadUintBig(32),
            admin: s.loadAddress(),
            proposers: s.loadRef(),
            executors: s.loadRef(),
            cancellers: s.loadRef(),
            bypassers: s.loadRef(),
            executorRoleCheckEnabled: s.loadBoolean(),
            opFinalizationTimeout: s.loadUintBig(32),
        }
    },
    store(self: Timelock_Init, b: c.Builder): void {
        b.storeUint(0x4982fcfd, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minDelay, 32);
        b.storeAddress(self.admin);
        b.storeRef(self.proposers);
        b.storeRef(self.executors);
        b.storeRef(self.cancellers);
        b.storeRef(self.bypassers);
        b.storeBit(self.executorRoleCheckEnabled);
        b.storeUint(self.opFinalizationTimeout, 32);
    },
    toCell(self: Timelock_Init): c.Cell {
        return makeCellFrom<Timelock_Init>(self, Timelock_Init.store);
    }
}

/**
 > struct (0x094718f4) Timelock_ScheduleBatch {
 >     queryId: uint64
 >     calls: SnakedCell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 >     delay: uint32
 > }
 */
export interface Timelock_ScheduleBatch {
    readonly $: 'Timelock_ScheduleBatch'
    queryId: uint64
    calls: SnakedCell<Timelock_Call>
    predecessor: uint256
    salt: uint256
    delay: uint32
}

export const Timelock_ScheduleBatch = {
    PREFIX: 0x094718f4,

    create(args: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }): Timelock_ScheduleBatch {
        return {
            $: 'Timelock_ScheduleBatch',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_ScheduleBatch {
        loadAndCheckPrefix32(s, 0x094718f4, 'Timelock_ScheduleBatch');
        return {
            $: 'Timelock_ScheduleBatch',
            queryId: s.loadUintBig(64),
            calls: s.loadRef(),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
            delay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_ScheduleBatch, b: c.Builder): void {
        b.storeUint(0x094718f4, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.calls);
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
 >     queryId: uint64
 >     id: uint256
 > }
 */
export interface Timelock_Cancel {
    readonly $: 'Timelock_Cancel'
    queryId: uint64
    id: uint256
}

export const Timelock_Cancel = {
    PREFIX: 0xaf3bf1d0,

    create(args: {
        queryId: uint64
        id: uint256
    }): Timelock_Cancel {
        return {
            $: 'Timelock_Cancel',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_Cancel {
        loadAndCheckPrefix32(s, 0xaf3bf1d0, 'Timelock_Cancel');
        return {
            $: 'Timelock_Cancel',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_Cancel, b: c.Builder): void {
        b.storeUint(0xaf3bf1d0, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_Cancel): c.Cell {
        return makeCellFrom<Timelock_Cancel>(self, Timelock_Cancel.store);
    }
}

/**
 > struct (0x6e9bf263) Timelock_ExecuteBatch {
 >     queryId: uint64
 >     calls: SnakedCell<Timelock_Call>
 >     predecessor: uint256
 >     salt: uint256
 > }
 */
export interface Timelock_ExecuteBatch {
    readonly $: 'Timelock_ExecuteBatch'
    queryId: uint64
    calls: SnakedCell<Timelock_Call>
    predecessor: uint256
    salt: uint256
}

export const Timelock_ExecuteBatch = {
    PREFIX: 0x6e9bf263,

    create(args: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }): Timelock_ExecuteBatch {
        return {
            $: 'Timelock_ExecuteBatch',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_ExecuteBatch {
        loadAndCheckPrefix32(s, 0x6e9bf263, 'Timelock_ExecuteBatch');
        return {
            $: 'Timelock_ExecuteBatch',
            queryId: s.loadUintBig(64),
            calls: s.loadRef(),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
        }
    },
    store(self: Timelock_ExecuteBatch, b: c.Builder): void {
        b.storeUint(0x6e9bf263, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.calls);
        b.storeUint(self.predecessor, 256);
        b.storeUint(self.salt, 256);
    },
    toCell(self: Timelock_ExecuteBatch): c.Cell {
        return makeCellFrom<Timelock_ExecuteBatch>(self, Timelock_ExecuteBatch.store);
    }
}

/**
 > struct (0x7a57a45c) Timelock_UpdateDelay {
 >     queryId: uint64
 >     newDelay: uint32
 > }
 */
export interface Timelock_UpdateDelay {
    readonly $: 'Timelock_UpdateDelay'
    queryId: uint64
    newDelay: uint32
}

export const Timelock_UpdateDelay = {
    PREFIX: 0x7a57a45c,

    create(args: {
        queryId: uint64
        newDelay: uint32
    }): Timelock_UpdateDelay {
        return {
            $: 'Timelock_UpdateDelay',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateDelay {
        loadAndCheckPrefix32(s, 0x7a57a45c, 'Timelock_UpdateDelay');
        return {
            $: 'Timelock_UpdateDelay',
            queryId: s.loadUintBig(64),
            newDelay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UpdateDelay, b: c.Builder): void {
        b.storeUint(0x7a57a45c, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.newDelay, 32);
    },
    toCell(self: Timelock_UpdateDelay): c.Cell {
        return makeCellFrom<Timelock_UpdateDelay>(self, Timelock_UpdateDelay.store);
    }
}

/**
 > struct (0x94278d4f) Timelock_UpdateOpFinalizationTimeout {
 >     queryId: uint64
 >     newOpFinalizationTimeout: uint32
 > }
 */
export interface Timelock_UpdateOpFinalizationTimeout {
    readonly $: 'Timelock_UpdateOpFinalizationTimeout'
    queryId: uint64
    newOpFinalizationTimeout: uint32
}

export const Timelock_UpdateOpFinalizationTimeout = {
    PREFIX: 0x94278d4f,

    create(args: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }): Timelock_UpdateOpFinalizationTimeout {
        return {
            $: 'Timelock_UpdateOpFinalizationTimeout',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateOpFinalizationTimeout {
        loadAndCheckPrefix32(s, 0x94278d4f, 'Timelock_UpdateOpFinalizationTimeout');
        return {
            $: 'Timelock_UpdateOpFinalizationTimeout',
            queryId: s.loadUintBig(64),
            newOpFinalizationTimeout: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UpdateOpFinalizationTimeout, b: c.Builder): void {
        b.storeUint(0x94278d4f, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.newOpFinalizationTimeout, 32);
    },
    toCell(self: Timelock_UpdateOpFinalizationTimeout): c.Cell {
        return makeCellFrom<Timelock_UpdateOpFinalizationTimeout>(self, Timelock_UpdateOpFinalizationTimeout.store);
    }
}

/**
 > struct (0x2637af77) Timelock_BlockFunctionSelector {
 >     queryId: uint64
 >     selector: uint32
 > }
 */
export interface Timelock_BlockFunctionSelector {
    readonly $: 'Timelock_BlockFunctionSelector'
    queryId: uint64
    selector: uint32
}

export const Timelock_BlockFunctionSelector = {
    PREFIX: 0x2637af77,

    create(args: {
        queryId: uint64
        selector: uint32
    }): Timelock_BlockFunctionSelector {
        return {
            $: 'Timelock_BlockFunctionSelector',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BlockFunctionSelector {
        loadAndCheckPrefix32(s, 0x2637af77, 'Timelock_BlockFunctionSelector');
        return {
            $: 'Timelock_BlockFunctionSelector',
            queryId: s.loadUintBig(64),
            selector: s.loadUintBig(32),
        }
    },
    store(self: Timelock_BlockFunctionSelector, b: c.Builder): void {
        b.storeUint(0x2637af77, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.selector, 32);
    },
    toCell(self: Timelock_BlockFunctionSelector): c.Cell {
        return makeCellFrom<Timelock_BlockFunctionSelector>(self, Timelock_BlockFunctionSelector.store);
    }
}

/**
 > struct (0x26f19f4e) Timelock_UnblockFunctionSelector {
 >     queryId: uint64
 >     selector: uint32
 > }
 */
export interface Timelock_UnblockFunctionSelector {
    readonly $: 'Timelock_UnblockFunctionSelector'
    queryId: uint64
    selector: uint32
}

export const Timelock_UnblockFunctionSelector = {
    PREFIX: 0x26f19f4e,

    create(args: {
        queryId: uint64
        selector: uint32
    }): Timelock_UnblockFunctionSelector {
        return {
            $: 'Timelock_UnblockFunctionSelector',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_UnblockFunctionSelector {
        loadAndCheckPrefix32(s, 0x26f19f4e, 'Timelock_UnblockFunctionSelector');
        return {
            $: 'Timelock_UnblockFunctionSelector',
            queryId: s.loadUintBig(64),
            selector: s.loadUintBig(32),
        }
    },
    store(self: Timelock_UnblockFunctionSelector, b: c.Builder): void {
        b.storeUint(0x26f19f4e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.selector, 32);
    },
    toCell(self: Timelock_UnblockFunctionSelector): c.Cell {
        return makeCellFrom<Timelock_UnblockFunctionSelector>(self, Timelock_UnblockFunctionSelector.store);
    }
}

/**
 > struct (0xbb0e9f7d) Timelock_BypasserExecuteBatch {
 >     queryId: uint64
 >     calls: SnakedCell<Timelock_Call>
 > }
 */
export interface Timelock_BypasserExecuteBatch {
    readonly $: 'Timelock_BypasserExecuteBatch'
    queryId: uint64
    calls: SnakedCell<Timelock_Call>
}

export const Timelock_BypasserExecuteBatch = {
    PREFIX: 0xbb0e9f7d,

    create(args: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
    }): Timelock_BypasserExecuteBatch {
        return {
            $: 'Timelock_BypasserExecuteBatch',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserExecuteBatch {
        loadAndCheckPrefix32(s, 0xbb0e9f7d, 'Timelock_BypasserExecuteBatch');
        return {
            $: 'Timelock_BypasserExecuteBatch',
            queryId: s.loadUintBig(64),
            calls: s.loadRef(),
        }
    },
    store(self: Timelock_BypasserExecuteBatch, b: c.Builder): void {
        b.storeUint(0xbb0e9f7d, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.calls);
    },
    toCell(self: Timelock_BypasserExecuteBatch): c.Cell {
        return makeCellFrom<Timelock_BypasserExecuteBatch>(self, Timelock_BypasserExecuteBatch.store);
    }
}

/**
 > struct (0x34d98baa) Timelock_UpdateExecutorRoleCheck {
 >     queryId: uint64
 >     enabled: bool
 > }
 */
export interface Timelock_UpdateExecutorRoleCheck {
    readonly $: 'Timelock_UpdateExecutorRoleCheck'
    queryId: uint64
    enabled: boolean
}

export const Timelock_UpdateExecutorRoleCheck = {
    PREFIX: 0x34d98baa,

    create(args: {
        queryId: uint64
        enabled: boolean
    }): Timelock_UpdateExecutorRoleCheck {
        return {
            $: 'Timelock_UpdateExecutorRoleCheck',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_UpdateExecutorRoleCheck {
        loadAndCheckPrefix32(s, 0x34d98baa, 'Timelock_UpdateExecutorRoleCheck');
        return {
            $: 'Timelock_UpdateExecutorRoleCheck',
            queryId: s.loadUintBig(64),
            enabled: s.loadBoolean(),
        }
    },
    store(self: Timelock_UpdateExecutorRoleCheck, b: c.Builder): void {
        b.storeUint(0x34d98baa, 32);
        b.storeUint(self.queryId, 64);
        b.storeBit(self.enabled);
    },
    toCell(self: Timelock_UpdateExecutorRoleCheck): c.Cell {
        return makeCellFrom<Timelock_UpdateExecutorRoleCheck>(self, Timelock_UpdateExecutorRoleCheck.store);
    }
}

/**
 > struct (0xf4538b79) Timelock_SubmitErrorReport {
 >     queryId: uint64
 >     opBatch: Cell<Timelock_OperationBatch>
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 > }
 */
export interface Timelock_SubmitErrorReport {
    readonly $: 'Timelock_SubmitErrorReport'
    queryId: uint64
    opBatch: CellRef<Timelock_OperationBatch>
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
}

export const Timelock_SubmitErrorReport = {
    PREFIX: 0xf4538b79,

    create(args: {
        queryId: uint64
        opBatch: CellRef<Timelock_OperationBatch>
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }): Timelock_SubmitErrorReport {
        return {
            $: 'Timelock_SubmitErrorReport',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_SubmitErrorReport {
        loadAndCheckPrefix32(s, 0xf4538b79, 'Timelock_SubmitErrorReport');
        return {
            $: 'Timelock_SubmitErrorReport',
            queryId: s.loadUintBig(64),
            opBatch: loadCellRef<Timelock_OperationBatch>(s, Timelock_OperationBatch.fromSlice),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
        }
    },
    store(self: Timelock_SubmitErrorReport, b: c.Builder): void {
        b.storeUint(0xf4538b79, 32);
        b.storeUint(self.queryId, 64);
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
 >     queryId: uint64
 >     id: uint256
 >     delay: uint32
 > }
 */
export interface Timelock_BatchScheduled {
    readonly $: 'Timelock_BatchScheduled'
    queryId: uint64
    id: uint256
    delay: uint32
}

export const Timelock_BatchScheduled = {
    PREFIX: 0xdf65b59e,

    create(args: {
        queryId: uint64
        id: uint256
        delay: uint32
    }): Timelock_BatchScheduled {
        return {
            $: 'Timelock_BatchScheduled',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BatchScheduled {
        loadAndCheckPrefix32(s, 0xdf65b59e, 'Timelock_BatchScheduled');
        return {
            $: 'Timelock_BatchScheduled',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
            delay: s.loadUintBig(32),
        }
    },
    store(self: Timelock_BatchScheduled, b: c.Builder): void {
        b.storeUint(0xdf65b59e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.id, 256);
        b.storeUint(self.delay, 32);
    },
    toCell(self: Timelock_BatchScheduled): c.Cell {
        return makeCellFrom<Timelock_BatchScheduled>(self, Timelock_BatchScheduled.store);
    }
}

/**
 > struct (0xc55fca54) Timelock_CallScheduled {
 >     queryId: uint64
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
    queryId: uint64
    id: uint256
    index: uint64
    call: CellRef<Timelock_Call>
    predecessor: uint256
    salt: uint256
    delay: uint32
}

export const Timelock_CallScheduled = {
    PREFIX: 0xc55fca54,

    create(args: {
        queryId: uint64
        id: uint256
        index: uint64
        call: CellRef<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }): Timelock_CallScheduled {
        return {
            $: 'Timelock_CallScheduled',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_CallScheduled {
        loadAndCheckPrefix32(s, 0xc55fca54, 'Timelock_CallScheduled');
        return {
            $: 'Timelock_CallScheduled',
            queryId: s.loadUintBig(64),
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
        b.storeUint(self.queryId, 64);
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
 >     queryId: uint64
 >     id: uint256
 > }
 */
export interface Timelock_BatchExecuted {
    readonly $: 'Timelock_BatchExecuted'
    queryId: uint64
    id: uint256
}

export const Timelock_BatchExecuted = {
    PREFIX: 0xa941ea1a,

    create(args: {
        queryId: uint64
        id: uint256
    }): Timelock_BatchExecuted {
        return {
            $: 'Timelock_BatchExecuted',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BatchExecuted {
        loadAndCheckPrefix32(s, 0xa941ea1a, 'Timelock_BatchExecuted');
        return {
            $: 'Timelock_BatchExecuted',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_BatchExecuted, b: c.Builder): void {
        b.storeUint(0xa941ea1a, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_BatchExecuted): c.Cell {
        return makeCellFrom<Timelock_BatchExecuted>(self, Timelock_BatchExecuted.store);
    }
}

/**
 > struct (0x49ea5d0e) Timelock_CallExecuted {
 >     queryId: uint64
 >     id: uint256
 >     index: uint64
 >     target: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Timelock_CallExecuted {
    readonly $: 'Timelock_CallExecuted'
    queryId: uint64
    id: uint256
    index: uint64
    target: c.Address
    value: coins
    data: c.Cell
}

export const Timelock_CallExecuted = {
    PREFIX: 0x49ea5d0e,

    create(args: {
        queryId: uint64
        id: uint256
        index: uint64
        target: c.Address
        value: coins
        data: c.Cell
    }): Timelock_CallExecuted {
        return {
            $: 'Timelock_CallExecuted',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_CallExecuted {
        loadAndCheckPrefix32(s, 0x49ea5d0e, 'Timelock_CallExecuted');
        return {
            $: 'Timelock_CallExecuted',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
            index: s.loadUintBig(64),
            target: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Timelock_CallExecuted, b: c.Builder): void {
        b.storeUint(0x49ea5d0e, 32);
        b.storeUint(self.queryId, 64);
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
 >     queryId: uint64
 > }
 */
export interface Timelock_BypasserBatchExecuted {
    readonly $: 'Timelock_BypasserBatchExecuted'
    queryId: uint64
}

export const Timelock_BypasserBatchExecuted = {
    PREFIX: 0x539b4214,

    create(args: {
        queryId: uint64
    }): Timelock_BypasserBatchExecuted {
        return {
            $: 'Timelock_BypasserBatchExecuted',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserBatchExecuted {
        loadAndCheckPrefix32(s, 0x539b4214, 'Timelock_BypasserBatchExecuted');
        return {
            $: 'Timelock_BypasserBatchExecuted',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: Timelock_BypasserBatchExecuted, b: c.Builder): void {
        b.storeUint(0x539b4214, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: Timelock_BypasserBatchExecuted): c.Cell {
        return makeCellFrom<Timelock_BypasserBatchExecuted>(self, Timelock_BypasserBatchExecuted.store);
    }
}

/**
 > struct (0x9c7f3010) Timelock_BypasserCallExecuted {
 >     queryId: uint64
 >     index: uint64
 >     target: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Timelock_BypasserCallExecuted {
    readonly $: 'Timelock_BypasserCallExecuted'
    queryId: uint64
    index: uint64
    target: c.Address
    value: coins
    data: c.Cell
}

export const Timelock_BypasserCallExecuted = {
    PREFIX: 0x9c7f3010,

    create(args: {
        queryId: uint64
        index: uint64
        target: c.Address
        value: coins
        data: c.Cell
    }): Timelock_BypasserCallExecuted {
        return {
            $: 'Timelock_BypasserCallExecuted',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_BypasserCallExecuted {
        loadAndCheckPrefix32(s, 0x9c7f3010, 'Timelock_BypasserCallExecuted');
        return {
            $: 'Timelock_BypasserCallExecuted',
            queryId: s.loadUintBig(64),
            index: s.loadUintBig(64),
            target: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Timelock_BypasserCallExecuted, b: c.Builder): void {
        b.storeUint(0x9c7f3010, 32);
        b.storeUint(self.queryId, 64);
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
 >     queryId: uint64
 >     id: uint256
 > }
 */
export interface Timelock_Canceled {
    readonly $: 'Timelock_Canceled'
    queryId: uint64
    id: uint256
}

export const Timelock_Canceled = {
    PREFIX: 0x580e80f2,

    create(args: {
        queryId: uint64
        id: uint256
    }): Timelock_Canceled {
        return {
            $: 'Timelock_Canceled',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_Canceled {
        loadAndCheckPrefix32(s, 0x580e80f2, 'Timelock_Canceled');
        return {
            $: 'Timelock_Canceled',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
        }
    },
    store(self: Timelock_Canceled, b: c.Builder): void {
        b.storeUint(0x580e80f2, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.id, 256);
    },
    toCell(self: Timelock_Canceled): c.Cell {
        return makeCellFrom<Timelock_Canceled>(self, Timelock_Canceled.store);
    }
}

/**
 > struct (0x904b14e0) Timelock_MinDelayChange {
 >     queryId: uint64
 >     oldDuration: uint32
 >     newDuration: uint32
 > }
 */
export interface Timelock_MinDelayChange {
    readonly $: 'Timelock_MinDelayChange'
    queryId: uint64
    oldDuration: uint32
    newDuration: uint32
}

export const Timelock_MinDelayChange = {
    PREFIX: 0x904b14e0,

    create(args: {
        queryId: uint64
        oldDuration: uint32
        newDuration: uint32
    }): Timelock_MinDelayChange {
        return {
            $: 'Timelock_MinDelayChange',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_MinDelayChange {
        loadAndCheckPrefix32(s, 0x904b14e0, 'Timelock_MinDelayChange');
        return {
            $: 'Timelock_MinDelayChange',
            queryId: s.loadUintBig(64),
            oldDuration: s.loadUintBig(32),
            newDuration: s.loadUintBig(32),
        }
    },
    store(self: Timelock_MinDelayChange, b: c.Builder): void {
        b.storeUint(0x904b14e0, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.oldDuration, 32);
        b.storeUint(self.newDuration, 32);
    },
    toCell(self: Timelock_MinDelayChange): c.Cell {
        return makeCellFrom<Timelock_MinDelayChange>(self, Timelock_MinDelayChange.store);
    }
}

/**
 > struct (0x1f102718) Timelock_OpFinalizationTimeoutChange {
 >     queryId: uint64
 >     oldDuration: uint32
 >     newDuration: uint32
 > }
 */
export interface Timelock_OpFinalizationTimeoutChange {
    readonly $: 'Timelock_OpFinalizationTimeoutChange'
    queryId: uint64
    oldDuration: uint32
    newDuration: uint32
}

export const Timelock_OpFinalizationTimeoutChange = {
    PREFIX: 0x1f102718,

    create(args: {
        queryId: uint64
        oldDuration: uint32
        newDuration: uint32
    }): Timelock_OpFinalizationTimeoutChange {
        return {
            $: 'Timelock_OpFinalizationTimeoutChange',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_OpFinalizationTimeoutChange {
        loadAndCheckPrefix32(s, 0x1f102718, 'Timelock_OpFinalizationTimeoutChange');
        return {
            $: 'Timelock_OpFinalizationTimeoutChange',
            queryId: s.loadUintBig(64),
            oldDuration: s.loadUintBig(32),
            newDuration: s.loadUintBig(32),
        }
    },
    store(self: Timelock_OpFinalizationTimeoutChange, b: c.Builder): void {
        b.storeUint(0x1f102718, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.oldDuration, 32);
        b.storeUint(self.newDuration, 32);
    },
    toCell(self: Timelock_OpFinalizationTimeoutChange): c.Cell {
        return makeCellFrom<Timelock_OpFinalizationTimeoutChange>(self, Timelock_OpFinalizationTimeoutChange.store);
    }
}

/**
 > struct (0xc6d451e2) Timelock_ExecutorRoleCheckUpdated {
 >     queryId: uint64
 >     enabled: bool
 > }
 */
export interface Timelock_ExecutorRoleCheckUpdated {
    readonly $: 'Timelock_ExecutorRoleCheckUpdated'
    queryId: uint64
    enabled: boolean
}

export const Timelock_ExecutorRoleCheckUpdated = {
    PREFIX: 0xc6d451e2,

    create(args: {
        queryId: uint64
        enabled: boolean
    }): Timelock_ExecutorRoleCheckUpdated {
        return {
            $: 'Timelock_ExecutorRoleCheckUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_ExecutorRoleCheckUpdated {
        loadAndCheckPrefix32(s, 0xc6d451e2, 'Timelock_ExecutorRoleCheckUpdated');
        return {
            $: 'Timelock_ExecutorRoleCheckUpdated',
            queryId: s.loadUintBig(64),
            enabled: s.loadBoolean(),
        }
    },
    store(self: Timelock_ExecutorRoleCheckUpdated, b: c.Builder): void {
        b.storeUint(0xc6d451e2, 32);
        b.storeUint(self.queryId, 64);
        b.storeBit(self.enabled);
    },
    toCell(self: Timelock_ExecutorRoleCheckUpdated): c.Cell {
        return makeCellFrom<Timelock_ExecutorRoleCheckUpdated>(self, Timelock_ExecutorRoleCheckUpdated.store);
    }
}

/**
 > struct (0xdbd4c8ee) Timelock_ErrorReportSubmitted {
 >     queryId: uint64
 >     id: uint256
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 >     matchesPendingOp: bool
 > }
 */
export interface Timelock_ErrorReportSubmitted {
    readonly $: 'Timelock_ErrorReportSubmitted'
    queryId: uint64
    id: uint256
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
    matchesPendingOp: boolean
}

export const Timelock_ErrorReportSubmitted = {
    PREFIX: 0xdbd4c8ee,

    create(args: {
        queryId: uint64
        id: uint256
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
        matchesPendingOp: boolean
    }): Timelock_ErrorReportSubmitted {
        return {
            $: 'Timelock_ErrorReportSubmitted',
            ...args
        }
    },
    fromSlice(s: c.Slice): Timelock_ErrorReportSubmitted {
        loadAndCheckPrefix32(s, 0xdbd4c8ee, 'Timelock_ErrorReportSubmitted');
        return {
            $: 'Timelock_ErrorReportSubmitted',
            queryId: s.loadUintBig(64),
            id: s.loadUintBig(256),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
            matchesPendingOp: s.loadBoolean(),
        }
    },
    store(self: Timelock_ErrorReportSubmitted, b: c.Builder): void {
        b.storeUint(0xdbd4c8ee, 32);
        b.storeUint(self.queryId, 64);
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
    timestamps: c.Dictionary<uint256, uint64>
    blockedFnSelectorsLen: uint32
    blockedFnSelectors: c.Dictionary<uint32, boolean>
    executorRoleCheckEnabled: boolean
    opPendingInfo: Timelock_OpPendingInfo
    rbac: CellRef<AccessControl_Data>
}

export const Timelock_Data = {
    create(args: {
        id: uint32
        minDelay: uint32
        timestamps: c.Dictionary<uint256, uint64>
        blockedFnSelectorsLen: uint32
        blockedFnSelectors: c.Dictionary<uint32, boolean>
        executorRoleCheckEnabled: boolean
        opPendingInfo: Timelock_OpPendingInfo
        rbac: CellRef<AccessControl_Data>
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
            timestamps: c.Dictionary.load<uint256, uint64>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(64), s),
            blockedFnSelectorsLen: s.loadUintBig(32),
            blockedFnSelectors: c.Dictionary.load<uint32, boolean>(c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool(), s),
            executorRoleCheckEnabled: s.loadBoolean(),
            opPendingInfo: Timelock_OpPendingInfo.fromSlice(s),
            rbac: loadCellRef<AccessControl_Data>(s, AccessControl_Data.fromSlice),
        }
    },
    store(self: Timelock_Data, b: c.Builder): void {
        b.storeUint(self.id, 32);
        b.storeUint(self.minDelay, 32);
        b.storeDict<uint256, uint64>(self.timestamps, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(64));
        b.storeUint(self.blockedFnSelectorsLen, 32);
        b.storeDict<uint32, boolean>(self.blockedFnSelectors, c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool());
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
            calls: s.loadRef(),
            predecessor: s.loadUintBig(256),
            salt: s.loadUintBig(256),
        }
    },
    store(self: Timelock_OperationBatch, b: c.Builder): void {
        b.storeRef(self.calls);
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
    opPendingCalls: c.Dictionary<uint256, boolean>
}

export const Timelock_OpPendingInfo = {
    create(args: {
        validAfter: uint64
        opFinalizationTimeout: uint32
        opPendingId: uint256
        opPendingCalls: c.Dictionary<uint256, boolean>
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
            opPendingCalls: c.Dictionary.load<uint256, boolean>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: Timelock_OpPendingInfo, b: c.Builder): void {
        b.storeUint(self.validAfter, 64);
        b.storeUint(self.opFinalizationTimeout, 32);
        b.storeUint(self.opPendingId, 256);
        b.storeDict<uint256, boolean>(self.opPendingCalls, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool());
    },
    toCell(self: Timelock_OpPendingInfo): c.Cell {
        return makeCellFrom<Timelock_OpPendingInfo>(self, Timelock_OpPendingInfo.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

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
        queryId: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleGranted {
        return {
            $: 'AccessControl_RoleGranted',
            ...args
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
        queryId: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleRevoked {
        return {
            $: 'AccessControl_RoleRevoked',
            ...args
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
 > struct (0xbd7e8bce) AccessControl_RoleAdminChanged {
 >     queryId: uint64
 >     role: uint256
 >     previousAdminRole: uint256
 >     newAdminRole: uint256
 > }
 */
export interface AccessControl_RoleAdminChanged {
    readonly $: 'AccessControl_RoleAdminChanged'
    queryId: uint64
    role: uint256
    previousAdminRole: uint256
    newAdminRole: uint256
}

export const AccessControl_RoleAdminChanged = {
    PREFIX: 0xbd7e8bce,

    create(args: {
        queryId: uint64
        role: uint256
        previousAdminRole: uint256
        newAdminRole: uint256
    }): AccessControl_RoleAdminChanged {
        return {
            $: 'AccessControl_RoleAdminChanged',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleAdminChanged {
        loadAndCheckPrefix32(s, 0xbd7e8bce, 'AccessControl_RoleAdminChanged');
        return {
            $: 'AccessControl_RoleAdminChanged',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            previousAdminRole: s.loadUintBig(256),
            newAdminRole: s.loadUintBig(256),
        }
    },
    store(self: AccessControl_RoleAdminChanged, b: c.Builder): void {
        b.storeUint(0xbd7e8bce, 32);
        b.storeUint(self.queryId, 64);
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
    roles: c.Dictionary<uint256, CellRef<AccessControl_RoleData>>
}

export const AccessControl_Data = {
    create(args: {
        roles: c.Dictionary<uint256, CellRef<AccessControl_RoleData>>
    }): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            roles: c.Dictionary.load<uint256, CellRef<AccessControl_RoleData>>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<AccessControl_RoleData>>(
                (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
            ), s),
        }
    },
    store(self: AccessControl_Data, b: c.Builder): void {
        b.storeDict<uint256, CellRef<AccessControl_RoleData>>(self.roles, c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<AccessControl_RoleData>>(
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
    hasRole: c.Dictionary<c.Address, boolean>
}

export const AccessControl_RoleData = {
    create(args: {
        adminRole: uint256
        membersLen: uint64
        hasRole: c.Dictionary<c.Address, boolean>
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
            hasRole: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: AccessControl_RoleData, b: c.Builder): void {
        b.storeUint(self.adminRole, 256);
        b.storeUint(self.membersLen, 64);
        b.storeDict<c.Address, boolean>(self.hasRole, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
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
    static CodeCell = c.Cell.fromBase64('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');

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
        timestamps: c.Dictionary<uint256, uint64>
        blockedFnSelectorsLen: uint32
        blockedFnSelectors: c.Dictionary<uint32, boolean>
        executorRoleCheckEnabled: boolean
        opPendingInfo: Timelock_OpPendingInfo
        rbac: CellRef<AccessControl_Data>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? Timelock.CodeCell,
            data: Timelock_Data.toCell(Timelock_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new Timelock(address, initialState);
    }

    static createCellOfTimelockInit(body: {
        queryId: uint64
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
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
        delay: uint32
    }) {
        return Timelock_ScheduleBatch.toCell(Timelock_ScheduleBatch.create(body));
    }

    static createCellOfTimelockCancel(body: {
        queryId: uint64
        id: uint256
    }) {
        return Timelock_Cancel.toCell(Timelock_Cancel.create(body));
    }

    static createCellOfTimelockExecuteBatch(body: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
        predecessor: uint256
        salt: uint256
    }) {
        return Timelock_ExecuteBatch.toCell(Timelock_ExecuteBatch.create(body));
    }

    static createCellOfTimelockUpdateDelay(body: {
        queryId: uint64
        newDelay: uint32
    }) {
        return Timelock_UpdateDelay.toCell(Timelock_UpdateDelay.create(body));
    }

    static createCellOfTimelockUpdateOpFinalizationTimeout(body: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }) {
        return Timelock_UpdateOpFinalizationTimeout.toCell(Timelock_UpdateOpFinalizationTimeout.create(body));
    }

    static createCellOfTimelockBlockFunctionSelector(body: {
        queryId: uint64
        selector: uint32
    }) {
        return Timelock_BlockFunctionSelector.toCell(Timelock_BlockFunctionSelector.create(body));
    }

    static createCellOfTimelockUnblockFunctionSelector(body: {
        queryId: uint64
        selector: uint32
    }) {
        return Timelock_UnblockFunctionSelector.toCell(Timelock_UnblockFunctionSelector.create(body));
    }

    static createCellOfTimelockBypasserExecuteBatch(body: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
    }) {
        return Timelock_BypasserExecuteBatch.toCell(Timelock_BypasserExecuteBatch.create(body));
    }

    static createCellOfTimelockUpdateExecutorRoleCheck(body: {
        queryId: uint64
        enabled: boolean
    }) {
        return Timelock_UpdateExecutorRoleCheck.toCell(Timelock_UpdateExecutorRoleCheck.create(body));
    }

    static createCellOfTimelockSubmitErrorReport(body: {
        queryId: uint64
        opBatch: CellRef<Timelock_OperationBatch>
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

    async sendTimelockInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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
        queryId: uint64
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
        queryId: uint64
        id: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_Cancel.toCell(Timelock_Cancel.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockExecuteBatch(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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
        queryId: uint64
        newDelay: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateDelay.toCell(Timelock_UpdateDelay.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUpdateOpFinalizationTimeout(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateOpFinalizationTimeout.toCell(Timelock_UpdateOpFinalizationTimeout.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockBlockFunctionSelector(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        selector: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_BlockFunctionSelector.toCell(Timelock_BlockFunctionSelector.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUnblockFunctionSelector(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        selector: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UnblockFunctionSelector.toCell(Timelock_UnblockFunctionSelector.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockBypasserExecuteBatch(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        calls: SnakedCell<Timelock_Call>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_BypasserExecuteBatch.toCell(Timelock_BypasserExecuteBatch.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockUpdateExecutorRoleCheck(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        enabled: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Timelock_UpdateExecutorRoleCheck.toCell(Timelock_UpdateExecutorRoleCheck.create(body)),
            ...extraOptions
        });
    }

    async sendTimelockSubmitErrorReport(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        opBatch: CellRef<Timelock_OperationBatch>
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
            { type: 'cell', cell: op.calls },
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
            opPendingCalls: r.readDictionary<uint256, boolean>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool()),
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

    async getRoleMembers(provider: ContractProvider, role: uint256): Promise<c.Dictionary<c.Address, boolean>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMembers', [
            { type: 'int', value: role },
        ]));
        return r.readDictionary<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    }
}
