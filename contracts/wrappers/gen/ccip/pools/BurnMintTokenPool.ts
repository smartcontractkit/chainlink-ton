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
 > struct TokenPool_DynamicConfig {
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_DynamicConfig {
    readonly $: 'TokenPool_DynamicConfig'
    router: c.Address
    rateLimitAdmin: c.Address | null /* = null */
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfig = {
    create(args: {
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin: c.Address | null
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
        }
    },
    store(self: TokenPool_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
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
 >     finalizationValue: coins
 >     onRampNamespaces: map<uint32, ()>
 >     extra: Cell<TokenPool_LockOrBurnExtra>?
 > }
 */
export interface TokenPool_LockOrBurn {
    readonly $: 'TokenPool_LockOrBurn'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address
    finalizationValue: coins
    onRampNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
    extra: TokenPool_LockOrBurnExtra | null /* = null */
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address
        finalizationValue: coins
        onRampNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
        extra?: TokenPool_LockOrBurnExtra | null /* = null */
    }): TokenPool_LockOrBurn {
        return {
            $: 'TokenPool_LockOrBurn',
            extra: null,
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
            finalizationValue: s.loadCoins(),
            onRampNamespaces: dictToSet(c.Dictionary.load<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
            extra: s.loadBoolean() ? loadCellRef<TokenPool_LockOrBurnExtra>(s, TokenPool_LockOrBurnExtra.fromSlice) : null,
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
        b.storeCoins(self.finalizationValue);
        b.storeDict<uint32, []>(setToDict(self.onRampNamespaces, c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
        storeTolkNullable<TokenPool_LockOrBurnExtra>(self.extra, b,
            (v,b) => storeCellRef<TokenPool_LockOrBurnExtra>(v, b, TokenPool_LockOrBurnExtra.store)
        );
    },
    toCell(self: TokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurn>(self, TokenPool_LockOrBurn.store);
    }
}

/**
 > struct TokenPool_LockOrBurnExtra {
 >     sendExcessesTo: address?
 >     returnTo: address?
 > }
 */
export interface TokenPool_LockOrBurnExtra {
    readonly $: 'TokenPool_LockOrBurnExtra'
    sendExcessesTo: c.Address | null /* = null */
    returnTo: c.Address | null /* = null */
}

export const TokenPool_LockOrBurnExtra = {
    create(args: {
        sendExcessesTo?: c.Address | null /* = null */
        returnTo?: c.Address | null /* = null */
    }): TokenPool_LockOrBurnExtra {
        return {
            $: 'TokenPool_LockOrBurnExtra',
            sendExcessesTo: null,
            returnTo: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnExtra {
        return {
            $: 'TokenPool_LockOrBurnExtra',
            sendExcessesTo: s.loadMaybeAddress(),
            returnTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_LockOrBurnExtra, b: c.Builder): void {
        b.storeAddress(self.sendExcessesTo);
        b.storeAddress(self.returnTo);
    },
    toCell(self: TokenPool_LockOrBurnExtra): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnExtra>(self, TokenPool_LockOrBurnExtra.store);
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
 >     delivery: Cell<TokenPool_ReleaseOrMintDelivery>
 >     sendExcessesTo: address?
 > }
 */
export interface TokenPool_ReleaseOrMint {
    readonly $: 'TokenPool_ReleaseOrMint'
    queryId: uint64
    request: TokenPool_ReleaseOrMintInV1
    requestedFinalityConfig: uint32
    replyTo: c.Address
    delivery: TokenPool_ReleaseOrMintDelivery
    sendExcessesTo: c.Address | null /* = null */
}

export const TokenPool_ReleaseOrMint = {
    PREFIX: 0x351f77e3,

    create(args: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo: c.Address
        delivery: TokenPool_ReleaseOrMintDelivery
        sendExcessesTo?: c.Address | null /* = null */
    }): TokenPool_ReleaseOrMint {
        return {
            $: 'TokenPool_ReleaseOrMint',
            sendExcessesTo: null,
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
            delivery: loadCellRef<TokenPool_ReleaseOrMintDelivery>(s, TokenPool_ReleaseOrMintDelivery.fromSlice),
            sendExcessesTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x351f77e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
        storeCellRef<TokenPool_ReleaseOrMintDelivery>(self.delivery, b, TokenPool_ReleaseOrMintDelivery.store);
        b.storeAddress(self.sendExcessesTo);
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
 >     forwardTonAmount: coins
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_LockOrBurnWithdraw {
    readonly $: 'TokenPool_LockOrBurnWithdraw'
    queryId: uint64
    forwardTonAmount: coins
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_LockOrBurnWithdraw = {
    PREFIX: 0xe7a35041,

    create(args: {
        queryId?: uint64
        forwardTonAmount: coins
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
            forwardTonAmount: s.loadCoins(),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnWithdraw, b: c.Builder): void {
        b.storeUint(0xe7a35041, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.forwardTonAmount);
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
 > struct (0x480060f1) TokenPool_GetConfig {
 >     queryId: uint64
 > }
 */
export interface TokenPool_GetConfig {
    readonly $: 'TokenPool_GetConfig'
    queryId: uint64
}

export const TokenPool_GetConfig = {
    PREFIX: 0x480060f1,

    create(args: {
        queryId?: uint64
    }): TokenPool_GetConfig {
        return {
            $: 'TokenPool_GetConfig',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetConfig {
        loadAndCheckPrefix32(s, 0x480060f1, 'TokenPool_GetConfig');
        return {
            $: 'TokenPool_GetConfig',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_GetConfig, b: c.Builder): void {
        b.storeUint(0x480060f1, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_GetConfig): c.Cell {
        return makeCellFrom<TokenPool_GetConfig>(self, TokenPool_GetConfig.store);
    }
}

/**
 > struct (0x1c8a40b8) TokenPool_Config {
 >     queryId: uint64
 >     transferInitiator: address?
 >     admission: TokenPool_AdmissionBudget
 > }
 */
export interface TokenPool_Config {
    readonly $: 'TokenPool_Config'
    queryId: uint64
    transferInitiator: c.Address | null
    admission: TokenPool_AdmissionBudget
}

export const TokenPool_Config = {
    PREFIX: 0x1c8a40b8,

    create(args: {
        queryId?: uint64
        transferInitiator: c.Address | null
        admission: TokenPool_AdmissionBudget
    }): TokenPool_Config {
        return {
            $: 'TokenPool_Config',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_Config {
        loadAndCheckPrefix32(s, 0x1c8a40b8, 'TokenPool_Config');
        return {
            $: 'TokenPool_Config',
            queryId: s.loadUintBig(64),
            transferInitiator: s.loadMaybeAddress(),
            admission: TokenPool_AdmissionBudget.fromSlice(s),
        }
    },
    store(self: TokenPool_Config, b: c.Builder): void {
        b.storeUint(0x1c8a40b8, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.transferInitiator);
        TokenPool_AdmissionBudget.store(self.admission, b);
    },
    toCell(self: TokenPool_Config): c.Cell {
        return makeCellFrom<TokenPool_Config>(self, TokenPool_Config.store);
    }
}

/**
 > struct (0x1e54ab8b) TokenPool_SetBudget {
 >     queryId: uint64
 >     budget: TokenPool_Budget
 > }
 */
export interface TokenPool_SetBudget {
    readonly $: 'TokenPool_SetBudget'
    queryId: uint64
    budget: TokenPool_Budget
}

export const TokenPool_SetBudget = {
    PREFIX: 0x1e54ab8b,

    create(args: {
        queryId?: uint64
        budget: TokenPool_Budget
    }): TokenPool_SetBudget {
        return {
            $: 'TokenPool_SetBudget',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetBudget {
        loadAndCheckPrefix32(s, 0x1e54ab8b, 'TokenPool_SetBudget');
        return {
            $: 'TokenPool_SetBudget',
            queryId: s.loadUintBig(64),
            budget: TokenPool_Budget.fromSlice(s),
        }
    },
    store(self: TokenPool_SetBudget, b: c.Builder): void {
        b.storeUint(0x1e54ab8b, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_Budget.store(self.budget, b);
    },
    toCell(self: TokenPool_SetBudget): c.Cell {
        return makeCellFrom<TokenPool_SetBudget>(self, TokenPool_SetBudget.store);
    }
}

/**
 > struct (0xfa704988) TokenPool_BudgetSet {
 >     queryId: uint64
 >     budget: TokenPool_Budget
 > }
 */
export interface TokenPool_BudgetSet {
    readonly $: 'TokenPool_BudgetSet'
    queryId: uint64
    budget: TokenPool_Budget
}

export const TokenPool_BudgetSet = {
    PREFIX: 0xfa704988,

    create(args: {
        queryId?: uint64
        budget: TokenPool_Budget
    }): TokenPool_BudgetSet {
        return {
            $: 'TokenPool_BudgetSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_BudgetSet {
        loadAndCheckPrefix32(s, 0xfa704988, 'TokenPool_BudgetSet');
        return {
            $: 'TokenPool_BudgetSet',
            queryId: s.loadUintBig(64),
            budget: TokenPool_Budget.fromSlice(s),
        }
    },
    store(self: TokenPool_BudgetSet, b: c.Builder): void {
        b.storeUint(0xfa704988, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_Budget.store(self.budget, b);
    },
    toCell(self: TokenPool_BudgetSet): c.Cell {
        return makeCellFrom<TokenPool_BudgetSet>(self, TokenPool_BudgetSet.store);
    }
}

/**
 > struct TokenPool_AdminConfig {
 >     ownable: Cell<Ownable2Step>
 >     dynamicConfig: Cell<TokenPool_DynamicConfig>
 >     allowedDepositNamespaces: map<uint32, ()>
 >     jettonClient: JettonClient
 >     allowedFinalityConfig: uint32
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: Ownable2Step
    dynamicConfig: TokenPool_DynamicConfig
    allowedDepositNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
    jettonClient: JettonClient
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
    advancedPoolHooks: c.Address | null /* = null */
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: Ownable2Step
        dynamicConfig: TokenPool_DynamicConfig
        allowedDepositNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
        jettonClient: JettonClient
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
        advancedPoolHooks?: c.Address | null /* = null */
    }): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            allowedFinalityConfig: 0n,
            advancedPoolHooks: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            ownable: loadCellRef<Ownable2Step>(s, Ownable2Step.fromSlice),
            dynamicConfig: loadCellRef<TokenPool_DynamicConfig>(s, TokenPool_DynamicConfig.fromSlice),
            allowedDepositNamespaces: dictToSet(c.Dictionary.load<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
            jettonClient: JettonClient.fromSlice(s),
            allowedFinalityConfig: s.loadUintBig(32),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
        b.storeDict<uint32, []>(setToDict(self.allowedDepositNamespaces, c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
        JettonClient.store(self.jettonClient, b);
        b.storeUint(self.allowedFinalityConfig, 32);
        b.storeAddress(self.advancedPoolHooks);
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
    budget: TokenPool_Budget /* = TokenPool_Budget { TokenPool_LockOrBurnBudget { 0 as coins, 0 as coins } as TokenPool_LockOrBurnBudget, TokenPool_ReleaseOrMintBudget { 0 as coins, 0 as coins } as TokenPool_ReleaseOrMintBudget } */
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: TokenPool_AdminConfig
        localPolicy: TokenPool_LocalPolicy
        tokenDecimals: uint8
        remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
        tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
        budget?: TokenPool_Budget /* = TokenPool_Budget { TokenPool_LockOrBurnBudget { 0 as coins, 0 as coins } as TokenPool_LockOrBurnBudget, TokenPool_ReleaseOrMintBudget { 0 as coins, 0 as coins } as TokenPool_ReleaseOrMintBudget } */
    }): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            budget: { $: 'TokenPool_Budget', lockOrBurn: { $: 'TokenPool_LockOrBurnBudget', admission: 0n, safety: 0n }, releaseOrMint: { $: 'TokenPool_ReleaseOrMintBudget', admission: 0n, safety: 0n } },
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
 > struct TokenPool_LockOrBurnBudget {
 >     admission: coins
 >     safety: coins
 > }
 */
export interface TokenPool_LockOrBurnBudget {
    readonly $: 'TokenPool_LockOrBurnBudget'
    admission: coins /* = 0 */
    safety: coins /* = 0 */
}

export const TokenPool_LockOrBurnBudget = {
    create(args: {
        admission?: coins /* = 0 */
        safety?: coins /* = 0 */
    }): TokenPool_LockOrBurnBudget {
        return {
            $: 'TokenPool_LockOrBurnBudget',
            admission: 0n,
            safety: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnBudget {
        return {
            $: 'TokenPool_LockOrBurnBudget',
            admission: s.loadCoins(),
            safety: s.loadCoins(),
        }
    },
    store(self: TokenPool_LockOrBurnBudget, b: c.Builder): void {
        b.storeCoins(self.admission);
        b.storeCoins(self.safety);
    },
    toCell(self: TokenPool_LockOrBurnBudget): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnBudget>(self, TokenPool_LockOrBurnBudget.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintBudget {
 >     admission: coins
 >     safety: coins
 > }
 */
export interface TokenPool_ReleaseOrMintBudget {
    readonly $: 'TokenPool_ReleaseOrMintBudget'
    admission: coins /* = 0 */
    safety: coins /* = 0 */
}

export const TokenPool_ReleaseOrMintBudget = {
    create(args: {
        admission?: coins /* = 0 */
        safety?: coins /* = 0 */
    }): TokenPool_ReleaseOrMintBudget {
        return {
            $: 'TokenPool_ReleaseOrMintBudget',
            admission: 0n,
            safety: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintBudget {
        return {
            $: 'TokenPool_ReleaseOrMintBudget',
            admission: s.loadCoins(),
            safety: s.loadCoins(),
        }
    },
    store(self: TokenPool_ReleaseOrMintBudget, b: c.Builder): void {
        b.storeCoins(self.admission);
        b.storeCoins(self.safety);
    },
    toCell(self: TokenPool_ReleaseOrMintBudget): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintBudget>(self, TokenPool_ReleaseOrMintBudget.store);
    }
}

/**
 > struct TokenPool_Budget {
 >     lockOrBurn: TokenPool_LockOrBurnBudget
 >     releaseOrMint: TokenPool_ReleaseOrMintBudget
 > }
 */
export interface TokenPool_Budget {
    readonly $: 'TokenPool_Budget'
    lockOrBurn: TokenPool_LockOrBurnBudget /* = TokenPool_LockOrBurnBudget { 0 as coins, 0 as coins } */
    releaseOrMint: TokenPool_ReleaseOrMintBudget /* = TokenPool_ReleaseOrMintBudget { 0 as coins, 0 as coins } */
}

export const TokenPool_Budget = {
    create(args: {
        lockOrBurn?: TokenPool_LockOrBurnBudget /* = TokenPool_LockOrBurnBudget { 0 as coins, 0 as coins } */
        releaseOrMint?: TokenPool_ReleaseOrMintBudget /* = TokenPool_ReleaseOrMintBudget { 0 as coins, 0 as coins } */
    }): TokenPool_Budget {
        return {
            $: 'TokenPool_Budget',
            lockOrBurn: { $: 'TokenPool_LockOrBurnBudget', admission: 0n, safety: 0n },
            releaseOrMint: { $: 'TokenPool_ReleaseOrMintBudget', admission: 0n, safety: 0n },
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_Budget {
        return {
            $: 'TokenPool_Budget',
            lockOrBurn: TokenPool_LockOrBurnBudget.fromSlice(s),
            releaseOrMint: TokenPool_ReleaseOrMintBudget.fromSlice(s),
        }
    },
    store(self: TokenPool_Budget, b: c.Builder): void {
        TokenPool_LockOrBurnBudget.store(self.lockOrBurn, b);
        TokenPool_ReleaseOrMintBudget.store(self.releaseOrMint, b);
    },
    toCell(self: TokenPool_Budget): c.Cell {
        return makeCellFrom<TokenPool_Budget>(self, TokenPool_Budget.store);
    }
}

/**
 > struct TokenPool_AdmissionBudget {
 >     lockOrBurn: coins
 >     releaseOrMint: coins
 > }
 */
export interface TokenPool_AdmissionBudget {
    readonly $: 'TokenPool_AdmissionBudget'
    lockOrBurn: coins
    releaseOrMint: coins
}

export const TokenPool_AdmissionBudget = {
    create(args: {
        lockOrBurn: coins
        releaseOrMint: coins
    }): TokenPool_AdmissionBudget {
        return {
            $: 'TokenPool_AdmissionBudget',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdmissionBudget {
        return {
            $: 'TokenPool_AdmissionBudget',
            lockOrBurn: s.loadCoins(),
            releaseOrMint: s.loadCoins(),
        }
    },
    store(self: TokenPool_AdmissionBudget, b: c.Builder): void {
        b.storeCoins(self.lockOrBurn);
        b.storeCoins(self.releaseOrMint);
    },
    toCell(self: TokenPool_AdmissionBudget): c.Cell {
        return makeCellFrom<TokenPool_AdmissionBudget>(self, TokenPool_AdmissionBudget.store);
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
 > struct (0xba302a47) BurnMintTokenPool_BurnContext {
 >     wallet: address
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 >     transferInitiator: address
 > }
 */
export interface BurnMintTokenPool_BurnContext {
    readonly $: 'BurnMintTokenPool_BurnContext'
    wallet: c.Address
    forwardPayload: TokenPool_LockOrBurnForwardPayload
    transferInitiator: c.Address
}

export const BurnMintTokenPool_BurnContext = {
    PREFIX: 0xba302a47,

    create(args: {
        wallet: c.Address
        forwardPayload: TokenPool_LockOrBurnForwardPayload
        transferInitiator: c.Address
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
            transferInitiator: s.loadAddress(),
        }
    },
    store(self: BurnMintTokenPool_BurnContext, b: c.Builder): void {
        b.storeUint(0xba302a47, 32);
        b.storeAddress(self.wallet);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
        b.storeAddress(self.transferInitiator);
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
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: TokenPool_Data
}

export const Storage = {
    create(args: {
        poolData: TokenPool_Data
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
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
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
        'TVMError.CellOverflow': 8,
        'Utils_Error.InvalidData': 13500,
        'RateLimiter_Error.BucketOverfilled': 16300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 16301,
        'RateLimiter_Error.TokenRateLimitReached': 16302,
        'RateLimiter_Error.InvalidRateLimitConfig': 16303,
        'RateLimiter_Error.DisabledNonZeroRateLimit': 16304,
        'BurnMintTokenPool_Error.UnexpectedBurnBounce': 45000,
        'BurnMintTokenPool_Error.UnexpectedMintBounce': 45001,
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
            throw new Error(`Custom pack/unpack for 'BurnMintTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new BurnMintTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: TokenPool_Data
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
        replyTo: c.Address
        finalizationValue: coins
        onRampNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
        extra?: TokenPool_LockOrBurnExtra | null /* = null */
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
        delivery: TokenPool_ReleaseOrMintDelivery
        sendExcessesTo?: c.Address | null /* = null */
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

    static createCellOfTokenPoolSetBudget(body: {
        queryId?: uint64
        budget: TokenPool_Budget
    }) {
        return TokenPool_SetBudget.toCell(TokenPool_SetBudget.create(body));
    }

    static createCellOfTokenPoolGetConfig(body: {
        queryId?: uint64
    }) {
        return TokenPool_GetConfig.toCell(TokenPool_GetConfig.create(body));
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
        finalizationValue: coins
        onRampNamespaces: Set<uint32> /* = [] as map<uint32, ()> */
        extra?: TokenPool_LockOrBurnExtra | null /* = null */
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
        delivery: TokenPool_ReleaseOrMintDelivery
        sendExcessesTo?: c.Address | null /* = null */
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

    async sendTokenPoolSetBudget(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        budget: TokenPool_Budget
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetBudget.toCell(TokenPool_SetBudget.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolGetConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_GetConfig.toCell(TokenPool_GetConfig.create(body)),
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

    async getBudget(provider: ContractProvider): Promise<TokenPool_Budget> {
        const r = StackReader.fromGetMethod(4, await provider.get('getBudget', []));
        return ({
            $: 'TokenPool_Budget',
            lockOrBurn: ({
                $: 'TokenPool_LockOrBurnBudget',
                admission: r.readBigInt(),
                safety: r.readBigInt(),
            }),
            releaseOrMint: ({
                $: 'TokenPool_ReleaseOrMintBudget',
                admission: r.readBigInt(),
                safety: r.readBigInt(),
            }),
        });
    }

    async getDynamicConfig(provider: ContractProvider): Promise<TokenPool_DynamicConfig> {
        const r = StackReader.fromGetMethod(3, await provider.get('getDynamicConfig', []));
        return ({
            $: 'TokenPool_DynamicConfig',
            router: r.readSlice().loadAddress(),
            rateLimitAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            feeAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
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

    async getCursedSubjects(provider: ContractProvider): Promise<lisp_list<uint128>> {
        const r = StackReader.fromGetMethod(1, await provider.get('cursedSubjects', []));
        return r.readLispListOf<uint128>(
            (r) => r.readBigInt()
        );
    }

    async getAdminConfig(provider: ContractProvider): Promise<TokenPool_AdminConfig> {
        const r = StackReader.fromGetMethod(7, await provider.get('getAdminConfig', []));
        return ({
            $: 'TokenPool_AdminConfig',
            ownable: r.readCellRef<Ownable2Step>(Ownable2Step.fromSlice),
            dynamicConfig: r.readCellRef<TokenPool_DynamicConfig>(TokenPool_DynamicConfig.fromSlice),
            allowedDepositNamespaces: dictToSet(r.readDictionary<uint32, []>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ))),
            jettonClient: ({
                $: 'JettonClient',
                masterAddress: r.readSlice().loadAddress(),
                jettonWalletCode: r.readCell(),
            }),
            allowedFinalityConfig: r.readBigInt(),
            advancedPoolHooks: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
        });
    }

    async getRemoteChainConfig(provider: ContractProvider, remoteChainSelector: uint64): Promise<TokenPool_RemoteChainConfig | null> {
        const r = StackReader.fromGetMethod(5, await provider.get('getRemoteChainConfig', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readWideNullable<TokenPool_RemoteChainConfig>(5,
            (r) => ({
                $: 'TokenPool_RemoteChainConfig',
                remoteTokenAddress: r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice),
                remotePools: dictToMap(r.readDictionary<uint256, CrossChainAddress>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CrossChainAddress>(
                                    (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                                    (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
                                ))),
                rateLimiters: r.readCellRef<TokenPool_RateLimiterPair>(TokenPool_RateLimiterPair.fromSlice),
                fastFinalityRateLimiters: r.readCellRef<TokenPool_RateLimiterPair>(TokenPool_RateLimiterPair.fromSlice),
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
