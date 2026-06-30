// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OnRamp contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'OnRamp.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > OnRamp.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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

type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint96 = bigint
type uint224 = bigint
type uint256 = bigint

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
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

/**
 > type RemainingBitsOrRef<T> = T
 */
export type RemainingBitsOrRef<T> = T

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
 > struct (0xb0ec5157) Deployable_InitializeAndSend {
 >     stateInit: ContractState
 >     selfMessage: Deployable_Message
 > }
 */
export interface Deployable_InitializeAndSend {
    readonly $: 'Deployable_InitializeAndSend'
    stateInit: ContractState
    selfMessage: Deployable_Message
}

export const Deployable_InitializeAndSend = {
    PREFIX: 0xb0ec5157,

    create(args: {
        stateInit: ContractState
        selfMessage: Deployable_Message
    }): Deployable_InitializeAndSend {
        return {
            $: 'Deployable_InitializeAndSend',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_InitializeAndSend {
        loadAndCheckPrefix32(s, 0xb0ec5157, 'Deployable_InitializeAndSend');
        return {
            $: 'Deployable_InitializeAndSend',
            stateInit: ContractState.fromSlice(s),
            selfMessage: Deployable_Message.fromSlice(s),
        }
    },
    store(self: Deployable_InitializeAndSend, b: c.Builder): void {
        b.storeUint(0xb0ec5157, 32);
        ContractState.store(self.stateInit, b);
        Deployable_Message.store(self.selfMessage, b);
    },
    toCell(self: Deployable_InitializeAndSend): c.Cell {
        return makeCellFrom<Deployable_InitializeAndSend>(self, Deployable_InitializeAndSend.store);
    }
}

/**
 > struct Deployable_Message {
 >     value: coins
 >     body: cell
 > }
 */
export interface Deployable_Message {
    readonly $: 'Deployable_Message'
    value: coins
    body: c.Cell
}

export const Deployable_Message = {
    create(args: {
        value: coins
        body: c.Cell
    }): Deployable_Message {
        return {
            $: 'Deployable_Message',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_Message {
        return {
            $: 'Deployable_Message',
            value: s.loadCoins(),
            body: s.loadRef(),
        }
    },
    store(self: Deployable_Message, b: c.Builder): void {
        b.storeCoins(self.value);
        b.storeRef(self.body);
    },
    toCell(self: Deployable_Message): c.Cell {
        return makeCellFrom<Deployable_Message>(self, Deployable_Message.store);
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
 > type CCIPSendExecutor_ID = uint224
 */
export type CCIPSendExecutor_ID = uint224

export const CCIPSendExecutor_ID = {
    fromSlice(s: c.Slice): CCIPSendExecutor_ID {
        return s.loadUintBig(224);
    },
    store(self: CCIPSendExecutor_ID, b: c.Builder): void {
        b.storeUint(self, 224);
    },
    toCell(self: CCIPSendExecutor_ID): c.Cell {
        return makeCellFrom<CCIPSendExecutor_ID>(self, CCIPSendExecutor_ID.store);
    }
}

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

/**
 > struct (0x6513f8e1) Router_MessageSent {
 >     queryID: uint64
 >     messageId: uint256
 >     destChainSelector: uint64
 >     sender: address
 > }
 */
export interface Router_MessageSent {
    readonly $: 'Router_MessageSent'
    queryID: uint64
    messageId: uint256
    destChainSelector: uint64
    sender: c.Address
}

export const Router_MessageSent = {
    PREFIX: 0x6513f8e1,

    create(args: {
        queryID: uint64
        messageId: uint256
        destChainSelector: uint64
        sender: c.Address
    }): Router_MessageSent {
        return {
            $: 'Router_MessageSent',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_MessageSent {
        loadAndCheckPrefix32(s, 0x6513f8e1, 'Router_MessageSent');
        return {
            $: 'Router_MessageSent',
            queryID: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
            destChainSelector: s.loadUintBig(64),
            sender: s.loadAddress(),
        }
    },
    store(self: Router_MessageSent, b: c.Builder): void {
        b.storeUint(0x6513f8e1, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.messageId, 256);
        b.storeUint(self.destChainSelector, 64);
        b.storeAddress(self.sender);
    },
    toCell(self: Router_MessageSent): c.Cell {
        return makeCellFrom<Router_MessageSent>(self, Router_MessageSent.store);
    }
}

/**
 > struct (0x8ae25114) Router_MessageRejected {
 >     queryID: uint64
 >     destChainSelector: uint64
 >     sender: address
 >     error: uint256
 > }
 */
export interface Router_MessageRejected {
    readonly $: 'Router_MessageRejected'
    queryID: uint64
    destChainSelector: uint64
    sender: c.Address
    error: uint256
}

export const Router_MessageRejected = {
    PREFIX: 0x8ae25114,

    create(args: {
        queryID: uint64
        destChainSelector: uint64
        sender: c.Address
        error: uint256
    }): Router_MessageRejected {
        return {
            $: 'Router_MessageRejected',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_MessageRejected {
        loadAndCheckPrefix32(s, 0x8ae25114, 'Router_MessageRejected');
        return {
            $: 'Router_MessageRejected',
            queryID: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            sender: s.loadAddress(),
            error: s.loadUintBig(256),
        }
    },
    store(self: Router_MessageRejected, b: c.Builder): void {
        b.storeUint(0x8ae25114, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.destChainSelector, 64);
        b.storeAddress(self.sender);
        b.storeUint(self.error, 256);
    },
    toCell(self: Router_MessageRejected): c.Cell {
        return makeCellFrom<Router_MessageRejected>(self, Router_MessageRejected.store);
    }
}

/**
 > struct (0x6f2d00df) Router_LockOrBurn {
 >     tokenPool: address
 >     tokenAmount: TokenAmount
 >     destChainSelector: uint64
 >     executorAddress: address
 > }
 */
export interface Router_LockOrBurn {
    readonly $: 'Router_LockOrBurn'
    tokenPool: c.Address
    tokenAmount: TokenAmount
    destChainSelector: uint64
    executorAddress: c.Address
}

export const Router_LockOrBurn = {
    PREFIX: 0x6f2d00df,

    create(args: {
        tokenPool: c.Address
        tokenAmount: TokenAmount
        destChainSelector: uint64
        executorAddress: c.Address
    }): Router_LockOrBurn {
        return {
            $: 'Router_LockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_LockOrBurn {
        loadAndCheckPrefix32(s, 0x6f2d00df, 'Router_LockOrBurn');
        return {
            $: 'Router_LockOrBurn',
            tokenPool: s.loadAddress(),
            tokenAmount: TokenAmount.fromSlice(s),
            destChainSelector: s.loadUintBig(64),
            executorAddress: s.loadAddress(),
        }
    },
    store(self: Router_LockOrBurn, b: c.Builder): void {
        b.storeUint(0x6f2d00df, 32);
        b.storeAddress(self.tokenPool);
        TokenAmount.store(self.tokenAmount, b);
        b.storeUint(self.destChainSelector, 64);
        b.storeAddress(self.executorAddress);
    },
    toCell(self: Router_LockOrBurn): c.Cell {
        return makeCellFrom<Router_LockOrBurn>(self, Router_LockOrBurn.store);
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
 > struct CCIPMessageSent {
 >     message: TVM2AnyRampMessage
 > }
 */
export interface CCIPMessageSent {
    readonly $: 'CCIPMessageSent'
    message: TVM2AnyRampMessage
}

export const CCIPMessageSent = {
    create(args: {
        message: TVM2AnyRampMessage
    }): CCIPMessageSent {
        return {
            $: 'CCIPMessageSent',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPMessageSent {
        return {
            $: 'CCIPMessageSent',
            message: TVM2AnyRampMessage.fromSlice(s),
        }
    },
    store(self: CCIPMessageSent, b: c.Builder): void {
        TVM2AnyRampMessage.store(self.message, b);
    },
    toCell(self: CCIPMessageSent): c.Cell {
        return makeCellFrom<CCIPMessageSent>(self, CCIPMessageSent.store);
    }
}

/**
 > struct DestChainSelectorAdded {
 >     destChainSelector: uint64
 > }
 */
export interface DestChainSelectorAdded {
    readonly $: 'DestChainSelectorAdded'
    destChainSelector: uint64
}

export const DestChainSelectorAdded = {
    create(args: {
        destChainSelector: uint64
    }): DestChainSelectorAdded {
        return {
            $: 'DestChainSelectorAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): DestChainSelectorAdded {
        return {
            $: 'DestChainSelectorAdded',
            destChainSelector: s.loadUintBig(64),
        }
    },
    store(self: DestChainSelectorAdded, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
    },
    toCell(self: DestChainSelectorAdded): c.Cell {
        return makeCellFrom<DestChainSelectorAdded>(self, DestChainSelectorAdded.store);
    }
}

/**
 > struct DestChainConfigUpdated {
 >     destChainSelector: uint64
 >     destChainConfig: OnRamp_DestChainConfig
 > }
 */
export interface DestChainConfigUpdated {
    readonly $: 'DestChainConfigUpdated'
    destChainSelector: uint64
    destChainConfig: OnRamp_DestChainConfig
}

export const DestChainConfigUpdated = {
    create(args: {
        destChainSelector: uint64
        destChainConfig: OnRamp_DestChainConfig
    }): DestChainConfigUpdated {
        return {
            $: 'DestChainConfigUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): DestChainConfigUpdated {
        return {
            $: 'DestChainConfigUpdated',
            destChainSelector: s.loadUintBig(64),
            destChainConfig: OnRamp_DestChainConfig.fromSlice(s),
        }
    },
    store(self: DestChainConfigUpdated, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        OnRamp_DestChainConfig.store(self.destChainConfig, b);
    },
    toCell(self: DestChainConfigUpdated): c.Cell {
        return makeCellFrom<DestChainConfigUpdated>(self, DestChainConfigUpdated.store);
    }
}

/**
 > struct ConfigSet {
 >     chainSelector: uint64
 >     dynamicConfig: OnRamp_DynamicConfig
 > }
 */
export interface ConfigSet {
    readonly $: 'ConfigSet'
    chainSelector: uint64
    dynamicConfig: OnRamp_DynamicConfig
}

export const ConfigSet = {
    create(args: {
        chainSelector: uint64
        dynamicConfig: OnRamp_DynamicConfig
    }): ConfigSet {
        return {
            $: 'ConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): ConfigSet {
        return {
            $: 'ConfigSet',
            chainSelector: s.loadUintBig(64),
            dynamicConfig: OnRamp_DynamicConfig.fromSlice(s),
        }
    },
    store(self: ConfigSet, b: c.Builder): void {
        b.storeUint(self.chainSelector, 64);
        OnRamp_DynamicConfig.store(self.dynamicConfig, b);
    },
    toCell(self: ConfigSet): c.Cell {
        return makeCellFrom<ConfigSet>(self, ConfigSet.store);
    }
}

/**
 > struct OnRamp_DestChainConfig {
 >     router: address
 >     sequenceNumber: uint64
 >     allowlistEnabled: bool
 >     allowedSenders: map<address, bool>
 > }
 */
export interface OnRamp_DestChainConfig {
    readonly $: 'OnRamp_DestChainConfig'
    router: c.Address
    sequenceNumber: uint64
    allowlistEnabled: boolean
    allowedSenders: c.Dictionary<c.Address, boolean>
}

export const OnRamp_DestChainConfig = {
    create(args: {
        router: c.Address
        sequenceNumber: uint64
        allowlistEnabled: boolean
        allowedSenders: c.Dictionary<c.Address, boolean>
    }): OnRamp_DestChainConfig {
        return {
            $: 'OnRamp_DestChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_DestChainConfig {
        return {
            $: 'OnRamp_DestChainConfig',
            router: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            allowlistEnabled: s.loadBoolean(),
            allowedSenders: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: OnRamp_DestChainConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeUint(self.sequenceNumber, 64);
        b.storeBit(self.allowlistEnabled);
        b.storeDict<c.Address, boolean>(self.allowedSenders, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: OnRamp_DestChainConfig): c.Cell {
        return makeCellFrom<OnRamp_DestChainConfig>(self, OnRamp_DestChainConfig.store);
    }
}

/**
 > struct OnRamp_DynamicConfig {
 >     feeQuoter: address
 >     feeAggregator: address
 >     allowlistAdmin: address
 >     reserve: coins
 > }
 */
export interface OnRamp_DynamicConfig {
    readonly $: 'OnRamp_DynamicConfig'
    feeQuoter: c.Address
    feeAggregator: c.Address
    allowlistAdmin: c.Address
    reserve: coins
}

export const OnRamp_DynamicConfig = {
    create(args: {
        feeQuoter: c.Address
        feeAggregator: c.Address
        allowlistAdmin: c.Address
        reserve: coins
    }): OnRamp_DynamicConfig {
        return {
            $: 'OnRamp_DynamicConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_DynamicConfig {
        return {
            $: 'OnRamp_DynamicConfig',
            feeQuoter: s.loadAddress(),
            feeAggregator: s.loadAddress(),
            allowlistAdmin: s.loadAddress(),
            reserve: s.loadCoins(),
        }
    },
    store(self: OnRamp_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.feeQuoter);
        b.storeAddress(self.feeAggregator);
        b.storeAddress(self.allowlistAdmin);
        b.storeCoins(self.reserve);
    },
    toCell(self: OnRamp_DynamicConfig): c.Cell {
        return makeCellFrom<OnRamp_DynamicConfig>(self, OnRamp_DynamicConfig.store);
    }
}

/**
 > struct OnRampUpdateDestChainConfig {
 >     destChainSelector: uint64
 >     router: address
 >     allowlistEnabled: bool
 > }
 */
export interface OnRampUpdateDestChainConfig {
    readonly $: 'OnRampUpdateDestChainConfig'
    destChainSelector: uint64
    router: c.Address
    allowlistEnabled: boolean
}

export const OnRampUpdateDestChainConfig = {
    create(args: {
        destChainSelector: uint64
        router: c.Address
        allowlistEnabled: boolean
    }): OnRampUpdateDestChainConfig {
        return {
            $: 'OnRampUpdateDestChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRampUpdateDestChainConfig {
        return {
            $: 'OnRampUpdateDestChainConfig',
            destChainSelector: s.loadUintBig(64),
            router: s.loadAddress(),
            allowlistEnabled: s.loadBoolean(),
        }
    },
    store(self: OnRampUpdateDestChainConfig, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        b.storeAddress(self.router);
        b.storeBit(self.allowlistEnabled);
    },
    toCell(self: OnRampUpdateDestChainConfig): c.Cell {
        return makeCellFrom<OnRampUpdateDestChainConfig>(self, OnRampUpdateDestChainConfig.store);
    }
}

/**
 > struct ExecutorDeployment {
 >     deployableCode: cell
 >     executorCode: cell
 > }
 */
export interface ExecutorDeployment {
    readonly $: 'ExecutorDeployment'
    deployableCode: c.Cell
    executorCode: c.Cell
}

export const ExecutorDeployment = {
    create(args: {
        deployableCode: c.Cell
        executorCode: c.Cell
    }): ExecutorDeployment {
        return {
            $: 'ExecutorDeployment',
            ...args
        }
    },
    fromSlice(s: c.Slice): ExecutorDeployment {
        return {
            $: 'ExecutorDeployment',
            deployableCode: s.loadRef(),
            executorCode: s.loadRef(),
        }
    },
    store(self: ExecutorDeployment, b: c.Builder): void {
        b.storeRef(self.deployableCode);
        b.storeRef(self.executorCode);
    },
    toCell(self: ExecutorDeployment): c.Cell {
        return makeCellFrom<ExecutorDeployment>(self, ExecutorDeployment.store);
    }
}

/**
 > struct UpdateAllowlist {
 >     destChainSelector: uint64
 >     add: SnakedCell<address>
 >     remove: SnakedCell<address>
 > }
 */
export interface UpdateAllowlist {
    readonly $: 'UpdateAllowlist'
    destChainSelector: uint64
    add: SnakedCell<c.Address>
    remove: SnakedCell<c.Address>
}

export const UpdateAllowlist = {
    create(args: {
        destChainSelector: uint64
        add: SnakedCell<c.Address>
        remove: SnakedCell<c.Address>
    }): UpdateAllowlist {
        return {
            $: 'UpdateAllowlist',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateAllowlist {
        return {
            $: 'UpdateAllowlist',
            destChainSelector: s.loadUintBig(64),
            add: s.loadRef(),
            remove: s.loadRef(),
        }
    },
    store(self: UpdateAllowlist, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        b.storeRef(self.add);
        b.storeRef(self.remove);
    },
    toCell(self: UpdateAllowlist): c.Cell {
        return makeCellFrom<UpdateAllowlist>(self, UpdateAllowlist.store);
    }
}

/**
 > struct Metadata {
 >     sender: address
 >     value: coins
 > }
 */
export interface Metadata {
    readonly $: 'Metadata'
    sender: c.Address
    value: coins
}

export const Metadata = {
    create(args: {
        sender: c.Address
        value: coins
    }): Metadata {
        return {
            $: 'Metadata',
            ...args
        }
    },
    fromSlice(s: c.Slice): Metadata {
        return {
            $: 'Metadata',
            sender: s.loadAddress(),
            value: s.loadCoins(),
        }
    },
    store(self: Metadata, b: c.Builder): void {
        b.storeAddress(self.sender);
        b.storeCoins(self.value);
    },
    toCell(self: Metadata): c.Cell {
        return makeCellFrom<Metadata>(self, Metadata.store);
    }
}

/**
 > struct TVM2AnyRampMessage {
 >     header: RampMessageHeader
 >     sender: address
 >     body: Cell<TVM2AnyRampMessageBody>
 >     feeValueJuels: uint96
 > }
 */
export interface TVM2AnyRampMessage {
    readonly $: 'TVM2AnyRampMessage'
    header: RampMessageHeader
    sender: c.Address
    body: CellRef<TVM2AnyRampMessageBody>
    feeValueJuels: uint96
}

export const TVM2AnyRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: c.Address
        body: CellRef<TVM2AnyRampMessageBody>
        feeValueJuels: uint96
    }): TVM2AnyRampMessage {
        return {
            $: 'TVM2AnyRampMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TVM2AnyRampMessage {
        return {
            $: 'TVM2AnyRampMessage',
            header: RampMessageHeader.fromSlice(s),
            sender: s.loadAddress(),
            body: loadCellRef<TVM2AnyRampMessageBody>(s, TVM2AnyRampMessageBody.fromSlice),
            feeValueJuels: s.loadUintBig(96),
        }
    },
    store(self: TVM2AnyRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        b.storeAddress(self.sender);
        storeCellRef<TVM2AnyRampMessageBody>(self.body, b, TVM2AnyRampMessageBody.store);
        b.storeUint(self.feeValueJuels, 96);
    },
    toCell(self: TVM2AnyRampMessage): c.Cell {
        return makeCellFrom<TVM2AnyRampMessage>(self, TVM2AnyRampMessage.store);
    }
}

/**
 > struct TVM2AnyRampMessageBody {
 >     receiver: Cell<CrossChainAddress>
 >     data: cell
 >     extraArgs: cell
 >     tokenAmounts: SnakedCell<TokenAmount>
 >     feeToken: address
 >     feeTokenAmount: uint256
 > }
 */
export interface TVM2AnyRampMessageBody {
    readonly $: 'TVM2AnyRampMessageBody'
    receiver: CellRef<CrossChainAddress>
    data: c.Cell
    extraArgs: c.Cell
    tokenAmounts: SnakedCell<TokenAmount>
    feeToken: c.Address
    feeTokenAmount: uint256
}

export const TVM2AnyRampMessageBody = {
    create(args: {
        receiver: CellRef<CrossChainAddress>
        data: c.Cell
        extraArgs: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address
        feeTokenAmount: uint256
    }): TVM2AnyRampMessageBody {
        return {
            $: 'TVM2AnyRampMessageBody',
            ...args
        }
    },
    fromSlice(s: c.Slice): TVM2AnyRampMessageBody {
        return {
            $: 'TVM2AnyRampMessageBody',
            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            data: s.loadRef(),
            extraArgs: s.loadRef(),
            tokenAmounts: s.loadRef(),
            feeToken: s.loadAddress(),
            feeTokenAmount: s.loadUintBig(256),
        }
    },
    store(self: TVM2AnyRampMessageBody, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.receiver, b, CrossChainAddress.store);
        b.storeRef(self.data);
        b.storeRef(self.extraArgs);
        b.storeRef(self.tokenAmounts);
        b.storeAddress(self.feeToken);
        b.storeUint(self.feeTokenAmount, 256);
    },
    toCell(self: TVM2AnyRampMessageBody): c.Cell {
        return makeCellFrom<TVM2AnyRampMessageBody>(self, TVM2AnyRampMessageBody.store);
    }
}

/**
 > struct OnRamp_Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     chainSelector: uint64
 >     config: Cell<OnRamp_DynamicConfig>
 >     destChainConfigs: map<uint64, OnRamp_DestChainConfig>
 >     executor: ExecutorDeployment
 > }
 */
export interface OnRamp_Storage {
    readonly $: 'OnRamp_Storage'
    id: uint32
    ownable: Ownable2Step
    chainSelector: uint64
    config: CellRef<OnRamp_DynamicConfig>
    destChainConfigs: c.Dictionary<uint64, OnRamp_DestChainConfig>
    executor: ExecutorDeployment
}

export const OnRamp_Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        chainSelector: uint64
        config: CellRef<OnRamp_DynamicConfig>
        destChainConfigs: c.Dictionary<uint64, OnRamp_DestChainConfig>
        executor: ExecutorDeployment
    }): OnRamp_Storage {
        return {
            $: 'OnRamp_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_Storage {
        return {
            $: 'OnRamp_Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
            chainSelector: s.loadUintBig(64),
            config: loadCellRef<OnRamp_DynamicConfig>(s, OnRamp_DynamicConfig.fromSlice),
            destChainConfigs: c.Dictionary.load<uint64, OnRamp_DestChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<OnRamp_DestChainConfig>(OnRamp_DestChainConfig.fromSlice, OnRamp_DestChainConfig.store), s),
            executor: ExecutorDeployment.fromSlice(s),
        }
    },
    store(self: OnRamp_Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        b.storeUint(self.chainSelector, 64);
        storeCellRef<OnRamp_DynamicConfig>(self.config, b, OnRamp_DynamicConfig.store);
        b.storeDict<uint64, OnRamp_DestChainConfig>(self.destChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<OnRamp_DestChainConfig>(OnRamp_DestChainConfig.fromSlice, OnRamp_DestChainConfig.store));
        ExecutorDeployment.store(self.executor, b);
    },
    toCell(self: OnRamp_Storage): c.Cell {
        return makeCellFrom<OnRamp_Storage>(self, OnRamp_Storage.store);
    }
}

/**
 > struct (0xdcf993c2) OnRamp_Send {
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 >     tokenRegistry: address?
 > }
 */
export interface OnRamp_Send {
    readonly $: 'OnRamp_Send'
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
    tokenRegistry: c.Address | null
}

export const OnRamp_Send = {
    PREFIX: 0xdcf993c2,

    create(args: {
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
        tokenRegistry: c.Address | null
    }): OnRamp_Send {
        return {
            $: 'OnRamp_Send',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_Send {
        loadAndCheckPrefix32(s, 0xdcf993c2, 'OnRamp_Send');
        return {
            $: 'OnRamp_Send',
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
            tokenRegistry: s.loadMaybeAddress(),
        }
    },
    store(self: OnRamp_Send, b: c.Builder): void {
        b.storeUint(0xdcf993c2, 32);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
        b.storeAddress(self.tokenRegistry);
    },
    toCell(self: OnRamp_Send): c.Cell {
        return makeCellFrom<OnRamp_Send>(self, OnRamp_Send.store);
    }
}

/**
 > struct (0x9c2ccc7e) OnRamp_GetValidatedFee<T> {
 >     ccipSend: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface OnRamp_GetValidatedFee<T> {
    readonly $: 'OnRamp_GetValidatedFee'
    ccipSend: CellRef<Router_CCIPSend>
    context: T
}

export const OnRamp_GetValidatedFee = {
    PREFIX: 0x9c2ccc7e,

    create<T>(args: {
        ccipSend: CellRef<Router_CCIPSend>
        context: T
    }): OnRamp_GetValidatedFee<T> {
        return {
            $: 'OnRamp_GetValidatedFee',
            ...args
        }
    },
}

/**
 > struct (0x9be1fb61) OnRamp_ExecutorRequestsLockOrBurn {
 >     tokenAmount: TokenAmount
 >     tokenPool: address
 >     destChainSelector: uint64
 >     executorID: CCIPSendExecutor_ID
 > }
 */
export interface OnRamp_ExecutorRequestsLockOrBurn {
    readonly $: 'OnRamp_ExecutorRequestsLockOrBurn'
    tokenAmount: TokenAmount
    tokenPool: c.Address
    destChainSelector: uint64
    executorID: CCIPSendExecutor_ID
}

export const OnRamp_ExecutorRequestsLockOrBurn = {
    PREFIX: 0x9be1fb61,

    create(args: {
        tokenAmount: TokenAmount
        tokenPool: c.Address
        destChainSelector: uint64
        executorID: CCIPSendExecutor_ID
    }): OnRamp_ExecutorRequestsLockOrBurn {
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorRequestsLockOrBurn {
        loadAndCheckPrefix32(s, 0x9be1fb61, 'OnRamp_ExecutorRequestsLockOrBurn');
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            tokenAmount: TokenAmount.fromSlice(s),
            tokenPool: s.loadAddress(),
            destChainSelector: s.loadUintBig(64),
            executorID: CCIPSendExecutor_ID.fromSlice(s),
        }
    },
    store(self: OnRamp_ExecutorRequestsLockOrBurn, b: c.Builder): void {
        b.storeUint(0x9be1fb61, 32);
        TokenAmount.store(self.tokenAmount, b);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.destChainSelector, 64);
        CCIPSendExecutor_ID.store(self.executorID, b);
    },
    toCell(self: OnRamp_ExecutorRequestsLockOrBurn): c.Cell {
        return makeCellFrom<OnRamp_ExecutorRequestsLockOrBurn>(self, OnRamp_ExecutorRequestsLockOrBurn.store);
    }
}

/**
 > struct OnRamp_GetValidatedFeeContext {
 >     onrampContext: address
 >     userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
 > }
 */
export interface OnRamp_GetValidatedFeeContext {
    readonly $: 'OnRamp_GetValidatedFeeContext'
    onrampContext: c.Address
    userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
}

export const OnRamp_GetValidatedFeeContext = {
    create(args: {
        onrampContext: c.Address
        userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
    }): OnRamp_GetValidatedFeeContext {
        return {
            $: 'OnRamp_GetValidatedFeeContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_GetValidatedFeeContext {
        return {
            $: 'OnRamp_GetValidatedFeeContext',
            onrampContext: s.loadAddress(),
            userContext: loadTolkRemaining(s),
        }
    },
    store(self: OnRamp_GetValidatedFeeContext, b: c.Builder): void {
        b.storeAddress(self.onrampContext);
        storeTolkRemaining(self.userContext, b);
    },
    toCell(self: OnRamp_GetValidatedFeeContext): c.Cell {
        return makeCellFrom<OnRamp_GetValidatedFeeContext>(self, OnRamp_GetValidatedFeeContext.store);
    }
}

/**
 > struct (0xa178c62e) OnRamp_SetDynamicConfig {
 >     config: OnRamp_DynamicConfig
 > }
 */
export interface OnRamp_SetDynamicConfig {
    readonly $: 'OnRamp_SetDynamicConfig'
    config: OnRamp_DynamicConfig
}

export const OnRamp_SetDynamicConfig = {
    PREFIX: 0xa178c62e,

    create(args: {
        config: OnRamp_DynamicConfig
    }): OnRamp_SetDynamicConfig {
        return {
            $: 'OnRamp_SetDynamicConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_SetDynamicConfig {
        loadAndCheckPrefix32(s, 0xa178c62e, 'OnRamp_SetDynamicConfig');
        return {
            $: 'OnRamp_SetDynamicConfig',
            config: OnRamp_DynamicConfig.fromSlice(s),
        }
    },
    store(self: OnRamp_SetDynamicConfig, b: c.Builder): void {
        b.storeUint(0xa178c62e, 32);
        OnRamp_DynamicConfig.store(self.config, b);
    },
    toCell(self: OnRamp_SetDynamicConfig): c.Cell {
        return makeCellFrom<OnRamp_SetDynamicConfig>(self, OnRamp_SetDynamicConfig.store);
    }
}

/**
 > struct (0xcfa6b336) OnRamp_ExecutorFinishedSuccessfully {
 >     executorID: CCIPSendExecutor_ID
 >     fee: Fee
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 > }
 */
export interface OnRamp_ExecutorFinishedSuccessfully {
    readonly $: 'OnRamp_ExecutorFinishedSuccessfully'
    executorID: CCIPSendExecutor_ID
    fee: Fee
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
}

export const OnRamp_ExecutorFinishedSuccessfully = {
    PREFIX: 0xcfa6b336,

    create(args: {
        executorID: CCIPSendExecutor_ID
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }): OnRamp_ExecutorFinishedSuccessfully {
        return {
            $: 'OnRamp_ExecutorFinishedSuccessfully',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorFinishedSuccessfully {
        loadAndCheckPrefix32(s, 0xcfa6b336, 'OnRamp_ExecutorFinishedSuccessfully');
        return {
            $: 'OnRamp_ExecutorFinishedSuccessfully',
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            fee: Fee.fromSlice(s),
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
        }
    },
    store(self: OnRamp_ExecutorFinishedSuccessfully, b: c.Builder): void {
        b.storeUint(0xcfa6b336, 32);
        CCIPSendExecutor_ID.store(self.executorID, b);
        Fee.store(self.fee, b);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
    },
    toCell(self: OnRamp_ExecutorFinishedSuccessfully): c.Cell {
        return makeCellFrom<OnRamp_ExecutorFinishedSuccessfully>(self, OnRamp_ExecutorFinishedSuccessfully.store);
    }
}

/**
 > struct (0xc4068e21) OnRamp_ExecutorFinishedWithError {
 >     executorID: CCIPSendExecutor_ID
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 > }
 */
export interface OnRamp_ExecutorFinishedWithError {
    readonly $: 'OnRamp_ExecutorFinishedWithError'
    executorID: CCIPSendExecutor_ID
    error: uint256
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
}

export const OnRamp_ExecutorFinishedWithError = {
    PREFIX: 0xc4068e21,

    create(args: {
        executorID: CCIPSendExecutor_ID
        error: uint256
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }): OnRamp_ExecutorFinishedWithError {
        return {
            $: 'OnRamp_ExecutorFinishedWithError',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorFinishedWithError {
        loadAndCheckPrefix32(s, 0xc4068e21, 'OnRamp_ExecutorFinishedWithError');
        return {
            $: 'OnRamp_ExecutorFinishedWithError',
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            error: s.loadUintBig(256),
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
        }
    },
    store(self: OnRamp_ExecutorFinishedWithError, b: c.Builder): void {
        b.storeUint(0xc4068e21, 32);
        CCIPSendExecutor_ID.store(self.executorID, b);
        b.storeUint(self.error, 256);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
    },
    toCell(self: OnRamp_ExecutorFinishedWithError): c.Cell {
        return makeCellFrom<OnRamp_ExecutorFinishedWithError>(self, OnRamp_ExecutorFinishedWithError.store);
    }
}

/**
 > struct (0x1a246b6c) OnRamp_UpdateDestChainConfigs {
 >     updates: SnakedCell<OnRampUpdateDestChainConfig>
 > }
 */
export interface OnRamp_UpdateDestChainConfigs {
    readonly $: 'OnRamp_UpdateDestChainConfigs'
    updates: SnakedCell<OnRampUpdateDestChainConfig>
}

export const OnRamp_UpdateDestChainConfigs = {
    PREFIX: 0x1a246b6c,

    create(args: {
        updates: SnakedCell<OnRampUpdateDestChainConfig>
    }): OnRamp_UpdateDestChainConfigs {
        return {
            $: 'OnRamp_UpdateDestChainConfigs',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_UpdateDestChainConfigs {
        loadAndCheckPrefix32(s, 0x1a246b6c, 'OnRamp_UpdateDestChainConfigs');
        return {
            $: 'OnRamp_UpdateDestChainConfigs',
            updates: s.loadRef(),
        }
    },
    store(self: OnRamp_UpdateDestChainConfigs, b: c.Builder): void {
        b.storeUint(0x1a246b6c, 32);
        b.storeRef(self.updates);
    },
    toCell(self: OnRamp_UpdateDestChainConfigs): c.Cell {
        return makeCellFrom<OnRamp_UpdateDestChainConfigs>(self, OnRamp_UpdateDestChainConfigs.store);
    }
}

/**
 > struct (0x82901c45) OnRamp_UpdateSendExecutor {
 >     code: cell
 > }
 */
export interface OnRamp_UpdateSendExecutor {
    readonly $: 'OnRamp_UpdateSendExecutor'
    code: c.Cell
}

export const OnRamp_UpdateSendExecutor = {
    PREFIX: 0x82901c45,

    create(args: {
        code: c.Cell
    }): OnRamp_UpdateSendExecutor {
        return {
            $: 'OnRamp_UpdateSendExecutor',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_UpdateSendExecutor {
        loadAndCheckPrefix32(s, 0x82901c45, 'OnRamp_UpdateSendExecutor');
        return {
            $: 'OnRamp_UpdateSendExecutor',
            code: s.loadRef(),
        }
    },
    store(self: OnRamp_UpdateSendExecutor, b: c.Builder): void {
        b.storeUint(0x82901c45, 32);
        b.storeRef(self.code);
    },
    toCell(self: OnRamp_UpdateSendExecutor): c.Cell {
        return makeCellFrom<OnRamp_UpdateSendExecutor>(self, OnRamp_UpdateSendExecutor.store);
    }
}

/**
 > struct (0x9dc06185) OnRamp_UpdateAllowlists {
 >     updates: SnakedCell<UpdateAllowlist>
 > }
 */
export interface OnRamp_UpdateAllowlists {
    readonly $: 'OnRamp_UpdateAllowlists'
    updates: SnakedCell<UpdateAllowlist>
}

export const OnRamp_UpdateAllowlists = {
    PREFIX: 0x9dc06185,

    create(args: {
        updates: SnakedCell<UpdateAllowlist>
    }): OnRamp_UpdateAllowlists {
        return {
            $: 'OnRamp_UpdateAllowlists',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_UpdateAllowlists {
        loadAndCheckPrefix32(s, 0x9dc06185, 'OnRamp_UpdateAllowlists');
        return {
            $: 'OnRamp_UpdateAllowlists',
            updates: s.loadRef(),
        }
    },
    store(self: OnRamp_UpdateAllowlists, b: c.Builder): void {
        b.storeUint(0x9dc06185, 32);
        b.storeRef(self.updates);
    },
    toCell(self: OnRamp_UpdateAllowlists): c.Cell {
        return makeCellFrom<OnRamp_UpdateAllowlists>(self, OnRamp_UpdateAllowlists.store);
    }
}

/**
 > struct (0x2afb11bd) OnRamp_MessageValidated<T> {
 >     fee: coins
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface OnRamp_MessageValidated<T> {
    readonly $: 'OnRamp_MessageValidated'
    fee: coins
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const OnRamp_MessageValidated = {
    PREFIX: 0x2afb11bd,

    create<T>(args: {
        fee: coins
        msg: CellRef<Router_CCIPSend>
        context: T
    }): OnRamp_MessageValidated<T> {
        return {
            $: 'OnRamp_MessageValidated',
            ...args
        }
    },
}

/**
 > struct (0xac1dd12e) OnRamp_MessageValidationFailed<T> {
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface OnRamp_MessageValidationFailed<T> {
    readonly $: 'OnRamp_MessageValidationFailed'
    error: uint256
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const OnRamp_MessageValidationFailed = {
    PREFIX: 0xac1dd12e,

    create<T>(args: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: T
    }): OnRamp_MessageValidationFailed<T> {
        return {
            $: 'OnRamp_MessageValidationFailed',
            ...args
        }
    },
}

/**
 > struct (0x7052dc75) OnRamp_WithdrawFeeTokens {
 >     feeTokens: SnakedCell<address>
 > }
 */
export interface OnRamp_WithdrawFeeTokens {
    readonly $: 'OnRamp_WithdrawFeeTokens'
    feeTokens: SnakedCell<c.Address>
}

export const OnRamp_WithdrawFeeTokens = {
    PREFIX: 0x7052dc75,

    create(args: {
        feeTokens: SnakedCell<c.Address>
    }): OnRamp_WithdrawFeeTokens {
        return {
            $: 'OnRamp_WithdrawFeeTokens',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_WithdrawFeeTokens {
        loadAndCheckPrefix32(s, 0x7052dc75, 'OnRamp_WithdrawFeeTokens');
        return {
            $: 'OnRamp_WithdrawFeeTokens',
            feeTokens: s.loadRef(),
        }
    },
    store(self: OnRamp_WithdrawFeeTokens, b: c.Builder): void {
        b.storeUint(0x7052dc75, 32);
        b.storeRef(self.feeTokens);
    },
    toCell(self: OnRamp_WithdrawFeeTokens): c.Cell {
        return makeCellFrom<OnRamp_WithdrawFeeTokens>(self, OnRamp_WithdrawFeeTokens.store);
    }
}

// ————————————————————————————————————————————
//    class OnRamp
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

export class OnRamp implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Error.UnknownDestChainSelector': 13400,
        'Error.Unauthorized': 13401,
        'Error.UnknownToken': 13404,
        'Error.InsufficientValue': 13405,
        'Utils_Error.InvalidData': 13500,
        'Upgradeable_Error.VersionMismatch': 19900,
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

    static registerCustomPackUnpack<T>(
        typeName: string,
        packToBuilderFn: CustomPackToBuilderFn<T> | null,
        unpackFromSliceFn: CustomUnpackFromSliceFn<T> | null,
    ) {
        if (customSerializersRegistry.has(typeName)) {
            throw new Error(`Custom pack/unpack for 'OnRamp.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new OnRamp(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        chainSelector: uint64
        config: CellRef<OnRamp_DynamicConfig>
        destChainConfigs: c.Dictionary<uint64, OnRamp_DestChainConfig>
        executor: ExecutorDeployment
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OnRamp.CodeCell,
            data: OnRamp_Storage.toCell(OnRamp_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OnRamp(address, initialState);
    }

    static createCellOfOnRampSend(body: {
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
        tokenRegistry: c.Address | null
    }) {
        return OnRamp_Send.toCell(OnRamp_Send.create(body));
    }

    static createCellOfOnRampGetValidatedFeeRemainingBitsAndRefs_(body: {
        ccipSend: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }) {
        return makeCellFrom<OnRamp_GetValidatedFee<RemainingBitsAndRefs>>(OnRamp_GetValidatedFee.create<RemainingBitsAndRefs>(body),
            (v,b) => { b.storeUint(0x9c2ccc7e, 32);
            storeCellRef<Router_CCIPSend>(v.ccipSend, b, Router_CCIPSend.store);
            storeTolkRemaining(v.context, b); }
        );
    }

    static createCellOfFeeQuoterMessageValidatedOnRampGetValidatedFeeContext_(body: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        context: OnRamp_GetValidatedFeeContext
    }) {
        return makeCellFrom<FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>>(FeeQuoter_MessageValidated.create<OnRamp_GetValidatedFeeContext>(body),
            (v,b) => { b.storeUint(0x1fa60374, 32);
            Fee.store(v.fee, b);
            storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
            OnRamp_GetValidatedFeeContext.store(v.context, b); }
        );
    }

    static createCellOfFeeQuoterMessageValidationFailedOnRampGetValidatedFeeContext_(body: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: OnRamp_GetValidatedFeeContext
    }) {
        return makeCellFrom<FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>>(FeeQuoter_MessageValidationFailed.create<OnRamp_GetValidatedFeeContext>(body),
            (v,b) => { b.storeUint(0xbcf0ab0f, 32);
            b.storeUint(v.error, 256);
            storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
            OnRamp_GetValidatedFeeContext.store(v.context, b); }
        );
    }

    static createCellOfOnRampExecutorRequestsLockOrBurn(body: {
        tokenAmount: TokenAmount
        tokenPool: c.Address
        destChainSelector: uint64
        executorID: CCIPSendExecutor_ID
    }) {
        return OnRamp_ExecutorRequestsLockOrBurn.toCell(OnRamp_ExecutorRequestsLockOrBurn.create(body));
    }

    static createCellOfOnRampExecutorFinishedSuccessfully(body: {
        executorID: CCIPSendExecutor_ID
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }) {
        return OnRamp_ExecutorFinishedSuccessfully.toCell(OnRamp_ExecutorFinishedSuccessfully.create(body));
    }

    static createCellOfOnRampExecutorFinishedWithError(body: {
        executorID: CCIPSendExecutor_ID
        error: uint256
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }) {
        return OnRamp_ExecutorFinishedWithError.toCell(OnRamp_ExecutorFinishedWithError.create(body));
    }

    static createCellOfOnRampSetDynamicConfig(body: {
        config: OnRamp_DynamicConfig
    }) {
        return OnRamp_SetDynamicConfig.toCell(OnRamp_SetDynamicConfig.create(body));
    }

    static createCellOfOnRampUpdateDestChainConfigs(body: {
        updates: SnakedCell<OnRampUpdateDestChainConfig>
    }) {
        return OnRamp_UpdateDestChainConfigs.toCell(OnRamp_UpdateDestChainConfigs.create(body));
    }

    static createCellOfOnRampUpdateSendExecutor(body: {
        code: c.Cell
    }) {
        return OnRamp_UpdateSendExecutor.toCell(OnRamp_UpdateSendExecutor.create(body));
    }

    static createCellOfOnRampUpdateAllowlists(body: {
        updates: SnakedCell<UpdateAllowlist>
    }) {
        return OnRamp_UpdateAllowlists.toCell(OnRamp_UpdateAllowlists.create(body));
    }

    static createCellOfOnRampWithdrawFeeTokens(body: {
        feeTokens: SnakedCell<c.Address>
    }) {
        return OnRamp_WithdrawFeeTokens.toCell(OnRamp_WithdrawFeeTokens.create(body));
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

    async sendOnRampSend(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
        tokenRegistry: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_Send.toCell(OnRamp_Send.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampGetValidatedFeeRemainingBitsAndRefs_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        ccipSend: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<OnRamp_GetValidatedFee<RemainingBitsAndRefs>>(OnRamp_GetValidatedFee.create<RemainingBitsAndRefs>(body),
                (v,b) => { b.storeUint(0x9c2ccc7e, 32);
                storeCellRef<Router_CCIPSend>(v.ccipSend, b, Router_CCIPSend.store);
                storeTolkRemaining(v.context, b); }
            ),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidatedOnRampGetValidatedFeeContext_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        context: OnRamp_GetValidatedFeeContext
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>>(FeeQuoter_MessageValidated.create<OnRamp_GetValidatedFeeContext>(body),
                (v,b) => { b.storeUint(0x1fa60374, 32);
                Fee.store(v.fee, b);
                storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
                OnRamp_GetValidatedFeeContext.store(v.context, b); }
            ),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidationFailedOnRampGetValidatedFeeContext_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: OnRamp_GetValidatedFeeContext
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>>(FeeQuoter_MessageValidationFailed.create<OnRamp_GetValidatedFeeContext>(body),
                (v,b) => { b.storeUint(0xbcf0ab0f, 32);
                b.storeUint(v.error, 256);
                storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
                OnRamp_GetValidatedFeeContext.store(v.context, b); }
            ),
            ...extraOptions
        });
    }

    async sendOnRampExecutorRequestsLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenAmount: TokenAmount
        tokenPool: c.Address
        destChainSelector: uint64
        executorID: CCIPSendExecutor_ID
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_ExecutorRequestsLockOrBurn.toCell(OnRamp_ExecutorRequestsLockOrBurn.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampExecutorFinishedSuccessfully(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        executorID: CCIPSendExecutor_ID
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_ExecutorFinishedSuccessfully.toCell(OnRamp_ExecutorFinishedSuccessfully.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampExecutorFinishedWithError(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        executorID: CCIPSendExecutor_ID
        error: uint256
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_ExecutorFinishedWithError.toCell(OnRamp_ExecutorFinishedWithError.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampSetDynamicConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        config: OnRamp_DynamicConfig
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_SetDynamicConfig.toCell(OnRamp_SetDynamicConfig.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampUpdateDestChainConfigs(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        updates: SnakedCell<OnRampUpdateDestChainConfig>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_UpdateDestChainConfigs.toCell(OnRamp_UpdateDestChainConfigs.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampUpdateSendExecutor(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        code: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_UpdateSendExecutor.toCell(OnRamp_UpdateSendExecutor.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampUpdateAllowlists(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        updates: SnakedCell<UpdateAllowlist>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_UpdateAllowlists.toCell(OnRamp_UpdateAllowlists.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampWithdrawFeeTokens(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        feeTokens: SnakedCell<c.Address>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_WithdrawFeeTokens.toCell(OnRamp_WithdrawFeeTokens.create(body)),
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

    async getIsChainSupported(provider: ContractProvider, destChainSelector: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isChainSupported', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readBoolean();
    }

    async getExpectedNextSequenceNumber(provider: ContractProvider, destChainSelector: uint64): Promise<uint64> {
        const r = StackReader.fromGetMethod(1, await provider.get('expectedNextSequenceNumber', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readBigInt();
    }

    async getStaticConfig(provider: ContractProvider): Promise<uint64> {
        const r = StackReader.fromGetMethod(1, await provider.get('staticConfig', []));
        return r.readBigInt();
    }

    async getDynamicConfig(provider: ContractProvider): Promise<OnRamp_DynamicConfig> {
        const r = StackReader.fromGetMethod(4, await provider.get('dynamicConfig', []));
        return ({
            $: 'OnRamp_DynamicConfig',
            feeQuoter: r.readSlice().loadAddress(),
            feeAggregator: r.readSlice().loadAddress(),
            allowlistAdmin: r.readSlice().loadAddress(),
            reserve: r.readBigInt(),
        });
    }

    async getDestChainConfig(provider: ContractProvider, destChainSelector: uint64): Promise<OnRamp_DestChainConfig> {
        const r = StackReader.fromGetMethod(4, await provider.get('destChainConfig', [
            { type: 'int', value: destChainSelector },
        ]));
        return ({
            $: 'OnRamp_DestChainConfig',
            router: r.readSlice().loadAddress(),
            sequenceNumber: r.readBigInt(),
            allowlistEnabled: r.readBoolean(),
            allowedSenders: r.readDictionary<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool()),
        });
    }

    async getFeeQuoter(provider: ContractProvider, _destChainSelector: bigint): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('feeQuoter', [
            { type: 'int', value: _destChainSelector },
        ]));
        return r.readSlice().loadAddress();
    }

    async getAllowedSendersList(provider: ContractProvider, destChainSelector: uint64): Promise<lisp_list<c.Address>> {
        const r = StackReader.fromGetMethod(1, await provider.get('allowedSendersList', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readLispListOf<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getDestChainSelectors(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('destChainSelectors', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
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

    async getSendExecutorCode(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('sendExecutorCode', []));
        return r.readCell();
    }

    async getSendExecutorCodeHash(provider: ContractProvider): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('sendExecutorCodeHash', []));
        return r.readBigInt();
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
