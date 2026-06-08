// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a MCMS contract in Tolk.
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

type int256 = bigint

type uint8 = bigint
type uint32 = bigint
type uint40 = bigint
type uint64 = bigint
type uint160 = bigint
type uint256 = bigint

/**
 > struct (0xe7fabde3) MCMS_SetRoot {
 >     queryId: uint64
 >     root: uint256
 >     validUntil: uint64
 >     metadata: RootMetadata
 >     metadataProof: SnakedCell<uint256>
 >     signatures: SnakedCell<Signature>
 > }
 */
export interface MCMS_SetRoot {
    readonly $: 'MCMS_SetRoot'
    queryId: uint64
    root: uint256
    validUntil: uint64
    metadata: RootMetadata
    metadataProof: SnakedCell<uint256>
    signatures: SnakedCell<Signature>
}

export const MCMS_SetRoot = {
    PREFIX: 0xe7fabde3,

    create(args: {
        queryId: uint64
        root: uint256
        validUntil: uint64
        metadata: RootMetadata
        metadataProof: SnakedCell<uint256>
        signatures: SnakedCell<Signature>
    }): MCMS_SetRoot {
        return {
            $: 'MCMS_SetRoot',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_SetRoot {
        loadAndCheckPrefix32(s, 0xe7fabde3, 'MCMS_SetRoot');
        return {
            $: 'MCMS_SetRoot',
            queryId: s.loadUintBig(64),
            root: s.loadUintBig(256),
            validUntil: s.loadUintBig(64),
            metadata: RootMetadata.fromSlice(s),
            metadataProof: s.loadRef(),
            signatures: s.loadRef(),
        }
    },
    store(self: MCMS_SetRoot, b: c.Builder): void {
        b.storeUint(0xe7fabde3, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.root, 256);
        b.storeUint(self.validUntil, 64);
        RootMetadata.store(self.metadata, b);
        b.storeRef(self.metadataProof);
        b.storeRef(self.signatures);
    },
    toCell(self: MCMS_SetRoot): c.Cell {
        return makeCellFrom<MCMS_SetRoot>(self, MCMS_SetRoot.store);
    }
}

/**
 > struct (0x9b9ce96a) MCMS_Execute {
 >     queryId: uint64
 >     op: Cell<Op>
 >     proof: SnakedCell<uint256>
 > }
 */
export interface MCMS_Execute {
    readonly $: 'MCMS_Execute'
    queryId: uint64
    op: CellRef<Op>
    proof: SnakedCell<uint256>
}

export const MCMS_Execute = {
    PREFIX: 0x9b9ce96a,

    create(args: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
    }): MCMS_Execute {
        return {
            $: 'MCMS_Execute',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_Execute {
        loadAndCheckPrefix32(s, 0x9b9ce96a, 'MCMS_Execute');
        return {
            $: 'MCMS_Execute',
            queryId: s.loadUintBig(64),
            op: loadCellRef<Op>(s, Op.fromSlice),
            proof: s.loadRef(),
        }
    },
    store(self: MCMS_Execute, b: c.Builder): void {
        b.storeUint(0x9b9ce96a, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<Op>(self.op, b, Op.store);
        b.storeRef(self.proof);
    },
    toCell(self: MCMS_Execute): c.Cell {
        return makeCellFrom<MCMS_Execute>(self, MCMS_Execute.store);
    }
}

/**
 > struct (0x89277f4b) MCMS_SetConfig {
 >     queryId: uint64
 >     signerAddresses: SnakedCell<uint160>
 >     signerGroups: SnakedCell<uint8>
 >     groupQuorums: map<uint8, uint8>
 >     groupParents: map<uint8, uint8>
 >     clearRoot: bool
 > }
 */
export interface MCMS_SetConfig {
    readonly $: 'MCMS_SetConfig'
    queryId: uint64
    signerAddresses: SnakedCell<uint160>
    signerGroups: SnakedCell<uint8>
    groupQuorums: c.Dictionary<uint8, uint8>
    groupParents: c.Dictionary<uint8, uint8>
    clearRoot: boolean
}

export const MCMS_SetConfig = {
    PREFIX: 0x89277f4b,

    create(args: {
        queryId: uint64
        signerAddresses: SnakedCell<uint160>
        signerGroups: SnakedCell<uint8>
        groupQuorums: c.Dictionary<uint8, uint8>
        groupParents: c.Dictionary<uint8, uint8>
        clearRoot: boolean
    }): MCMS_SetConfig {
        return {
            $: 'MCMS_SetConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_SetConfig {
        loadAndCheckPrefix32(s, 0x89277f4b, 'MCMS_SetConfig');
        return {
            $: 'MCMS_SetConfig',
            queryId: s.loadUintBig(64),
            signerAddresses: s.loadRef(),
            signerGroups: s.loadRef(),
            groupQuorums: c.Dictionary.load<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8), s),
            groupParents: c.Dictionary.load<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8), s),
            clearRoot: s.loadBoolean(),
        }
    },
    store(self: MCMS_SetConfig, b: c.Builder): void {
        b.storeUint(0x89277f4b, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.signerAddresses);
        b.storeRef(self.signerGroups);
        b.storeDict<uint8, uint8>(self.groupQuorums, c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8));
        b.storeDict<uint8, uint8>(self.groupParents, c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8));
        b.storeBit(self.clearRoot);
    },
    toCell(self: MCMS_SetConfig): c.Cell {
        return makeCellFrom<MCMS_SetConfig>(self, MCMS_SetConfig.store);
    }
}

/**
 > struct (0x9dcbbab1) MCMS_UpdateOpFinalizationTimeout {
 >     queryId: uint64
 >     newOpFinalizationTimeout: uint32
 > }
 */
