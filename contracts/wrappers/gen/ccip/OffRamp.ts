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

type int32 = bigint

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
type bits256 = c.Slice

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
 > enum Upgradeable_Error { 1 variants }
 */
export type Upgradeable_Error = bigint

export const Upgradeable_Error = {
    VersionMismatch: 19900n,

    fromSlice(s: c.Slice): Upgradeable_Error {
        return s.loadUintBig(15);
    },
    store(self: Upgradeable_Error, b: c.Builder): void {
        b.storeUint(self, 15);
    },
    toCell(self: Upgradeable_Error): c.Cell {
        return makeCellFrom<Upgradeable_Error>(self, Upgradeable_Error.store);
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
        queryId?: uint64
        code: c.Cell
    }): Upgradeable_Upgrade {
        return {
            $: 'Upgradeable_Upgrade',
            ...args,
            queryId: args.queryId ?? 0n
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
 > enum Ownable2Step_Error { 3 variants }
 */
export type Ownable2Step_Error = bigint

export const Ownable2Step_Error = {
    OnlyCallableByOwner: 49800n,
    CannotTransferToSelf: 49801n,
    MustBeProposedOwner: 49802n,

    fromSlice(s: c.Slice): Ownable2Step_Error {
        return s.loadUintBig(16);
    },
    store(self: Ownable2Step_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: Ownable2Step_Error): c.Cell {
        return makeCellFrom<Ownable2Step_Error>(self, Ownable2Step_Error.store);
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
 > struct (0xf21b7da1) Ownable2Step_TransferOwnership {
 >     queryId: uint64
 >     newOwner: address
 > }
 */
export interface Ownable2Step_TransferOwnership {
    readonly $: 'Ownable2Step_TransferOwnership'
    queryId: uint64
    newOwner: c.Address
}

export const Ownable2Step_TransferOwnership = {
    PREFIX: 0xf21b7da1,

    create(args: {
        queryId?: uint64
        newOwner: c.Address
    }): Ownable2Step_TransferOwnership {
        return {
            $: 'Ownable2Step_TransferOwnership',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_TransferOwnership {
        loadAndCheckPrefix32(s, 0xf21b7da1, 'Ownable2Step_TransferOwnership');
        return {
            $: 'Ownable2Step_TransferOwnership',
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_TransferOwnership, b: c.Builder): void {
        b.storeUint(0xf21b7da1, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_TransferOwnership): c.Cell {
        return makeCellFrom<Ownable2Step_TransferOwnership>(self, Ownable2Step_TransferOwnership.store);
    }
}

/**
 > struct (0xf9e29e4a) Ownable2Step_AcceptOwnership {
 >     queryId: uint64
 > }
 */
export interface Ownable2Step_AcceptOwnership {
    readonly $: 'Ownable2Step_AcceptOwnership'
    queryId: uint64
}

export const Ownable2Step_AcceptOwnership = {
    PREFIX: 0xf9e29e4a,

    create(args: {
        queryId?: uint64
    }): Ownable2Step_AcceptOwnership {
        return {
            $: 'Ownable2Step_AcceptOwnership',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_AcceptOwnership {
        loadAndCheckPrefix32(s, 0xf9e29e4a, 'Ownable2Step_AcceptOwnership');
        return {
            $: 'Ownable2Step_AcceptOwnership',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: Ownable2Step_AcceptOwnership, b: c.Builder): void {
        b.storeUint(0xf9e29e4a, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: Ownable2Step_AcceptOwnership): c.Cell {
        return makeCellFrom<Ownable2Step_AcceptOwnership>(self, Ownable2Step_AcceptOwnership.store);
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
 > enum Withdrawable_Error { 3 variants }
 */
export type Withdrawable_Error = bigint

export const Withdrawable_Error = {
    InsufficientBalance: 57100n,
    HitReserve: 57101n,
    InvalidRequest: 57102n,

    fromSlice(s: c.Slice): Withdrawable_Error {
        return s.loadUintBig(16);
    },
    store(self: Withdrawable_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: Withdrawable_Error): c.Cell {
        return makeCellFrom<Withdrawable_Error>(self, Withdrawable_Error.store);
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
        queryId?: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }): Withdrawable_Withdraw {
        return {
            $: 'Withdrawable_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
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
 > enum MerkleMultiProof_Error { 5 variants }
 */
export type MerkleMultiProof_Error = bigint

export const MerkleMultiProof_Error = {
    InvalidProofLeavesCannotBeEmpty: 12000n,
    InvalidProofLeavesTooLarge: 12001n,
    InvalidProofProofsTooLarge: 12002n,
    InvalidProofTotalHashesExceededMax: 12003n,
    InvalidProofDataSizeMismatch: 12004n,

    fromSlice(s: c.Slice): MerkleMultiProof_Error {
        return s.loadUintBig(14);
    },
    store(self: MerkleMultiProof_Error, b: c.Builder): void {
        b.storeUint(self, 14);
    },
    toCell(self: MerkleMultiProof_Error): c.Cell {
        return makeCellFrom<MerkleMultiProof_Error>(self, MerkleMultiProof_Error.store);
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
            signers: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
            transmitters: loadSnakedCellOf(s, (s) => s.loadAddress()),
            bigF: s.loadUintBig(8),
        }
    },
    store(self: OCR3Base_ConfigSet, b: c.Builder): void {
        b.storeUint(self.ocrPluginType, 16);
        b.storeUint(self.configDigest, 256);
        storeSnakedCellOf(self.signers, b, (v, b) => b.storeUint(v, 256));
        storeSnakedCellOf(self.transmitters, b, (v, b) => b.storeAddress(v));
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
        queryId?: uint64
        configDigest: uint256
        ocrPluginType: uint16
        bigF: uint8
        isSignatureVerificationEnabled: boolean
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
    }): OCR3Base_SetOCR3Config {
        return {
            $: 'OCR3Base_SetOCR3Config',
            ...args,
            queryId: args.queryId ?? 0n
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
            signers: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
            transmitters: loadSnakedCellOf(s, (s) => s.loadAddress()),
        }
    },
    store(self: OCR3Base_SetOCR3Config, b: c.Builder): void {
        b.storeUint(0x2b78359f, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.configDigest, 256);
        b.storeUint(self.ocrPluginType, 16);
        b.storeUint(self.bigF, 8);
        b.storeBit(self.isSignatureVerificationEnabled);
        storeSnakedCellOf(self.signers, b, (v, b) => b.storeUint(v, 256));
        storeSnakedCellOf(self.transmitters, b, (v, b) => b.storeAddress(v));
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
    commit: OCRConfig | null
    execute: OCRConfig | null
}

export const OCR3Base = {
    create(args: {
        chainId: uint8
        commit: OCRConfig | null
        execute: OCRConfig | null
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
        storeTolkNullable<OCRConfig>(self.commit, b,
            (v,b) => storeCellRef<OCRConfig>(v, b, OCRConfig.store)
        );
        storeTolkNullable<OCRConfig>(self.execute, b,
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
    signers: Map<uint256, uint8> /* = [] as map<uint256, uint8> */
    transmitters: Map<c.Address, uint8> /* = [] as map<address, uint8> */
}

export const OCRConfig = {
    create(args: {
        configInfo: ConfigInfo
        signers: Map<uint256, uint8> /* = [] as map<uint256, uint8> */
        transmitters: Map<c.Address, uint8> /* = [] as map<address, uint8> */
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
            signers: dictToMap(c.Dictionary.load<uint256, uint8>(c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(8), s)),
            transmitters: dictToMap(c.Dictionary.load<c.Address, uint8>(c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(8), s)),
        }
    },
    store(self: OCRConfig, b: c.Builder): void {
        ConfigInfo.store(self.configInfo, b);
        b.storeDict<uint256, uint8>(mapToDict(self.signers, c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(8)), c.Dictionary.Keys.BigUint(256), c.Dictionary.Values.BigUint(8));
        b.storeDict<c.Address, uint8>(mapToDict(self.transmitters, c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(8)), c.Dictionary.Keys.Address(), c.Dictionary.Values.BigUint(8));
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
    _padding: bits192 /* = hex('000000000000000000000000000000000000000000000000') as slice as bits192 */
    sequenceBytes: uint64
}

export const ReportContext = {
    create(args: {
        configDigest: uint256
        _padding?: bits192 /* = hex('000000000000000000000000000000000000000000000000') as slice as bits192 */
        sequenceBytes: uint64
    }): ReportContext {
        return {
            $: 'ReportContext',
            _padding: new c.Slice(new c.BitReader(new c.BitString(Buffer.from('000000000000000000000000000000000000000000000000', 'hex'), 0, 192)), []),
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
 > enum Utils_Error { 2 variants }
 */
export type Utils_Error = bigint

export const Utils_Error = {
    InvalidData: 13500n,
    BitmapOutOfBounds: 13501n,

    fromSlice(s: c.Slice): Utils_Error {
        return s.loadUintBig(14);
    },
    store(self: Utils_Error, b: c.Builder): void {
        b.storeUint(self, 14);
    },
    toCell(self: Utils_Error): c.Cell {
        return makeCellFrom<Utils_Error>(self, Utils_Error.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = T[]

function storeSnakedCellOf<T>(v: SnakedCell<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v.length === 0) {
        b.storeRef(c.Cell.EMPTY);
        return;
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
    b.storeRef(current);
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
 > struct (0xde852b1b) FeeQuoter_UpdatePrices {
 >     updates: PriceUpdates
 >     sendExcessesTo: address?
 > }
 */
export interface FeeQuoter_UpdatePrices {
    readonly $: 'FeeQuoter_UpdatePrices'
    updates: PriceUpdates
    sendExcessesTo: c.Address | null /* = null */
}

export const FeeQuoter_UpdatePrices = {
    PREFIX: 0xde852b1b,

    create(args: {
        updates: PriceUpdates
        sendExcessesTo?: c.Address | null /* = null */
    }): FeeQuoter_UpdatePrices {
        return {
            $: 'FeeQuoter_UpdatePrices',
            sendExcessesTo: null,
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
 >     queryId: uint64
 >     message: Cell<Any2TVMRampMessage>
 >     permissionlessExecutionThresholdSeconds: uint32
 >     metadataHash: uint256
 >     gasOverride: GasOverride?
 >     offchainTokenData: lisp_list<lisp_list<cell>>
 > }
 */
export interface MerkleRoot_Validate {
    readonly $: 'MerkleRoot_Validate'
    queryId: uint64
    message: Any2TVMRampMessage
    permissionlessExecutionThresholdSeconds: uint32
    metadataHash: uint256
    gasOverride: GasOverride | null
    offchainTokenData: lisp_list<lisp_list<c.Cell>>
}

export const MerkleRoot_Validate = {
    PREFIX: 0x038ede91,

    create(args: {
        queryId?: uint64
        message: Any2TVMRampMessage
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: GasOverride | null
        offchainTokenData: lisp_list<lisp_list<c.Cell>>
    }): MerkleRoot_Validate {
        return {
            $: 'MerkleRoot_Validate',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_Validate {
        loadAndCheckPrefix32(s, 0x038ede91, 'MerkleRoot_Validate');
        return {
            $: 'MerkleRoot_Validate',
            queryId: s.loadUintBig(64),
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? GasOverride.fromSlice(s) : null,
            offchainTokenData: loadLispListOf<lisp_list<c.Cell>>(s,
                (s) => loadLispListOf<c.Cell>(s,
                    (s) => s.loadRef()
                )
            ),
        }
    },
    store(self: MerkleRoot_Validate, b: c.Builder): void {
        b.storeUint(0x038ede91, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<GasOverride>(self.gasOverride, b, GasOverride.store);
        storeLispListOf<lisp_list<c.Cell>>(self.offchainTokenData, b,
            (v,b) => { storeLispListOf<c.Cell>(v, b,
                (v,b) => b.storeRef(v)
            ); }
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
 >     queryId: uint64
 >     effectiveGasLimit: coins
 >     root: address
 >     sequenceNumber: uint64
 >     sourceChainSelector: uint64
 >     messageId: uint256
 >     tokenTransfer: Cell<ReceiveExecutor_TokenTransfer>?
 > }
 */
export interface ReceiveExecutor_InitExecute {
    readonly $: 'ReceiveExecutor_InitExecute'
    queryId: uint64
    effectiveGasLimit: coins
    root: c.Address
    sequenceNumber: uint64
    sourceChainSelector: uint64
    messageId: uint256
    tokenTransfer: ReceiveExecutor_TokenTransfer | null /* = null */
}

export const ReceiveExecutor_InitExecute = {
    PREFIX: 0x64cd2fd2,

    create(args: {
        queryId?: uint64
        effectiveGasLimit: coins
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
        tokenTransfer?: ReceiveExecutor_TokenTransfer | null /* = null */
    }): ReceiveExecutor_InitExecute {
        return {
            $: 'ReceiveExecutor_InitExecute',
            tokenTransfer: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_InitExecute {
        loadAndCheckPrefix32(s, 0x64cd2fd2, 'ReceiveExecutor_InitExecute');
        return {
            $: 'ReceiveExecutor_InitExecute',
            queryId: s.loadUintBig(64),
            effectiveGasLimit: s.loadCoins(),
            root: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            sourceChainSelector: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
            tokenTransfer: s.loadBoolean() ? loadCellRef<ReceiveExecutor_TokenTransfer>(s, ReceiveExecutor_TokenTransfer.fromSlice) : null,
        }
    },
    store(self: ReceiveExecutor_InitExecute, b: c.Builder): void {
        b.storeUint(0x64cd2fd2, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.effectiveGasLimit);
        b.storeAddress(self.root);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.messageId, 256);
        storeTolkNullable<ReceiveExecutor_TokenTransfer>(self.tokenTransfer, b,
            (v,b) => storeCellRef<ReceiveExecutor_TokenTransfer>(v, b, ReceiveExecutor_TokenTransfer.store)
        );
    },
    toCell(self: ReceiveExecutor_InitExecute): c.Cell {
        return makeCellFrom<ReceiveExecutor_InitExecute>(self, ReceiveExecutor_InitExecute.store);
    }
}

/**
 > struct ReceiveExecutor_TokenTransfer {
 >     tokenAdminRegistry: address
 >     transfer: Any2TVMTokenTransfer
 >     offchainTokenData: cell?
 > }
 */
export interface ReceiveExecutor_TokenTransfer {
    readonly $: 'ReceiveExecutor_TokenTransfer'
    tokenAdminRegistry: c.Address
    transfer: Any2TVMTokenTransfer
    offchainTokenData: c.Cell | null /* = null */
}

export const ReceiveExecutor_TokenTransfer = {
    create(args: {
        tokenAdminRegistry: c.Address
        transfer: Any2TVMTokenTransfer
        offchainTokenData?: c.Cell | null /* = null */
    }): ReceiveExecutor_TokenTransfer {
        return {
            $: 'ReceiveExecutor_TokenTransfer',
            offchainTokenData: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_TokenTransfer {
        return {
            $: 'ReceiveExecutor_TokenTransfer',
            tokenAdminRegistry: s.loadAddress(),
            transfer: Any2TVMTokenTransfer.fromSlice(s),
            offchainTokenData: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: ReceiveExecutor_TokenTransfer, b: c.Builder): void {
        b.storeAddress(self.tokenAdminRegistry);
        Any2TVMTokenTransfer.store(self.transfer, b);
        storeTolkNullable<c.Cell>(self.offchainTokenData, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: ReceiveExecutor_TokenTransfer): c.Cell {
        return makeCellFrom<ReceiveExecutor_TokenTransfer>(self, ReceiveExecutor_TokenTransfer.store);
    }
}

/**
 > struct (0xdf58530e) ReceiveExecutor_ReleaseOrMintFailed {
 >     queryId: uint64
 >     reason: ReleaseOrMint_ReleaseOrMintFailedReason
 > }
 */
export interface ReceiveExecutor_ReleaseOrMintFailed {
    readonly $: 'ReceiveExecutor_ReleaseOrMintFailed'
    queryId: uint64
    reason: ReleaseOrMint_ReleaseOrMintFailedReason
}

export const ReceiveExecutor_ReleaseOrMintFailed = {
    PREFIX: 0xdf58530e,

    create(args: {
        queryId?: uint64
        reason: ReleaseOrMint_ReleaseOrMintFailedReason
    }): ReceiveExecutor_ReleaseOrMintFailed {
        return {
            $: 'ReceiveExecutor_ReleaseOrMintFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_ReleaseOrMintFailed {
        loadAndCheckPrefix32(s, 0xdf58530e, 'ReceiveExecutor_ReleaseOrMintFailed');
        return {
            $: 'ReceiveExecutor_ReleaseOrMintFailed',
            queryId: s.loadUintBig(64),
            reason: ReleaseOrMint_ReleaseOrMintFailedReason.fromSlice(s),
        }
    },
    store(self: ReceiveExecutor_ReleaseOrMintFailed, b: c.Builder): void {
        b.storeUint(0xdf58530e, 32);
        b.storeUint(self.queryId, 64);
        ReleaseOrMint_ReleaseOrMintFailedReason.store(self.reason, b);
    },
    toCell(self: ReceiveExecutor_ReleaseOrMintFailed): c.Cell {
        return makeCellFrom<ReceiveExecutor_ReleaseOrMintFailed>(self, ReceiveExecutor_ReleaseOrMintFailed.store);
    }
}

/**
 > type ReleaseOrMint_ReleaseOrMintFailedReason = ReleaseOrMintBounced | NotEnoughDestGasAmountForTokenTransfer
 */
export type ReleaseOrMint_ReleaseOrMintFailedReason =
    | ReleaseOrMintBounced
    | NotEnoughDestGasAmountForTokenTransfer

export const ReleaseOrMint_ReleaseOrMintFailedReason = {
    fromSlice(s: c.Slice): ReleaseOrMint_ReleaseOrMintFailedReason {
        return lookupPrefix(s, 0xb70c2a9a, 32) ? ReleaseOrMintBounced.fromSlice(s) :
            lookupPrefix(s, 0xb304ecdf, 32) ? NotEnoughDestGasAmountForTokenTransfer.fromSlice(s) :
            throwNonePrefixMatch('ReleaseOrMint_ReleaseOrMintFailedReason');
    },
    store(self: ReleaseOrMint_ReleaseOrMintFailedReason, b: c.Builder): void {
        switch (self.$) {
            case 'ReleaseOrMintBounced':
                ReleaseOrMintBounced.store(self, b);
                break;
            case 'NotEnoughDestGasAmountForTokenTransfer':
                NotEnoughDestGasAmountForTokenTransfer.store(self, b);
                break;
        }
    },
    toCell(self: ReleaseOrMint_ReleaseOrMintFailedReason): c.Cell {
        return makeCellFrom<ReleaseOrMint_ReleaseOrMintFailedReason>(self, ReleaseOrMint_ReleaseOrMintFailedReason.store);
    }
}

/**
 > struct (0xb70c2a9a) ReleaseOrMintBounced {
 >     exitCode: int32
 > }
 */
export interface ReleaseOrMintBounced {
    readonly $: 'ReleaseOrMintBounced'
    exitCode: int32
}

export const ReleaseOrMintBounced = {
    PREFIX: 0xb70c2a9a,

    create(args: {
        exitCode: int32
    }): ReleaseOrMintBounced {
        return {
            $: 'ReleaseOrMintBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReleaseOrMintBounced {
        loadAndCheckPrefix32(s, 0xb70c2a9a, 'ReleaseOrMintBounced');
        return {
            $: 'ReleaseOrMintBounced',
            exitCode: s.loadIntBig(32),
        }
    },
    store(self: ReleaseOrMintBounced, b: c.Builder): void {
        b.storeUint(0xb70c2a9a, 32);
        b.storeInt(self.exitCode, 32);
    },
    toCell(self: ReleaseOrMintBounced): c.Cell {
        return makeCellFrom<ReleaseOrMintBounced>(self, ReleaseOrMintBounced.store);
    }
}

/**
 > struct (0xb304ecdf) NotEnoughDestGasAmountForTokenTransfer {
 > }
 */
export interface NotEnoughDestGasAmountForTokenTransfer {
    readonly $: 'NotEnoughDestGasAmountForTokenTransfer'
}

export const NotEnoughDestGasAmountForTokenTransfer = {
    PREFIX: 0xb304ecdf,

    create(): NotEnoughDestGasAmountForTokenTransfer {
        return {
            $: 'NotEnoughDestGasAmountForTokenTransfer',
        }
    },
    fromSlice(s: c.Slice): NotEnoughDestGasAmountForTokenTransfer {
        loadAndCheckPrefix32(s, 0xb304ecdf, 'NotEnoughDestGasAmountForTokenTransfer');
        return {
            $: 'NotEnoughDestGasAmountForTokenTransfer',
        }
    },
    store(self: NotEnoughDestGasAmountForTokenTransfer, b: c.Builder): void {
        b.storeUint(0xb304ecdf, 32);
    },
    toCell(self: NotEnoughDestGasAmountForTokenTransfer): c.Cell {
        return makeCellFrom<NotEnoughDestGasAmountForTokenTransfer>(self, NotEnoughDestGasAmountForTokenTransfer.store);
    }
}

/**
 > struct (0xf0af71c5) ReceiveExecutor_CCIPReceiveConfirm {
 >     queryId: uint64
 >     receiver: address
 > }
 */
export interface ReceiveExecutor_CCIPReceiveConfirm {
    readonly $: 'ReceiveExecutor_CCIPReceiveConfirm'
    queryId: uint64
    receiver: c.Address
}

export const ReceiveExecutor_CCIPReceiveConfirm = {
    PREFIX: 0xf0af71c5,

    create(args: {
        queryId?: uint64
        receiver: c.Address
    }): ReceiveExecutor_CCIPReceiveConfirm {
        return {
            $: 'ReceiveExecutor_CCIPReceiveConfirm',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_CCIPReceiveConfirm {
        loadAndCheckPrefix32(s, 0xf0af71c5, 'ReceiveExecutor_CCIPReceiveConfirm');
        return {
            $: 'ReceiveExecutor_CCIPReceiveConfirm',
            queryId: s.loadUintBig(64),
            receiver: s.loadAddress(),
        }
    },
    store(self: ReceiveExecutor_CCIPReceiveConfirm, b: c.Builder): void {
        b.storeUint(0xf0af71c5, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.receiver);
    },
    toCell(self: ReceiveExecutor_CCIPReceiveConfirm): c.Cell {
        return makeCellFrom<ReceiveExecutor_CCIPReceiveConfirm>(self, ReceiveExecutor_CCIPReceiveConfirm.store);
    }
}

/**
 > struct (0x8854993b) ReceiveExecutor_CCIPReceiveFailed {
 >     queryId: uint64
 >     receiver: address
 >     reason: ReceiveExecutor_FailedReason
 > }
 */
export interface ReceiveExecutor_CCIPReceiveFailed {
    readonly $: 'ReceiveExecutor_CCIPReceiveFailed'
    queryId: uint64
    receiver: c.Address
    reason: ReceiveExecutor_FailedReason
}

export const ReceiveExecutor_CCIPReceiveFailed = {
    PREFIX: 0x8854993b,

    create(args: {
        queryId?: uint64
        receiver: c.Address
        reason: ReceiveExecutor_FailedReason
    }): ReceiveExecutor_CCIPReceiveFailed {
        return {
            $: 'ReceiveExecutor_CCIPReceiveFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_CCIPReceiveFailed {
        loadAndCheckPrefix32(s, 0x8854993b, 'ReceiveExecutor_CCIPReceiveFailed');
        return {
            $: 'ReceiveExecutor_CCIPReceiveFailed',
            queryId: s.loadUintBig(64),
            receiver: s.loadAddress(),
            reason: ReceiveExecutor_FailedReason.fromSlice(s),
        }
    },
    store(self: ReceiveExecutor_CCIPReceiveFailed, b: c.Builder): void {
        b.storeUint(0x8854993b, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.receiver);
        ReceiveExecutor_FailedReason.store(self.reason, b);
    },
    toCell(self: ReceiveExecutor_CCIPReceiveFailed): c.Cell {
        return makeCellFrom<ReceiveExecutor_CCIPReceiveFailed>(self, ReceiveExecutor_CCIPReceiveFailed.store);
    }
}

/**
 > enum ReceiveExecutor_FailedReason { 3 variants }
 */
export type ReceiveExecutor_FailedReason = bigint

export const ReceiveExecutor_FailedReason = {
    NotEnoughGas: 0n,
    BouncedFromReceiver: 1n,
    BouncedFromRouter: 2n,

    fromSlice(s: c.Slice): ReceiveExecutor_FailedReason {
        return s.loadUintBig(8);
    },
    store(self: ReceiveExecutor_FailedReason, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: ReceiveExecutor_FailedReason): c.Cell {
        return makeCellFrom<ReceiveExecutor_FailedReason>(self, ReceiveExecutor_FailedReason.store);
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
 > struct (0xfc69c50b) Router_RouteMessage {
 >     queryId: uint64
 >     message: Cell<Any2TVMMessage>
 >     execId: ReceiveExecutorId
 >     receiver: address
 >     gasLimit: coins
 > }
 */
export interface Router_RouteMessage {
    readonly $: 'Router_RouteMessage'
    queryId: uint64
    message: Any2TVMMessage
    execId: ReceiveExecutorId
    receiver: c.Address
    gasLimit: coins
}

export const Router_RouteMessage = {
    PREFIX: 0xfc69c50b,

    create(args: {
        queryId?: uint64
        message: Any2TVMMessage
        execId: ReceiveExecutorId
        receiver: c.Address
        gasLimit: coins
    }): Router_RouteMessage {
        return {
            $: 'Router_RouteMessage',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Router_RouteMessage {
        loadAndCheckPrefix32(s, 0xfc69c50b, 'Router_RouteMessage');
        return {
            $: 'Router_RouteMessage',
            queryId: s.loadUintBig(64),
            message: loadCellRef<Any2TVMMessage>(s, Any2TVMMessage.fromSlice),
            execId: ReceiveExecutorId.fromSlice(s),
            receiver: s.loadAddress(),
            gasLimit: s.loadCoins(),
        }
    },
    store(self: Router_RouteMessage, b: c.Builder): void {
        b.storeUint(0xfc69c50b, 32);
        b.storeUint(self.queryId, 64);
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
        queryId?: uint64
        reportContext: ReportContext
        report: CommitReport
        signatures: SnakedCell<SignatureEd25519>
    }): OffRamp_Commit {
        return {
            $: 'OffRamp_Commit',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_Commit {
        loadAndCheckPrefix32(s, 0x9d431905, 'OffRamp_Commit');
        return {
            $: 'OffRamp_Commit',
            queryId: s.loadUintBig(64),
            reportContext: ReportContext.fromSlice(s),
            report: CommitReport.fromSlice(s),
            signatures: loadSnakedCellOf(s, SignatureEd25519.fromSlice),
        }
    },
    store(self: OffRamp_Commit, b: c.Builder): void {
        b.storeUint(0x9d431905, 32);
        b.storeUint(self.queryId, 64);
        ReportContext.store(self.reportContext, b);
        CommitReport.store(self.report, b);
        storeSnakedCellOf(self.signatures, b, SignatureEd25519.store);
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
        queryId?: uint64
        reportContext: ReportContext
        report: ExecutionReport
    }): OffRamp_Execute {
        return {
            $: 'OffRamp_Execute',
            ...args,
            queryId: args.queryId ?? 0n
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
 >     queryId: uint64
 >     message: Cell<Any2TVMRampMessage>
 >     root: MerkleRootId
 >     metadataHash: uint256
 >     gasOverride: GasOverride?
 >     executionState: ExecutionState
 >     offchainTokenData: lisp_list<lisp_list<cell>>
 > }
 */
export interface OffRamp_ExecuteValidated {
    readonly $: 'OffRamp_ExecuteValidated'
    queryId: uint64
    message: Any2TVMRampMessage
    root: MerkleRootId
    metadataHash: uint256
    gasOverride: GasOverride | null /* = null */
    executionState: ExecutionState
    offchainTokenData: lisp_list<lisp_list<c.Cell>>
}

export const OffRamp_ExecuteValidated = {
    PREFIX: 0xc73d5a8a,

    create(args: {
        queryId?: uint64
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
        offchainTokenData: lisp_list<lisp_list<c.Cell>>
    }): OffRamp_ExecuteValidated {
        return {
            $: 'OffRamp_ExecuteValidated',
            gasOverride: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_ExecuteValidated {
        loadAndCheckPrefix32(s, 0xc73d5a8a, 'OffRamp_ExecuteValidated');
        return {
            $: 'OffRamp_ExecuteValidated',
            queryId: s.loadUintBig(64),
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            root: MerkleRootId.fromSlice(s),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? GasOverride.fromSlice(s) : null,
            executionState: ExecutionState.fromSlice(s),
            offchainTokenData: loadLispListOf<lisp_list<c.Cell>>(s,
                (s) => loadLispListOf<c.Cell>(s,
                    (s) => s.loadRef()
                )
            ),
        }
    },
    store(self: OffRamp_ExecuteValidated, b: c.Builder): void {
        b.storeUint(0xc73d5a8a, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        MerkleRootId.store(self.root, b);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<GasOverride>(self.gasOverride, b, GasOverride.store);
        ExecutionState.store(self.executionState, b);
        storeLispListOf<lisp_list<c.Cell>>(self.offchainTokenData, b,
            (v,b) => { storeLispListOf<c.Cell>(v, b,
                (v,b) => b.storeRef(v)
            ); }
        );
    },
    toCell(self: OffRamp_ExecuteValidated): c.Cell {
        return makeCellFrom<OffRamp_ExecuteValidated>(self, OffRamp_ExecuteValidated.store);
    }
}

/**
 > struct (0xa00785cf) OffRamp_ManuallyExecute {
 >     queryId: uint64
 >     report: ExecutionReport
 >     gasOverride: GasOverride
 > }
 */
export interface OffRamp_ManuallyExecute {
    readonly $: 'OffRamp_ManuallyExecute'
    queryId: uint64
    report: ExecutionReport
    gasOverride: GasOverride
}

export const OffRamp_ManuallyExecute = {
    PREFIX: 0xa00785cf,

    create(args: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }): OffRamp_ManuallyExecute {
        return {
            $: 'OffRamp_ManuallyExecute',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_ManuallyExecute {
        loadAndCheckPrefix32(s, 0xa00785cf, 'OffRamp_ManuallyExecute');
        return {
            $: 'OffRamp_ManuallyExecute',
            queryId: s.loadUintBig(64),
            report: ExecutionReport.fromSlice(s),
            gasOverride: GasOverride.fromSlice(s),
        }
    },
    store(self: OffRamp_ManuallyExecute, b: c.Builder): void {
        b.storeUint(0xa00785cf, 32);
        b.storeUint(self.queryId, 64);
        ExecutionReport.store(self.report, b);
        GasOverride.store(self.gasOverride, b);
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
        queryId?: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }): OffRamp_UpdateSourceChainConfigs {
        return {
            $: 'OffRamp_UpdateSourceChainConfigs',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_UpdateSourceChainConfigs {
        loadAndCheckPrefix32(s, 0x22b4f05c, 'OffRamp_UpdateSourceChainConfigs');
        return {
            $: 'OffRamp_UpdateSourceChainConfigs',
            queryId: s.loadUintBig(64),
            configs: loadSnakedCellOf(s, SourceChainConfigUpdate.fromSlice),
        }
    },
    store(self: OffRamp_UpdateSourceChainConfigs, b: c.Builder): void {
        b.storeUint(0x22b4f05c, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.configs, b, SourceChainConfigUpdate.store);
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
 >     queryId: uint64
 >     message: Cell<Any2TVMRampMessage>
 >     execId: uint192
 >     effectiveGasLimit: coins
 > }
 */
export interface OffRamp_DispatchValidated {
    readonly $: 'OffRamp_DispatchValidated'
    queryId: uint64
    message: Any2TVMRampMessage
    execId: uint192
    effectiveGasLimit: coins
}

export const OffRamp_DispatchValidated = {
    PREFIX: 0x58cfcb02,

    create(args: {
        queryId?: uint64
        message: Any2TVMRampMessage
        execId: uint192
        effectiveGasLimit: coins
    }): OffRamp_DispatchValidated {
        return {
            $: 'OffRamp_DispatchValidated',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_DispatchValidated {
        loadAndCheckPrefix32(s, 0x58cfcb02, 'OffRamp_DispatchValidated');
        return {
            $: 'OffRamp_DispatchValidated',
            queryId: s.loadUintBig(64),
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            execId: s.loadUintBig(192),
            effectiveGasLimit: s.loadCoins(),
        }
    },
    store(self: OffRamp_DispatchValidated, b: c.Builder): void {
        b.storeUint(0x58cfcb02, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.execId, 192);
        b.storeCoins(self.effectiveGasLimit);
    },
    toCell(self: OffRamp_DispatchValidated): c.Cell {
        return makeCellFrom<OffRamp_DispatchValidated>(self, OffRamp_DispatchValidated.store);
    }
}

/**
 > struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
 >     queryId: uint64
 >     execId: ReceiveExecutorId
 >     receiver: address
 > }
 */
export interface OffRamp_CCIPReceiveConfirm {
    readonly $: 'OffRamp_CCIPReceiveConfirm'
    queryId: uint64
    execId: ReceiveExecutorId
    receiver: c.Address
}

export const OffRamp_CCIPReceiveConfirm = {
    PREFIX: 0x28f4166f,

    create(args: {
        queryId?: uint64
        execId: ReceiveExecutorId
        receiver: c.Address
    }): OffRamp_CCIPReceiveConfirm {
        return {
            $: 'OffRamp_CCIPReceiveConfirm',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_CCIPReceiveConfirm {
        loadAndCheckPrefix32(s, 0x28f4166f, 'OffRamp_CCIPReceiveConfirm');
        return {
            $: 'OffRamp_CCIPReceiveConfirm',
            queryId: s.loadUintBig(64),
            execId: ReceiveExecutorId.fromSlice(s),
            receiver: s.loadAddress(),
        }
    },
    store(self: OffRamp_CCIPReceiveConfirm, b: c.Builder): void {
        b.storeUint(0x28f4166f, 32);
        b.storeUint(self.queryId, 64);
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
 >     queryId: uint64
 >     header: Cell<RampMessageHeader>
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifySuccess {
    readonly $: 'OffRamp_NotifySuccess'
    queryId: uint64
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifySuccess = {
    PREFIX: 0x59e56170,

    create(args: {
        queryId?: uint64
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifySuccess {
        return {
            $: 'OffRamp_NotifySuccess',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifySuccess {
        loadAndCheckPrefix32(s, 0x59e56170, 'OffRamp_NotifySuccess');
        return {
            $: 'OffRamp_NotifySuccess',
            queryId: s.loadUintBig(64),
            header: loadCellRef<RampMessageHeader>(s, RampMessageHeader.fromSlice),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifySuccess, b: c.Builder): void {
        b.storeUint(0x59e56170, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<RampMessageHeader>(self.header, b, RampMessageHeader.store);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.root);
    },
    toCell(self: OffRamp_NotifySuccess): c.Cell {
        return makeCellFrom<OffRamp_NotifySuccess>(self, OffRamp_NotifySuccess.store);
    }
}

/**
 > struct (0x177ebd03) OffRamp_NotifyFailure {
 >     queryId: uint64
 >     header: Cell<RampMessageHeader>
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifyFailure {
    readonly $: 'OffRamp_NotifyFailure'
    queryId: uint64
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifyFailure = {
    PREFIX: 0x177ebd03,

    create(args: {
        queryId?: uint64
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifyFailure {
        return {
            $: 'OffRamp_NotifyFailure',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifyFailure {
        loadAndCheckPrefix32(s, 0x177ebd03, 'OffRamp_NotifyFailure');
        return {
            $: 'OffRamp_NotifyFailure',
            queryId: s.loadUintBig(64),
            header: loadCellRef<RampMessageHeader>(s, RampMessageHeader.fromSlice),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifyFailure, b: c.Builder): void {
        b.storeUint(0x177ebd03, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<RampMessageHeader>(self.header, b, RampMessageHeader.store);
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
 >     config: OffRamp_DynamicConfig
 > }
 */
export interface OffRamp_SetDynamicConfig {
    readonly $: 'OffRamp_SetDynamicConfig'
    queryId: uint64
    config: OffRamp_DynamicConfig
}

export const OffRamp_SetDynamicConfig = {
    PREFIX: 0x95bc5a5c,

    create(args: {
        queryId?: uint64
        config: OffRamp_DynamicConfig
    }): OffRamp_SetDynamicConfig {
        return {
            $: 'OffRamp_SetDynamicConfig',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_SetDynamicConfig {
        loadAndCheckPrefix32(s, 0x95bc5a5c, 'OffRamp_SetDynamicConfig');
        return {
            $: 'OffRamp_SetDynamicConfig',
            queryId: s.loadUintBig(64),
            config: OffRamp_DynamicConfig.fromSlice(s),
        }
    },
    store(self: OffRamp_SetDynamicConfig, b: c.Builder): void {
        b.storeUint(0x95bc5a5c, 32);
        b.storeUint(self.queryId, 64);
        OffRamp_DynamicConfig.store(self.config, b);
    },
    toCell(self: OffRamp_SetDynamicConfig): c.Cell {
        return makeCellFrom<OffRamp_SetDynamicConfig>(self, OffRamp_SetDynamicConfig.store);
    }
}

/**
 > struct (0x7deaf076) OffRamp_ReleaseOrMint {
 >     queryId: uint64
 >     execId: ReceiveExecutorId
 >     tokenPool: address
 >     destGasAmount: coins
 >     requestedFinalityConfig: uint32
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 > }
 */
export interface OffRamp_ReleaseOrMint {
    readonly $: 'OffRamp_ReleaseOrMint'
    queryId: uint64
    execId: ReceiveExecutorId
    tokenPool: c.Address
    destGasAmount: coins
    requestedFinalityConfig: uint32
    request: TokenPool_ReleaseOrMintInV1
}

export const OffRamp_ReleaseOrMint = {
    PREFIX: 0x7deaf076,

    create(args: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
        destGasAmount: coins
        requestedFinalityConfig: uint32
        request: TokenPool_ReleaseOrMintInV1
    }): OffRamp_ReleaseOrMint {
        return {
            $: 'OffRamp_ReleaseOrMint',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_ReleaseOrMint {
        loadAndCheckPrefix32(s, 0x7deaf076, 'OffRamp_ReleaseOrMint');
        return {
            $: 'OffRamp_ReleaseOrMint',
            queryId: s.loadUintBig(64),
            execId: ReceiveExecutorId.fromSlice(s),
            tokenPool: s.loadAddress(),
            destGasAmount: s.loadCoins(),
            requestedFinalityConfig: s.loadUintBig(32),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
        }
    },
    store(self: OffRamp_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x7deaf076, 32);
        b.storeUint(self.queryId, 64);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.tokenPool);
        b.storeCoins(self.destGasAmount);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
    },
    toCell(self: OffRamp_ReleaseOrMint): c.Cell {
        return makeCellFrom<OffRamp_ReleaseOrMint>(self, OffRamp_ReleaseOrMint.store);
    }
}

/**
 > enum OffRamp_Error { 22 variants }
 */
export type OffRamp_Error = bigint

export const OffRamp_Error = {
    MessageNotFromOwnedContract: 22100n,
    SourceChainNotEnabled: 22101n,
    EmptyExecutionReport: 22102n,
    InvalidMessageDestChainSelector: 22103n,
    SourceChainSelectorMismatch: 22104n,
    InvalidOnRampUpdate: 22105n,
    InsufficientFee: 22106n,
    SubjectCursed: 22107n,
    Unauthorized: 22108n,
    ZeroAddressNotAllowed: 22109n,
    TooManyMessagesInReport: 22110n,
    SignatureVerificationRequiredInCommitPlugin: 22111n,
    SignatureVerificationNotAllowedInExecutionPlugin: 22112n,
    InvalidInterval: 22113n,
    BatchingNotSupported: 22114n,
    OnRampAddressMismatch: 22115n,
    EmptyCommitReport: 22116n,
    MerkleRootCannotBeZero: 22117n,
    UnsupportedNumberOfTokens: 22118n,
    ManualExecutionGasAmountCountMismatch: 22119n,
    InvalidManualExecutionGasLimit: 22120n,
    UnexpectedTokenData: 22121n,

    fromSlice(s: c.Slice): OffRamp_Error {
        return s.loadUintBig(15);
    },
    store(self: OffRamp_Error, b: c.Builder): void {
        b.storeUint(self, 15);
    },
    toCell(self: OffRamp_Error): c.Cell {
        return makeCellFrom<OffRamp_Error>(self, OffRamp_Error.store);
    }
}

/**
 > struct ExecutionReport {
 >     sourceChainSelector: uint64
 >     messages: cell
 >     offchainTokenData: lisp_list<lisp_list<cell>>
 >     proofs: SnakedCell<uint256>
 >     proofFlagBits: uint256
 > }
 */
export interface ExecutionReport {
    readonly $: 'ExecutionReport'
    sourceChainSelector: uint64
    messages: c.Cell
    offchainTokenData: lisp_list<lisp_list<c.Cell>>
    proofs: SnakedCell<uint256>
    proofFlagBits: uint256
}

export const ExecutionReport = {
    create(args: {
        sourceChainSelector: uint64
        messages: c.Cell
        offchainTokenData: lisp_list<lisp_list<c.Cell>>
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
            offchainTokenData: loadLispListOf<lisp_list<c.Cell>>(s,
                (s) => loadLispListOf<c.Cell>(s,
                    (s) => s.loadRef()
                )
            ),
            proofs: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
            proofFlagBits: s.loadUintBig(256),
        }
    },
    store(self: ExecutionReport, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        b.storeRef(self.messages);
        storeLispListOf<lisp_list<c.Cell>>(self.offchainTokenData, b,
            (v,b) => { storeLispListOf<c.Cell>(v, b,
                (v,b) => b.storeRef(v)
            ); }
        );
        storeSnakedCellOf(self.proofs, b, (v, b) => b.storeUint(v, 256));
        b.storeUint(self.proofFlagBits, 256);
    },
    toCell(self: ExecutionReport): c.Cell {
        return makeCellFrom<ExecutionReport>(self, ExecutionReport.store);
    }
}

/**
 > struct GasOverride {
 >     receiverExecutionGasLimit: coins?
 >     tokenGasOverrides: SnakedCell<coins>?
 > }
 */
export interface GasOverride {
    readonly $: 'GasOverride'
    receiverExecutionGasLimit: coins | null /* = null */
    tokenGasOverrides: SnakedCell<coins> | null /* = null */
}

export const GasOverride = {
    create(args: {
        receiverExecutionGasLimit?: coins | null /* = null */
        tokenGasOverrides?: SnakedCell<coins> | null /* = null */
    }): GasOverride {
        return {
            $: 'GasOverride',
            receiverExecutionGasLimit: null,
            tokenGasOverrides: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): GasOverride {
        return {
            $: 'GasOverride',
            receiverExecutionGasLimit: s.loadBoolean() ? s.loadCoins() : null,
            tokenGasOverrides: s.loadBoolean() ? loadSnakedCellOf(s, (s) => s.loadCoins()) : null,
        }
    },
    store(self: GasOverride, b: c.Builder): void {
        storeTolkNullable<coins>(self.receiverExecutionGasLimit, b,
            (v,b) => b.storeCoins(v)
        );
        storeTolkNullable<SnakedCell<coins>>(self.tokenGasOverrides, b, (v,b) => storeSnakedCellOf(v, b, (v, b) => b.storeCoins(v)));
    },
    toCell(self: GasOverride): c.Cell {
        return makeCellFrom<GasOverride>(self, GasOverride.store);
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
    priceUpdates: PriceUpdates | null /* = null */
    merkleRoots: SnakedCell<MerkleRoot>
}

export const CommitReport = {
    create(args: {
        priceUpdates?: PriceUpdates | null /* = null */
        merkleRoots: SnakedCell<MerkleRoot>
    }): CommitReport {
        return {
            $: 'CommitReport',
            priceUpdates: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): CommitReport {
        return {
            $: 'CommitReport',
            priceUpdates: s.loadBoolean() ? loadCellRef<PriceUpdates>(s, PriceUpdates.fromSlice) : null,
            merkleRoots: loadSnakedCellOf(s, MerkleRoot.fromSlice),
        }
    },
    store(self: CommitReport, b: c.Builder): void {
        storeTolkNullable<PriceUpdates>(self.priceUpdates, b,
            (v,b) => storeCellRef<PriceUpdates>(v, b, PriceUpdates.store)
        );
        storeSnakedCellOf(self.merkleRoots, b, MerkleRoot.store);
    },
    toCell(self: CommitReport): c.Cell {
        return makeCellFrom<CommitReport>(self, CommitReport.store);
    }
}

/**
 > struct Any2TVMMessageV1Metadata {
 >     _header: uint256
 >     sourceChainSelector: uint64
 >     destChainSelector: uint64
 >     onRamp: Cell<CrossChainAddress>
 > }
 */
export interface Any2TVMMessageV1Metadata {
    readonly $: 'Any2TVMMessageV1Metadata'
    _header: uint256 /* = 94125445462166101730960845378898357591674356293939125390047719859241158747070 */
    sourceChainSelector: uint64
    destChainSelector: uint64
    onRamp: CrossChainAddress
}

export const Any2TVMMessageV1Metadata = {
    create(args: {
        _header?: uint256 /* = 94125445462166101730960845378898357591674356293939125390047719859241158747070 */
        sourceChainSelector: uint64
        destChainSelector: uint64
        onRamp: CrossChainAddress
    }): Any2TVMMessageV1Metadata {
        return {
            $: 'Any2TVMMessageV1Metadata',
            _header: 94125445462166101730960845378898357591674356293939125390047719859241158747070n,
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMMessageV1Metadata {
        return {
            $: 'Any2TVMMessageV1Metadata',
            _header: s.loadUintBig(256),
            sourceChainSelector: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            onRamp: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: Any2TVMMessageV1Metadata, b: c.Builder): void {
        b.storeUint(self._header, 256);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.destChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.onRamp, b, CrossChainAddress.store);
    },
    toCell(self: Any2TVMMessageV1Metadata): c.Cell {
        return makeCellFrom<Any2TVMMessageV1Metadata>(self, Any2TVMMessageV1Metadata.store);
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
 > struct OffRamp_DynamicConfig {
 >     feeQuoter: address
 >     permissionlessExecutionThresholdSeconds: uint32
 >     minGasLimit: coins
 >     minTTGasLimit: coins
 > }
 */
export interface OffRamp_DynamicConfig {
    readonly $: 'OffRamp_DynamicConfig'
    feeQuoter: c.Address
    permissionlessExecutionThresholdSeconds: uint32
    minGasLimit: coins
    minTTGasLimit: coins
}

export const OffRamp_DynamicConfig = {
    create(args: {
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
        minGasLimit: coins
        minTTGasLimit: coins
    }): OffRamp_DynamicConfig {
        return {
            $: 'OffRamp_DynamicConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DynamicConfig {
        return {
            $: 'OffRamp_DynamicConfig',
            feeQuoter: s.loadAddress(),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            minGasLimit: s.loadCoins(),
            minTTGasLimit: s.loadCoins(),
        }
    },
    store(self: OffRamp_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.feeQuoter);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeCoins(self.minGasLimit);
        b.storeCoins(self.minTTGasLimit);
    },
    toCell(self: OffRamp_DynamicConfig): c.Cell {
        return makeCellFrom<OffRamp_DynamicConfig>(self, OffRamp_DynamicConfig.store);
    }
}

/**
 > struct Config {
 >     chainSelector: uint64
 >     tokenAdminRegistry: address
 >     dynamicConfig: OffRamp_DynamicConfig
 > }
 */
export interface Config {
    readonly $: 'Config'
    chainSelector: uint64
    tokenAdminRegistry: c.Address
    dynamicConfig: OffRamp_DynamicConfig
}

export const Config = {
    create(args: {
        chainSelector: uint64
        tokenAdminRegistry: c.Address
        dynamicConfig: OffRamp_DynamicConfig
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
            tokenAdminRegistry: s.loadAddress(),
            dynamicConfig: OffRamp_DynamicConfig.fromSlice(s),
        }
    },
    store(self: Config, b: c.Builder): void {
        b.storeUint(self.chainSelector, 64);
        b.storeAddress(self.tokenAdminRegistry);
        OffRamp_DynamicConfig.store(self.dynamicConfig, b);
    },
    toCell(self: Config): c.Cell {
        return makeCellFrom<Config>(self, Config.store);
    }
}

/**
 > struct OffRamp_StaticConfig {
 >     rmnRouter: address
 >     tokenAdminRegistry: address
 >     chainSelector: uint64
 > }
 */
export interface OffRamp_StaticConfig {
    readonly $: 'OffRamp_StaticConfig'
    rmnRouter: c.Address
    tokenAdminRegistry: c.Address
    chainSelector: uint64
}

export const OffRamp_StaticConfig = {
    create(args: {
        rmnRouter: c.Address
        tokenAdminRegistry: c.Address
        chainSelector: uint64
    }): OffRamp_StaticConfig {
        return {
            $: 'OffRamp_StaticConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_StaticConfig {
        return {
            $: 'OffRamp_StaticConfig',
            rmnRouter: s.loadAddress(),
            tokenAdminRegistry: s.loadAddress(),
            chainSelector: s.loadUintBig(64),
        }
    },
    store(self: OffRamp_StaticConfig, b: c.Builder): void {
        b.storeAddress(self.rmnRouter);
        b.storeAddress(self.tokenAdminRegistry);
        b.storeUint(self.chainSelector, 64);
    },
    toCell(self: OffRamp_StaticConfig): c.Cell {
        return makeCellFrom<OffRamp_StaticConfig>(self, OffRamp_StaticConfig.store);
    }
}

/**
 > struct OffRamp_Config {
 >     staticConfig: OffRamp_StaticConfig
 >     dynamicConfig: Cell<OffRamp_DynamicConfig>
 > }
 */
export interface OffRamp_Config {
    readonly $: 'OffRamp_Config'
    staticConfig: OffRamp_StaticConfig
    dynamicConfig: OffRamp_DynamicConfig
}

export const OffRamp_Config = {
    create(args: {
        staticConfig: OffRamp_StaticConfig
        dynamicConfig: OffRamp_DynamicConfig
    }): OffRamp_Config {
        return {
            $: 'OffRamp_Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_Config {
        return {
            $: 'OffRamp_Config',
            staticConfig: OffRamp_StaticConfig.fromSlice(s),
            dynamicConfig: loadCellRef<OffRamp_DynamicConfig>(s, OffRamp_DynamicConfig.fromSlice),
        }
    },
    store(self: OffRamp_Config, b: c.Builder): void {
        OffRamp_StaticConfig.store(self.staticConfig, b);
        storeCellRef<OffRamp_DynamicConfig>(self.dynamicConfig, b, OffRamp_DynamicConfig.store);
    },
    toCell(self: OffRamp_Config): c.Cell {
        return makeCellFrom<OffRamp_Config>(self, OffRamp_Config.store);
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
    sender: CrossChainAddress
    data: c.Cell
    receiver: c.Address
    gasLimit: coins
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
}

export const Any2TVMRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: CrossChainAddress
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
            tokenAmounts: s.loadBoolean() ? loadSnakedCellOf(s, Any2TVMTokenTransfer.fromSlice) : null,
        }
    },
    store(self: Any2TVMRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        storeCellRef<CrossChainAddress>(self.sender, b, CrossChainAddress.store);
        b.storeRef(self.data);
        b.storeAddress(self.receiver);
        b.storeCoins(self.gasLimit);
        storeTolkNullable<SnakedCell<Any2TVMTokenTransfer>>(self.tokenAmounts, b, (v,b) => storeSnakedCellOf(v, b, Any2TVMTokenTransfer.store));
    },
    toCell(self: Any2TVMRampMessage): c.Cell {
        return makeCellFrom<Any2TVMRampMessage>(self, Any2TVMRampMessage.store);
    }
}

/**
 > struct Any2TVMRampMessageIDData {
 >     _leafDomainSeparator: bits256
 >     metadataHash: uint256
 >     metadata: Cell<Any2TVMRampMessageIDHeader>
 >     sender: Cell<CrossChainAddress>
 >     data: cell
 >     tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?
 > }
 */
export interface Any2TVMRampMessageIDData {
    readonly $: 'Any2TVMRampMessageIDData'
    _leafDomainSeparator: bits256 /* = hex('0000000000000000000000000000000000000000000000000000000000000000') as slice as bits256 */
    metadataHash: uint256
    metadata: Any2TVMRampMessageIDHeader
    sender: CrossChainAddress
    data: c.Cell
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
}

export const Any2TVMRampMessageIDData = {
    create(args: {
        _leafDomainSeparator?: bits256 /* = hex('0000000000000000000000000000000000000000000000000000000000000000') as slice as bits256 */
        metadataHash: uint256
        metadata: Any2TVMRampMessageIDHeader
        sender: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
    }): Any2TVMRampMessageIDData {
        return {
            $: 'Any2TVMRampMessageIDData',
            _leafDomainSeparator: new c.Slice(new c.BitReader(new c.BitString(Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), 0, 256)), []),
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMRampMessageIDData {
        return {
            $: 'Any2TVMRampMessageIDData',
            _leafDomainSeparator: loadTolkBitsN(s, 256),
            metadataHash: s.loadUintBig(256),
            metadata: loadCellRef<Any2TVMRampMessageIDHeader>(s, Any2TVMRampMessageIDHeader.fromSlice),
            sender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            data: s.loadRef(),
            tokenAmounts: s.loadBoolean() ? loadSnakedCellOf(s, Any2TVMTokenTransfer.fromSlice) : null,
        }
    },
    store(self: Any2TVMRampMessageIDData, b: c.Builder): void {
        storeTolkBitsN(self._leafDomainSeparator, 256, b);
        b.storeUint(self.metadataHash, 256);
        storeCellRef<Any2TVMRampMessageIDHeader>(self.metadata, b, Any2TVMRampMessageIDHeader.store);
        storeCellRef<CrossChainAddress>(self.sender, b, CrossChainAddress.store);
        b.storeRef(self.data);
        storeTolkNullable<SnakedCell<Any2TVMTokenTransfer>>(self.tokenAmounts, b, (v,b) => storeSnakedCellOf(v, b, Any2TVMTokenTransfer.store));
    },
    toCell(self: Any2TVMRampMessageIDData): c.Cell {
        return makeCellFrom<Any2TVMRampMessageIDData>(self, Any2TVMRampMessageIDData.store);
    }
}

/**
 > struct Any2TVMRampMessageIDHeader {
 >     messageId: uint256
 >     receiver: address
 >     sequenceNumber: uint64
 >     gasLimit: coins
 >     nonce: uint64
 > }
 */
export interface Any2TVMRampMessageIDHeader {
    readonly $: 'Any2TVMRampMessageIDHeader'
    messageId: uint256
    receiver: c.Address
    sequenceNumber: uint64
    gasLimit: coins
    nonce: uint64
}

export const Any2TVMRampMessageIDHeader = {
    create(args: {
        messageId: uint256
        receiver: c.Address
        sequenceNumber: uint64
        gasLimit: coins
        nonce: uint64
    }): Any2TVMRampMessageIDHeader {
        return {
            $: 'Any2TVMRampMessageIDHeader',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMRampMessageIDHeader {
        return {
            $: 'Any2TVMRampMessageIDHeader',
            messageId: s.loadUintBig(256),
            receiver: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            gasLimit: s.loadCoins(),
            nonce: s.loadUintBig(64),
        }
    },
    store(self: Any2TVMRampMessageIDHeader, b: c.Builder): void {
        b.storeUint(self.messageId, 256);
        b.storeAddress(self.receiver);
        b.storeUint(self.sequenceNumber, 64);
        b.storeCoins(self.gasLimit);
        b.storeUint(self.nonce, 64);
    },
    toCell(self: Any2TVMRampMessageIDHeader): c.Cell {
        return makeCellFrom<Any2TVMRampMessageIDHeader>(self, Any2TVMRampMessageIDHeader.store);
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
 >     token: address
 >     destGasAmount: coins
 >     extraData: cell?
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CrossChainAddress
    token: c.Address
    destGasAmount: coins
    extraData: c.Cell | null
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CrossChainAddress
        token: c.Address
        destGasAmount: coins
        extraData: c.Cell | null
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
            token: s.loadAddress(),
            destGasAmount: s.loadCoins(),
            extraData: s.loadBoolean() ? s.loadRef() : null,
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.token);
        b.storeCoins(self.destGasAmount);
        storeTolkNullable<c.Cell>(self.extraData, b,
            (v,b) => b.storeRef(v)
        );
        b.storeUint(self.amount, 256);
    },
    toCell(self: Any2TVMTokenTransfer): c.Cell {
        return makeCellFrom<Any2TVMTokenTransfer>(self, Any2TVMTokenTransfer.store);
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
 >     config: Cell<OffRamp_Config>
 >     ocr3Base: Cell<OCR3Base>
 >     cursedSubjects: CursedSubjects
 >     sourceChainConfigs: map<uint64, SourceChainConfig>
 >     latestPriceSequenceNumber: uint64
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint32
    ownable: Ownable2Step
    config: OffRamp_Config
    ocr3Base: OCR3Base
    cursedSubjects: CursedSubjects
    sourceChainConfigs: Map<uint64, SourceChainConfig> /* = [] as map<uint64, SourceChainConfig> */
    latestPriceSequenceNumber: uint64 /* = 0 */
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        config: OffRamp_Config
        ocr3Base: OCR3Base
        cursedSubjects: CursedSubjects
        sourceChainConfigs: Map<uint64, SourceChainConfig> /* = [] as map<uint64, SourceChainConfig> */
        latestPriceSequenceNumber?: uint64 /* = 0 */
    }): Storage {
        return {
            $: 'Storage',
            latestPriceSequenceNumber: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
            config: loadCellRef<OffRamp_Config>(s, OffRamp_Config.fromSlice),
            ocr3Base: loadCellRef<OCR3Base>(s, OCR3Base.fromSlice),
            cursedSubjects: CursedSubjects.fromSlice(s),
            sourceChainConfigs: dictToMap(c.Dictionary.load<uint64, SourceChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store), s)),
            latestPriceSequenceNumber: s.loadUintBig(64),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        storeCellRef<OffRamp_Config>(self.config, b, OffRamp_Config.store);
        storeCellRef<OCR3Base>(self.ocr3Base, b, OCR3Base.store);
        CursedSubjects.store(self.cursedSubjects, b);
        b.storeDict<uint64, SourceChainConfig>(mapToDict(self.sourceChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store));
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
    priceUpdates: PriceUpdates | null
}

export const CommitReportAccepted = {
    create(args: {
        merkleRoot: MerkleRoot | null
        priceUpdates: PriceUpdates | null
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
        storeTolkNullable<PriceUpdates>(self.priceUpdates, b,
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
 >     config: OffRamp_DynamicConfig
 > }
 */
export interface OffRamp_DynamicConfigSet {
    readonly $: 'OffRamp_DynamicConfigSet'
    config: OffRamp_DynamicConfig
}

export const OffRamp_DynamicConfigSet = {
    create(args: {
        config: OffRamp_DynamicConfig
    }): OffRamp_DynamicConfigSet {
        return {
            $: 'OffRamp_DynamicConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DynamicConfigSet {
        return {
            $: 'OffRamp_DynamicConfigSet',
            config: OffRamp_DynamicConfig.fromSlice(s),
        }
    },
    store(self: OffRamp_DynamicConfigSet, b: c.Builder): void {
        OffRamp_DynamicConfig.store(self.config, b);
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
 > enum MultiOCR3Base_Error { 16 variants }
 */
export type MultiOCR3Base_Error = bigint

export const MultiOCR3Base_Error = {
    BigFMustBePositive: 54500n,
    StaticConfigCannotBeChanged: 54501n,
    TooManySigners: 54502n,
    BigFTooHigh: 54503n,
    TooManyTransmitters: 54504n,
    NoTransmitters: 54505n,
    RepeatedSigners: 54506n,
    RepeatedTransmitters: 54507n,
    ConfigDigestMismatch: 54508n,
    UnauthorizedTransmitter: 54509n,
    WrongNumberOfSignatures: 54510n,
    UnauthorizedSigner: 54511n,
    NonUniqueSignatures: 54512n,
    InvalidSignature: 54513n,
    NonExistentOcrPluginType: 54514n,
    NoSigners: 54515n,

    fromSlice(s: c.Slice): MultiOCR3Base_Error {
        return s.loadUintBig(16);
    },
    store(self: MultiOCR3Base_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: MultiOCR3Base_Error): c.Cell {
        return makeCellFrom<MultiOCR3Base_Error>(self, MultiOCR3Base_Error.store);
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
            tokenPriceUpdates: loadSnakedCellOf(s, TokenPriceUpdate.fromSlice),
            gasPriceUpdates: loadSnakedCellOf(s, GasPriceUpdate.fromSlice),
        }
    },
    store(self: PriceUpdates, b: c.Builder): void {
        storeSnakedCellOf(self.tokenPriceUpdates, b, TokenPriceUpdate.store);
        storeSnakedCellOf(self.gasPriceUpdates, b, GasPriceUpdate.store);
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
        'MerkleMultiProof_Error.InvalidProofLeavesCannotBeEmpty': 12000,
        'MerkleMultiProof_Error.InvalidProofLeavesTooLarge': 12001,
        'MerkleMultiProof_Error.InvalidProofProofsTooLarge': 12002,
        'MerkleMultiProof_Error.InvalidProofTotalHashesExceededMax': 12003,
        'MerkleMultiProof_Error.InvalidProofDataSizeMismatch': 12004,
        'Utils_Error.InvalidData': 13500,
        'Utils_Error.BitmapOutOfBounds': 13501,
        'Upgradeable_Error.VersionMismatch': 19900,
        'OffRamp_Error.MessageNotFromOwnedContract': 22100,
        'OffRamp_Error.SourceChainNotEnabled': 22101,
        'OffRamp_Error.EmptyExecutionReport': 22102,
        'OffRamp_Error.InvalidMessageDestChainSelector': 22103,
        'OffRamp_Error.SourceChainSelectorMismatch': 22104,
        'OffRamp_Error.InvalidOnRampUpdate': 22105,
        'OffRamp_Error.InsufficientFee': 22106,
        'OffRamp_Error.SubjectCursed': 22107,
        'OffRamp_Error.Unauthorized': 22108,
        'OffRamp_Error.ZeroAddressNotAllowed': 22109,
        'OffRamp_Error.TooManyMessagesInReport': 22110,
        'OffRamp_Error.SignatureVerificationRequiredInCommitPlugin': 22111,
        'OffRamp_Error.SignatureVerificationNotAllowedInExecutionPlugin': 22112,
        'OffRamp_Error.InvalidInterval': 22113,
        'OffRamp_Error.BatchingNotSupported': 22114,
        'OffRamp_Error.OnRampAddressMismatch': 22115,
        'OffRamp_Error.EmptyCommitReport': 22116,
        'OffRamp_Error.MerkleRootCannotBeZero': 22117,
        'OffRamp_Error.UnsupportedNumberOfTokens': 22118,
        'OffRamp_Error.ManualExecutionGasAmountCountMismatch': 22119,
        'OffRamp_Error.InvalidManualExecutionGasLimit': 22120,
        'OffRamp_Error.UnexpectedTokenData': 22121,
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
        config: OffRamp_Config
        ocr3Base: OCR3Base
        cursedSubjects: CursedSubjects
        sourceChainConfigs: Map<uint64, SourceChainConfig> /* = [] as map<uint64, SourceChainConfig> */
        latestPriceSequenceNumber?: uint64 /* = 0 */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OffRamp.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OffRamp(address, initialState);
    }

    static createCellOfOffRampCommit(body: {
        queryId?: uint64
        reportContext: ReportContext
        report: CommitReport
        signatures: SnakedCell<SignatureEd25519>
    }) {
        return OffRamp_Commit.toCell(OffRamp_Commit.create(body));
    }

    static createCellOfOffRampExecute(body: {
        queryId?: uint64
        reportContext: ReportContext
        report: ExecutionReport
    }) {
        return OffRamp_Execute.toCell(OffRamp_Execute.create(body));
    }

    static createCellOfOffRampExecuteValidated(body: {
        queryId?: uint64
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
        offchainTokenData: lisp_list<lisp_list<c.Cell>>
    }) {
        return OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body));
    }

    static createCellOfOffRampManuallyExecute(body: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }) {
        return OffRamp_ManuallyExecute.toCell(OffRamp_ManuallyExecute.create(body));
    }

    static createCellOfOffRampDispatchValidated(body: {
        queryId?: uint64
        message: Any2TVMRampMessage
        execId: uint192
        effectiveGasLimit: coins
    }) {
        return OffRamp_DispatchValidated.toCell(OffRamp_DispatchValidated.create(body));
    }

    static createCellOfOffRampReleaseOrMint(body: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
        destGasAmount: coins
        requestedFinalityConfig: uint32
        request: TokenPool_ReleaseOrMintInV1
    }) {
        return OffRamp_ReleaseOrMint.toCell(OffRamp_ReleaseOrMint.create(body));
    }

    static createCellOfOffRampUpdateSourceChainConfigs(body: {
        queryId?: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }) {
        return OffRamp_UpdateSourceChainConfigs.toCell(OffRamp_UpdateSourceChainConfigs.create(body));
    }

    static createCellOfOffRampCCIPReceiveConfirm(body: {
        queryId?: uint64
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
        queryId?: uint64
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }) {
        return OffRamp_NotifyFailure.toCell(OffRamp_NotifyFailure.create(body));
    }

    static createCellOfOffRampNotifySuccess(body: {
        queryId?: uint64
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
        queryId?: uint64
        config: OffRamp_DynamicConfig
    }) {
        return OffRamp_SetDynamicConfig.toCell(OffRamp_SetDynamicConfig.create(body));
    }

    static createCellOfOCR3BaseSetOCR3Config(body: {
        queryId?: uint64
        configDigest: uint256
        ocrPluginType: uint16
        bigF: uint8
        isSignatureVerificationEnabled: boolean
        signers: SnakedCell<uint256>
        transmitters: SnakedCell<c.Address>
    }) {
        return OCR3Base_SetOCR3Config.toCell(OCR3Base_SetOCR3Config.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId?: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
    }

    static createCellOfWithdrawableWithdraw(body: {
        queryId?: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }) {
        return Withdrawable_Withdraw.toCell(Withdrawable_Withdraw.create(body));
    }

    static createCellOfOwnable2StepTransferOwnership(body: {
        queryId?: uint64
        newOwner: c.Address
    }) {
        return Ownable2Step_TransferOwnership.toCell(Ownable2Step_TransferOwnership.create(body));
    }

    static createCellOfOwnable2StepAcceptOwnership(body: {
        queryId?: uint64
    }) {
        return Ownable2Step_AcceptOwnership.toCell(Ownable2Step_AcceptOwnership.create(body));
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

    async sendOffRampCommit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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
        queryId?: uint64
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
        queryId?: uint64
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
        offchainTokenData: lisp_list<lisp_list<c.Cell>>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampManuallyExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ManuallyExecute.toCell(OffRamp_ManuallyExecute.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampDispatchValidated(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        message: Any2TVMRampMessage
        execId: uint192
        effectiveGasLimit: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_DispatchValidated.toCell(OffRamp_DispatchValidated.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
        destGasAmount: coins
        requestedFinalityConfig: uint32
        request: TokenPool_ReleaseOrMintInV1
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ReleaseOrMint.toCell(OffRamp_ReleaseOrMint.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampUpdateSourceChainConfigs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        configs: SnakedCell<SourceChainConfigUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_UpdateSourceChainConfigs.toCell(OffRamp_UpdateSourceChainConfigs.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampCCIPReceiveConfirm(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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
        queryId?: uint64
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
        queryId?: uint64
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
        queryId?: uint64
        config: OffRamp_DynamicConfig
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_SetDynamicConfig.toCell(OffRamp_SetDynamicConfig.create(body)),
            ...extraOptions
        });
    }

    async sendOCR3BaseSetOCR3Config(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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

    async sendUpgradeableUpgrade(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        code: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body)),
            ...extraOptions
        });
    }

    async sendWithdrawableWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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

    async sendOwnable2StepTransferOwnership(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        newOwner: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Ownable2Step_TransferOwnership.toCell(Ownable2Step_TransferOwnership.create(body)),
            ...extraOptions
        });
    }

    async sendOwnable2StepAcceptOwnership(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Ownable2Step_AcceptOwnership.toCell(Ownable2Step_AcceptOwnership.create(body)),
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
            commit: r.readNullable<OCRConfig>(
                (r) => r.readCellRef<OCRConfig>(OCRConfig.fromSlice)
            ),
            execute: r.readNullable<OCRConfig>(
                (r) => r.readCellRef<OCRConfig>(OCRConfig.fromSlice)
            ),
        });
    }

    async getConfig(provider: ContractProvider): Promise<Config> {
        const r = StackReader.fromGetMethod(6, await provider.get('config', []));
        return ({
            $: 'Config',
            chainSelector: r.readBigInt(),
            tokenAdminRegistry: r.readSlice().loadAddress(),
            dynamicConfig: ({
                $: 'OffRamp_DynamicConfig',
                feeQuoter: r.readSlice().loadAddress(),
                permissionlessExecutionThresholdSeconds: r.readBigInt(),
                minGasLimit: r.readBigInt(),
                minTTGasLimit: r.readBigInt(),
            }),
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

    async getAllSourceChainConfigs(provider: ContractProvider): Promise<Map<uint64, SourceChainConfig>> {
        const r = StackReader.fromGetMethod(1, await provider.get('allSourceChainConfigs', []));
        return dictToMap(r.readDictionary<uint64, SourceChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store)));
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
