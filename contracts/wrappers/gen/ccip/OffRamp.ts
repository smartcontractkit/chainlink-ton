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
 >     message: Cell<Any2TVMRampMessage>
 >     permissionlessExecutionThresholdSeconds: uint32
 >     metadataHash: uint256
 >     gasOverride: GasOverride?
 > }
 */
export interface MerkleRoot_Validate {
    readonly $: 'MerkleRoot_Validate'
    message: Any2TVMRampMessage
    permissionlessExecutionThresholdSeconds: uint32
    metadataHash: uint256
    gasOverride: GasOverride | null
}

export const MerkleRoot_Validate = {
    PREFIX: 0x038ede91,

    create(args: {
        message: Any2TVMRampMessage
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: GasOverride | null
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
            gasOverride: s.loadBoolean() ? GasOverride.fromSlice(s) : null,
        }
    },
    store(self: MerkleRoot_Validate, b: c.Builder): void {
        b.storeUint(0x038ede91, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<GasOverride>(self.gasOverride, b, GasOverride.store);
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
 >     gasOverride: GasOverride?
 >     root: address
 >     sequenceNumber: uint64
 >     sourceChainSelector: uint64
 >     messageId: uint256
 >     tokenAdminRegistry: Cell<address>?
 > }
 */
export interface ReceiveExecutor_InitExecute {
    readonly $: 'ReceiveExecutor_InitExecute'
    gasOverride: GasOverride | null /* = null */
    root: c.Address
    sequenceNumber: uint64
    sourceChainSelector: uint64
    messageId: uint256
    tokenAdminRegistry: c.Address | null /* = null */
}

export const ReceiveExecutor_InitExecute = {
    PREFIX: 0x64cd2fd2,

    create(args: {
        gasOverride?: GasOverride | null /* = null */
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
        tokenAdminRegistry?: c.Address | null /* = null */
    }): ReceiveExecutor_InitExecute {
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: null,
            tokenAdminRegistry: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_InitExecute {
        loadAndCheckPrefix32(s, 0x64cd2fd2, 'ReceiveExecutor_InitExecute');
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: s.loadBoolean() ? GasOverride.fromSlice(s) : null,
            root: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            sourceChainSelector: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
            tokenAdminRegistry: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: ReceiveExecutor_InitExecute, b: c.Builder): void {
        b.storeUint(0x64cd2fd2, 32);
        storeTolkNullable<GasOverride>(self.gasOverride, b, GasOverride.store);
        b.storeAddress(self.root);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.messageId, 256);
        storeTolkNullable<c.Address>(self.tokenAdminRegistry, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: ReceiveExecutor_InitExecute): c.Cell {
        return makeCellFrom<ReceiveExecutor_InitExecute>(self, ReceiveExecutor_InitExecute.store);
    }
}

/**
 > struct (0x07265cda) ReleaseOrMint_ReleaseOrMintBounced {
 >     queryId: uint64
 >     exitCode: int32
 > }
 */
export interface ReleaseOrMint_ReleaseOrMintBounced {
    readonly $: 'ReleaseOrMint_ReleaseOrMintBounced'
    queryId: uint64
    exitCode: int32
}

export const ReleaseOrMint_ReleaseOrMintBounced = {
    PREFIX: 0x07265cda,

    create(args: {
        queryId?: uint64
        exitCode: int32
    }): ReleaseOrMint_ReleaseOrMintBounced {
        return {
            $: 'ReleaseOrMint_ReleaseOrMintBounced',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReleaseOrMint_ReleaseOrMintBounced {
        loadAndCheckPrefix32(s, 0x07265cda, 'ReleaseOrMint_ReleaseOrMintBounced');
        return {
            $: 'ReleaseOrMint_ReleaseOrMintBounced',
            queryId: s.loadUintBig(64),
            exitCode: s.loadIntBig(32),
        }
    },
    store(self: ReleaseOrMint_ReleaseOrMintBounced, b: c.Builder): void {
        b.storeUint(0x07265cda, 32);
        b.storeUint(self.queryId, 64);
        b.storeInt(self.exitCode, 32);
    },
    toCell(self: ReleaseOrMint_ReleaseOrMintBounced): c.Cell {
        return makeCellFrom<ReleaseOrMint_ReleaseOrMintBounced>(self, ReleaseOrMint_ReleaseOrMintBounced.store);
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
 >     message: Cell<Any2TVMMessage>
 >     execId: ReceiveExecutorId
 >     receiver: address
 >     gasLimit: coins
 > }
 */
export interface Router_RouteMessage {
    readonly $: 'Router_RouteMessage'
    message: Any2TVMMessage
    execId: ReceiveExecutorId
    receiver: c.Address
    gasLimit: coins
}

export const Router_RouteMessage = {
    PREFIX: 0xfc69c50b,

    create(args: {
        message: Any2TVMMessage
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
 >     message: Cell<Any2TVMRampMessage>
 >     root: MerkleRootId
 >     metadataHash: uint256
 >     gasOverride: GasOverride?
 >     executionState: ExecutionState
 > }
 */
export interface OffRamp_ExecuteValidated {
    readonly $: 'OffRamp_ExecuteValidated'
    message: Any2TVMRampMessage
    root: MerkleRootId
    metadataHash: uint256
    gasOverride: GasOverride | null /* = null */
    executionState: ExecutionState
}

export const OffRamp_ExecuteValidated = {
    PREFIX: 0xc73d5a8a,

    create(args: {
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
    }): OffRamp_ExecuteValidated {
        return {
            $: 'OffRamp_ExecuteValidated',
            gasOverride: null,
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
            gasOverride: s.loadBoolean() ? GasOverride.fromSlice(s) : null,
            executionState: ExecutionState.fromSlice(s),
        }
    },
    store(self: OffRamp_ExecuteValidated, b: c.Builder): void {
        b.storeUint(0xc73d5a8a, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        MerkleRootId.store(self.root, b);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<GasOverride>(self.gasOverride, b, GasOverride.store);
        ExecutionState.store(self.executionState, b);
    },
    toCell(self: OffRamp_ExecuteValidated): c.Cell {
        return makeCellFrom<OffRamp_ExecuteValidated>(self, OffRamp_ExecuteValidated.store);
    }
}

/**
 > struct (0xfef433bd) OffRamp_ManuallyExecute_V2 {
 >     queryId: uint64
 >     report: ExecutionReport
 >     gasOverride: GasOverride
 > }
 */
export interface OffRamp_ManuallyExecute_V2 {
    readonly $: 'OffRamp_ManuallyExecute_V2'
    queryId: uint64
    report: ExecutionReport
    gasOverride: GasOverride
}

export const OffRamp_ManuallyExecute_V2 = {
    PREFIX: 0xfef433bd,

    create(args: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }): OffRamp_ManuallyExecute_V2 {
        return {
            $: 'OffRamp_ManuallyExecute_V2',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_ManuallyExecute_V2 {
        loadAndCheckPrefix32(s, 0xfef433bd, 'OffRamp_ManuallyExecute_V2');
        return {
            $: 'OffRamp_ManuallyExecute_V2',
            queryId: s.loadUintBig(64),
            report: ExecutionReport.fromSlice(s),
            gasOverride: GasOverride.fromSlice(s),
        }
    },
    store(self: OffRamp_ManuallyExecute_V2, b: c.Builder): void {
        b.storeUint(0xfef433bd, 32);
        b.storeUint(self.queryId, 64);
        ExecutionReport.store(self.report, b);
        GasOverride.store(self.gasOverride, b);
    },
    toCell(self: OffRamp_ManuallyExecute_V2): c.Cell {
        return makeCellFrom<OffRamp_ManuallyExecute_V2>(self, OffRamp_ManuallyExecute_V2.store);
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
 >     message: Cell<Any2TVMRampMessage>
 >     execId: uint192
 >     receiverExecutionGasLimit: coins?
 > }
 */
export interface OffRamp_DispatchValidated {
    readonly $: 'OffRamp_DispatchValidated'
    message: Any2TVMRampMessage
    execId: uint192
    receiverExecutionGasLimit: coins | null
}

export const OffRamp_DispatchValidated = {
    PREFIX: 0x58cfcb02,

    create(args: {
        message: Any2TVMRampMessage
        execId: uint192
        receiverExecutionGasLimit: coins | null
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
            receiverExecutionGasLimit: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: OffRamp_DispatchValidated, b: c.Builder): void {
        b.storeUint(0x58cfcb02, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.execId, 192);
        storeTolkNullable<coins>(self.receiverExecutionGasLimit, b,
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
        queryId?: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
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
        queryId?: uint64
        receiveExecutorCode: c.Cell | null
        merkleRootCode: c.Cell | null
    }): OffRamp_UpdateDeployables {
        return {
            $: 'OffRamp_UpdateDeployables',
            ...args,
            queryId: args.queryId ?? 0n
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
 > struct (0x7deaf076) OffRamp_ReleaseOrMint {
 >     queryId: uint64
 >     execId: ReceiveExecutorId
 >     tokenPool: address
 >     requestedFinalityConfig: uint32
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 > }
 */
export interface OffRamp_ReleaseOrMint {
    readonly $: 'OffRamp_ReleaseOrMint'
    queryId: uint64
    execId: ReceiveExecutorId
    tokenPool: c.Address
    requestedFinalityConfig: uint32
    request: TokenPool_ReleaseOrMintInV1
}

export const OffRamp_ReleaseOrMint = {
    PREFIX: 0x7deaf076,

    create(args: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
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
            requestedFinalityConfig: s.loadUintBig(32),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
        }
    },
    store(self: OffRamp_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x7deaf076, 32);
        b.storeUint(self.queryId, 64);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
    },
    toCell(self: OffRamp_ReleaseOrMint): c.Cell {
        return makeCellFrom<OffRamp_ReleaseOrMint>(self, OffRamp_ReleaseOrMint.store);
    }
}

/**
 > enum OffRamp_Error { 19 variants }
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
            proofs: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
            proofFlagBits: s.loadUintBig(256),
        }
    },
    store(self: ExecutionReport, b: c.Builder): void {
        b.storeUint(self.sourceChainSelector, 64);
        b.storeRef(self.messages);
        b.storeRef(self.offchainTokenData);
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
 > }
 */
export interface GasOverride {
    readonly $: 'GasOverride'
    receiverExecutionGasLimit: coins | null /* = null */
}

export const GasOverride = {
    create(args: {
        receiverExecutionGasLimit?: coins | null /* = null */
    }): GasOverride {
        return {
            $: 'GasOverride',
            receiverExecutionGasLimit: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): GasOverride {
        return {
            $: 'GasOverride',
            receiverExecutionGasLimit: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: GasOverride, b: c.Builder): void {
        storeTolkNullable<coins>(self.receiverExecutionGasLimit, b,
            (v,b) => b.storeCoins(v)
        );
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
 >     destGasAmount: uint32
 >     extraData: cell?
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CrossChainAddress
    token: c.Address
    destGasAmount: uint32
    extraData: c.Cell | null
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CrossChainAddress
        token: c.Address
        destGasAmount: uint32
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
            destGasAmount: s.loadUintBig(32),
            extraData: s.loadBoolean() ? s.loadRef() : null,
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.token);
        b.storeUint(self.destGasAmount, 32);
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
    deployables: OffRamp_Deployables
    feeQuoter: c.Address
    ocr3Base: OCR3Base
    cursedSubjects: CursedSubjects
    chainSelector: uint64
    permissionlessExecutionThresholdSeconds: uint32
    sourceChainConfigs: Map<uint64, SourceChainConfig> /* = [] as map<uint64, SourceChainConfig> */
    latestPriceSequenceNumber: uint64 /* = 0 */
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        deployables: OffRamp_Deployables
        feeQuoter: c.Address
        ocr3Base: OCR3Base
        cursedSubjects: CursedSubjects
        chainSelector: uint64
        permissionlessExecutionThresholdSeconds: uint32
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
            deployables: loadCellRef<OffRamp_Deployables>(s, OffRamp_Deployables.fromSlice),
            feeQuoter: s.loadAddress(),
            ocr3Base: loadCellRef<OCR3Base>(s, OCR3Base.fromSlice),
            cursedSubjects: CursedSubjects.fromSlice(s),
            chainSelector: s.loadUintBig(64),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            sourceChainConfigs: dictToMap(c.Dictionary.load<uint64, SourceChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<SourceChainConfig>(SourceChainConfig.fromSlice, SourceChainConfig.store), s)),
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
        deployables: OffRamp_Deployables
        feeQuoter: c.Address
        ocr3Base: OCR3Base
        cursedSubjects: CursedSubjects
        chainSelector: uint64
        permissionlessExecutionThresholdSeconds: uint32
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
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
    }) {
        return OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body));
    }

    static createCellOfOffRampManuallyExecuteV2(body: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }) {
        return OffRamp_ManuallyExecute_V2.toCell(OffRamp_ManuallyExecute_V2.create(body));
    }

    static createCellOfOffRampDispatchValidated(body: {
        message: Any2TVMRampMessage
        execId: uint192
        receiverExecutionGasLimit: coins | null
    }) {
        return OffRamp_DispatchValidated.toCell(OffRamp_DispatchValidated.create(body));
    }

    static createCellOfOffRampReleaseOrMint(body: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
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
        queryId?: uint64
        feeQuoter: c.Address
        permissionlessExecutionThresholdSeconds: uint32
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

    static createCellOfOffRampUpdateDeployables(body: {
        queryId?: uint64
        receiveExecutorCode: c.Cell | null
        merkleRootCode: c.Cell | null
    }) {
        return OffRamp_UpdateDeployables.toCell(OffRamp_UpdateDeployables.create(body));
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
        message: Any2TVMRampMessage
        root: MerkleRootId
        metadataHash: uint256
        gasOverride?: GasOverride | null /* = null */
        executionState: ExecutionState
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ExecuteValidated.toCell(OffRamp_ExecuteValidated.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampManuallyExecuteV2(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        report: ExecutionReport
        gasOverride: GasOverride
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRamp_ManuallyExecute_V2.toCell(OffRamp_ManuallyExecute_V2.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampDispatchValidated(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: Any2TVMRampMessage
        execId: uint192
        receiverExecutionGasLimit: coins | null
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
        queryId?: uint64
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

    async sendOffRampUpdateDeployables(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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