export interface MCMS_UpdateOpFinalizationTimeout {
    readonly $: 'MCMS_UpdateOpFinalizationTimeout'
    queryId: uint64
    newOpFinalizationTimeout: uint32
}

export const MCMS_UpdateOpFinalizationTimeout = {
    PREFIX: 0x9dcbbab1,

    create(args: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }): MCMS_UpdateOpFinalizationTimeout {
        return {
            $: 'MCMS_UpdateOpFinalizationTimeout',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_UpdateOpFinalizationTimeout {
        loadAndCheckPrefix32(s, 0x9dcbbab1, 'MCMS_UpdateOpFinalizationTimeout');
        return {
            $: 'MCMS_UpdateOpFinalizationTimeout',
            queryId: s.loadUintBig(64),
            newOpFinalizationTimeout: s.loadUintBig(32),
        }
    },
    store(self: MCMS_UpdateOpFinalizationTimeout, b: c.Builder): void {
        b.storeUint(0x9dcbbab1, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.newOpFinalizationTimeout, 32);
    },
    toCell(self: MCMS_UpdateOpFinalizationTimeout): c.Cell {
        return makeCellFrom<MCMS_UpdateOpFinalizationTimeout>(self, MCMS_UpdateOpFinalizationTimeout.store);
    }
}

/**
 > struct (0x4b3af0b5) MCMS_SubmitErrorReport {
 >     queryId: uint64
 >     op: Cell<Op>
 >     proof: SnakedCell<uint256>
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 > }
 */
export interface MCMS_SubmitErrorReport {
    readonly $: 'MCMS_SubmitErrorReport'
    queryId: uint64
    op: CellRef<Op>
    proof: SnakedCell<uint256>
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
}

export const MCMS_SubmitErrorReport = {
    PREFIX: 0x4b3af0b5,

    create(args: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }): MCMS_SubmitErrorReport {
        return {
            $: 'MCMS_SubmitErrorReport',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_SubmitErrorReport {
        loadAndCheckPrefix32(s, 0x4b3af0b5, 'MCMS_SubmitErrorReport');
        return {
            $: 'MCMS_SubmitErrorReport',
            queryId: s.loadUintBig(64),
            op: loadCellRef<Op>(s, Op.fromSlice),
            proof: s.loadRef(),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
        }
    },
    store(self: MCMS_SubmitErrorReport, b: c.Builder): void {
        b.storeUint(0x4b3af0b5, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<Op>(self.op, b, Op.store);
        b.storeRef(self.proof);
        b.storeUint(self.opTxHash, 256);
        b.storeUint(self.errorTxHash, 256);
        b.storeUint(self.errorCode, 32);
    },
    toCell(self: MCMS_SubmitErrorReport): c.Cell {
        return makeCellFrom<MCMS_SubmitErrorReport>(self, MCMS_SubmitErrorReport.store);
    }
}

/**
 > struct (0xf275742f) MCMS_TransferOracleRole {
 >     queryId: uint64
 >     newOracle: address
 > }
 */
export interface MCMS_TransferOracleRole {
    readonly $: 'MCMS_TransferOracleRole'
    queryId: uint64
    newOracle: c.Address
}

export const MCMS_TransferOracleRole = {
    PREFIX: 0xf275742f,

    create(args: {
        queryId: uint64
        newOracle: c.Address
    }): MCMS_TransferOracleRole {
        return {
            $: 'MCMS_TransferOracleRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_TransferOracleRole {
        loadAndCheckPrefix32(s, 0xf275742f, 'MCMS_TransferOracleRole');
        return {
            $: 'MCMS_TransferOracleRole',
            queryId: s.loadUintBig(64),
            newOracle: s.loadAddress(),
        }
    },
    store(self: MCMS_TransferOracleRole, b: c.Builder): void {
        b.storeUint(0xf275742f, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOracle);
    },
    toCell(self: MCMS_TransferOracleRole): c.Cell {
        return makeCellFrom<MCMS_TransferOracleRole>(self, MCMS_TransferOracleRole.store);
    }
}

/**
 > struct (0xa903c276) MCMS_CleanExpiredRoots {
 >     queryId: uint64
 >     roots: SnakedCell<RootDescriptor>
 > }
 */
export interface MCMS_CleanExpiredRoots {
    readonly $: 'MCMS_CleanExpiredRoots'
    queryId: uint64
    roots: SnakedCell<RootDescriptor>
}

export const MCMS_CleanExpiredRoots = {
    PREFIX: 0xa903c276,

    create(args: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }): MCMS_CleanExpiredRoots {
        return {
            $: 'MCMS_CleanExpiredRoots',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_CleanExpiredRoots {
        loadAndCheckPrefix32(s, 0xa903c276, 'MCMS_CleanExpiredRoots');
        return {
            $: 'MCMS_CleanExpiredRoots',
            queryId: s.loadUintBig(64),
            roots: s.loadRef(),
        }
    },
    store(self: MCMS_CleanExpiredRoots, b: c.Builder): void {
        b.storeUint(0xa903c276, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.roots);
    },
    toCell(self: MCMS_CleanExpiredRoots): c.Cell {
        return makeCellFrom<MCMS_CleanExpiredRoots>(self, MCMS_CleanExpiredRoots.store);
    }
}

/**
 > struct (0xa6533a3d) MCMS_NewRoot {
 >     queryId: uint64
 >     root: uint256
 >     validUntil: uint64
 >     metadata: RootMetadata
 > }
 */
export interface MCMS_NewRoot {
    readonly $: 'MCMS_NewRoot'
    queryId: uint64
    root: uint256
    validUntil: uint64
    metadata: RootMetadata
}

export const MCMS_NewRoot = {
    PREFIX: 0xa6533a3d,

    create(args: {
        queryId: uint64
        root: uint256
        validUntil: uint64
        metadata: RootMetadata
    }): MCMS_NewRoot {
        return {
            $: 'MCMS_NewRoot',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_NewRoot {
        loadAndCheckPrefix32(s, 0xa6533a3d, 'MCMS_NewRoot');
        return {
            $: 'MCMS_NewRoot',
            queryId: s.loadUintBig(64),
            root: s.loadUintBig(256),
            validUntil: s.loadUintBig(64),
            metadata: RootMetadata.fromSlice(s),
        }
    },
    store(self: MCMS_NewRoot, b: c.Builder): void {
        b.storeUint(0xa6533a3d, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.root, 256);
        b.storeUint(self.validUntil, 64);
        RootMetadata.store(self.metadata, b);
    },
    toCell(self: MCMS_NewRoot): c.Cell {
        return makeCellFrom<MCMS_NewRoot>(self, MCMS_NewRoot.store);
    }
}

/**
 > struct (0xd80be574) MCMS_ConfigSet {
 >     queryId: uint64
 >     config: Config
 >     isRootCleared: bool
 > }
 */
export interface MCMS_ConfigSet {
    readonly $: 'MCMS_ConfigSet'
    queryId: uint64
    config: Config
    isRootCleared: boolean
}

export const MCMS_ConfigSet = {
    PREFIX: 0xd80be574,

    create(args: {
        queryId: uint64
        config: Config
        isRootCleared: boolean
    }): MCMS_ConfigSet {
        return {
            $: 'MCMS_ConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_ConfigSet {
        loadAndCheckPrefix32(s, 0xd80be574, 'MCMS_ConfigSet');
        return {
            $: 'MCMS_ConfigSet',
            queryId: s.loadUintBig(64),
            config: Config.fromSlice(s),
            isRootCleared: s.loadBoolean(),
        }
    },
    store(self: MCMS_ConfigSet, b: c.Builder): void {
        b.storeUint(0xd80be574, 32);
        b.storeUint(self.queryId, 64);
        Config.store(self.config, b);
        b.storeBit(self.isRootCleared);
    },
    toCell(self: MCMS_ConfigSet): c.Cell {
        return makeCellFrom<MCMS_ConfigSet>(self, MCMS_ConfigSet.store);
    }
}

/**
 > struct (0x7cf37cbf) MCMS_OpExecuted {
 >     queryId: uint64
 >     nonce: uint40
 >     to: address
 >     data: cell
 >     value: coins
 > }
 */
export interface MCMS_OpExecuted {
    readonly $: 'MCMS_OpExecuted'
    queryId: uint64
    nonce: uint40
    to: c.Address
    data: c.Cell
    value: coins
}

export const MCMS_OpExecuted = {
    PREFIX: 0x7cf37cbf,

    create(args: {
        queryId: uint64
        nonce: uint40
        to: c.Address
        data: c.Cell
        value: coins
    }): MCMS_OpExecuted {
        return {
            $: 'MCMS_OpExecuted',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_OpExecuted {
        loadAndCheckPrefix32(s, 0x7cf37cbf, 'MCMS_OpExecuted');
        return {
            $: 'MCMS_OpExecuted',
            queryId: s.loadUintBig(64),
            nonce: s.loadUintBig(40),
            to: s.loadAddress(),
            data: s.loadRef(),
            value: s.loadCoins(),
        }
    },
    store(self: MCMS_OpExecuted, b: c.Builder): void {
        b.storeUint(0x7cf37cbf, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.nonce, 40);
        b.storeAddress(self.to);
        b.storeRef(self.data);
        b.storeCoins(self.value);
    },
    toCell(self: MCMS_OpExecuted): c.Cell {
        return makeCellFrom<MCMS_OpExecuted>(self, MCMS_OpExecuted.store);
    }
}

/**
 > struct (0x16fc10e6) MCMS_OpFinalizationTimeoutChange {
 >     queryId: uint64
 >     oldDuration: uint32
 >     newDuration: uint32
 > }
 */
export interface MCMS_OpFinalizationTimeoutChange {
    readonly $: 'MCMS_OpFinalizationTimeoutChange'
    queryId: uint64
    oldDuration: uint32
    newDuration: uint32
}

export const MCMS_OpFinalizationTimeoutChange = {
    PREFIX: 0x16fc10e6,

    create(args: {
        queryId: uint64
        oldDuration: uint32
        newDuration: uint32
    }): MCMS_OpFinalizationTimeoutChange {
        return {
            $: 'MCMS_OpFinalizationTimeoutChange',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_OpFinalizationTimeoutChange {
        loadAndCheckPrefix32(s, 0x16fc10e6, 'MCMS_OpFinalizationTimeoutChange');
        return {
            $: 'MCMS_OpFinalizationTimeoutChange',
            queryId: s.loadUintBig(64),
            oldDuration: s.loadUintBig(32),
            newDuration: s.loadUintBig(32),
        }
    },
    store(self: MCMS_OpFinalizationTimeoutChange, b: c.Builder): void {
        b.storeUint(0x16fc10e6, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.oldDuration, 32);
        b.storeUint(self.newDuration, 32);
    },
    toCell(self: MCMS_OpFinalizationTimeoutChange): c.Cell {
        return makeCellFrom<MCMS_OpFinalizationTimeoutChange>(self, MCMS_OpFinalizationTimeoutChange.store);
    }
}

/**
 > struct (0xbbc4deb4) MCMS_ErrorReportSubmitted {
 >     queryId: uint64
 >     opLeafHash: uint256
 >     opTxHash: uint256
 >     errorTxHash: uint256
 >     errorCode: uint32
 >     root: Cell<uint256>
 >     matchesPendingOp: bool
 > }
 */
export interface MCMS_ErrorReportSubmitted {
    readonly $: 'MCMS_ErrorReportSubmitted'
    queryId: uint64
    opLeafHash: uint256
    opTxHash: uint256
    errorTxHash: uint256
    errorCode: uint32
    root: CellRef<uint256>
    matchesPendingOp: boolean
}

export const MCMS_ErrorReportSubmitted = {
    PREFIX: 0xbbc4deb4,

    create(args: {
        queryId: uint64
        opLeafHash: uint256
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
        root: CellRef<uint256>
        matchesPendingOp: boolean
    }): MCMS_ErrorReportSubmitted {
        return {
            $: 'MCMS_ErrorReportSubmitted',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_ErrorReportSubmitted {
        loadAndCheckPrefix32(s, 0xbbc4deb4, 'MCMS_ErrorReportSubmitted');
        return {
            $: 'MCMS_ErrorReportSubmitted',
            queryId: s.loadUintBig(64),
            opLeafHash: s.loadUintBig(256),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUintBig(32),
            root: loadCellRef<uint256>(s,
                (s) => s.loadUintBig(256)
            ),
            matchesPendingOp: s.loadBoolean(),
        }
    },
    store(self: MCMS_ErrorReportSubmitted, b: c.Builder): void {
        b.storeUint(0xbbc4deb4, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.opLeafHash, 256);
        b.storeUint(self.opTxHash, 256);
        b.storeUint(self.errorTxHash, 256);
        b.storeUint(self.errorCode, 32);
        storeCellRef<uint256>(self.root, b,
            (v,b) => b.storeUint(v, 256)
        );
        b.storeBit(self.matchesPendingOp);
    },
    toCell(self: MCMS_ErrorReportSubmitted): c.Cell {
        return makeCellFrom<MCMS_ErrorReportSubmitted>(self, MCMS_ErrorReportSubmitted.store);
    }
}

/**
 > struct (0xff4176a3) MCMS_OracleRoleTransferred {
 >     queryId: uint64
 >     oldOracle: address
 >     newOracle: address
 > }
 */
export interface MCMS_OracleRoleTransferred {
    readonly $: 'MCMS_OracleRoleTransferred'
    queryId: uint64
    oldOracle: c.Address
    newOracle: c.Address
}

export const MCMS_OracleRoleTransferred = {
    PREFIX: 0xff4176a3,

    create(args: {
        queryId: uint64
        oldOracle: c.Address
        newOracle: c.Address
    }): MCMS_OracleRoleTransferred {
        return {
            $: 'MCMS_OracleRoleTransferred',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_OracleRoleTransferred {
        loadAndCheckPrefix32(s, 0xff4176a3, 'MCMS_OracleRoleTransferred');
        return {
            $: 'MCMS_OracleRoleTransferred',
            queryId: s.loadUintBig(64),
            oldOracle: s.loadAddress(),
            newOracle: s.loadAddress(),
        }
    },
    store(self: MCMS_OracleRoleTransferred, b: c.Builder): void {
        b.storeUint(0xff4176a3, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.oldOracle);
        b.storeAddress(self.newOracle);
    },
    toCell(self: MCMS_OracleRoleTransferred): c.Cell {
        return makeCellFrom<MCMS_OracleRoleTransferred>(self, MCMS_OracleRoleTransferred.store);
    }
}

/**
 > struct (0xa86846d5) MCMS_ExpiredRootsCleaned {
 >     queryId: uint64
 >     roots: SnakedCell<RootDescriptor>
 > }
 */
export interface MCMS_ExpiredRootsCleaned {
    readonly $: 'MCMS_ExpiredRootsCleaned'
    queryId: uint64
    roots: SnakedCell<RootDescriptor>
}

export const MCMS_ExpiredRootsCleaned = {
    PREFIX: 0xa86846d5,

    create(args: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }): MCMS_ExpiredRootsCleaned {
        return {
            $: 'MCMS_ExpiredRootsCleaned',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_ExpiredRootsCleaned {
        loadAndCheckPrefix32(s, 0xa86846d5, 'MCMS_ExpiredRootsCleaned');
        return {
            $: 'MCMS_ExpiredRootsCleaned',
            queryId: s.loadUintBig(64),
            roots: s.loadRef(),
        }
    },
    store(self: MCMS_ExpiredRootsCleaned, b: c.Builder): void {
        b.storeUint(0xa86846d5, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.roots);
    },
    toCell(self: MCMS_ExpiredRootsCleaned): c.Cell {
        return makeCellFrom<MCMS_ExpiredRootsCleaned>(self, MCMS_ExpiredRootsCleaned.store);
    }
}

/**
 > struct (0xe695431e) MCMS_BounceHandled {
 >     sender: address
 >     bouncedBody: uint256
 >     root: uint256
 >     nonce: uint40
 >     matchesPendingOp: bool
 >     rootExpired: bool
 > }
 */
export interface MCMS_BounceHandled {
    readonly $: 'MCMS_BounceHandled'
    sender: c.Address
    bouncedBody: uint256
    root: uint256
    nonce: uint40
    matchesPendingOp: boolean
    rootExpired: boolean
}

export const MCMS_BounceHandled = {
    PREFIX: 0xe695431e,

    create(args: {
        sender: c.Address
        bouncedBody: uint256
        root: uint256
        nonce: uint40
        matchesPendingOp: boolean
        rootExpired: boolean
    }): MCMS_BounceHandled {
        return {
            $: 'MCMS_BounceHandled',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_BounceHandled {
        loadAndCheckPrefix32(s, 0xe695431e, 'MCMS_BounceHandled');
        return {
            $: 'MCMS_BounceHandled',
            sender: s.loadAddress(),
            bouncedBody: s.loadUintBig(256),
            root: s.loadUintBig(256),
            nonce: s.loadUintBig(40),
            matchesPendingOp: s.loadBoolean(),
            rootExpired: s.loadBoolean(),
        }
    },
    store(self: MCMS_BounceHandled, b: c.Builder): void {
        b.storeUint(0xe695431e, 32);
        b.storeAddress(self.sender);
        b.storeUint(self.bouncedBody, 256);
        b.storeUint(self.root, 256);
        b.storeUint(self.nonce, 40);
        b.storeBit(self.matchesPendingOp);
        b.storeBit(self.rootExpired);
    },
    toCell(self: MCMS_BounceHandled): c.Cell {
        return makeCellFrom<MCMS_BounceHandled>(self, MCMS_BounceHandled.store);
    }
}

/**
 > struct MCMS_Data {
 >     id: uint32
 >     ownable: Ownable2Step
 >     oracle: address
 >     signers: map<uint160, Signer>
 >     config: Cell<Config>
 >     seenSignedHashes: map<uint256, bool>
 >     rootInfo: Cell<RootInfo>
 > }
 */
export interface MCMS_Data {
    readonly $: 'MCMS_Data'
    id: uint32
    ownable: Ownable2Step
    oracle: c.Address
    signers: c.Dictionary<uint160, Signer>
    config: CellRef<Config>
    seenSignedHashes: c.Dictionary<uint256, boolean>
    rootInfo: CellRef<RootInfo>
}

export const MCMS_Data = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        oracle: c.Address
        signers: c.Dictionary<uint160, Signer>
        config: CellRef<Config>
        seenSignedHashes: c.Dictionary<uint256, boolean>
        rootInfo: CellRef<RootInfo>
    }): MCMS_Data {
        return {
            $: 'MCMS_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): MCMS_Data {
        return {
            $: 'MCMS_Data',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
            oracle: s.loadAddress(),
            signers: c.Dictionary.load<uint160, Signer>(c.Dictionary.Keys.BigUint(160), createDictionaryValue<Signer>(Signer.fromSlice, Signer.store), s),
            config: loadCellRef<Config>(s, Config.fromSlice),
            seenSignedHashes: c.Dictionary.load<uint256, boolean>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool(), s),
            rootInfo: loadCellRef<RootInfo>(s, RootInfo.fromSlice),
        }
    },
    store(self: MCMS_Data, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        b.storeAddress(self.oracle);
        b.storeDict<uint160, Signer>(self.signers, c.Dictionary.Keys.BigUint(160), createDictionaryValue<Signer>(Signer.fromSlice, Signer.store));
        storeCellRef<Config>(self.config, b, Config.store);
        b.storeDict<uint256, boolean>(self.seenSignedHashes, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.Bool());
        storeCellRef<RootInfo>(self.rootInfo, b, RootInfo.store);
    },
    toCell(self: MCMS_Data): c.Cell {
        return makeCellFrom<MCMS_Data>(self, MCMS_Data.store);
    }
}

/**
 > struct Signer {
 >     address: uint160
 >     index: uint8
 >     group: uint8
 > }
 */
export interface Signer {
    readonly $: 'Signer'
    address: uint160
    index: uint8
    group: uint8
}

export const Signer = {
    create(args: {
        address: uint160
        index: uint8
        group: uint8
    }): Signer {
        return {
            $: 'Signer',
            ...args
        }
    },
    fromSlice(s: c.Slice): Signer {
        return {
            $: 'Signer',
            address: s.loadUintBig(160),
            index: s.loadUintBig(8),
            group: s.loadUintBig(8),
        }
    },
    store(self: Signer, b: c.Builder): void {
        b.storeUint(self.address, 160);
        b.storeUint(self.index, 8);
        b.storeUint(self.group, 8);
    },
    toCell(self: Signer): c.Cell {
        return makeCellFrom<Signer>(self, Signer.store);
    }
}

/**
 > struct Config {
 >     signers: map<uint8, Signer>
 >     groupQuorums: map<uint8, uint8>
 >     groupParents: map<uint8, uint8>
 > }
 */
export interface Config {
    readonly $: 'Config'
    signers: c.Dictionary<uint8, Signer>
    groupQuorums: c.Dictionary<uint8, uint8>
    groupParents: c.Dictionary<uint8, uint8>
}

export const Config = {
    create(args: {
        signers: c.Dictionary<uint8, Signer>
        groupQuorums: c.Dictionary<uint8, uint8>
        groupParents: c.Dictionary<uint8, uint8>
    }): Config {
        return {
            $: 'Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): Config {
        return {
            $: 'Config',
            signers: c.Dictionary.load<uint8, Signer>(c.Dictionary.Keys.BigUint(8), createDictionaryValue<Signer>(Signer.fromSlice, Signer.store), s),
            groupQuorums: c.Dictionary.load<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8), s),
            groupParents: c.Dictionary.load<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8), s),
        }
    },
    store(self: Config, b: c.Builder): void {
        b.storeDict<uint8, Signer>(self.signers, c.Dictionary.Keys.BigUint(8), createDictionaryValue<Signer>(Signer.fromSlice, Signer.store));
        b.storeDict<uint8, uint8>(self.groupQuorums, c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8));
        b.storeDict<uint8, uint8>(self.groupParents, c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8));
    },
    toCell(self: Config): c.Cell {
        return makeCellFrom<Config>(self, Config.store);
    }
}

/**
 > struct RootInfo {
 >     expiringRootAndOpCount: ExpiringRootAndOpCount
 >     rootMetadata: RootMetadata
 > }
 */
export interface RootInfo {
    readonly $: 'RootInfo'
    expiringRootAndOpCount: ExpiringRootAndOpCount
    rootMetadata: RootMetadata
}

export const RootInfo = {
    create(args: {
        expiringRootAndOpCount: ExpiringRootAndOpCount
        rootMetadata: RootMetadata
    }): RootInfo {
        return {
            $: 'RootInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): RootInfo {
        return {
            $: 'RootInfo',
            expiringRootAndOpCount: ExpiringRootAndOpCount.fromSlice(s),
            rootMetadata: RootMetadata.fromSlice(s),
        }
    },
    store(self: RootInfo, b: c.Builder): void {
        ExpiringRootAndOpCount.store(self.expiringRootAndOpCount, b);
        RootMetadata.store(self.rootMetadata, b);
    },
    toCell(self: RootInfo): c.Cell {
        return makeCellFrom<RootInfo>(self, RootInfo.store);
    }
}

/**
 > struct ExpiringRootAndOpCount {
 >     root: uint256
 >     validUntil: uint64
 >     opCount: uint40
 >     opPendingInfo: Cell<OpPendingInfo>
 > }
 */
export interface ExpiringRootAndOpCount {
    readonly $: 'ExpiringRootAndOpCount'
    root: uint256
    validUntil: uint64
    opCount: uint40
    opPendingInfo: CellRef<OpPendingInfo>
}

export const ExpiringRootAndOpCount = {
    create(args: {
        root: uint256
        validUntil: uint64
        opCount: uint40
        opPendingInfo: CellRef<OpPendingInfo>
    }): ExpiringRootAndOpCount {
        return {
            $: 'ExpiringRootAndOpCount',
            ...args
        }
    },
    fromSlice(s: c.Slice): ExpiringRootAndOpCount {
        return {
            $: 'ExpiringRootAndOpCount',
            root: s.loadUintBig(256),
            validUntil: s.loadUintBig(64),
            opCount: s.loadUintBig(40),
            opPendingInfo: loadCellRef<OpPendingInfo>(s, OpPendingInfo.fromSlice),
        }
    },
    store(self: ExpiringRootAndOpCount, b: c.Builder): void {
        b.storeUint(self.root, 256);
        b.storeUint(self.validUntil, 64);
        b.storeUint(self.opCount, 40);
        storeCellRef<OpPendingInfo>(self.opPendingInfo, b, OpPendingInfo.store);
    },
    toCell(self: ExpiringRootAndOpCount): c.Cell {
        return makeCellFrom<ExpiringRootAndOpCount>(self, ExpiringRootAndOpCount.store);
    }
}

/**
 > struct OpPendingInfo {
 >     validAfter: uint64
 >     opFinalizationTimeout: uint32
 >     opPendingReceiver: address?
 >     opPendingBodyTruncated: uint256
 > }
 */
export interface OpPendingInfo {
    readonly $: 'OpPendingInfo'
    validAfter: uint64
    opFinalizationTimeout: uint32
    opPendingReceiver: c.Address | null
    opPendingBodyTruncated: uint256
}

export const OpPendingInfo = {
    create(args: {
        validAfter: uint64
        opFinalizationTimeout: uint32
        opPendingReceiver: c.Address | null
        opPendingBodyTruncated: uint256
    }): OpPendingInfo {
        return {
            $: 'OpPendingInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): OpPendingInfo {
        return {
            $: 'OpPendingInfo',
            validAfter: s.loadUintBig(64),
            opFinalizationTimeout: s.loadUintBig(32),
            opPendingReceiver: s.loadMaybeAddress(),
            opPendingBodyTruncated: s.loadUintBig(256),
        }
    },
    store(self: OpPendingInfo, b: c.Builder): void {
        b.storeUint(self.validAfter, 64);
        b.storeUint(self.opFinalizationTimeout, 32);
        b.storeAddress(self.opPendingReceiver);
        b.storeUint(self.opPendingBodyTruncated, 256);
    },
    toCell(self: OpPendingInfo): c.Cell {
        return makeCellFrom<OpPendingInfo>(self, OpPendingInfo.store);
    }
}

/**
 > struct RootMetadata {
 >     chainId: int256
 >     multiSig: address
 >     preOpCount: uint40
 >     postOpCount: uint40
 >     overridePreviousRoot: bool
 > }
 */
export interface RootMetadata {
    readonly $: 'RootMetadata'
    chainId: int256
    multiSig: c.Address
    preOpCount: uint40
    postOpCount: uint40
    overridePreviousRoot: boolean
}

export const RootMetadata = {
    create(args: {
        chainId: int256
        multiSig: c.Address
        preOpCount: uint40
        postOpCount: uint40
        overridePreviousRoot: boolean
    }): RootMetadata {
        return {
            $: 'RootMetadata',
            ...args
        }
    },
    fromSlice(s: c.Slice): RootMetadata {
        return {
            $: 'RootMetadata',
            chainId: s.loadIntBig(256),
            multiSig: s.loadAddress(),
            preOpCount: s.loadUintBig(40),
            postOpCount: s.loadUintBig(40),
            overridePreviousRoot: s.loadBoolean(),
        }
    },
    store(self: RootMetadata, b: c.Builder): void {
        b.storeInt(self.chainId, 256);
        b.storeAddress(self.multiSig);
        b.storeUint(self.preOpCount, 40);
        b.storeUint(self.postOpCount, 40);
        b.storeBit(self.overridePreviousRoot);
    },
    toCell(self: RootMetadata): c.Cell {
        return makeCellFrom<RootMetadata>(self, RootMetadata.store);
    }
}

/**
 > struct Signature {
 >     v: uint8
 >     r: uint256
 >     s: uint256
 > }
 */
export interface Signature {
    readonly $: 'Signature'
    v: uint8
    r: uint256
    s: uint256
}

export const Signature = {
    create(args: {
        v: uint8
        r: uint256
        s: uint256
    }): Signature {
        return {
            $: 'Signature',
            ...args
        }
    },
    fromSlice(s: c.Slice): Signature {
        return {
            $: 'Signature',
            v: s.loadUintBig(8),
            r: s.loadUintBig(256),
            s: s.loadUintBig(256),
        }
    },
    store(self: Signature, b: c.Builder): void {
        b.storeUint(self.v, 8);
        b.storeUint(self.r, 256);
        b.storeUint(self.s, 256);
    },
    toCell(self: Signature): c.Cell {
        return makeCellFrom<Signature>(self, Signature.store);
    }
}

/**
 > struct Op {
 >     chainId: int256
 >     multiSig: address
 >     nonce: uint40
 >     to: address
 >     value: coins
 >     data: cell
 > }
 */
export interface Op {
    readonly $: 'Op'
    chainId: int256
    multiSig: c.Address
    nonce: uint40
    to: c.Address
    value: coins
    data: c.Cell
}

export const Op = {
    create(args: {
        chainId: int256
        multiSig: c.Address
        nonce: uint40
        to: c.Address
        value: coins
        data: c.Cell
    }): Op {
        return {
            $: 'Op',
            ...args
        }
    },
    fromSlice(s: c.Slice): Op {
        return {
            $: 'Op',
            chainId: s.loadIntBig(256),
            multiSig: s.loadAddress(),
            nonce: s.loadUintBig(40),
            to: s.loadAddress(),
            value: s.loadCoins(),
            data: s.loadRef(),
        }
    },
    store(self: Op, b: c.Builder): void {
        b.storeInt(self.chainId, 256);
        b.storeAddress(self.multiSig);
        b.storeUint(self.nonce, 40);
        b.storeAddress(self.to);
        b.storeCoins(self.value);
        b.storeRef(self.data);
    },
    toCell(self: Op): c.Cell {
        return makeCellFrom<Op>(self, Op.store);
    }
}

/**
 > struct RootDescriptor {
 >     root: uint256
 >     validUntil: uint64
 > }
 */
export interface RootDescriptor {
    readonly $: 'RootDescriptor'
    root: uint256
    validUntil: uint64
}

export const RootDescriptor = {
    create(args: {
        root: uint256
        validUntil: uint64
    }): RootDescriptor {
        return {
            $: 'RootDescriptor',
            ...args
        }
    },
    fromSlice(s: c.Slice): RootDescriptor {
        return {
            $: 'RootDescriptor',
            root: s.loadUintBig(256),
            validUntil: s.loadUintBig(64),
        }
    },
    store(self: RootDescriptor, b: c.Builder): void {
        b.storeUint(self.root, 256);
        b.storeUint(self.validUntil, 64);
    },
    toCell(self: RootDescriptor): c.Cell {
        return makeCellFrom<RootDescriptor>(self, RootDescriptor.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

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

// ————————————————————————————————————————————
//    class MCMS
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

export class MCMS implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'MCMS_Error.OutOfBoundsNumSigners': 10400,
        'MCMS_Error.SignerGroupsLengthMismatch': 10401,
        'MCMS_Error.OutOfBoundsGroup': 10402,
        'MCMS_Error.GroupTreeNotWellFormed': 10403,
        'MCMS_Error.OutOfBoundsGroupQuorum': 10404,
        'MCMS_Error.SignerInDisabledGroup': 10405,
        'MCMS_Error.SignersAdderssesMustBeStrictlyIncreasing': 10406,
        'MCMS_Error.InvalidSigner': 10407,
        'MCMS_Error.InsufficientSigners': 10408,
        'MCMS_Error.WrongChainId': 10409,
        'MCMS_Error.WrongMultiSig': 10410,
        'MCMS_Error.WrongPostOpCount': 10411,
        'MCMS_Error.PendingOps': 10412,
        'MCMS_Error.WrongPreOpCount': 10413,
        'MCMS_Error.ProofCannotBeVerified': 10414,
        'MCMS_Error.RootExpired': 10415,
        'MCMS_Error.WrongNonce': 10416,
        'MCMS_Error.PostOpCountReached': 10417,
        'MCMS_Error.ValidUntilHasAlreadyPassed': 10419,
        'MCMS_Error.MissingConfig': 10420,
        'MCMS_Error.SignedHashAlreadySeen': 10421,
        'MCMS_Error.RootNotFinalized': 10422,
        'MCMS_Error.InsufficientValue': 10423,
        'MCMS_Error.UnauthorizedOracle': 10424,
        'MCMS_Error.RootNotExpired': 10425,
        'MCMS_Error.InsufficientFee': 10426,
        'Utils_Error.InvalidData': 13500,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new MCMS(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        oracle: c.Address
        signers: c.Dictionary<uint160, Signer>
        config: CellRef<Config>
        seenSignedHashes: c.Dictionary<uint256, boolean>
        rootInfo: CellRef<RootInfo>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? MCMS.CodeCell,
            data: MCMS_Data.toCell(MCMS_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new MCMS(address, initialState);
    }

    static createCellOfMCMSSetRoot(body: {
        queryId: uint64
        root: uint256
        validUntil: uint64
        metadata: RootMetadata
        metadataProof: SnakedCell<uint256>
        signatures: SnakedCell<Signature>
    }) {
        return MCMS_SetRoot.toCell(MCMS_SetRoot.create(body));
    }

    static createCellOfMCMSExecute(body: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
    }) {
        return MCMS_Execute.toCell(MCMS_Execute.create(body));
    }

    static createCellOfMCMSSetConfig(body: {
        queryId: uint64
        signerAddresses: SnakedCell<uint160>
        signerGroups: SnakedCell<uint8>
        groupQuorums: c.Dictionary<uint8, uint8>
        groupParents: c.Dictionary<uint8, uint8>
        clearRoot: boolean
    }) {
        return MCMS_SetConfig.toCell(MCMS_SetConfig.create(body));
    }

    static createCellOfMCMSUpdateOpFinalizationTimeout(body: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }) {
        return MCMS_UpdateOpFinalizationTimeout.toCell(MCMS_UpdateOpFinalizationTimeout.create(body));
    }

    static createCellOfMCMSSubmitErrorReport(body: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }) {
        return MCMS_SubmitErrorReport.toCell(MCMS_SubmitErrorReport.create(body));
    }

    static createCellOfMCMSTransferOracleRole(body: {
        queryId: uint64
        newOracle: c.Address
    }) {
        return MCMS_TransferOracleRole.toCell(MCMS_TransferOracleRole.create(body));
    }

    static createCellOfMCMSCleanExpiredRoots(body: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }) {
        return MCMS_CleanExpiredRoots.toCell(MCMS_CleanExpiredRoots.create(body));
    }

    static createCellOfMCMSConfigSet(body: {
        queryId: uint64
        config: Config
        isRootCleared: boolean
    }) {
        return MCMS_ConfigSet.toCell(MCMS_ConfigSet.create(body));
    }

    static createCellOfMCMSOracleRoleTransferred(body: {
        queryId: uint64
        oldOracle: c.Address
        newOracle: c.Address
    }) {
        return MCMS_OracleRoleTransferred.toCell(MCMS_OracleRoleTransferred.create(body));
    }

    static createCellOfMCMSExpiredRootsCleaned(body: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }) {
        return MCMS_ExpiredRootsCleaned.toCell(MCMS_ExpiredRootsCleaned.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendMCMSSetRoot(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        root: uint256
        validUntil: uint64
        metadata: RootMetadata
        metadataProof: SnakedCell<uint256>
        signatures: SnakedCell<Signature>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_SetRoot.toCell(MCMS_SetRoot.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_Execute.toCell(MCMS_Execute.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSSetConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        signerAddresses: SnakedCell<uint160>
        signerGroups: SnakedCell<uint8>
        groupQuorums: c.Dictionary<uint8, uint8>
        groupParents: c.Dictionary<uint8, uint8>
        clearRoot: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_SetConfig.toCell(MCMS_SetConfig.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSUpdateOpFinalizationTimeout(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        newOpFinalizationTimeout: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_UpdateOpFinalizationTimeout.toCell(MCMS_UpdateOpFinalizationTimeout.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSSubmitErrorReport(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        op: CellRef<Op>
        proof: SnakedCell<uint256>
        opTxHash: uint256
        errorTxHash: uint256
        errorCode: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_SubmitErrorReport.toCell(MCMS_SubmitErrorReport.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSTransferOracleRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        newOracle: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_TransferOracleRole.toCell(MCMS_TransferOracleRole.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSCleanExpiredRoots(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_CleanExpiredRoots.toCell(MCMS_CleanExpiredRoots.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSConfigSet(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        config: Config
        isRootCleared: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_ConfigSet.toCell(MCMS_ConfigSet.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSOracleRoleTransferred(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        oldOracle: c.Address
        newOracle: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_OracleRoleTransferred.toCell(MCMS_OracleRoleTransferred.create(body)),
            ...extraOptions
        });
    }

    async sendMCMSExpiredRootsCleaned(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        roots: SnakedCell<RootDescriptor>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MCMS_ExpiredRootsCleaned.toCell(MCMS_ExpiredRootsCleaned.create(body)),
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

    async getConfig(provider: ContractProvider): Promise<Config> {
        const r = StackReader.fromGetMethod(3, await provider.get('getConfig', []));
        return ({
            $: 'Config',
            signers: r.readDictionary<uint8, Signer>(c.Dictionary.Keys.BigUint(8), createDictionaryValue<Signer>(Signer.fromSlice, Signer.store)),
            groupQuorums: r.readDictionary<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8)),
            groupParents: r.readDictionary<uint8, uint8>(c.Dictionary.Keys.BigUint(8), c.Dictionary.Values.BigUint(8)),
        });
    }

    async getOpCount(provider: ContractProvider): Promise<uint40> {
        const r = StackReader.fromGetMethod(1, await provider.get('getOpCount', []));
        return r.readBigInt();
    }

    async getRoot(provider: ContractProvider): Promise<[
        uint256,
        uint64,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('getRoot', []));
        return [
            r.readBigInt(),
            r.readBigInt(),
        ];
    }

    async getOpPendingInfo(provider: ContractProvider): Promise<OpPendingInfo> {
        const r = StackReader.fromGetMethod(4, await provider.get('getOpPendingInfo', []));
        return ({
            $: 'OpPendingInfo',
            validAfter: r.readBigInt(),
            opFinalizationTimeout: r.readBigInt(),
            opPendingReceiver: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            opPendingBodyTruncated: r.readBigInt(),
        });
    }

    async getRootMetadata(provider: ContractProvider): Promise<RootMetadata> {
        const r = StackReader.fromGetMethod(5, await provider.get('getRootMetadata', []));
        return ({
            $: 'RootMetadata',
            chainId: r.readBigInt(),
            multiSig: r.readSlice().loadAddress(),
            preOpCount: r.readBigInt(),
            postOpCount: r.readBigInt(),
            overridePreviousRoot: r.readBoolean(),
        });
    }

    async getOracle(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getOracle', []));
        return r.readSlice().loadAddress();
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
}
