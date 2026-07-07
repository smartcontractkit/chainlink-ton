// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OffRamp contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

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

function storeTolkBitsN(v: c.Slice, nBits: number, b: c.Builder): void {
    if (v.remainingBits !== nBits) { throw new Error(`expected ${nBits} bits, got ${v.remainingBits}`); }
    if (v.remainingRefs !== 0) { throw new Error(`expected 0 refs, got ${v.remainingRefs}`); }
    b.storeSlice(v);
}

function loadTolkBitsN(s: c.Slice, nBits: number): c.Slice {
    return new c.Slice(new c.BitReader(s.loadBits(nBits)), []);
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'OffRamp.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > OffRamp.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint112 = bigint
type uint128 = bigint
type uint192 = bigint
type uint224 = bigint
type uint256 = bigint

type bits192 = c.Slice

/**
 > struct ContractState {
 >     code: cell
 >     data: cell
 > }
 */
export interface ContractState {
    readonly $: 'ContractState'
    code: c.Cell
    data: c.Cell
}

export const ContractState = {
    create(args: {
        code: c.Cell
        data: c.Cell
    }): ContractState {
        return {
            $: 'ContractState',
            ...args
        }
    },
    fromSlice(s: c.Slice): ContractState {
        return {
            $: 'ContractState',
            code: s.loadRef(),
            data: s.loadRef(),
        }
    },
    store(self: ContractState, b: c.Builder): void {
        b.storeRef(self.code);
        b.storeRef(self.data);
    },
    toCell(self: ContractState): c.Cell {
        return makeCellFrom<ContractState>(self, ContractState.store);
    }
}

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
 > struct (0xba466447) Deployable_Initialize {
 >     stateInit: ContractState
 > }
 */
export interface Deployable_Initialize {
    readonly $: 'Deployable_Initialize'
    stateInit: ContractState
}

export const Deployable_Initialize = {
    PREFIX: 0xba466447,

    create(args: {
        stateInit: ContractState
    }): Deployable_Initialize {
        return {
            $: 'Deployable_Initialize',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_Initialize {
        loadAndCheckPrefix32(s, 0xba466447, 'Deployable_Initialize');
        return {
            $: 'Deployable_Initialize',
            stateInit: ContractState.fromSlice(s),
        }
    },
    store(self: Deployable_Initialize, b: c.Builder): void {
        b.storeUint(0xba466447, 32);
        ContractState.store(self.stateInit, b);
    },
    toCell(self: Deployable_Initialize): c.Cell {
        return makeCellFrom<Deployable_Initialize>(self, Deployable_Initialize.store);
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
 > struct OCR3Base_ConfigSet {
 >     ocrPluginType: uint16
 >     configDigest: uint256
 >     signers: SnakedCell<uint256>
 >     transmitters: SnakedCell<address>
 >     bigF: uint8
 > }
 */
export interface OCR3Base_ConfigSet {
    readonly $: 'OCR3Base_ConfigSet'
    ocrPluginType: uint16
    configDigest: uint256
    signers: SnakedCell<uint256>
    transmitters: SnakedCell<c.Address>
    bigF: uint8
}

export const OCR3Base_ConfigSet = {
    create(args: {
        ocrPluginType: uint16
        configDigest: uint256
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
        bigF: uint8
    }): OCR3Base_ConfigSet {
        return {
            $: 'OCR3Base_ConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): OCR3Base_ConfigSet {
        return {
            $: 'OCR3Base_ConfigSet',
            ocrPluginType: s.loadUintBig(16),
            configDigest: s.loadUintBig(256),
            signers: s.loadRef(),
            transmitters: s.loadRef(),
            bigF: s.loadUintBig(8),
        }
    },
    store(self: OCR3Base_ConfigSet, b: c.Builder): void {
        b.storeUint(self.ocrPluginType, 16);
        b.storeUint(self.configDigest, 256);
        b.storeRef(self.signers);
        b.storeRef(self.transmitters);
        b.storeUint(self.bigF, 8);
    },
    toCell(self: OCR3Base_ConfigSet): c.Cell {
        return makeCellFrom<OCR3Base_ConfigSet>(self, OCR3Base_ConfigSet.store);
    }
}

/**
 > struct OCR3Base_Transmitted {
 >     ocrPluginType: uint16
 >     configDigest: uint256
 >     sequenceNumber: uint64
 > }
 */
export interface OCR3Base_Transmitted {
    readonly $: 'OCR3Base_Transmitted'
    ocrPluginType: uint16
    configDigest: uint256
    sequenceNumber: uint64
}

export const OCR3Base_Transmitted = {
    create(args: {
        ocrPluginType: uint16
        configDigest: uint256
        sequenceNumber: uint64
    }): OCR3Base_Transmitted {
        return {
            $: 'OCR3Base_Transmitted',
            ...args
        }
    },
    fromSlice(s: c.Slice): OCR3Base_Transmitted {
        return {
            $: 'OCR3Base_Transmitted',
            ocrPluginType: s.loadUintBig(16),
            configDigest: s.loadUintBig(256),
            sequenceNumber: s.loadUintBig(64),
        }
    },
    store(self: OCR3Base_Transmitted, b: c.Builder): void {
        b.storeUint(self.ocrPluginType, 16);
        b.storeUint(self.configDigest, 256);
        b.storeUint(self.sequenceNumber, 64);
    },
    toCell(self: OCR3Base_Transmitted): c.Cell {
        return makeCellFrom<OCR3Base_Transmitted>(self, OCR3Base_Transmitted.store);
    }
}

/**
 > struct (0x2b78359f) OCR3Base_SetOCR3Config {
 >     queryId: uint64
 >     configDigest: uint256
 >     ocrPluginType: uint16
 >     bigF: uint8
 >     isSignatureVerificationEnabled: bool
 >     signers: SnakedCell<uint256>
 >     transmitters: SnakedCell<address>
 > }
 */
export interface OCR3Base_SetOCR3Config {
    readonly $: 'OCR3Base_SetOCR3Config'
    queryId: uint64
    configDigest: uint256
    ocrPluginType: uint16
    bigF: uint8
    isSignatureVerificationEnabled: boolean
    signers: SnakedCell<uint256>
    transmitters: SnakedCell<c.Address>
}

export const OCR3Base_SetOCR3Config = {
    PREFIX: 0x2b78359f,

    create(args: {
        queryId: uint64
        configDigest: uint256
        ocrPluginType: uint16
        bigF: uint8
        isSignatureVerificationEnabled: boolean
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
    }): OCR3Base_SetOCR3Config {
        return {
            $: 'OCR3Base_SetOCR3Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): OCR3Base_SetOCR3Config {
        loadAndCheckPrefix32(s, 0x2b78359f, 'OCR3Base_SetOCR3Config');
        return {
            $: 'OCR3Base_SetOCR3Config',
            queryId: s.loadUintBig(64),
            configDigest: s.loadUintBig(256),
            ocrPluginType: s.loadUintBig(16),
            bigF: s.loadUintBig(8),
            isSignatureVerificationEnabled: s.loadBoolean(),
            signers: s.loadRef(),
            transmitters: s.loadRef(),
        }
    },
    store(self: OCR3Base_SetOCR3Config, b: c.Builder): void {
        b.storeUint(0x2b78359f, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.configDigest, 256);
        b.storeUint(self.ocrPluginType, 16);
        b.storeUint(self.bigF, 8);
        b.storeBit(self.isSignatureVerificationEnabled);
        b.storeRef(self.signers);
        b.storeRef(self.transmitters);
    },
    toCell(self: OCR3Base_SetOCR3Config): c.Cell {
        return makeCellFrom<OCR3Base_SetOCR3Config>(self, OCR3Base_SetOCR3Config.store);
    }
}

/**
 > struct OCR3Base {
 >     chainId: uint8
 >     commit: Cell<OCRConfig>?
 >     execute: Cell<OCRConfig>?
 > }
 */
export interface OCR3Base {
    readonly $: 'OCR3Base'
    chainId: uint8
    commit: CellRef<OCRConfig> | null
    execute: CellRef<OCRConfig> | null
}

export const OCR3Base = {
    create(args: {
        chainId: uint8
        commit: CellRef<OCRConfig> | null
        execute: CellRef<OCRConfig> | null
    }): OCR3Base {
        return {
            $: 'OCR3Base',
            ...args
        }
    },
    fromSlice(s: c.Slice): OCR3Base {
        return {
            $: 'OCR3Base',
            chainId: s.loadUintBig(8),
            commit: s.loadBoolean() ? loadCellRef<OCRConfig>(s, OCRConfig.fromSlice) : null,
            execute: s.loadBoolean() ? loadCellRef<OCRConfig>(s, OCRConfig.fromSlice) : null,
        }
    },
    store(self: OCR3Base, b: c.Builder): void {
        b.storeUint(self.chainId, 8);
        storeTolkNullable<CellRef<OCRConfig>>(self.commit, b,
            (v,b) => storeCellRef<OCRConfig>(v, b, OCRConfig.store)
        );
        storeTolkNullable<CellRef<OCRConfig>>(self.execute, b,
            (v,b) => storeCellRef<OCRConfig>(v, b, OCRConfig.store)
        );
    },
    toCell(self: OCR3Base): c.Cell {
        return makeCellFrom<OCR3Base>(self, OCR3Base.store);
    }
}

/**
 > struct OCRConfig {
 >     configInfo: ConfigInfo
 >     signers: map<uint256, uint8>
 >     transmitters: map<address, uint8>
 > }
 */
export interface OCRConfig {
    readonly $: 'OCRConfig'
    configInfo: ConfigInfo
    signers: c.Dictionary<uint256, uint8>
    transmitters: c.Dictionary<c.Address, uint8>
}

export const OCRConfig = {
    create(args: {
        configInfo: ConfigInfo
        signers: c.Dictionary<uint256, uint8>
        transmitters: c.Dictionary<c.Address, uint8>
    }): OCRConfig {
        return {
            $: 'OCRConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OCRConfig {
        return {
            $: 'OCRConfig',
            configInfo: ConfigInfo.fromSlice(s),
            signers: c.Dictionary.load<uint256, uint8>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(8), s),
            transmitters: c.Dictionary.load<c.Address, uint8>(c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(8), s),
        }
    },
    store(self: OCRConfig, b: c.Builder): void {
        ConfigInfo.store(self.configInfo, b);
        b.storeDict<uint256, uint8>(self.signers, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(8));
        b.storeDict<c.Address, uint8>(self.transmitters, c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(8));
    },
    toCell(self: OCRConfig): c.Cell {
        return makeCellFrom<OCRConfig>(self, OCRConfig.store);
    }
}

/**
 > struct ConfigInfo {
 >     configDigest: uint256
 >     bigF: uint8
 >     n: uint8
 >     isSignatureVerificationEnabled: bool
 > }
 */
export interface ConfigInfo {
    readonly $: 'ConfigInfo'
    configDigest: uint256 /* = 0 */
    bigF: uint8 /* = 0 */
    n: uint8 /* = 0 */
    isSignatureVerificationEnabled: boolean /* = false */
}

export const ConfigInfo = {
    create(args: {
        configDigest?: uint256 /* = 0 */
        bigF?: uint8 /* = 0 */
        n?: uint8 /* = 0 */
        isSignatureVerificationEnabled?: boolean /* = false */
    }): ConfigInfo {
        return {
            $: 'ConfigInfo',
            configDigest: 0n,
            bigF: 0n,
            n: 0n,
            isSignatureVerificationEnabled: false,
            ...args
        }
    },
    fromSlice(s: c.Slice): ConfigInfo {
        return {
            $: 'ConfigInfo',
            configDigest: s.loadUintBig(256),
            bigF: s.loadUintBig(8),
            n: s.loadUintBig(8),
            isSignatureVerificationEnabled: s.loadBoolean(),
        }
    },
    store(self: ConfigInfo, b: c.Builder): void {
        b.storeUint(self.configDigest, 256);
        b.storeUint(self.bigF, 8);
        b.storeUint(self.n, 8);
        b.storeBit(self.isSignatureVerificationEnabled);
    },
    toCell(self: ConfigInfo): c.Cell {
        return makeCellFrom<ConfigInfo>(self, ConfigInfo.store);
    }
}

/**
 > struct SignatureEd25519 {
 >     signer: uint256
 >     r: uint256
 >     s: uint256
 > }
 */
export interface SignatureEd25519 {
    readonly $: 'SignatureEd25519'
    signer: uint256
    r: uint256
    s: uint256
}

export const SignatureEd25519 = {
    create(args: {
        signer: uint256
        r: uint256
        s: uint256
    }): SignatureEd25519 {
        return {
            $: 'SignatureEd25519',
            ...args
        }
    },
    fromSlice(s: c.Slice): SignatureEd25519 {
        return {
            $: 'SignatureEd25519',
            signer: s.loadUintBig(256),
            r: s.loadUintBig(256),
            s: s.loadUintBig(256),
        }
    },
    store(self: SignatureEd25519, b: c.Builder): void {
        b.storeUint(self.signer, 256);
        b.storeUint(self.r, 256);
        b.storeUint(self.s, 256);
    },
    toCell(self: SignatureEd25519): c.Cell {
        return makeCellFrom<SignatureEd25519>(self, SignatureEd25519.store);
    }
}

/**
 > struct ReportContext {
 >     configDigest: uint256
 >     _padding: bits192
 >     sequenceBytes: uint64
 > }
 */
export interface ReportContext {
    readonly $: 'ReportContext'
    configDigest: uint256
    _padding: bits192
    sequenceBytes: uint64
}

export const ReportContext = {
    create(args: {
        configDigest: uint256
        _padding: bits192
        sequenceBytes: uint64
    }): ReportContext {
        return {
            $: 'ReportContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReportContext {
        return {
            $: 'ReportContext',
            configDigest: s.loadUintBig(256),
            _padding: loadTolkBitsN(s, 192),
            sequenceBytes: s.loadUintBig(64),
        }
    },
    store(self: ReportContext, b: c.Builder): void {
        b.storeUint(self.configDigest, 256);
        storeTolkBitsN(self._padding, 192, b);
        b.storeUint(self.sequenceBytes, 64);
    },
    toCell(self: ReportContext): c.Cell {
        return makeCellFrom<ReportContext>(self, ReportContext.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

/**
 > struct Any2TVMMessage {
 >     messageId: uint256
 >     sourceChainSelector: uint64
 >     sender: CrossChainAddress
 >     data: cell
 >     tokenAmounts: cell?
 > }
 */
export interface Any2TVMMessage {
    readonly $: 'Any2TVMMessage'
    messageId: uint256
    sourceChainSelector: uint64
    sender: CrossChainAddress
    data: c.Cell
    tokenAmounts: c.Cell | null
}

export const Any2TVMMessage = {
    create(args: {
        messageId: uint256
        sourceChainSelector: uint64
        sender: CrossChainAddress
        data: c.Cell
        tokenAmounts: c.Cell | null
    }): Any2TVMMessage {
        return {
            $: 'Any2TVMMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMMessage {
        return {
            $: 'Any2TVMMessage',
            messageId: s.loadUintBig(256),
            sourceChainSelector: s.loadUintBig(64),
            sender: CrossChainAddress.fromSlice(s),
            data: s.loadRef(),
            tokenAmounts: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: Any2TVMMessage, b: c.Builder): void {
        b.storeUint(self.messageId, 256);
        b.storeUint(self.sourceChainSelector, 64);
        CrossChainAddress.store(self.sender, b);
        b.storeRef(self.data);
        storeTolkNullable<c.Cell>(self.tokenAmounts, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: Any2TVMMessage): c.Cell {
        return makeCellFrom<Any2TVMMessage>(self, Any2TVMMessage.store);
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
 > struct RampMessageHeader {
 >     messageId: uint256
 >     sourceChainSelector: uint64
 >     destChainSelector: uint64
 >     sequenceNumber: uint64
 >     nonce: uint64
 > }
 */
export interface RampMessageHeader {
    readonly $: 'RampMessageHeader'
    messageId: uint256
    sourceChainSelector: uint64
    destChainSelector: uint64
    sequenceNumber: uint64
    nonce: uint64
}

export const RampMessageHeader = {
    create(args: {
        messageId: uint256
        sourceChainSelector: uint64
        destChainSelector: uint64
        sequenceNumber: uint64
        nonce: uint64
    }): RampMessageHeader {
        return {
            $: 'RampMessageHeader',
            ...args
        }
    },
    fromSlice(s: c.Slice): RampMessageHeader {
        return {
            $: 'RampMessageHeader',
            messageId: s.loadUintBig(256),
            sourceChainSelector: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            sequenceNumber: s.loadUintBig(64),
            nonce: s.loadUintBig(64),
        }
    },
    store(self: RampMessageHeader, b: c.Builder): void {
        b.storeUint(self.messageId, 256);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.destChainSelector, 64);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.nonce, 64);
    },
    toCell(self: RampMessageHeader): c.Cell {
        return makeCellFrom<RampMessageHeader>(self, RampMessageHeader.store);
    }
}

/**
 > struct CursedSubjects {
 >     data: map<uint128, ()>
 > }
 */
export interface CursedSubjects {
    readonly $: 'CursedSubjects'
    data: c.Dictionary<uint128, []>
}

export const CursedSubjects = {
    create(args: {
        data: c.Dictionary<uint128, []>
    }): CursedSubjects {
        return {
            $: 'CursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): CursedSubjects {
        return {
            $: 'CursedSubjects',
            data: c.Dictionary.load<uint128, []>(c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
                (s) => [],
                (v,b) => { {} }
            ), s),
        }
    },
    store(self: CursedSubjects, b: c.Builder): void {
        b.storeDict<uint128, []>(self.data, c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: CursedSubjects): c.Cell {
        return makeCellFrom<CursedSubjects>(self, CursedSubjects.store);
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
 > struct (0x038ede91) MerkleRoot_Validate {
 >     message: Cell<Any2TVMRampMessage>
 >     permissionlessExecutionThresholdSeconds: uint32
 >     metadataHash: uint256
 >     gasOverride: coins?
 > }
 */
export interface MerkleRoot_Validate {
    readonly $: 'MerkleRoot_Validate'
    message: CellRef<Any2TVMRampMessage>
    permissionlessExecutionThresholdSeconds: uint32
    metadataHash: uint256
    gasOverride: coins | null
}

export const MerkleRoot_Validate = {
    PREFIX: 0x038ede91,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: coins | null
    }): MerkleRoot_Validate {
        return {
            $: 'MerkleRoot_Validate',
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_Validate {
        loadAndCheckPrefix32(s, 0x038ede91, 'MerkleRoot_Validate');
        return {
            $: 'MerkleRoot_Validate',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: MerkleRoot_Validate, b: c.Builder): void {
        b.storeUint(0x038ede91, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
    },
    toCell(self: MerkleRoot_Validate): c.Cell {
        return makeCellFrom<MerkleRoot_Validate>(self, MerkleRoot_Validate.store);
    }
}

/**
 > struct (0x019f4cd2) MerkleRoot_MarkState {
 >     seqNum: uint64
 >     state: ExecutionState
 > }
 */
export interface MerkleRoot_MarkState {
    readonly $: 'MerkleRoot_MarkState'
    seqNum: uint64
    state: ExecutionState
}

export const MerkleRoot_MarkState = {
    PREFIX: 0x019f4cd2,

    create(args: {
        seqNum: uint64
        state: ExecutionState
    }): MerkleRoot_MarkState {
        return {
            $: 'MerkleRoot_MarkState',
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_MarkState {
        loadAndCheckPrefix32(s, 0x019f4cd2, 'MerkleRoot_MarkState');
        return {
            $: 'MerkleRoot_MarkState',
            seqNum: s.loadUintBig(64),
            state: ExecutionState.fromSlice(s),
        }
    },
    store(self: MerkleRoot_MarkState, b: c.Builder): void {
        b.storeUint(0x019f4cd2, 32);
        b.storeUint(self.seqNum, 64);
        ExecutionState.store(self.state, b);
    },
    toCell(self: MerkleRoot_MarkState): c.Cell {
        return makeCellFrom<MerkleRoot_MarkState>(self, MerkleRoot_MarkState.store);
    }
}

/**
 > struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
 >     gasOverride: coins?
 >     root: address
 >     sequenceNumber: uint64
 >     sourceChainSelector: uint64
 >     messageId: uint256
 > }
 */
export interface ReceiveExecutor_InitExecute {
    readonly $: 'ReceiveExecutor_InitExecute'
    gasOverride: coins | null /* = null */
    root: c.Address
    sequenceNumber: uint64
    sourceChainSelector: uint64
    messageId: uint256
}

export const ReceiveExecutor_InitExecute = {
    PREFIX: 0x64cd2fd2,

    create(args: {
        gasOverride?: coins | null /* = null */
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
    }): ReceiveExecutor_InitExecute {
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_InitExecute {
        loadAndCheckPrefix32(s, 0x64cd2fd2, 'ReceiveExecutor_InitExecute');
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
            root: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            sourceChainSelector: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
        }
    },
    store(self: ReceiveExecutor_InitExecute, b: c.Builder): void {
        b.storeUint(0x64cd2fd2, 32);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
        b.storeAddress(self.root);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.messageId, 256);
    },
    toCell(self: ReceiveExecutor_InitExecute): c.Cell {
        return makeCellFrom<ReceiveExecutor_InitExecute>(self, ReceiveExecutor_InitExecute.store);
    }
}

/**
 > struct (0x00e5dd97) ReceiveExecutor_Confirm {
 >     receiver: address
 > }
 */
export interface ReceiveExecutor_Confirm {
    readonly $: 'ReceiveExecutor_Confirm'
    receiver: c.Address
}

export const ReceiveExecutor_Confirm = {
    PREFIX: 0x00e5dd97,

    create(args: {
        receiver: c.Address
    }): ReceiveExecutor_Confirm {
        return {
            $: 'ReceiveExecutor_Confirm',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_Confirm {
        loadAndCheckPrefix32(s, 0x00e5dd97, 'ReceiveExecutor_Confirm');
        return {
            $: 'ReceiveExecutor_Confirm',
            receiver: s.loadAddress(),
        }
    },
    store(self: ReceiveExecutor_Confirm, b: c.Builder): void {
        b.storeUint(0x00e5dd97, 32);
        b.storeAddress(self.receiver);
    },
    toCell(self: ReceiveExecutor_Confirm): c.Cell {
        return makeCellFrom<ReceiveExecutor_Confirm>(self, ReceiveExecutor_Confirm.store);
    }
}

/**
 > struct (0x05dee1bb) ReceiveExecutor_Bounced {
 >     receiver: address
 >     reason: ReceiveExecutor_BouncedReason
 > }
 */
export interface ReceiveExecutor_Bounced {
    readonly $: 'ReceiveExecutor_Bounced'
    receiver: c.Address
    reason: ReceiveExecutor_BouncedReason
}

export const ReceiveExecutor_Bounced = {
    PREFIX: 0x05dee1bb,

    create(args: {
        receiver: c.Address
        reason: ReceiveExecutor_BouncedReason
    }): ReceiveExecutor_Bounced {
        return {
            $: 'ReceiveExecutor_Bounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_Bounced {
        loadAndCheckPrefix32(s, 0x05dee1bb, 'ReceiveExecutor_Bounced');
        return {
            $: 'ReceiveExecutor_Bounced',
            receiver: s.loadAddress(),
            reason: ReceiveExecutor_BouncedReason.fromSlice(s),
        }
    },
    store(self: ReceiveExecutor_Bounced, b: c.Builder): void {
        b.storeUint(0x05dee1bb, 32);
        b.storeAddress(self.receiver);
        ReceiveExecutor_BouncedReason.store(self.reason, b);
    },
    toCell(self: ReceiveExecutor_Bounced): c.Cell {
        return makeCellFrom<ReceiveExecutor_Bounced>(self, ReceiveExecutor_Bounced.store);
    }
}

/**
 > enum ReceiveExecutor_BouncedReason { 3 variants }
 */
export type ReceiveExecutor_BouncedReason = bigint

export const ReceiveExecutor_BouncedReason = {
    NotEnoughGas: 0n,
    BouncedFromReceiver: 1n,
    BouncedFromRouter: 2n,

    fromSlice(s: c.Slice): ReceiveExecutor_BouncedReason {
        return s.loadUintBig(8);
    },
    store(self: ReceiveExecutor_BouncedReason, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: ReceiveExecutor_BouncedReason): c.Cell {
        return makeCellFrom<ReceiveExecutor_BouncedReason>(self, ReceiveExecutor_BouncedReason.store);
    }
}

/**
 > struct (0xfc69c50b) Router_RouteMessage {
 >     message: Cell<Any2TVMMessage>
 >     execId: ReceiveExecutorId
 >     receiver: address
 >     gasLimit: coins
 > }
 */
export interface Router_RouteMessage {
    readonly $: 'Router_RouteMessage'
    message: CellRef<Any2TVMMessage>
    execId: ReceiveExecutorId
    receiver: c.Address
    gasLimit: coins
}

export const Router_RouteMessage = {
    PREFIX: 0xfc69c50b,

    create(args: {
        message: CellRef<Any2TVMMessage>
        execId: ReceiveExecutorId
        receiver: c.Address
        gasLimit: coins
    }): Router_RouteMessage {
        return {
            $: 'Router_RouteMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RouteMessage {
        loadAndCheckPrefix32(s, 0xfc69c50b, 'Router_RouteMessage');
        return {
            $: 'Router_RouteMessage',
            message: loadCellRef<Any2TVMMessage>(s, Any2TVMMessage.fromSlice),
            execId: ReceiveExecutorId.fromSlice(s),
            receiver: s.loadAddress(),
            gasLimit: s.loadCoins(),
        }
    },
    store(self: Router_RouteMessage, b: c.Builder): void {
        b.storeUint(0xfc69c50b, 32);
        storeCellRef<Any2TVMMessage>(self.message, b, Any2TVMMessage.store);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.receiver);
        b.storeCoins(self.gasLimit);
    },
    toCell(self: Router_RouteMessage): c.Cell {
        return makeCellFrom<Router_RouteMessage>(self, Router_RouteMessage.store);
    }
}

/**
 > struct (0x9d431905) OffRamp_Commit {
 >     queryId: uint64
 >     reportContext: ReportContext
 >     report: CommitReport
 >     signatures: SnakedCell<SignatureEd25519>
 > }
 */
export interface OffRamp_Commit {
    readonly $: 'OffRamp_Commit'
    queryId: uint64
    reportContext: ReportContext
    report: CommitReport
    signatures: SnakedCell<SignatureEd25519>
}

export const OffRamp_Commit = {
    PREFIX: 0x9d431905,

    create(args: {
        queryId: uint64
        reportContext: ReportContext
        report: CommitReport
        signatures: SnakedCell<SignatureEd25519>
    }): OffRamp_Commit {
        return {
            $: 'OffRamp_Commit',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_Commit {
        loadAndCheckPrefix32(s, 0x9d431905, 'OffRamp_Commit');
        return {
            $: 'OffRamp_Commit',
            queryId: s.loadUintBig(64),
            reportContext: ReportContext.fromSlice(s),
            report: CommitReport.fromSlice(s),
            signatures: s.loadRef(),
        }
    },
    store(self: OffRamp_Commit, b: c.Builder): void {
        b.storeUint(0x9d431905, 32);
        b.storeUint(self.queryId, 64);
        ReportContext.store(self.reportContext, b);
        CommitReport.store(self.report, b);
        b.storeRef(self.signatures);
    },
    toCell(self: OffRamp_Commit): c.Cell {
        return makeCellFrom<OffRamp_Commit>(self, OffRamp_Commit.store);
    }
}

/**
 > struct (0x27bdac33) OffRamp_Execute {
 >     queryId: uint64
 >     reportContext: ReportContext
 >     report: ExecutionReport
 > }
 */
export interface OffRamp_Execute {
    readonly $: 'OffRamp_Execute'
    queryId: uint64
    reportContext: ReportContext
    report: ExecutionReport
}

export const OffRamp_Execute = {
    PREFIX: 0x27bdac33,

    create(args: {
        queryId: uint64
        reportContext: ReportContext
        report: ExecutionReport
    }): OffRamp_Execute {
        return {
            $: 'OffRamp_Execute',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_Execute {
        loadAndCheckPrefix32(s, 0x27bdac33, 'OffRamp_Execute');
        return {
            $: 'OffRamp_Execute',
            queryId: s.loadUintBig(64),
            reportContext: ReportContext.fromSlice(s),
            report: ExecutionReport.fromSlice(s),
        }
    },
    store(self: OffRamp_Execute, b: c.Builder): void {
        b.storeUint(0x27bdac33, 32);
        b.storeUint(self.queryId, 64);
        ReportContext.store(self.reportContext, b);
        ExecutionReport.store(self.report, b);
    },
    toCell(self: OffRamp_Execute): c.Cell {
        return makeCellFrom<OffRamp_Execute>(self, OffRamp_Execute.store);
    }
}

/**
 > struct (0xc73d5a8a) OffRamp_ExecuteValidated {
 >     message: Cell<Any2TVMRampMessage>
 >     root: MerkleRootId
 >     metadataHash: uint256
 >     gasOverride: coins?
 >     executionState: ExecutionState
 > }
 */
export interface OffRamp_ExecuteValidated {
    readonly $: 'OffRamp_ExecuteValidated'
    message: CellRef<Any2TVMRampMessage>
    root: MerkleRootId
    metadataHash: uint256
    gasOverride: coins | null
    executionState: ExecutionState
}

export const OffRamp_ExecuteValidated = {
    PREFIX: 0xc73d5a8a,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
        root: MerkleRootId
        metadataHash: uint256
        gasOverride: coins | null
        executionState: ExecutionState
    }): OffRamp_ExecuteValidated {
        return {
            $: 'OffRamp_ExecuteValidated',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_ExecuteValidated {
        loadAndCheckPrefix32(s, 0xc73d5a8a, 'OffRamp_ExecuteValidated');
        return {
            $: 'OffRamp_ExecuteValidated',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            root: MerkleRootId.fromSlice(s),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
            executionState: ExecutionState.fromSlice(s),
        }
    },
    store(self: OffRamp_ExecuteValidated, b: c.Builder): void {
        b.storeUint(0xc73d5a8a, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        MerkleRootId.store(self.root, b);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
        ExecutionState.store(self.executionState, b);
    },
    toCell(self: OffRamp_ExecuteValidated): c.Cell {
        return makeCellFrom<OffRamp_ExecuteValidated>(self, OffRamp_ExecuteValidated.store);
    }
}

/**
 > struct (0xa00785cf) OffRamp_ManuallyExecute {
 >     queryId: uint64
 >     report: ExecutionReport
 >     gasOverride: coins
 > }
 */
export interface OffRamp_ManuallyExecute {
    readonly $: 'OffRamp_ManuallyExecute'
    queryId: uint64
    report: ExecutionReport
    gasOverride: coins
}

export const OffRamp_ManuallyExecute = {
    PREFIX: 0xa00785cf,

    create(args: {
        queryId: uint64
        report: ExecutionReport
        gasOverride: coins
    }): OffRamp_ManuallyExecute {
        return {
            $: 'OffRamp_ManuallyExecute',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_ManuallyExecute {
        loadAndCheckPrefix32(s, 0xa00785cf, 'OffRamp_ManuallyExecute');
        return {
            $: 'OffRamp_ManuallyExecute',
            queryId: s.loadUintBig(64),
            report: ExecutionReport.fromSlice(s),
            gasOverride: s.loadCoins(),
        }
    },
    store(self: OffRamp_ManuallyExecute, b: c.Builder): void {
        b.storeUint(0xa00785cf, 32);
        b.storeUint(self.queryId, 64);
        ExecutionReport.store(self.report, b);
        b.storeCoins(self.gasOverride);
    },
    toCell(self: OffRamp_ManuallyExecute): c.Cell {
        return makeCellFrom<OffRamp_ManuallyExecute>(self, OffRamp_ManuallyExecute.store);
    }
}

/**
 > struct (0x22b4f05c) OffRamp_UpdateSourceChainConfigs {
 >     queryId: uint64
 >     configs: SnakedCell<SourceChainConfigUpdate>
 > }
 */
export interface OffRamp_UpdateSourceChainConfigs {
    readonly $: 'OffRamp_UpdateSourceChainConfigs'
    queryId: uint64
    configs: SnakedCell<SourceChainConfigUpdate>
}

export const OffRamp_UpdateSourceChainConfigs = {
    PREFIX: 0x22b4f05c,

    create(args: {
        queryId: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }): OffRamp_UpdateSourceChainConfigs {
        return {
            $: 'OffRamp_UpdateSourceChainConfigs',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_UpdateSourceChainConfigs {
        loadAndCheckPrefix32(s, 0x22b4f05c, 'OffRamp_UpdateSourceChainConfigs');
        return {
            $: 'OffRamp_UpdateSourceChainConfigs',
            queryId: s.loadUintBig(64),
            configs: s.loadRef(),
        }
    },
    store(self: OffRamp_UpdateSourceChainConfigs, b: c.Builder): void {
        b.storeUint(0x22b4f05c, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.configs);
    },
    toCell(self: OffRamp_UpdateSourceChainConfigs): c.Cell {
        return makeCellFrom<OffRamp_UpdateSourceChainConfigs>(self, OffRamp_UpdateSourceChainConfigs.store);
    }
}

/**
 > struct SourceChainConfigUpdate {
 >     sourceChainSelector: uint64
 >     config: SourceChainConfig
 > }
 */
export interface SourceChainConfigUpdate {
    readonly $: 'SourceChainConfigUpdate'
    sourceChainSelector: uint64
    config: SourceChainConfig
}

export const SourceChainConfigUpdate = {
    create(args: {
        sourceChainSelector: uint64
        config: SourceChainConfig
    }): SourceChainConfigUpdate {
        return {
            $: 'SourceChainConfigUpdate',
            ...args
        }
    },
    fromSlice(s: c.Slice): SourceChainConfigUpdate {
        return {
            $: 'SourceChainConfigUpdate',
            sourceChainSelector: s.loadUintBig(64),
            config: SourceChainConfig.fromSlice(s),
        }
    },
    store(self: SourceChainConfigUpdate, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        SourceChainConfig.store(self.config, b);
    },
    toCell(self: SourceChainConfigUpdate): c.Cell {
        return makeCellFrom<SourceChainConfigUpdate>(self, SourceChainConfigUpdate.store);
    }
}

/**
 > struct (0x58cfcb02) OffRamp_DispatchValidated {
 >     message: Cell<Any2TVMRampMessage>
 >     execId: uint192
 >     gasOverride: coins?
 > }
 */
export interface OffRamp_DispatchValidated {
    readonly $: 'OffRamp_DispatchValidated'
    message: CellRef<Any2TVMRampMessage>
    execId: uint192
    gasOverride: coins | null
}

export const OffRamp_DispatchValidated = {
    PREFIX: 0x58cfcb02,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
        execId: uint192
        gasOverride: coins | null
    }): OffRamp_DispatchValidated {
        return {
            $: 'OffRamp_DispatchValidated',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DispatchValidated {
        loadAndCheckPrefix32(s, 0x58cfcb02, 'OffRamp_DispatchValidated');
        return {
            $: 'OffRamp_DispatchValidated',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            execId: s.loadUintBig(192),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: OffRamp_DispatchValidated, b: c.Builder): void {
        b.storeUint(0x58cfcb02, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.execId, 192);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
    },
    toCell(self: OffRamp_DispatchValidated): c.Cell {
        return makeCellFrom<OffRamp_DispatchValidated>(self, OffRamp_DispatchValidated.store);
    }
}

/**
 > struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
 >     execId: ReceiveExecutorId
 >     receiver: address
 > }
 */
export interface OffRamp_CCIPReceiveConfirm {
    readonly $: 'OffRamp_CCIPReceiveConfirm'
    execId: ReceiveExecutorId
    receiver: c.Address
}

export const OffRamp_CCIPReceiveConfirm = {
    PREFIX: 0x28f4166f,

    create(args: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }): OffRamp_CCIPReceiveConfirm {
        return {
            $: 'OffRamp_CCIPReceiveConfirm',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_CCIPReceiveConfirm {
        loadAndCheckPrefix32(s, 0x28f4166f, 'OffRamp_CCIPReceiveConfirm');
        return {
            $: 'OffRamp_CCIPReceiveConfirm',
            execId: ReceiveExecutorId.fromSlice(s),
            receiver: s.loadAddress(),
        }
    },
    store(self: OffRamp_CCIPReceiveConfirm, b: c.Builder): void {
        b.storeUint(0x28f4166f, 32);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.receiver);
    },
    toCell(self: OffRamp_CCIPReceiveConfirm): c.Cell {
        return makeCellFrom<OffRamp_CCIPReceiveConfirm>(self, OffRamp_CCIPReceiveConfirm.store);
    }
}

/**
 > struct (0x2dcf2a43) OffRamp_CCIPReceiveBounced {
 >     execId: ReceiveExecutorId
 >     receiver: address
 > }
 */
export interface OffRamp_CCIPReceiveBounced {
    readonly $: 'OffRamp_CCIPReceiveBounced'
    execId: ReceiveExecutorId
    receiver: c.Address
}

export const OffRamp_CCIPReceiveBounced = {
    PREFIX: 0x2dcf2a43,

    create(args: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }): OffRamp_CCIPReceiveBounced {
        return {
            $: 'OffRamp_CCIPReceiveBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_CCIPReceiveBounced {
        loadAndCheckPrefix32(s, 0x2dcf2a43, 'OffRamp_CCIPReceiveBounced');
        return {
            $: 'OffRamp_CCIPReceiveBounced',
            execId: ReceiveExecutorId.fromSlice(s),
            receiver: s.loadAddress(),
        }
    },
    store(self: OffRamp_CCIPReceiveBounced, b: c.Builder): void {
        b.storeUint(0x2dcf2a43, 32);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.receiver);
    },
    toCell(self: OffRamp_CCIPReceiveBounced): c.Cell {
        return makeCellFrom<OffRamp_CCIPReceiveBounced>(self, OffRamp_CCIPReceiveBounced.store);
    }
}

/**
 > struct (0x59e56170) OffRamp_NotifySuccess {
 >     header: RampMessageHeader
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifySuccess {
    readonly $: 'OffRamp_NotifySuccess'
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifySuccess = {
    PREFIX: 0x59e56170,

    create(args: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifySuccess {
        return {
            $: 'OffRamp_NotifySuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifySuccess {
        loadAndCheckPrefix32(s, 0x59e56170, 'OffRamp_NotifySuccess');
        return {
            $: 'OffRamp_NotifySuccess',
            header: RampMessageHeader.fromSlice(s),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifySuccess, b: c.Builder): void {
        b.storeUint(0x59e56170, 32);
        RampMessageHeader.store(self.header, b);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.root);
    },
    toCell(self: OffRamp_NotifySuccess): c.Cell {
        return makeCellFrom<OffRamp_NotifySuccess>(self, OffRamp_NotifySuccess.store);
    }
}

/**
 > struct (0x177ebd03) OffRamp_NotifyFailure {
 >     header: RampMessageHeader
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifyFailure {
    readonly $: 'OffRamp_NotifyFailure'
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifyFailure = {
    PREFIX: 0x177ebd03,

    create(args: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifyFailure {
        return {
            $: 'OffRamp_NotifyFailure',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifyFailure {
        loadAndCheckPrefix32(s, 0x177ebd03, 'OffRamp_NotifyFailure');
        return {
            $: 'OffRamp_NotifyFailure',
            header: RampMessageHeader.fromSlice(s),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifyFailure, b: c.Builder): void {
        b.storeUint(0x177ebd03, 32);
        RampMessageHeader.store(self.header, b);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.root);
    },
    toCell(self: OffRamp_NotifyFailure): c.Cell {
        return makeCellFrom<OffRamp_NotifyFailure>(self, OffRamp_NotifyFailure.store);
    }
}

/**
 > struct (0x4ca1bcb3) OffRamp_UpdateCursedSubjects {
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface OffRamp_UpdateCursedSubjects {
    readonly $: 'OffRamp_UpdateCursedSubjects'
    cursedSubjects: CursedSubjects
}

export const OffRamp_UpdateCursedSubjects = {
    PREFIX: 0x4ca1bcb3,

    create(args: {
        cursedSubjects: CursedSubjects
    }): OffRamp_UpdateCursedSubjects {
        return {
            $: 'OffRamp_UpdateCursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_UpdateCursedSubjects {
        loadAndCheckPrefix32(s, 0x4ca1bcb3, 'OffRamp_UpdateCursedSubjects');
        return {
            $: 'OffRamp_UpdateCursedSubjects',
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: OffRamp_UpdateCursedSubjects, b: c.Builder): void {
        b.storeUint(0x4ca1bcb3, 32);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: OffRamp_UpdateCursedSubjects): c.Cell {
        return makeCellFrom<OffRamp_UpdateCursedSubjects>(self, OffRamp_UpdateCursedSubjects.store);
    }
}

/**
 > struct (0x95bc5a5c) OffRamp_SetDynamicConfig {
 >     queryId: uint64
 >     feeQuoter: address
 >     permissionlessExecutionThresholdSeconds: uint32
 > }
 */
export interface OffRamp_SetDynamicConfig {
    readonly $: 'OffRamp_SetDynamicConfig'
    queryId: uint64
    feeQuoter: c.Address
    permissionlessExecutionThresholdSeconds: uint32
}

export const OffRamp_SetDynamicConfig = {
    PREFIX: 0x95bc5a5c,

    create(args: {
        queryId: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
    }): OffRamp_SetDynamicConfig {
        return {
            $: 'OffRamp_SetDynamicConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_SetDynamicConfig {
        loadAndCheckPrefix32(s, 0x95bc5a5c, 'OffRamp_SetDynamicConfig');
        return {
            $: 'OffRamp_SetDynamicConfig',
            queryId: s.loadUintBig(64),
            feeQuoter: s.loadAddress(),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
        }
    },
    store(self: OffRamp_SetDynamicConfig, b: c.Builder): void {
        b.storeUint(0x95bc5a5c, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.feeQuoter);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
    },
    toCell(self: OffRamp_SetDynamicConfig): c.Cell {
        return makeCellFrom<OffRamp_SetDynamicConfig>(self, OffRamp_SetDynamicConfig.store);
    }
}

/**
 > struct (0xa015e0e2) OffRamp_UpdateDeployables {
 >     queryId: uint64
 >     receiveExecutorCode: cell?
 >     merkleRootCode: cell?
 > }
 */
export interface OffRamp_UpdateDeployables {
    readonly $: 'OffRamp_UpdateDeployables'
    queryId: uint64
    receiveExecutorCode: c.Cell | null
    merkleRootCode: c.Cell | null
}

export const OffRamp_UpdateDeployables = {
    PREFIX: 0xa015e0e2,

    create(args: {
        queryId: uint64
        receiveExecutorCode: c.Cell | null
        merkleRootCode: c.Cell | null
    }): OffRamp_UpdateDeployables {
        return {
            $: 'OffRamp_UpdateDeployables',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_UpdateDeployables {
        loadAndCheckPrefix32(s, 0xa015e0e2, 'OffRamp_UpdateDeployables');
        return {
            $: 'OffRamp_UpdateDeployables',
            queryId: s.loadUintBig(64),
            receiveExecutorCode: s.loadBoolean() ? s.loadRef() : null,
            merkleRootCode: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: OffRamp_UpdateDeployables, b: c.Builder): void {
        b.storeUint(0xa015e0e2, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.receiveExecutorCode, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.merkleRootCode, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: OffRamp_UpdateDeployables): c.Cell {
        return makeCellFrom<OffRamp_UpdateDeployables>(self, OffRamp_UpdateDeployables.store);
    }
}

/**
 > struct ExecutionReport {
 >     sourceChainSelector: uint64
 >     messages: cell
 >     offchainTokenData: cell
 >     proofs: SnakedCell<uint256>
 >     proofFlagBits: uint256
 > }
 */
export interface ExecutionReport {
    readonly $: 'ExecutionReport'
    sourceChainSelector: uint64
    messages: c.Cell
    offchainTokenData: c.Cell
    proofs: SnakedCell<uint256>
    proofFlagBits: uint256
}

export const ExecutionReport = {
    create(args: {
        sourceChainSelector: uint64
        messages: c.Cell
        offchainTokenData: c.Cell
        proofs: SnakedCell<uint256>
        proofFlagBits: uint256
    }): ExecutionReport {
        return {
            $: 'ExecutionReport',
            ...args
        }
    },
    fromSlice(s: c.Slice): ExecutionReport {
        return {
            $: 'ExecutionReport',
            sourceChainSelector: s.loadUintBig(64),
            messages: s.loadRef(),
            offchainTokenData: s.loadRef(),
            proofs: s.loadRef(),
            proofFlagBits: s.loadUintBig(256),
        }
    },
    store(self: ExecutionReport, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        b.storeRef(self.messages);
        b.storeRef(self.offchainTokenData);
        b.storeRef(self.proofs);
        b.storeUint(self.proofFlagBits, 256);
    },
    toCell(self: ExecutionReport): c.Cell {
        return makeCellFrom<ExecutionReport>(self, ExecutionReport.store);
    }
}

/**
 > struct CommitReport {
 >     priceUpdates: Cell<PriceUpdates>?
 >     merkleRoots: SnakedCell<MerkleRoot>
 > }
 */
export interface CommitReport {
    readonly $: 'CommitReport'
    priceUpdates: CellRef<PriceUpdates> | null
    merkleRoots: SnakedCell<MerkleRoot>
}

export const CommitReport = {
    create(args: {
        priceUpdates: CellRef<PriceUpdates> | null
        merkleRoots: SnakedCell<MerkleRoot>
    }): CommitReport {
        return {
            $: 'CommitReport',
            ...args
        }
    },
    fromSlice(s: c.Slice): CommitReport {
        return {
            $: 'CommitReport',
            priceUpdates: s.loadBoolean() ? loadCellRef<PriceUpdates>(s, PriceUpdates.fromSlice) : null,
            merkleRoots: s.loadRef(),
        }
    },
    store(self: CommitReport, b: c.Builder): void {
        storeTolkNullable<CellRef<PriceUpdates>>(self.priceUpdates, b,
            (v,b) => storeCellRef<PriceUpdates>(v, b, PriceUpdates.store)
        );
        b.storeRef(self.merkleRoots);
    },
    toCell(self: CommitReport): c.Cell {
        return makeCellFrom<CommitReport>(self, CommitReport.store);
    }
}

/**
 > struct DeployableHashes {
 >     merkleRoot: uint256
 >     receiveExecutor: uint256
 >     deployer: uint256
 > }
 */
export interface DeployableHashes {
    readonly $: 'DeployableHashes'
    merkleRoot: uint256
    receiveExecutor: uint256
    deployer: uint256
}

export const DeployableHashes = {
    create(args: {
        merkleRoot: uint256
        receiveExecutor: uint256
        deployer: uint256
    }): DeployableHashes {
        return {
            $: 'DeployableHashes',
            ...args
        }
    },
    fromSlice(s: c.Slice): DeployableHashes {
        return {
            $: 'DeployableHashes',
            merkleRoot: s.loadUintBig(256),
            receiveExecutor: s.loadUintBig(256),
            deployer: s.loadUintBig(256),
        }
    },
    store(self: DeployableHashes, b: c.Builder): void {
        b.storeUint(self.merkleRoot, 256);
        b.storeUint(self.receiveExecutor, 256);
        b.storeUint(self.deployer, 256);
    },
    toCell(self: DeployableHashes): c.Cell {
        return makeCellFrom<DeployableHashes>(self, DeployableHashes.store);
    }
}

/**
 > struct Config {
 >     chainSelector: uint64
 >     feeQuoter: address
 >     permissionlessExecutionThresholdSeconds: uint32
 > }
 */
export interface Config {
    readonly $: 'Config'
    chainSelector: uint64
    feeQuoter: c.Address
    permissionlessExecutionThresholdSeconds: uint32
}

export const Config = {
    create(args: {
        chainSelector: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
    }): Config {
        return {
            $: 'Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): Config {
        return {
            $: 'Config',
            chainSelector: s.loadUintBig(64),
            feeQuoter: s.loadAddress(),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
        }
    },
    store(self: Config, b: c.Builder): void {
        b.storeUint(self.chainSelector, 64);
        b.storeAddress(self.feeQuoter);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
    },
    toCell(self: Config): c.Cell {
        return makeCellFrom<Config>(self, Config.store);
    }
}

/**
 > struct SourceChainConfig {
 >     router: address
 >     isEnabled: bool
 >     minSeqNr: uint64
 >     isRMNVerificationDisabled: bool
 >     onRamp: CrossChainAddress
 > }
 */
export interface SourceChainConfig {
    readonly $: 'SourceChainConfig'
    router: c.Address
    isEnabled: boolean
    minSeqNr: uint64
    isRMNVerificationDisabled: boolean
    onRamp: CrossChainAddress
}

export const SourceChainConfig = {
    create(args: {
        router: c.Address
        isEnabled: boolean
        minSeqNr: uint64
        isRMNVerificationDisabled: boolean
        onRamp: CrossChainAddress
    }): SourceChainConfig {
        return {
            $: 'SourceChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): SourceChainConfig {
        return {
            $: 'SourceChainConfig',
            router: s.loadAddress(),
            isEnabled: s.loadBoolean(),
            minSeqNr: s.loadUintBig(64),
            isRMNVerificationDisabled: s.loadBoolean(),
            onRamp: CrossChainAddress.fromSlice(s),
        }
    },
    store(self: SourceChainConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeBit(self.isEnabled);
        b.storeUint(self.minSeqNr, 64);
        b.storeBit(self.isRMNVerificationDisabled);
        CrossChainAddress.store(self.onRamp, b);
    },
    toCell(self: SourceChainConfig): c.Cell {
        return makeCellFrom<SourceChainConfig>(self, SourceChainConfig.store);
    }
}

/**
 > struct Any2TVMRampMessage {
 >     header: RampMessageHeader
 >     sender: Cell<CrossChainAddress>
 >     data: cell
 >     receiver: address
 >     gasLimit: coins
 >     tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?
 > }
 */
export interface Any2TVMRampMessage {
    readonly $: 'Any2TVMRampMessage'
    header: RampMessageHeader
    sender: CellRef<CrossChainAddress>
    data: c.Cell
    receiver: c.Address
    gasLimit: coins
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
}

export const Any2TVMRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: CellRef<CrossChainAddress>
        data: c.Cell
        receiver: c.Address
        gasLimit: coins
        tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
    }): Any2TVMRampMessage {
        return {
            $: 'Any2TVMRampMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMRampMessage {
        return {
            $: 'Any2TVMRampMessage',
            header: RampMessageHeader.fromSlice(s),
            sender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            data: s.loadRef(),
            receiver: s.loadAddress(),
            gasLimit: s.loadCoins(),
            tokenAmounts: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: Any2TVMRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        storeCellRef<CrossChainAddress>(self.sender, b, CrossChainAddress.store);
        b.storeRef(self.data);
        b.storeAddress(self.receiver);
        b.storeCoins(self.gasLimit);
        storeTolkNullable<SnakedCell<Any2TVMTokenTransfer>>(self.tokenAmounts, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: Any2TVMRampMessage): c.Cell {
        return makeCellFrom<Any2TVMRampMessage>(self, Any2TVMRampMessage.store);
    }
}

/**
 > struct MerkleRoot {
 >     sourceChainSelector: uint64
 >     onRampAddress: CrossChainAddress
 >     minSeqNr: uint64
 >     maxSeqNr: uint64
 >     merkleRoot: uint256
 > }
 */
export interface MerkleRoot {
    readonly $: 'MerkleRoot'
    sourceChainSelector: uint64
    onRampAddress: CrossChainAddress
    minSeqNr: uint64
    maxSeqNr: uint64
    merkleRoot: uint256
}

export const MerkleRoot = {
    create(args: {
        sourceChainSelector: uint64
        onRampAddress: CrossChainAddress
        minSeqNr: uint64
        maxSeqNr: uint64
        merkleRoot: uint256
    }): MerkleRoot {
        return {
            $: 'MerkleRoot',
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot {
        return {
            $: 'MerkleRoot',
            sourceChainSelector: s.loadUintBig(64),
            onRampAddress: CrossChainAddress.fromSlice(s),
            minSeqNr: s.loadUintBig(64),
            maxSeqNr: s.loadUintBig(64),
            merkleRoot: s.loadUintBig(256),
        }
    },
    store(self: MerkleRoot, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        CrossChainAddress.store(self.onRampAddress, b);
        b.storeUint(self.minSeqNr, 64);
        b.storeUint(self.maxSeqNr, 64);
        b.storeUint(self.merkleRoot, 256);
    },
    toCell(self: MerkleRoot): c.Cell {
        return makeCellFrom<MerkleRoot>(self, MerkleRoot.store);
    }
}

/**
 > struct Any2TVMTokenTransfer {
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     destPoolAddress: address
 >     destGasAmount: uint32
 >     extraData: cell
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CellRef<CrossChainAddress>
    destPoolAddress: c.Address
    destGasAmount: uint32
    extraData: c.Cell
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CellRef<CrossChainAddress>
        destPoolAddress: c.Address
        destGasAmount: uint32
        extraData: c.Cell
        amount: uint256
    }): Any2TVMTokenTransfer {
        return {
            $: 'Any2TVMTokenTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMTokenTransfer {
        return {
            $: 'Any2TVMTokenTransfer',
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            destPoolAddress: s.loadAddress(),
            destGasAmount: s.loadUintBig(32),
            extraData: s.loadRef(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.destPoolAddress);
        b.storeUint(self.destGasAmount, 32);
        b.storeRef(self.extraData);
        b.storeUint(self.amount, 256);
    },
    toCell(self: Any2TVMTokenTransfer): c.Cell {
        return makeCellFrom<Any2TVMTokenTransfer>(self, Any2TVMTokenTransfer.store);
    }
}

/**
 > struct OffRamp_Deployables {
 >     rmnRouter: address
 >     deployer: cell
 >     merkleRootCode: cell
 >     receiveExecutorCode: cell
 > }
 */
export interface OffRamp_Deployables {
    readonly $: 'OffRamp_Deployables'
    rmnRouter: c.Address
    deployer: c.Cell
    merkleRootCode: c.Cell
    receiveExecutorCode: c.Cell
}

export const OffRamp_Deployables = {
    create(args: {
        rmnRouter: c.Address
        deployer: c.Cell
        merkleRootCode: c.Cell
        receiveExecutorCode: c.Cell
    }): OffRamp_Deployables {
        return {
            $: 'OffRamp_Deployables',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_Deployables {
        return {
            $: 'OffRamp_Deployables',
            rmnRouter: s.loadAddress(),
            deployer: s.loadRef(),
            merkleRootCode: s.loadRef(),
            receiveExecutorCode: s.loadRef(),
        }
    },
    store(self: OffRamp_Deployables, b: c.Builder): void {
        b.storeAddress(self.rmnRouter);
        b.storeRef(self.deployer);
        b.storeRef(self.merkleRootCode);
        b.storeRef(self.receiveExecutorCode);
    },
    toCell(self: OffRamp_Deployables): c.Cell {
        return makeCellFrom<OffRamp_Deployables>(self, OffRamp_Deployables.store);
    }
}

/**
 > type ReceiveExecutorId = uint192
 */
export type ReceiveExecutorId = uint192

export const ReceiveExecutorId = {
    fromSlice(s: c.Slice): ReceiveExecutorId {
        return s.loadUintBig(192);
    },
    store(self: ReceiveExecutorId, b: c.Builder): void {
        b.storeUint(self, 192);
    },
    toCell(self: ReceiveExecutorId): c.Cell {
        return makeCellFrom<ReceiveExecutorId>(self, ReceiveExecutorId.store);
    }
}

/**
 > type MerkleRootId = uint256
 */
export type MerkleRootId = uint256

export const MerkleRootId = {
    fromSlice(s: c.Slice): MerkleRootId {
        return s.loadUintBig(256);
    },
    store(self: MerkleRootId, b: c.Builder): void {
        b.storeUint(self, 256);
    },
    toCell(self: MerkleRootId): c.Cell {
        return makeCellFrom<MerkleRootId>(self, MerkleRootId.store);
    }
}

/**
 > enum ExecutionState { 4 variants }
 */
export type ExecutionState = bigint

export const ExecutionState = {
    Untouched: 0n,
    InProgress: 1n,
    Success: 2n,
    Failure: 3n,

    fromSlice(s: c.Slice): ExecutionState {
        return s.loadUintBig(8);
    },
    store(self: ExecutionState, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: ExecutionState): c.Cell {
        return makeCellFrom<ExecutionState>(self, ExecutionState.store);
    }
}

/**
 > struct Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     deployables: Cell<OffRamp_Deployables>
 >     feeQuoter: address
 >     ocr3Base: Cell<OCR3Base>
 >     cursedSubjects: CursedSubjects
 >     chainSelector: uint64
 >     permissionlessExecutionThresholdSeconds: uint32
 >     sourceChainConfigs: map<uint64, SourceChainConfig>
 >     latestPriceSequenceNumber: uint64
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint32
    ownable: Ownable2Step
    deployables: CellRef<OffRamp_Deployables>
    feeQuoter: c.Address
    ocr3Base: CellRef<OCR3Base>
    cursedSubjects: CursedSubjects
    chainSelector: uint64
    permissionlessExecutionThresholdSeconds: uint32
    sourceChainConfigs: c.Dictionary<uint64, SourceChainConfig>
    latestPriceSequenceNumber: uint64
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        deployables: CellRef<OffRamp_Deployables>
        feeQuoter: c.Address
        ocr3Base: CellRef<OCR3Base>
        cursedSubjects: CursedSubjects
        chainSelector: uint64
        permissionlessExecutionThresholdSeconds: uint32
        sourceChainConfigs: c.Dictionary<uint64, SourceChainConfig>
        latestPriceSequenceNumber: uint64
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
            deployables: loadCellRef<OffRamp_Deployables>(s, OffRamp_Deployables.fromSlice),
            feeQuoter: s.loadAddress(),
            ocr3Base: loadCellRef<OCR3Base>(s, OCR3Base.fromSlice),
            cursedSubjects: CursedSubjects.fromSlice(s),
            chainSelector: s.loadUintBig(64),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            sourceChainConfigs: c.Dictionary.load<uint64, SourceChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store), s),
            latestPriceSequenceNumber: s.loadUintBig(64),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        storeCellRef<OffRamp_Deployables>(self.deployables, b, OffRamp_Deployables.store);
        b.storeAddress(self.feeQuoter);
        storeCellRef<OCR3Base>(self.ocr3Base, b, OCR3Base.store);
        CursedSubjects.store(self.cursedSubjects, b);
        b.storeUint(self.chainSelector, 64);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeDict<uint64, SourceChainConfig>(self.sourceChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store));
        b.storeUint(self.latestPriceSequenceNumber, 64);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct ExecutionStateChanged {
 >     sourceChainSelector: uint64
 >     sequenceNumber: uint64
 >     messageId: uint256
 >     state: ExecutionState
 > }
 */
export interface ExecutionStateChanged {
    readonly $: 'ExecutionStateChanged'
    sourceChainSelector: uint64
    sequenceNumber: uint64
    messageId: uint256
    state: ExecutionState
}

export const ExecutionStateChanged = {
    create(args: {
        sourceChainSelector: uint64
        sequenceNumber: uint64
        messageId: uint256
        state: ExecutionState
    }): ExecutionStateChanged {
        return {
            $: 'ExecutionStateChanged',
            ...args
        }
    },
    fromSlice(s: c.Slice): ExecutionStateChanged {
        return {
            $: 'ExecutionStateChanged',
            sourceChainSelector: s.loadUintBig(64),
            sequenceNumber: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
            state: ExecutionState.fromSlice(s),
        }
    },
    store(self: ExecutionStateChanged, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.messageId, 256);
        ExecutionState.store(self.state, b);
    },
    toCell(self: ExecutionStateChanged): c.Cell {
        return makeCellFrom<ExecutionStateChanged>(self, ExecutionStateChanged.store);
    }
}

/**
 > struct CommitReportAccepted {
 >     merkleRoot: MerkleRoot?
 >     priceUpdates: Cell<PriceUpdates>?
 > }
 */
export interface CommitReportAccepted {
    readonly $: 'CommitReportAccepted'
    merkleRoot: MerkleRoot | null
    priceUpdates: CellRef<PriceUpdates> | null
}

export const CommitReportAccepted = {
    create(args: {
        merkleRoot: MerkleRoot | null
        priceUpdates: CellRef<PriceUpdates> | null
    }): CommitReportAccepted {
        return {
            $: 'CommitReportAccepted',
            ...args
        }
    },
    fromSlice(s: c.Slice): CommitReportAccepted {
        return {
            $: 'CommitReportAccepted',
            merkleRoot: s.loadBoolean() ? MerkleRoot.fromSlice(s) : null,
            priceUpdates: s.loadBoolean() ? loadCellRef<PriceUpdates>(s, PriceUpdates.fromSlice) : null,
        }
    },
    store(self: CommitReportAccepted, b: c.Builder): void {
        storeTolkNullable<MerkleRoot>(self.merkleRoot, b, MerkleRoot.store);
        storeTolkNullable<CellRef<PriceUpdates>>(self.priceUpdates, b,
            (v,b) => storeCellRef<PriceUpdates>(v, b, PriceUpdates.store)
        );
    },
    toCell(self: CommitReportAccepted): c.Cell {
        return makeCellFrom<CommitReportAccepted>(self, CommitReportAccepted.store);
    }
}

/**
 > struct SourceChainSelectorAdded {
 >     sourceChainSelector: uint64
 > }
 */
export interface SourceChainSelectorAdded {
    readonly $: 'SourceChainSelectorAdded'
    sourceChainSelector: uint64
}

export const SourceChainSelectorAdded = {
    create(args: {
        sourceChainSelector: uint64
    }): SourceChainSelectorAdded {
        return {
            $: 'SourceChainSelectorAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): SourceChainSelectorAdded {
        return {
            $: 'SourceChainSelectorAdded',
            sourceChainSelector: s.loadUintBig(64),
        }
    },
    store(self: SourceChainSelectorAdded, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
    },
    toCell(self: SourceChainSelectorAdded): c.Cell {
        return makeCellFrom<SourceChainSelectorAdded>(self, SourceChainSelectorAdded.store);
    }
}

/**
 > struct SourceChainConfigUpdated {
 >     sourceChainSelector: uint64
 >     sourceChainConfig: SourceChainConfig
 > }
 */
export interface SourceChainConfigUpdated {
    readonly $: 'SourceChainConfigUpdated'
    sourceChainSelector: uint64
    sourceChainConfig: SourceChainConfig
}

export const SourceChainConfigUpdated = {
    create(args: {
        sourceChainSelector: uint64
        sourceChainConfig: SourceChainConfig
    }): SourceChainConfigUpdated {
        return {
            $: 'SourceChainConfigUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): SourceChainConfigUpdated {
        return {
            $: 'SourceChainConfigUpdated',
            sourceChainSelector: s.loadUintBig(64),
            sourceChainConfig: SourceChainConfig.fromSlice(s),
        }
    },
    store(self: SourceChainConfigUpdated, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        SourceChainConfig.store(self.sourceChainConfig, b);
    },
    toCell(self: SourceChainConfigUpdated): c.Cell {
        return makeCellFrom<SourceChainConfigUpdated>(self, SourceChainConfigUpdated.store);
    }
}

/**
 > struct OffRamp_DynamicConfigSet {
 >     feeQuoter: address
 >     permissionlessExecutionThresholdSeconds: uint32
 > }
 */
export interface OffRamp_DynamicConfigSet {
    readonly $: 'OffRamp_DynamicConfigSet'
    feeQuoter: c.Address
    permissionlessExecutionThresholdSeconds: uint32
}

export const OffRamp_DynamicConfigSet = {
    create(args: {
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
    }): OffRamp_DynamicConfigSet {
        return {
            $: 'OffRamp_DynamicConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DynamicConfigSet {
        return {
            $: 'OffRamp_DynamicConfigSet',
            feeQuoter: s.loadAddress(),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
        }
    },
    store(self: OffRamp_DynamicConfigSet, b: c.Builder): void {
        b.storeAddress(self.feeQuoter);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
    },
    toCell(self: OffRamp_DynamicConfigSet): c.Cell {
        return makeCellFrom<OffRamp_DynamicConfigSet>(self, OffRamp_DynamicConfigSet.store);
    }
}

/**
 > struct OffRamp_ReceiveExecutorInitExecuteBounced {
 >     receiveExecutor: address
 >     root: address
 >     sequenceNumber: uint64
 > }
 */
export interface OffRamp_ReceiveExecutorInitExecuteBounced {
    readonly $: 'OffRamp_ReceiveExecutorInitExecuteBounced'
    receiveExecutor: c.Address
    root: c.Address
    sequenceNumber: uint64
}

export const OffRamp_ReceiveExecutorInitExecuteBounced = {
    create(args: {
        receiveExecutor: c.Address
        root: c.Address
        sequenceNumber: uint64
    }): OffRamp_ReceiveExecutorInitExecuteBounced {
        return {
            $: 'OffRamp_ReceiveExecutorInitExecuteBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_ReceiveExecutorInitExecuteBounced {
        return {
            $: 'OffRamp_ReceiveExecutorInitExecuteBounced',
            receiveExecutor: s.loadAddress(),
            root: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
        }
    },
    store(self: OffRamp_ReceiveExecutorInitExecuteBounced, b: c.Builder): void {
        b.storeAddress(self.receiveExecutor);
        b.storeAddress(self.root);
        b.storeUint(self.sequenceNumber, 64);
    },
    toCell(self: OffRamp_ReceiveExecutorInitExecuteBounced): c.Cell {
        return makeCellFrom<OffRamp_ReceiveExecutorInitExecuteBounced>(self, OffRamp_ReceiveExecutorInitExecuteBounced.store);
    }
}

/**
 > struct OffRamp_DeployableInitializeBounced {
 >     deployableAddress: address
 > }
 */
export interface OffRamp_DeployableInitializeBounced {
    readonly $: 'OffRamp_DeployableInitializeBounced'
    deployableAddress: c.Address
}

export const OffRamp_DeployableInitializeBounced = {
    create(args: {
        deployableAddress: c.Address
    }): OffRamp_DeployableInitializeBounced {
        return {
            $: 'OffRamp_DeployableInitializeBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DeployableInitializeBounced {
        return {
            $: 'OffRamp_DeployableInitializeBounced',
            deployableAddress: s.loadAddress(),
        }
    },
    store(self: OffRamp_DeployableInitializeBounced, b: c.Builder): void {
        b.storeAddress(self.deployableAddress);
    },
    toCell(self: OffRamp_DeployableInitializeBounced): c.Cell {
        return makeCellFrom<OffRamp_DeployableInitializeBounced>(self, OffRamp_DeployableInitializeBounced.store);
    }
}

/**
 > struct OffRamp_RouteMessageBounced {
 >     router: address
 >     execId: uint192
 > }
 */
export interface OffRamp_RouteMessageBounced {
    readonly $: 'OffRamp_RouteMessageBounced'
    router: c.Address
    execId: uint192
}

export const OffRamp_RouteMessageBounced = {
    create(args: {
        router: c.Address
        execId: uint192
    }): OffRamp_RouteMessageBounced {
        return {
            $: 'OffRamp_RouteMessageBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_RouteMessageBounced {
        return {
            $: 'OffRamp_RouteMessageBounced',
            router: s.loadAddress(),
            execId: s.loadUintBig(192),
        }
    },
    store(self: OffRamp_RouteMessageBounced, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeUint(self.execId, 192);
    },
    toCell(self: OffRamp_RouteMessageBounced): c.Cell {
        return makeCellFrom<OffRamp_RouteMessageBounced>(self, OffRamp_RouteMessageBounced.store);
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

// ————————————————————————————————————————————
//    class OffRamp
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

export class OffRamp implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'MerkleMultiProof_Error.InvalidProofLeavesCannotBeEmpty': 12000,
        'MerkleMultiProof_Error.InvalidProofLeavesTooLarge': 12001,
        'MerkleMultiProof_Error.InvalidProofProofsTooLarge': 12002,
        'MerkleMultiProof_Error.InvalidProofTotalHashesExceededMax': 12003,
        'MerkleMultiProof_Error.InvalidProofDataSizeMismatch': 12004,
        'Utils_Error.InvalidData': 13500,
        'Utils_Error.BitmapOutOfBounds': 13501,
        'Upgradeable_Error.VersionMismatch': 19900,
        'Error.MessageNotFromOwnedContract': 22100,
        'Error.SourceChainNotEnabled': 22101,
        'Error.EmptyExecutionReport': 22102,
        'Error.InvalidMessageDestChainSelector': 22103,
        'Error.SourceChainSelectorMismatch': 22104,
        'Error.InvalidOnRampUpdate': 22105,
        'Error.InsufficientFee': 22106,
        'Error.SubjectCursed': 22107,
        'Error.Unauthorized': 22108,
        'Error.TooManyMessagesInReport': 22110,
        'Error.SignatureVerificationRequiredInCommitPlugin': 22111,
        'Error.SignatureVerificationNotAllowedInExecutionPlugin': 22112,
        'Error.InvalidInterval': 22113,
        'Error.BatchingNotSupported': 22114,
        'Error.OnRampAddressMismatch': 22115,
        'Error.EmptyCommitReport': 22116,
        'Error.MerkleRootCannotBeZero': 22117,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'MultiOCR3Base_Error.BigFMustBePositive': 54500,
        'MultiOCR3Base_Error.StaticConfigCannotBeChanged': 54501,
        'MultiOCR3Base_Error.TooManySigners': 54502,
        'MultiOCR3Base_Error.BigFTooHigh': 54503,
        'MultiOCR3Base_Error.TooManyTransmitters': 54504,
        'MultiOCR3Base_Error.NoTransmitters': 54505,
        'MultiOCR3Base_Error.RepeatedSigners': 54506,
        'MultiOCR3Base_Error.RepeatedTransmitters': 54507,
        'MultiOCR3Base_Error.ConfigDigestMismatch': 54508,
        'MultiOCR3Base_Error.UnauthorizedTransmitter': 54509,
        'MultiOCR3Base_Error.WrongNumberOfSignatures': 54510,
        'MultiOCR3Base_Error.UnauthorizedSigner': 54511,
        'MultiOCR3Base_Error.NonUniqueSignatures': 54512,
        'MultiOCR3Base_Error.InvalidSignature': 54513,
        'MultiOCR3Base_Error.NonExistentOcrPluginType': 54514,
        'MultiOCR3Base_Error.NoSigners': 54515,
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
            throw new Error(`Custom pack/unpack for 'OffRamp.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new OffRamp(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        deployables: CellRef<OffRamp_Deployables>
        feeQuoter: c.Address
        ocr3Base: CellRef<OCR3Base>
        cursedSubjects: CursedSubjects
        chainSelector: uint64
        permissionlessExecutionThresholdSeconds: uint32
        sourceChainConfigs: c.Dictionary<uint64, SourceChainConfig>
        latestPriceSequenceNumber: uint64
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OffRamp.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OffRamp(address, initialState);
    }

    static createCellOfOffRampCommit(body: {
        queryId: uint64
        reportContext: ReportContext
        report: CommitReport
        signatures: SnakedCell<SignatureEd25519>
    }) {
        return OffRamp_Commit.toCell(OffRamp_Commit.create(body));
    }

    static createCellOfOffRampExecute(body: {
        queryId: uint64
        reportContext: ReportContext
        report: ExecutionReport
    }) {
        return OffRamp_Execute.toCell(OffRamp_Execute.create(body));
    }

    static createCellOfOffRampExecuteValidated(body: {
        message: CellRef<Any2TVMRampMessage>
        root: MerkleRootId
        metadataHash: uint256
        gasOverride: coins | null
        executionState: ExecutionState
    }) {
        return OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body));
    }

    static createCellOfOffRampManuallyExecute(body: {
        queryId: uint64
        report: ExecutionReport
        gasOverride: coins
    }) {
        return OffRamp_ManuallyExecute.toCell(OffRamp_ManuallyExecute.create(body));
    }

    static createCellOfOffRampDispatchValidated(body: {
        message: CellRef<Any2TVMRampMessage>
        execId: uint192
        gasOverride: coins | null
    }) {
        return OffRamp_DispatchValidated.toCell(OffRamp_DispatchValidated.create(body));
    }

    static createCellOfOffRampUpdateSourceChainConfigs(body: {
        queryId: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }) {
        return OffRamp_UpdateSourceChainConfigs.toCell(OffRamp_UpdateSourceChainConfigs.create(body));
    }

    static createCellOfOffRampCCIPReceiveConfirm(body: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }) {
        return OffRamp_CCIPReceiveConfirm.toCell(OffRamp_CCIPReceiveConfirm.create(body));
    }

    static createCellOfOffRampCCIPReceiveBounced(body: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }) {
        return OffRamp_CCIPReceiveBounced.toCell(OffRamp_CCIPReceiveBounced.create(body));
    }

    static createCellOfOffRampNotifyFailure(body: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }) {
        return OffRamp_NotifyFailure.toCell(OffRamp_NotifyFailure.create(body));
    }

    static createCellOfOffRampNotifySuccess(body: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }) {
        return OffRamp_NotifySuccess.toCell(OffRamp_NotifySuccess.create(body));
    }

    static createCellOfOffRampUpdateCursedSubjects(body: {
        cursedSubjects: CursedSubjects
    }) {
        return OffRamp_UpdateCursedSubjects.toCell(OffRamp_UpdateCursedSubjects.create(body));
    }

    static createCellOfOffRampSetDynamicConfig(body: {
        queryId: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
    }) {
        return OffRamp_SetDynamicConfig.toCell(OffRamp_SetDynamicConfig.create(body));
    }

    static createCellOfOCR3BaseSetOCR3Config(body: {
        queryId: uint64
        configDigest: uint256
        ocrPluginType: uint16
        bigF: uint8
        isSignatureVerificationEnabled: boolean
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
    }) {
        return OCR3Base_SetOCR3Config.toCell(OCR3Base_SetOCR3Config.create(body));
    }

    static createCellOfOffRampUpdateDeployables(body: {
        queryId: uint64
        receiveExecutorCode: c.Cell | null
        merkleRootCode: c.Cell | null
    }) {
        return OffRamp_UpdateDeployables.toCell(OffRamp_UpdateDeployables.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
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

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendOffRampCommit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        reportContext: ReportContext
        report: CommitReport
        signatures: SnakedCell<SignatureEd25519>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_Commit.toCell(OffRamp_Commit.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        reportContext: ReportContext
        report: ExecutionReport
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_Execute.toCell(OffRamp_Execute.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampExecuteValidated(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: CellRef<Any2TVMRampMessage>
        root: MerkleRootId
        metadataHash: uint256
        gasOverride: coins | null
        executionState: ExecutionState
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampManuallyExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        report: ExecutionReport
        gasOverride: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ManuallyExecute.toCell(OffRamp_ManuallyExecute.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampDispatchValidated(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: CellRef<Any2TVMRampMessage>
        execId: uint192
        gasOverride: coins | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_DispatchValidated.toCell(OffRamp_DispatchValidated.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampUpdateSourceChainConfigs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_UpdateSourceChainConfigs.toCell(OffRamp_UpdateSourceChainConfigs.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampCCIPReceiveConfirm(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_CCIPReceiveConfirm.toCell(OffRamp_CCIPReceiveConfirm.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampCCIPReceiveBounced(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        execId: ReceiveExecutorId
        receiver: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_CCIPReceiveBounced.toCell(OffRamp_CCIPReceiveBounced.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampNotifyFailure(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_NotifyFailure.toCell(OffRamp_NotifyFailure.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampNotifySuccess(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_NotifySuccess.toCell(OffRamp_NotifySuccess.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampUpdateCursedSubjects(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        cursedSubjects: CursedSubjects
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_UpdateCursedSubjects.toCell(OffRamp_UpdateCursedSubjects.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampSetDynamicConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_SetDynamicConfig.toCell(OffRamp_SetDynamicConfig.create(body)),
            ...extraOptions
        });
    }

    async sendOCR3BaseSetOCR3Config(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        configDigest: uint256
        ocrPluginType: uint16
        bigF: uint8
        isSignatureVerificationEnabled: boolean
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OCR3Base_SetOCR3Config.toCell(OCR3Base_SetOCR3Config.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampUpdateDeployables(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        receiveExecutorCode: c.Cell | null
        merkleRootCode: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_UpdateDeployables.toCell(OffRamp_UpdateDeployables.create(body)),
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

    async getLatestPriceSequenceNumber(provider: ContractProvider): Promise<uint64> {
        const r = StackReader.fromGetMethod(1, await provider.get('latestPriceSequenceNumber', []));
        return r.readBigInt();
    }

    async getSourceChainSelectors(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('sourceChainSelectors', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
    }

    async getOcr3Config(provider: ContractProvider): Promise<OCR3Base> {
        const r = StackReader.fromGetMethod(3, await provider.get('ocr3Config', []));
        return ({
            $: 'OCR3Base',
            chainId: r.readBigInt(),
            commit: r.readNullable<CellRef<OCRConfig>>(
                (r) => r.readCellRef<OCRConfig>(OCRConfig.fromSlice)
            ),
            execute: r.readNullable<CellRef<OCRConfig>>(
                (r) => r.readCellRef<OCRConfig>(OCRConfig.fromSlice)
            ),
        });
    }

    async getConfig(provider: ContractProvider): Promise<Config> {
        const r = StackReader.fromGetMethod(3, await provider.get('config', []));
        return ({
            $: 'Config',
            chainSelector: r.readBigInt(),
            feeQuoter: r.readSlice().loadAddress(),
            permissionlessExecutionThresholdSeconds: r.readBigInt(),
        });
    }

    async getSourceChainConfig(provider: ContractProvider, sourceChainSelector: uint64): Promise<SourceChainConfig> {
        const r = StackReader.fromGetMethod(5, await provider.get('sourceChainConfig', [
            { type: 'int', value: sourceChainSelector },
        ]));
        return ({
            $: 'SourceChainConfig',
            router: r.readSlice().loadAddress(),
            isEnabled: r.readBoolean(),
            minSeqNr: r.readBigInt(),
            isRMNVerificationDisabled: r.readBoolean(),
            onRamp: r.readSlice(),
        });
    }

    async getAllSourceChainConfigs(provider: ContractProvider): Promise<c.Dictionary<uint64, SourceChainConfig>> {
        const r = StackReader.fromGetMethod(1, await provider.get('allSourceChainConfigs', []));
        return r.readDictionary<uint64, SourceChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store));
    }

    async getVerifyNotCursed(provider: ContractProvider, subject: uint128): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('verifyNotCursed', [
            { type: 'int', value: subject },
        ]));
        return r.readBoolean();
    }

    async getCursedSubjects(provider: ContractProvider): Promise<lisp_list<uint128>> {
        const r = StackReader.fromGetMethod(1, await provider.get('cursedSubjects', []));
        return r.readLispListOf<uint128>(
            (r) => r.readBigInt()
        );
    }

    async getDeployableHashes(provider: ContractProvider): Promise<DeployableHashes> {
        const r = StackReader.fromGetMethod(3, await provider.get('deployableHashes', []));
        return ({
            $: 'DeployableHashes',
            merkleRoot: r.readBigInt(),
            receiveExecutor: r.readBigInt(),
            deployer: r.readBigInt(),
        });
    }

    async getRmnRouter(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmnRouter', []));
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

    async getReserve(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('reserve', []));
        return r.readBigInt();
    }
}
