// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a LockReleaseLockboxTokenPool contract in Tolk.
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'LockReleaseLockboxTokenPool.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > LockReleaseLockboxTokenPool.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint128 = bigint
type uint256 = bigint

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
 > type AccessControl_InMessage = AccessControl_GrantRole | AccessControl_RevokeRole | AccessControl_RenounceRole
 */
export type AccessControl_InMessage =
    | AccessControl_GrantRole
    | AccessControl_RevokeRole
    | AccessControl_RenounceRole

export const AccessControl_InMessage = {
    fromSlice(s: c.Slice): AccessControl_InMessage {
        return lookupPrefix(s, 0x95cd540f, 32) ? AccessControl_GrantRole.fromSlice(s) :
            lookupPrefix(s, 0x969b0db9, 32) ? AccessControl_RevokeRole.fromSlice(s) :
            lookupPrefix(s, 0x39452c46, 32) ? AccessControl_RenounceRole.fromSlice(s) :
            throwNonePrefixMatch('AccessControl_InMessage');
    },
    store(self: AccessControl_InMessage, b: c.Builder): void {
        switch (self.$) {
            case 'AccessControl_GrantRole':
                AccessControl_GrantRole.store(self, b);
                break;
            case 'AccessControl_RevokeRole':
                AccessControl_RevokeRole.store(self, b);
                break;
            case 'AccessControl_RenounceRole':
                AccessControl_RenounceRole.store(self, b);
                break;
        }
    },
    toCell(self: AccessControl_InMessage): c.Cell {
        return makeCellFrom<AccessControl_InMessage>(self, AccessControl_InMessage.store);
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
 > struct (0xd53276db) ReturnExcessesBack {
 >     queryId: uint64
 > }
 */
export interface ReturnExcessesBack {
    readonly $: 'ReturnExcessesBack'
    queryId: uint64
}

export const ReturnExcessesBack = {
    PREFIX: 0xd53276db,

    create(args: {
        queryId?: uint64
    }): ReturnExcessesBack {
        return {
            $: 'ReturnExcessesBack',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ReturnExcessesBack {
        loadAndCheckPrefix32(s, 0xd53276db, 'ReturnExcessesBack');
        return {
            $: 'ReturnExcessesBack',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: ReturnExcessesBack, b: c.Builder): void {
        b.storeUint(0xd53276db, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: ReturnExcessesBack): c.Cell {
        return makeCellFrom<ReturnExcessesBack>(self, ReturnExcessesBack.store);
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
 > struct CursePolicy {
 >     admin: Ownable2Step
 >     rbac: Cell<AccessControl_Data>
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface CursePolicy {
    readonly $: 'CursePolicy'
    admin: Ownable2Step
    rbac: AccessControl_Data
    cursedSubjects: CursedSubjects
}

export const CursePolicy = {
    create(args: {
        admin: Ownable2Step
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
            admin: Ownable2Step.fromSlice(s),
            rbac: loadCellRef<AccessControl_Data>(s, AccessControl_Data.fromSlice),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: CursePolicy, b: c.Builder): void {
        Ownable2Step.store(self.admin, b);
        storeCellRef<AccessControl_Data>(self.rbac, b, AccessControl_Data.store);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: CursePolicy): c.Cell {
        return makeCellFrom<CursePolicy>(self, CursePolicy.store);
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
 >     budget: TokenPool_Budget
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: TokenPool_AdminConfig
    localPolicy: TokenPool_LocalPolicy
    tokenDecimals: uint8
    remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
    tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
    budget: TokenPool_Budget /* = TokenPool_Budget { MinValueConfig { null as null as coins? } as MinValueConfig, MinValueConfig { null as null as coins? } as MinValueConfig } */
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: TokenPool_AdminConfig
        localPolicy: TokenPool_LocalPolicy
        tokenDecimals: uint8
        remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
        tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
        budget?: TokenPool_Budget /* = TokenPool_Budget { MinValueConfig { null as null as coins? } as MinValueConfig, MinValueConfig { null as null as coins? } as MinValueConfig } */
    }): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            budget: { $: 'TokenPool_Budget', safety: { $: 'MinValueConfig', value: null }, admission: { $: 'MinValueConfig', value: null } },
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
            budget: TokenPool_Budget.fromSlice(s),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_LocalPolicy>(self.localPolicy, b, TokenPool_LocalPolicy.store);
        b.storeUint(self.tokenDecimals, 8);
        b.storeDict<uint64, TokenPool_RemoteChainConfig>(mapToDict(self.remoteChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store));
        b.storeDict<uint64, TokenPool_TokenTransferFeeConfig>(mapToDict(self.tokenTransferFeeConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store));
        TokenPool_Budget.store(self.budget, b);
    },
    toCell(self: TokenPool_Data): c.Cell {
        return makeCellFrom<TokenPool_Data>(self, TokenPool_Data.store);
    }
}

/**
 > struct TokenPool_Budget {
 >     safety: MinValueConfig
 >     admission: MinValueConfig
 > }
 */
export interface TokenPool_Budget {
    readonly $: 'TokenPool_Budget'
    safety: MinValueConfig /* = MinValueConfig { null as null as coins? } */
    admission: MinValueConfig /* = MinValueConfig { null as null as coins? } */
}

export const TokenPool_Budget = {
    create(args: {
        safety?: MinValueConfig /* = MinValueConfig { null as null as coins? } */
        admission?: MinValueConfig /* = MinValueConfig { null as null as coins? } */
    }): TokenPool_Budget {
        return {
            $: 'TokenPool_Budget',
            safety: { $: 'MinValueConfig', value: null },
            admission: { $: 'MinValueConfig', value: null },
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_Budget {
        return {
            $: 'TokenPool_Budget',
            safety: MinValueConfig.fromSlice(s),
            admission: MinValueConfig.fromSlice(s),
        }
    },
    store(self: TokenPool_Budget, b: c.Builder): void {
        MinValueConfig.store(self.safety, b);
        MinValueConfig.store(self.admission, b);
    },
    toCell(self: TokenPool_Budget): c.Cell {
        return makeCellFrom<TokenPool_Budget>(self, TokenPool_Budget.store);
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
 > struct (0xfdd0edc0) TokenPool_Curse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface TokenPool_Curse {
    readonly $: 'TokenPool_Curse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const TokenPool_Curse = {
    PREFIX: 0xfdd0edc0,

    create(args: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }): TokenPool_Curse {
        return {
            $: 'TokenPool_Curse',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_Curse {
        loadAndCheckPrefix32(s, 0xfdd0edc0, 'TokenPool_Curse');
        return {
            $: 'TokenPool_Curse',
            queryId: s.loadUintBig(64),
            subjects: loadSnakedCellOf(s, (s) => s.loadUintBig(128)),
        }
    },
    store(self: TokenPool_Curse, b: c.Builder): void {
        b.storeUint(0xfdd0edc0, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.subjects, b, (v, b) => b.storeUint(v, 128));
    },
    toCell(self: TokenPool_Curse): c.Cell {
        return makeCellFrom<TokenPool_Curse>(self, TokenPool_Curse.store);
    }
}

/**
 > struct (0x61cf16f1) TokenPool_Uncurse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface TokenPool_Uncurse {
    readonly $: 'TokenPool_Uncurse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const TokenPool_Uncurse = {
    PREFIX: 0x61cf16f1,

    create(args: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }): TokenPool_Uncurse {
        return {
            $: 'TokenPool_Uncurse',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_Uncurse {
        loadAndCheckPrefix32(s, 0x61cf16f1, 'TokenPool_Uncurse');
        return {
            $: 'TokenPool_Uncurse',
            queryId: s.loadUintBig(64),
            subjects: loadSnakedCellOf(s, (s) => s.loadUintBig(128)),
        }
    },
    store(self: TokenPool_Uncurse, b: c.Builder): void {
        b.storeUint(0x61cf16f1, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.subjects, b, (v, b) => b.storeUint(v, 128));
    },
    toCell(self: TokenPool_Uncurse): c.Cell {
        return makeCellFrom<TokenPool_Uncurse>(self, TokenPool_Uncurse.store);
    }
}

/**
 > struct (0x72b535a5) TokenPool_RMNOwnableMessage {
 >     content: RemainingBitsAndRefs
 > }
 */
export interface TokenPool_RMNOwnableMessage {
    readonly $: 'TokenPool_RMNOwnableMessage'
    content: RemainingBitsAndRefs
}

export const TokenPool_RMNOwnableMessage = {
    PREFIX: 0x72b535a5,

    create(args: {
        content: RemainingBitsAndRefs
    }): TokenPool_RMNOwnableMessage {
        return {
            $: 'TokenPool_RMNOwnableMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RMNOwnableMessage {
        loadAndCheckPrefix32(s, 0x72b535a5, 'TokenPool_RMNOwnableMessage');
        return {
            $: 'TokenPool_RMNOwnableMessage',
            content: loadTolkRemaining(s),
        }
    },
    store(self: TokenPool_RMNOwnableMessage, b: c.Builder): void {
        b.storeUint(0x72b535a5, 32);
        storeTolkRemaining(self.content, b);
    },
    toCell(self: TokenPool_RMNOwnableMessage): c.Cell {
        return makeCellFrom<TokenPool_RMNOwnableMessage>(self, TokenPool_RMNOwnableMessage.store);
    }
}

/**
 > struct (0x2e7a1790) TokenPool_RMNAccessControlMessage {
 >     content: Cell<AccessControl_InMessage>
 > }
 */
export interface TokenPool_RMNAccessControlMessage {
    readonly $: 'TokenPool_RMNAccessControlMessage'
    content: AccessControl_InMessage
}

export const TokenPool_RMNAccessControlMessage = {
    PREFIX: 0x2e7a1790,

    create(args: {
        content: AccessControl_InMessage
    }): TokenPool_RMNAccessControlMessage {
        return {
            $: 'TokenPool_RMNAccessControlMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RMNAccessControlMessage {
        loadAndCheckPrefix32(s, 0x2e7a1790, 'TokenPool_RMNAccessControlMessage');
        return {
            $: 'TokenPool_RMNAccessControlMessage',
            content: loadCellRef<AccessControl_InMessage>(s, AccessControl_InMessage.fromSlice),
        }
    },
    store(self: TokenPool_RMNAccessControlMessage, b: c.Builder): void {
        b.storeUint(0x2e7a1790, 32);
        storeCellRef<AccessControl_InMessage>(self.content, b, AccessControl_InMessage.store);
    },
    toCell(self: TokenPool_RMNAccessControlMessage): c.Cell {
        return makeCellFrom<TokenPool_RMNAccessControlMessage>(self, TokenPool_RMNAccessControlMessage.store);
    }
}

/**
 > struct (0xfa7da444) TokenPool_LockOrBurn {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     replyTo: address
 > }
 */
export interface TokenPool_LockOrBurn {
    readonly $: 'TokenPool_LockOrBurn'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address
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
            replyTo: s.loadAddress(),
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
 >     replyTo: address
 >     delivery: Cell<TokenPool_ReleaseOrMintDelivery>?
 > }
 */
export interface TokenPool_ReleaseOrMint {
    readonly $: 'TokenPool_ReleaseOrMint'
    queryId: uint64
    request: TokenPool_ReleaseOrMintInV1
    requestedFinalityConfig: uint32
    replyTo: c.Address
    delivery: TokenPool_ReleaseOrMintDelivery | null /* = null */
}

export const TokenPool_ReleaseOrMint = {
    PREFIX: 0x351f77e3,

    create(args: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo: c.Address
        delivery?: TokenPool_ReleaseOrMintDelivery | null /* = null */
    }): TokenPool_ReleaseOrMint {
        return {
            $: 'TokenPool_ReleaseOrMint',
            delivery: null,
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
            replyTo: s.loadAddress(),
            delivery: s.loadBoolean() ? loadCellRef<TokenPool_ReleaseOrMintDelivery>(s, TokenPool_ReleaseOrMintDelivery.fromSlice) : null,
        }
    },
    store(self: TokenPool_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x351f77e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
        storeTolkNullable<TokenPool_ReleaseOrMintDelivery>(self.delivery, b,
            (v,b) => storeCellRef<TokenPool_ReleaseOrMintDelivery>(v, b, TokenPool_ReleaseOrMintDelivery.store)
        );
    },
    toCell(self: TokenPool_ReleaseOrMint): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMint>(self, TokenPool_ReleaseOrMint.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintDelivery {
 >     recipient: address
 >     forwardTonAmount: coins
 >     forwardPayload: cell?
 > }
 */
export interface TokenPool_ReleaseOrMintDelivery {
    readonly $: 'TokenPool_ReleaseOrMintDelivery'
    recipient: c.Address
    forwardTonAmount: coins
    forwardPayload: c.Cell | null
}

export const TokenPool_ReleaseOrMintDelivery = {
    create(args: {
        recipient: c.Address
        forwardTonAmount: coins
        forwardPayload: c.Cell | null
    }): TokenPool_ReleaseOrMintDelivery {
        return {
            $: 'TokenPool_ReleaseOrMintDelivery',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintDelivery {
        return {
            $: 'TokenPool_ReleaseOrMintDelivery',
            recipient: s.loadAddress(),
            forwardTonAmount: s.loadCoins(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_ReleaseOrMintDelivery, b: c.Builder): void {
        b.storeAddress(self.recipient);
        b.storeCoins(self.forwardTonAmount);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_ReleaseOrMintDelivery): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintDelivery>(self, TokenPool_ReleaseOrMintDelivery.store);
    }
}

/**
 > struct (0x81d45b24) TokenPool_ReleaseOrMintDelivered {
 >     queryId: uint64
 >     replyTo: address
 >     transfer: Cell<TokenPool_DeliveredTransfer>
 > }
 */
export interface TokenPool_ReleaseOrMintDelivered {
    readonly $: 'TokenPool_ReleaseOrMintDelivered'
    queryId: uint64
    replyTo: c.Address
    transfer: TokenPool_DeliveredTransfer
}

export const TokenPool_ReleaseOrMintDelivered = {
    PREFIX: 0x81d45b24,

    create(args: {
        queryId?: uint64
        replyTo: c.Address
        transfer: TokenPool_DeliveredTransfer
    }): TokenPool_ReleaseOrMintDelivered {
        return {
            $: 'TokenPool_ReleaseOrMintDelivered',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintDelivered {
        loadAndCheckPrefix32(s, 0x81d45b24, 'TokenPool_ReleaseOrMintDelivered');
        return {
            $: 'TokenPool_ReleaseOrMintDelivered',
            queryId: s.loadUintBig(64),
            replyTo: s.loadAddress(),
            transfer: loadCellRef<TokenPool_DeliveredTransfer>(s, TokenPool_DeliveredTransfer.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintDelivered, b: c.Builder): void {
        b.storeUint(0x81d45b24, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.replyTo);
        storeCellRef<TokenPool_DeliveredTransfer>(self.transfer, b, TokenPool_DeliveredTransfer.store);
    },
    toCell(self: TokenPool_ReleaseOrMintDelivered): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintDelivered>(self, TokenPool_ReleaseOrMintDelivered.store);
    }
}

/**
 > struct TokenPool_DeliveredTransfer {
 >     remoteChainSelector: uint64
 >     localToken: address
 >     receiver: address
 >     amount: coins
 > }
 */
export interface TokenPool_DeliveredTransfer {
    readonly $: 'TokenPool_DeliveredTransfer'
    remoteChainSelector: uint64
    localToken: c.Address
    receiver: c.Address
    amount: coins
}

export const TokenPool_DeliveredTransfer = {
    create(args: {
        remoteChainSelector: uint64
        localToken: c.Address
        receiver: c.Address
        amount: coins
    }): TokenPool_DeliveredTransfer {
        return {
            $: 'TokenPool_DeliveredTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_DeliveredTransfer {
        return {
            $: 'TokenPool_DeliveredTransfer',
            remoteChainSelector: s.loadUintBig(64),
            localToken: s.loadAddress(),
            receiver: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: TokenPool_DeliveredTransfer, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.localToken);
        b.storeAddress(self.receiver);
        b.storeCoins(self.amount);
    },
    toCell(self: TokenPool_DeliveredTransfer): c.Cell {
        return makeCellFrom<TokenPool_DeliveredTransfer>(self, TokenPool_DeliveredTransfer.store);
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
 > struct TokenPool_FeeContext {
 >     feeConfig: TokenPool_TokenTransferFeeConfig
 >     amountPostFee: coins
 >     feesProvided: bool
 > }
 */
export interface TokenPool_FeeContext {
    readonly $: 'TokenPool_FeeContext'
    feeConfig: TokenPool_TokenTransferFeeConfig
    amountPostFee: coins
    feesProvided: boolean
}

export const TokenPool_FeeContext = {
    create(args: {
        feeConfig: TokenPool_TokenTransferFeeConfig
        amountPostFee: coins
        feesProvided: boolean
    }): TokenPool_FeeContext {
        return {
            $: 'TokenPool_FeeContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FeeContext {
        return {
            $: 'TokenPool_FeeContext',
            feeConfig: TokenPool_TokenTransferFeeConfig.fromSlice(s),
            amountPostFee: s.loadCoins(),
            feesProvided: s.loadBoolean(),
        }
    },
    store(self: TokenPool_FeeContext, b: c.Builder): void {
        TokenPool_TokenTransferFeeConfig.store(self.feeConfig, b);
        b.storeCoins(self.amountPostFee);
        b.storeBit(self.feesProvided);
    },
    toCell(self: TokenPool_FeeContext): c.Cell {
        return makeCellFrom<TokenPool_FeeContext>(self, TokenPool_FeeContext.store);
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
 > struct (0x6c70b2dd) TokenPool_CCVs {
 >     queryId: uint64
 >     requiredCCVs: array<address>
 >     fwdPayload: cell?
 > }
 */
export interface TokenPool_CCVs {
    readonly $: 'TokenPool_CCVs'
    queryId: uint64
    requiredCCVs: array<c.Address>
    fwdPayload: c.Cell | null
}

export const TokenPool_CCVs = {
    PREFIX: 0x6c70b2dd,

    create(args: {
        queryId?: uint64
        requiredCCVs: array<c.Address>
        fwdPayload: c.Cell | null
    }): TokenPool_CCVs {
        return {
            $: 'TokenPool_CCVs',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_CCVs {
        loadAndCheckPrefix32(s, 0x6c70b2dd, 'TokenPool_CCVs');
        return {
            $: 'TokenPool_CCVs',
            queryId: s.loadUintBig(64),
            requiredCCVs: loadArrayOf<c.Address>(s,
                (s) => s.loadAddress()
            ),
            fwdPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_CCVs, b: c.Builder): void {
        b.storeUint(0x6c70b2dd, 32);
        b.storeUint(self.queryId, 64);
        storeArrayOf<c.Address>(self.requiredCCVs, b,
            (v,b) => b.storeAddress(v)
        );
        storeTolkNullable<c.Cell>(self.fwdPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_CCVs): c.Cell {
        return makeCellFrom<TokenPool_CCVs>(self, TokenPool_CCVs.store);
    }
}

/**
 > struct (0x158dd7d5) TokenPool_CCVsAndFees {
 >     queryId: uint64
 >     requiredCCVs: array<address>
 >     fees: Cell<TokenPool_FeeContext>
 >     fwdPayload: cell?
 > }
 */
export interface TokenPool_CCVsAndFees {
    readonly $: 'TokenPool_CCVsAndFees'
    queryId: uint64
    requiredCCVs: array<c.Address>
    fees: TokenPool_FeeContext
    fwdPayload: c.Cell | null
}

export const TokenPool_CCVsAndFees = {
    PREFIX: 0x158dd7d5,

    create(args: {
        queryId?: uint64
        requiredCCVs: array<c.Address>
        fees: TokenPool_FeeContext
        fwdPayload: c.Cell | null
    }): TokenPool_CCVsAndFees {
        return {
            $: 'TokenPool_CCVsAndFees',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_CCVsAndFees {
        loadAndCheckPrefix32(s, 0x158dd7d5, 'TokenPool_CCVsAndFees');
        return {
            $: 'TokenPool_CCVsAndFees',
            queryId: s.loadUintBig(64),
            requiredCCVs: loadArrayOf<c.Address>(s,
                (s) => s.loadAddress()
            ),
            fees: loadCellRef<TokenPool_FeeContext>(s, TokenPool_FeeContext.fromSlice),
            fwdPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_CCVsAndFees, b: c.Builder): void {
        b.storeUint(0x158dd7d5, 32);
        b.storeUint(self.queryId, 64);
        storeArrayOf<c.Address>(self.requiredCCVs, b,
            (v,b) => b.storeAddress(v)
        );
        storeCellRef<TokenPool_FeeContext>(self.fees, b, TokenPool_FeeContext.store);
        storeTolkNullable<c.Cell>(self.fwdPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_CCVsAndFees): c.Cell {
        return makeCellFrom<TokenPool_CCVsAndFees>(self, TokenPool_CCVsAndFees.store);
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
 > struct (0x9643c08d) TokenPool_LockOrBurnWithdrawFailed {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 >     errorCode: int32
 > }
 */
export interface TokenPool_LockOrBurnWithdrawFailed {
    readonly $: 'TokenPool_LockOrBurnWithdrawFailed'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
    errorCode: int32
}

export const TokenPool_LockOrBurnWithdrawFailed = {
    PREFIX: 0x9643c08d,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
        errorCode: int32
    }): TokenPool_LockOrBurnWithdrawFailed {
        return {
            $: 'TokenPool_LockOrBurnWithdrawFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnWithdrawFailed {
        loadAndCheckPrefix32(s, 0x9643c08d, 'TokenPool_LockOrBurnWithdrawFailed');
        return {
            $: 'TokenPool_LockOrBurnWithdrawFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
            errorCode: s.loadIntBig(32),
        }
    },
    store(self: TokenPool_LockOrBurnWithdrawFailed, b: c.Builder): void {
        b.storeUint(0x9643c08d, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
        b.storeInt(self.errorCode, 32);
    },
    toCell(self: TokenPool_LockOrBurnWithdrawFailed): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnWithdrawFailed>(self, TokenPool_LockOrBurnWithdrawFailed.store);
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
 >     errorCode: int32
 > }
 */
export interface TokenPool_LockOrBurnFailure {
    readonly $: 'TokenPool_LockOrBurnFailure'
    queryId: uint64
    errorCode: int32
}

export const TokenPool_LockOrBurnFailure = {
    PREFIX: 0x3476ea72,

    create(args: {
        queryId?: uint64
        errorCode: int32
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
            errorCode: s.loadIntBig(32),
        }
    },
    store(self: TokenPool_LockOrBurnFailure, b: c.Builder): void {
        b.storeUint(0x3476ea72, 32);
        b.storeUint(self.queryId, 64);
        b.storeInt(self.errorCode, 32);
    },
    toCell(self: TokenPool_LockOrBurnFailure): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFailure>(self, TokenPool_LockOrBurnFailure.store);
    }
}

/**
 > struct (0xedd4948a) TokenPool_ReleaseOrMintFinalized {
 >     queryId: uint64
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface TokenPool_ReleaseOrMintFinalized {
    readonly $: 'TokenPool_ReleaseOrMintFinalized'
    queryId: uint64
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintFinalized = {
    PREFIX: 0xedd4948a,

    create(args: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintFinalized {
        return {
            $: 'TokenPool_ReleaseOrMintFinalized',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFinalized {
        loadAndCheckPrefix32(s, 0xedd4948a, 'TokenPool_ReleaseOrMintFinalized');
        return {
            $: 'TokenPool_ReleaseOrMintFinalized',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintFinalized, b: c.Builder): void {
        b.storeUint(0xedd4948a, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintFinalized): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFinalized>(self, TokenPool_ReleaseOrMintFinalized.store);
    }
}

/**
 > struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
 >     queryId: uint64
 >     errorCode: int32
 > }
 */
export interface TokenPool_ReleaseOrMintFailure {
    readonly $: 'TokenPool_ReleaseOrMintFailure'
    queryId: uint64
    errorCode: int32
}

export const TokenPool_ReleaseOrMintFailure = {
    PREFIX: 0xef0cb36e,

    create(args: {
        queryId?: uint64
        errorCode: int32
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
            errorCode: s.loadIntBig(32),
        }
    },
    store(self: TokenPool_ReleaseOrMintFailure, b: c.Builder): void {
        b.storeUint(0xef0cb36e, 32);
        b.storeUint(self.queryId, 64);
        b.storeInt(self.errorCode, 32);
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
 > struct (0x500b10e4) TokenPool_GetTransferInitiator {
 >     queryId: uint64
 > }
 */
export interface TokenPool_GetTransferInitiator {
    readonly $: 'TokenPool_GetTransferInitiator'
    queryId: uint64
}

export const TokenPool_GetTransferInitiator = {
    PREFIX: 0x500b10e4,

    create(args: {
        queryId?: uint64
    }): TokenPool_GetTransferInitiator {
        return {
            $: 'TokenPool_GetTransferInitiator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetTransferInitiator {
        loadAndCheckPrefix32(s, 0x500b10e4, 'TokenPool_GetTransferInitiator');
        return {
            $: 'TokenPool_GetTransferInitiator',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_GetTransferInitiator, b: c.Builder): void {
        b.storeUint(0x500b10e4, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_GetTransferInitiator): c.Cell {
        return makeCellFrom<TokenPool_GetTransferInitiator>(self, TokenPool_GetTransferInitiator.store);
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
 >     outboundRateLimiterConfig: Cell<RateLimiter_Config>
 >     inboundRateLimiterConfig: Cell<RateLimiter_Config>
 > }
 */
export interface TokenPool_ChainAdded {
    readonly $: 'TokenPool_ChainAdded'
    remoteChainSelector: uint64
    remoteTokenAddress: CrossChainAddress
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}

export const TokenPool_ChainAdded = {
    create(args: {
        remoteChainSelector: uint64
        remoteTokenAddress: CrossChainAddress
        outboundRateLimiterConfig: RateLimiter_Config
        inboundRateLimiterConfig: RateLimiter_Config
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
            outboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
            inboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
        }
    },
    store(self: TokenPool_ChainAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        storeCellRef<RateLimiter_Config>(self.outboundRateLimiterConfig, b, RateLimiter_Config.store);
        storeCellRef<RateLimiter_Config>(self.inboundRateLimiterConfig, b, RateLimiter_Config.store);
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
 > struct (0x9e9ec361) JettonLockBox_Deposit {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     context: cell?
 >     returnAddress: address?
 > }
 */
export interface JettonLockBox_Deposit {
    readonly $: 'JettonLockBox_Deposit'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    context: c.Cell | null
    returnAddress: c.Address | null /* = null */
}

export const JettonLockBox_Deposit = {
    PREFIX: 0x9e9ec361,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        context: c.Cell | null
        returnAddress?: c.Address | null /* = null */
    }): JettonLockBox_Deposit {
        return {
            $: 'JettonLockBox_Deposit',
            returnAddress: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposit {
        loadAndCheckPrefix32(s, 0x9e9ec361, 'JettonLockBox_Deposit');
        return {
            $: 'JettonLockBox_Deposit',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? s.loadRef() : null,
            returnAddress: s.loadMaybeAddress(),
        }
    },
    store(self: JettonLockBox_Deposit, b: c.Builder): void {
        b.storeUint(0x9e9ec361, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
        b.storeAddress(self.returnAddress);
    },
    toCell(self: JettonLockBox_Deposit): c.Cell {
        return makeCellFrom<JettonLockBox_Deposit>(self, JettonLockBox_Deposit.store);
    }
}

/**
 > struct JettonLockBox_WithdrawExtra {
 >     sendExcessesTo: address?
 >     forwardTonAmount: coins
 >     forwardPayload: cell?
 > }
 */
export interface JettonLockBox_WithdrawExtra {
    readonly $: 'JettonLockBox_WithdrawExtra'
    sendExcessesTo: c.Address | null
    forwardTonAmount: coins
    forwardPayload: c.Cell | null
}

export const JettonLockBox_WithdrawExtra = {
    create(args: {
        sendExcessesTo: c.Address | null
        forwardTonAmount: coins
        forwardPayload: c.Cell | null
    }): JettonLockBox_WithdrawExtra {
        return {
            $: 'JettonLockBox_WithdrawExtra',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawExtra {
        return {
            $: 'JettonLockBox_WithdrawExtra',
            sendExcessesTo: s.loadMaybeAddress(),
            forwardTonAmount: s.loadCoins(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: JettonLockBox_WithdrawExtra, b: c.Builder): void {
        b.storeAddress(self.sendExcessesTo);
        b.storeCoins(self.forwardTonAmount);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: JettonLockBox_WithdrawExtra): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawExtra>(self, JettonLockBox_WithdrawExtra.store);
    }
}

/**
 > struct (0xd065c306) JettonLockBox_Withdraw {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     recipient: address
 >     extra: Cell<JettonLockBox_WithdrawExtra>?
 > }
 */
export interface JettonLockBox_Withdraw {
    readonly $: 'JettonLockBox_Withdraw'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    recipient: c.Address
    extra: JettonLockBox_WithdrawExtra | null
}

export const JettonLockBox_Withdraw = {
    PREFIX: 0xd065c306,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipient: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }): JettonLockBox_Withdraw {
        return {
            $: 'JettonLockBox_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Withdraw {
        loadAndCheckPrefix32(s, 0xd065c306, 'JettonLockBox_Withdraw');
        return {
            $: 'JettonLockBox_Withdraw',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            recipient: s.loadAddress(),
            extra: s.loadBoolean() ? loadCellRef<JettonLockBox_WithdrawExtra>(s, JettonLockBox_WithdrawExtra.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_Withdraw, b: c.Builder): void {
        b.storeUint(0xd065c306, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipient);
        storeTolkNullable<JettonLockBox_WithdrawExtra>(self.extra, b,
            (v,b) => storeCellRef<JettonLockBox_WithdrawExtra>(v, b, JettonLockBox_WithdrawExtra.store)
        );
    },
    toCell(self: JettonLockBox_Withdraw): c.Cell {
        return makeCellFrom<JettonLockBox_Withdraw>(self, JettonLockBox_Withdraw.store);
    }
}

/**
 > struct (0x6d077f2e) JettonLockBox_Deposited {
 >     queryId: uint64
 >     token: address
 >     depositor: address
 >     amount: coins
 >     context: cell?
 > }
 */
export interface JettonLockBox_Deposited {
    readonly $: 'JettonLockBox_Deposited'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: c.Cell | null
}

export const JettonLockBox_Deposited = {
    PREFIX: 0x6d077f2e,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: c.Cell | null
    }): JettonLockBox_Deposited {
        return {
            $: 'JettonLockBox_Deposited',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposited {
        loadAndCheckPrefix32(s, 0x6d077f2e, 'JettonLockBox_Deposited');
        return {
            $: 'JettonLockBox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            depositor: s.loadAddress(),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: JettonLockBox_Deposited, b: c.Builder): void {
        b.storeUint(0x6d077f2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.depositor);
        b.storeCoins(self.amount);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: JettonLockBox_Deposited): c.Cell {
        return makeCellFrom<JettonLockBox_Deposited>(self, JettonLockBox_Deposited.store);
    }
}

/**
 > struct (0x5e28ebd8) JettonLockBox_DepositFailed {
 >     queryId: uint64
 >     token: address
 >     depositor: address
 >     amount: coins
 >     context: Cell<JettonLockBox_Deposit>?
 >     errorCode: int32
 >     returnAttempted: bool
 > }
 */
export interface JettonLockBox_DepositFailed {
    readonly $: 'JettonLockBox_DepositFailed'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: JettonLockBox_Deposit | null
    errorCode: int32
    returnAttempted: boolean
}

export const JettonLockBox_DepositFailed = {
    PREFIX: 0x5e28ebd8,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: JettonLockBox_Deposit | null
        errorCode: int32
        returnAttempted: boolean
    }): JettonLockBox_DepositFailed {
        return {
            $: 'JettonLockBox_DepositFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_DepositFailed {
        loadAndCheckPrefix32(s, 0x5e28ebd8, 'JettonLockBox_DepositFailed');
        return {
            $: 'JettonLockBox_DepositFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            depositor: s.loadAddress(),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? loadCellRef<JettonLockBox_Deposit>(s, JettonLockBox_Deposit.fromSlice) : null,
            errorCode: s.loadIntBig(32),
            returnAttempted: s.loadBoolean(),
        }
    },
    store(self: JettonLockBox_DepositFailed, b: c.Builder): void {
        b.storeUint(0x5e28ebd8, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.depositor);
        b.storeCoins(self.amount);
        storeTolkNullable<JettonLockBox_Deposit>(self.context, b,
            (v,b) => storeCellRef<JettonLockBox_Deposit>(v, b, JettonLockBox_Deposit.store)
        );
        b.storeInt(self.errorCode, 32);
        b.storeBit(self.returnAttempted);
    },
    toCell(self: JettonLockBox_DepositFailed): c.Cell {
        return makeCellFrom<JettonLockBox_DepositFailed>(self, JettonLockBox_DepositFailed.store);
    }
}

/**
 > struct (0x60bae556) JettonLockBox_WithdrawFailed {
 >     queryId: uint64
 >     token: address
 >     context: Cell<JettonLockBox_Withdraw>?
 > }
 */
export interface JettonLockBox_WithdrawFailed {
    readonly $: 'JettonLockBox_WithdrawFailed'
    queryId: uint64
    token: c.Address
    context: JettonLockBox_Withdraw | null
}

export const JettonLockBox_WithdrawFailed = {
    PREFIX: 0x60bae556,

    create(args: {
        queryId?: uint64
        token: c.Address
        context: JettonLockBox_Withdraw | null
    }): JettonLockBox_WithdrawFailed {
        return {
            $: 'JettonLockBox_WithdrawFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawFailed {
        loadAndCheckPrefix32(s, 0x60bae556, 'JettonLockBox_WithdrawFailed');
        return {
            $: 'JettonLockBox_WithdrawFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            context: s.loadBoolean() ? loadCellRef<JettonLockBox_Withdraw>(s, JettonLockBox_Withdraw.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0x60bae556, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        storeTolkNullable<JettonLockBox_Withdraw>(self.context, b,
            (v,b) => storeCellRef<JettonLockBox_Withdraw>(v, b, JettonLockBox_Withdraw.store)
        );
    },
    toCell(self: JettonLockBox_WithdrawFailed): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawFailed>(self, JettonLockBox_WithdrawFailed.store);
    }
}

/**
 > struct (0x60fdb63b) LockReleaseLockboxTokenPool_LockContext {
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface LockReleaseLockboxTokenPool_LockContext {
    readonly $: 'LockReleaseLockboxTokenPool_LockContext'
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const LockReleaseLockboxTokenPool_LockContext = {
    PREFIX: 0x60fdb63b,

    create(args: {
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): LockReleaseLockboxTokenPool_LockContext {
        return {
            $: 'LockReleaseLockboxTokenPool_LockContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): LockReleaseLockboxTokenPool_LockContext {
        loadAndCheckPrefix32(s, 0x60fdb63b, 'LockReleaseLockboxTokenPool_LockContext');
        return {
            $: 'LockReleaseLockboxTokenPool_LockContext',
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: LockReleaseLockboxTokenPool_LockContext, b: c.Builder): void {
        b.storeUint(0x60fdb63b, 32);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: LockReleaseLockboxTokenPool_LockContext): c.Cell {
        return makeCellFrom<LockReleaseLockboxTokenPool_LockContext>(self, LockReleaseLockboxTokenPool_LockContext.store);
    }
}

/**
 > struct (0x90230477) LockReleaseLockboxTokenPool_ReleaseContext {
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface LockReleaseLockboxTokenPool_ReleaseContext {
    readonly $: 'LockReleaseLockboxTokenPool_ReleaseContext'
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload
}

export const LockReleaseLockboxTokenPool_ReleaseContext = {
    PREFIX: 0x90230477,

    create(args: {
        forwardPayload: TokenPool_ReleaseOrMintForwardPayload
    }): LockReleaseLockboxTokenPool_ReleaseContext {
        return {
            $: 'LockReleaseLockboxTokenPool_ReleaseContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): LockReleaseLockboxTokenPool_ReleaseContext {
        loadAndCheckPrefix32(s, 0x90230477, 'LockReleaseLockboxTokenPool_ReleaseContext');
        return {
            $: 'LockReleaseLockboxTokenPool_ReleaseContext',
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: LockReleaseLockboxTokenPool_ReleaseContext, b: c.Builder): void {
        b.storeUint(0x90230477, 32);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: LockReleaseLockboxTokenPool_ReleaseContext): c.Cell {
        return makeCellFrom<LockReleaseLockboxTokenPool_ReleaseContext>(self, LockReleaseLockboxTokenPool_ReleaseContext.store);
    }
}

/**
 > type LockReleaseLockboxTokenPool_OutMessage = AskToTransfer
 */
export type LockReleaseLockboxTokenPool_OutMessage = AskToTransfer

export const LockReleaseLockboxTokenPool_OutMessage = {
    fromSlice(s: c.Slice): LockReleaseLockboxTokenPool_OutMessage {
        return AskToTransfer.fromSlice(s);
    },
    store(self: LockReleaseLockboxTokenPool_OutMessage, b: c.Builder): void {
        AskToTransfer.store(self, b);
    },
    toCell(self: LockReleaseLockboxTokenPool_OutMessage): c.Cell {
        return makeCellFrom<LockReleaseLockboxTokenPool_OutMessage>(self, LockReleaseLockboxTokenPool_OutMessage.store);
    }
}

/**
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 >     lockbox: address
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: TokenPool_Data
    lockbox: c.Address
}

export const Storage = {
    create(args: {
        poolData: TokenPool_Data
        lockbox: c.Address
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
            lockbox: s.loadAddress(),
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
        b.storeAddress(self.lockbox);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct MinValueConfig {
 >     value: coins?
 > }
 */
export interface MinValueConfig {
    readonly $: 'MinValueConfig'
    value: coins | null /* = null */
}

export const MinValueConfig = {
    create(args: {
        value?: coins | null /* = null */
    }): MinValueConfig {
        return {
            $: 'MinValueConfig',
            value: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): MinValueConfig {
        return {
            $: 'MinValueConfig',
            value: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: MinValueConfig, b: c.Builder): void {
        storeTolkNullable<coins>(self.value, b,
            (v,b) => b.storeCoins(v)
        );
    },
    toCell(self: MinValueConfig): c.Cell {
        return makeCellFrom<MinValueConfig>(self, MinValueConfig.store);
    }
}

/**
 > struct RateLimiter_Config {
 >     isEnabled: bool
 >     capacity: uint128
 >     rate: uint128
 > }
 */
export interface RateLimiter_Config {
    readonly $: 'RateLimiter_Config'
    isEnabled: boolean
    capacity: uint128
    rate: uint128
}

export const RateLimiter_Config = {
    create(args: {
        isEnabled: boolean
        capacity: uint128
        rate: uint128
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
            capacity: s.loadUintBig(128),
            rate: s.loadUintBig(128),
        }
    },
    store(self: RateLimiter_Config, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 128);
        b.storeUint(self.rate, 128);
    },
    toCell(self: RateLimiter_Config): c.Cell {
        return makeCellFrom<RateLimiter_Config>(self, RateLimiter_Config.store);
    }
}

/**
 > struct RateLimiter_TokenBucket {
 >     tokens: uint128
 >     lastUpdated: uint32
 >     isEnabled: bool
 >     capacity: uint128
 >     rate: uint128
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint128
    lastUpdated: uint32
    isEnabled: boolean
    capacity: uint128
    rate: uint128
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint128
        lastUpdated: uint32
        isEnabled: boolean
        capacity: uint128
        rate: uint128
    }): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            tokens: s.loadUintBig(128),
            lastUpdated: s.loadUintBig(32),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(128),
            rate: s.loadUintBig(128),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 128);
        b.storeUint(self.lastUpdated, 32);
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 128);
        b.storeUint(self.rate, 128);
    },
    toCell(self: RateLimiter_TokenBucket): c.Cell {
        return makeCellFrom<RateLimiter_TokenBucket>(self, RateLimiter_TokenBucket.store);
    }
}

// ————————————————————————————————————————————
//    class LockReleaseLockboxTokenPool
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

export class LockReleaseLockboxTokenPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'RateLimiter_Error.BucketOverfilled': 16300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 16301,
        'RateLimiter_Error.TokenRateLimitReached': 16302,
        'RateLimiter_Error.InvalidRateLimitConfig': 16303,
        'RateLimiter_Error.DisabledNonZeroRateLimit': 16304,
        'LockReleaseLockBoxTokenPool_Error.LockBoxNotConfigured': 20900,
        'LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender': 20901,
        'LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce': 20902,
        'LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed': 20906,
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
        'TokenPool_Error.InsufficientMessageValue': 51725,
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
            throw new Error(`Custom pack/unpack for 'LockReleaseLockboxTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new LockReleaseLockboxTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: TokenPool_Data
        lockbox: c.Address
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? LockReleaseLockboxTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new LockReleaseLockboxTokenPool(address, initialState);
    }

    static createCellOfTokenPoolLockOrBurn(body: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address
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

    static createCellOfTokenPoolLockOrBurnWithdrawFailed(body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
        errorCode: int32
    }) {
        return TokenPool_LockOrBurnWithdrawFailed.toCell(TokenPool_LockOrBurnWithdrawFailed.create(body));
    }

    static createCellOfTokenPoolReleaseOrMint(body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo: c.Address
        delivery?: TokenPool_ReleaseOrMintDelivery | null /* = null */
    }) {
        return TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body));
    }

    static createCellOfTokenPoolReleaseOrMintDelivered(body: {
        queryId?: uint64
        replyTo: c.Address
        transfer: TokenPool_DeliveredTransfer
    }) {
        return TokenPool_ReleaseOrMintDelivered.toCell(TokenPool_ReleaseOrMintDelivered.create(body));
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

    static createCellOfTokenPoolCurse(body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }) {
        return TokenPool_Curse.toCell(TokenPool_Curse.create(body));
    }

    static createCellOfTokenPoolUncurse(body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }) {
        return TokenPool_Uncurse.toCell(TokenPool_Uncurse.create(body));
    }

    static createCellOfTokenPoolRMNOwnableMessage(body: {
        content: RemainingBitsAndRefs
    }) {
        return TokenPool_RMNOwnableMessage.toCell(TokenPool_RMNOwnableMessage.create(body));
    }

    static createCellOfTokenPoolRMNAccessControlMessage(body: {
        content: AccessControl_InMessage
    }) {
        return TokenPool_RMNAccessControlMessage.toCell(TokenPool_RMNAccessControlMessage.create(body));
    }

    static createCellOfJettonWithdrawableWithdraw(body: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }) {
        return JettonWithdrawable_Withdraw.toCell(JettonWithdrawable_Withdraw.create(body));
    }

    static createCellOfReturnExcessesBack(body: {
        queryId?: uint64
    }) {
        return ReturnExcessesBack.toCell(ReturnExcessesBack.create(body));
    }

    static createCellOfJettonLockBoxDeposited(body: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: c.Cell | null
    }) {
        return JettonLockBox_Deposited.toCell(JettonLockBox_Deposited.create(body));
    }

    static createCellOfJettonLockBoxDepositFailed(body: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: JettonLockBox_Deposit | null
        errorCode: int32
        returnAttempted: boolean
    }) {
        return JettonLockBox_DepositFailed.toCell(JettonLockBox_DepositFailed.create(body));
    }

    static createCellOfJettonLockBoxWithdrawFailed(body: {
        queryId?: uint64
        token: c.Address
        context: JettonLockBox_Withdraw | null
    }) {
        return JettonLockBox_WithdrawFailed.toCell(JettonLockBox_WithdrawFailed.create(body));
    }

    static createCellOfTokenPoolGetTransferInitiator(body: {
        queryId?: uint64
    }) {
        return TokenPool_GetTransferInitiator.toCell(TokenPool_GetTransferInitiator.create(body));
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
        replyTo: c.Address
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

    async sendTokenPoolLockOrBurnWithdrawFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
        errorCode: int32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurnWithdrawFailed.toCell(TokenPool_LockOrBurnWithdrawFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo: c.Address
        delivery?: TokenPool_ReleaseOrMintDelivery | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMintDelivered(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        replyTo: c.Address
        transfer: TokenPool_DeliveredTransfer
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMintDelivered.toCell(TokenPool_ReleaseOrMintDelivered.create(body)),
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

    async sendTokenPoolCurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_Curse.toCell(TokenPool_Curse.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolUncurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_Uncurse.toCell(TokenPool_Uncurse.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolRMNOwnableMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        content: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_RMNOwnableMessage.toCell(TokenPool_RMNOwnableMessage.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolRMNAccessControlMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        content: AccessControl_InMessage
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_RMNAccessControlMessage.toCell(TokenPool_RMNAccessControlMessage.create(body)),
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

    async sendReturnExcessesBack(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReturnExcessesBack.toCell(ReturnExcessesBack.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxDeposited(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Deposited.toCell(JettonLockBox_Deposited.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxDepositFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: JettonLockBox_Deposit | null
        errorCode: int32
        returnAttempted: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_DepositFailed.toCell(JettonLockBox_DepositFailed.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxWithdrawFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        context: JettonLockBox_Withdraw | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_WithdrawFailed.toCell(JettonLockBox_WithdrawFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolGetTransferInitiator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_GetTransferInitiator.toCell(TokenPool_GetTransferInitiator.create(body)),
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

    async getLockbox(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('lockbox', []));
        return r.readSlice().loadAddress();
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

    async getPendingOwner(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('pendingOwner', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRmnOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_owner', []));
        return r.readSlice().loadAddress();
    }

    async getRmnPendingOwner(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_pendingOwner', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRmnHasRole(provider: ContractProvider, role: uint256, account: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_hasRole', [
            { type: 'int', value: role },
            { type: 'slice', cell: makeCellFrom<c.Address>(account,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getRmnGetRoleAdmin(provider: ContractProvider, role: uint256): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_getRoleAdmin', [
            { type: 'int', value: role },
        ]));
        return r.readBigInt();
    }

    async getRmnCanCurse(provider: ContractProvider, account: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_canCurse', [
            { type: 'slice', cell: makeCellFrom<c.Address>(account,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getRmnCanUncurse(provider: ContractProvider, account: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('rmn_canUncurse', [
            { type: 'slice', cell: makeCellFrom<c.Address>(account,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
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
