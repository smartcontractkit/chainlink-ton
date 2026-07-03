// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a Router contract in Tolk.
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

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'Router.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > Router.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint128 = bigint
type uint192 = bigint
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
 > struct Ramp {
 >     chainSelector: uint64
 >     ramp: address
 > }
 */
export interface Ramp {
    readonly $: 'Ramp'
    chainSelector: uint64
    ramp: c.Address
}

export const Ramp = {
    create(args: {
        chainSelector: uint64
        ramp: c.Address
    }): Ramp {
        return {
            $: 'Ramp',
            ...args
        }
    },
    fromSlice(s: c.Slice): Ramp {
        return {
            $: 'Ramp',
            chainSelector: s.loadUintBig(64),
            ramp: s.loadAddress(),
        }
    },
    store(self: Ramp, b: c.Builder): void {
        b.storeUint(self.chainSelector, 64);
        b.storeAddress(self.ramp);
    },
    toCell(self: Ramp): c.Cell {
        return makeCellFrom<Ramp>(self, Ramp.store);
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
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args
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
 > struct (0xb3126df1) Receiver_CCIPReceive {
 >     execId: uint192
 >     message: Any2TVMMessage
 > }
 */
export interface Receiver_CCIPReceive {
    readonly $: 'Receiver_CCIPReceive'
    execId: uint192
    message: Any2TVMMessage
}

export const Receiver_CCIPReceive = {
    PREFIX: 0xb3126df1,

    create(args: {
        execId: uint192
        message: Any2TVMMessage
    }): Receiver_CCIPReceive {
        return {
            $: 'Receiver_CCIPReceive',
            ...args
        }
    },
    fromSlice(s: c.Slice): Receiver_CCIPReceive {
        loadAndCheckPrefix32(s, 0xb3126df1, 'Receiver_CCIPReceive');
        return {
            $: 'Receiver_CCIPReceive',
            execId: s.loadUintBig(192),
            message: Any2TVMMessage.fromSlice(s),
        }
    },
    store(self: Receiver_CCIPReceive, b: c.Builder): void {
        b.storeUint(0xb3126df1, 32);
        b.storeUint(self.execId, 192);
        Any2TVMMessage.store(self.message, b);
    },
    toCell(self: Receiver_CCIPReceive): c.Cell {
        return makeCellFrom<Receiver_CCIPReceive>(self, Receiver_CCIPReceive.store);
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
 > struct (0xd24387a4) TokenRegistry_SetTokenInfo {
 >     info: TokenRegistry_TokenInfo
 > }
 */
export interface TokenRegistry_SetTokenInfo {
    readonly $: 'TokenRegistry_SetTokenInfo'
    info: TokenRegistry_TokenInfo
}

export const TokenRegistry_SetTokenInfo = {
    PREFIX: 0xd24387a4,

    create(args: {
        info: TokenRegistry_TokenInfo
    }): TokenRegistry_SetTokenInfo {
        return {
            $: 'TokenRegistry_SetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_SetTokenInfo {
        loadAndCheckPrefix32(s, 0xd24387a4, 'TokenRegistry_SetTokenInfo');
        return {
            $: 'TokenRegistry_SetTokenInfo',
            info: TokenRegistry_TokenInfo.fromSlice(s),
        }
    },
    store(self: TokenRegistry_SetTokenInfo, b: c.Builder): void {
        b.storeUint(0xd24387a4, 32);
        TokenRegistry_TokenInfo.store(self.info, b);
    },
    toCell(self: TokenRegistry_SetTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_SetTokenInfo>(self, TokenRegistry_SetTokenInfo.store);
    }
}

/**
 > struct (0x7dd8f942) MockTokenPool_LockOrBurn {
 >     tokenAmount: TokenAmount
 >     notify: address
 > }
 */
export interface MockTokenPool_LockOrBurn {
    readonly $: 'MockTokenPool_LockOrBurn'
    tokenAmount: TokenAmount
    notify: c.Address
}

export const MockTokenPool_LockOrBurn = {
    PREFIX: 0x7dd8f942,

    create(args: {
        tokenAmount: TokenAmount
        notify: c.Address
    }): MockTokenPool_LockOrBurn {
        return {
            $: 'MockTokenPool_LockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): MockTokenPool_LockOrBurn {
        loadAndCheckPrefix32(s, 0x7dd8f942, 'MockTokenPool_LockOrBurn');
        return {
            $: 'MockTokenPool_LockOrBurn',
            tokenAmount: TokenAmount.fromSlice(s),
            notify: s.loadAddress(),
        }
    },
    store(self: MockTokenPool_LockOrBurn, b: c.Builder): void {
        b.storeUint(0x7dd8f942, 32);
        TokenAmount.store(self.tokenAmount, b);
        b.storeAddress(self.notify);
    },
    toCell(self: MockTokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<MockTokenPool_LockOrBurn>(self, MockTokenPool_LockOrBurn.store);
    }
}

/**
 > struct OnRamps {
 >     destChainSelectors: SnakedCell<uint64>
 >     onRamp: address?
 > }
 */
export interface OnRamps {
    readonly $: 'OnRamps'
    destChainSelectors: SnakedCell<uint64>
    onRamp: c.Address | null
}

export const OnRamps = {
    create(args: {
        destChainSelectors: SnakedCell<uint64>
        onRamp: c.Address | null
    }): OnRamps {
        return {
            $: 'OnRamps',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamps {
        return {
            $: 'OnRamps',
            destChainSelectors: s.loadRef(),
            onRamp: s.loadMaybeAddress(),
        }
    },
    store(self: OnRamps, b: c.Builder): void {
        b.storeRef(self.destChainSelectors);
        b.storeAddress(self.onRamp);
    },
    toCell(self: OnRamps): c.Cell {
        return makeCellFrom<OnRamps>(self, OnRamps.store);
    }
}

/**
 > struct OffRamps {
 >     sourceChainSelectors: SnakedCell<uint64>
 >     offRamp: address
 > }
 */
export interface OffRamps {
    readonly $: 'OffRamps'
    sourceChainSelectors: SnakedCell<uint64>
    offRamp: c.Address
}

export const OffRamps = {
    create(args: {
        sourceChainSelectors: SnakedCell<uint64>
        offRamp: c.Address
    }): OffRamps {
        return {
            $: 'OffRamps',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamps {
        return {
            $: 'OffRamps',
            sourceChainSelectors: s.loadRef(),
            offRamp: s.loadAddress(),
        }
    },
    store(self: OffRamps, b: c.Builder): void {
        b.storeRef(self.sourceChainSelectors);
        b.storeAddress(self.offRamp);
    },
    toCell(self: OffRamps): c.Cell {
        return makeCellFrom<OffRamps>(self, OffRamps.store);
    }
}

/**
 > struct Router_TokenRegistryDeployment {
 >     deployableCode: cell
 >     tokenRegistryCode: cell
 > }
 */
export interface Router_TokenRegistryDeployment {
    readonly $: 'Router_TokenRegistryDeployment'
    deployableCode: c.Cell
    tokenRegistryCode: c.Cell
}

export const Router_TokenRegistryDeployment = {
    create(args: {
        deployableCode: c.Cell
        tokenRegistryCode: c.Cell
    }): Router_TokenRegistryDeployment {
        return {
            $: 'Router_TokenRegistryDeployment',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_TokenRegistryDeployment {
        return {
            $: 'Router_TokenRegistryDeployment',
            deployableCode: s.loadRef(),
            tokenRegistryCode: s.loadRef(),
        }
    },
    store(self: Router_TokenRegistryDeployment, b: c.Builder): void {
        b.storeRef(self.deployableCode);
        b.storeRef(self.tokenRegistryCode);
    },
    toCell(self: Router_TokenRegistryDeployment): c.Cell {
        return makeCellFrom<Router_TokenRegistryDeployment>(self, Router_TokenRegistryDeployment.store);
    }
}

/**
 > type Router_GetValidatedFee_RemainingBitsAndRefs = Router_GetValidatedFee<RemainingBitsAndRefs>
 */
export type Router_GetValidatedFee_RemainingBitsAndRefs = Router_GetValidatedFee<RemainingBitsAndRefs>

export const Router_GetValidatedFee_RemainingBitsAndRefs = {
    fromSlice(s: c.Slice): Router_GetValidatedFee_RemainingBitsAndRefs {
        return (() => {
            loadAndCheckPrefix32(s, 0x4dd6aa82, 'Router_GetValidatedFee');
            return {
                $: 'Router_GetValidatedFee',
                ccipSend: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: loadTolkRemaining(s),
            }
        })();
    },
    store(self: Router_GetValidatedFee_RemainingBitsAndRefs, b: c.Builder): void {
        b.storeUint(0x4dd6aa82, 32);
        storeCellRef<Router_CCIPSend>(self.ccipSend, b, Router_CCIPSend.store);
        storeTolkRemaining(self.context, b);
    },
    toCell(self: Router_GetValidatedFee_RemainingBitsAndRefs): c.Cell {
        return makeCellFrom<Router_GetValidatedFee_RemainingBitsAndRefs>(self, Router_GetValidatedFee_RemainingBitsAndRefs.store);
    }
}

/**
 > type OnRamp_MessageValidated_GetValidatedFeeContext = OnRamp_MessageValidated<Router_GetValidatedFeeContext>
 */
export type OnRamp_MessageValidated_GetValidatedFeeContext = OnRamp_MessageValidated<Router_GetValidatedFeeContext>

export const OnRamp_MessageValidated_GetValidatedFeeContext = {
    fromSlice(s: c.Slice): OnRamp_MessageValidated_GetValidatedFeeContext {
        return (() => {
            loadAndCheckPrefix32(s, 0x2afb11bd, 'OnRamp_MessageValidated');
            return {
                $: 'OnRamp_MessageValidated',
                fee: s.loadCoins(),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: Router_GetValidatedFeeContext.fromSlice(s),
            }
        })();
    },
    store(self: OnRamp_MessageValidated_GetValidatedFeeContext, b: c.Builder): void {
        b.storeUint(0x2afb11bd, 32);
        b.storeCoins(self.fee);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Router_GetValidatedFeeContext.store(self.context, b);
    },
    toCell(self: OnRamp_MessageValidated_GetValidatedFeeContext): c.Cell {
        return makeCellFrom<OnRamp_MessageValidated_GetValidatedFeeContext>(self, OnRamp_MessageValidated_GetValidatedFeeContext.store);
    }
}

/**
 > type OnRamp_MessageValidationFailed_GetValidatedFeeContext = OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext>
 */
export type OnRamp_MessageValidationFailed_GetValidatedFeeContext = OnRamp_MessageValidationFailed<Router_GetValidatedFeeContext>

export const OnRamp_MessageValidationFailed_GetValidatedFeeContext = {
    fromSlice(s: c.Slice): OnRamp_MessageValidationFailed_GetValidatedFeeContext {
        return (() => {
            loadAndCheckPrefix32(s, 0xac1dd12e, 'OnRamp_MessageValidationFailed');
            return {
                $: 'OnRamp_MessageValidationFailed',
                error: s.loadUintBig(256),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: Router_GetValidatedFeeContext.fromSlice(s),
            }
        })();
    },
    store(self: OnRamp_MessageValidationFailed_GetValidatedFeeContext, b: c.Builder): void {
        b.storeUint(0xac1dd12e, 32);
        b.storeUint(self.error, 256);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Router_GetValidatedFeeContext.store(self.context, b);
    },
    toCell(self: OnRamp_MessageValidationFailed_GetValidatedFeeContext): c.Cell {
        return makeCellFrom<OnRamp_MessageValidationFailed_GetValidatedFeeContext>(self, OnRamp_MessageValidationFailed_GetValidatedFeeContext.store);
    }
}

/**
 > struct (0x7db6745d) Router_ApplyRampUpdates {
 >     queryId: uint64
 >     onRampUpdates: OnRamps?
 >     offRampAdds: OffRamps?
 >     offRampRemoves: OffRamps?
 > }
 */
export interface Router_ApplyRampUpdates {
    readonly $: 'Router_ApplyRampUpdates'
    queryId: uint64
    onRampUpdates: OnRamps | null
    offRampAdds: OffRamps | null
    offRampRemoves: OffRamps | null
}

export const Router_ApplyRampUpdates = {
    PREFIX: 0x7db6745d,

    create(args: {
        queryId: uint64
        onRampUpdates: OnRamps | null
        offRampAdds: OffRamps | null
        offRampRemoves: OffRamps | null
    }): Router_ApplyRampUpdates {
        return {
            $: 'Router_ApplyRampUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_ApplyRampUpdates {
        loadAndCheckPrefix32(s, 0x7db6745d, 'Router_ApplyRampUpdates');
        return {
            $: 'Router_ApplyRampUpdates',
            queryId: s.loadUintBig(64),
            onRampUpdates: s.loadBoolean() ? OnRamps.fromSlice(s) : null,
            offRampAdds: s.loadBoolean() ? OffRamps.fromSlice(s) : null,
            offRampRemoves: s.loadBoolean() ? OffRamps.fromSlice(s) : null,
        }
    },
    store(self: Router_ApplyRampUpdates, b: c.Builder): void {
        b.storeUint(0x7db6745d, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<OnRamps>(self.onRampUpdates, b, OnRamps.store);
        storeTolkNullable<OffRamps>(self.offRampAdds, b, OffRamps.store);
        storeTolkNullable<OffRamps>(self.offRampRemoves, b, OffRamps.store);
    },
    toCell(self: Router_ApplyRampUpdates): c.Cell {
        return makeCellFrom<Router_ApplyRampUpdates>(self, Router_ApplyRampUpdates.store);
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
 > struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
 >     execId: ReceiveExecutorId
 > }
 */
export interface Router_CCIPReceiveConfirm {
    readonly $: 'Router_CCIPReceiveConfirm'
    execId: ReceiveExecutorId
}

export const Router_CCIPReceiveConfirm = {
    PREFIX: 0x1e55bbf6,

    create(args: {
        execId: ReceiveExecutorId
    }): Router_CCIPReceiveConfirm {
        return {
            $: 'Router_CCIPReceiveConfirm',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_CCIPReceiveConfirm {
        loadAndCheckPrefix32(s, 0x1e55bbf6, 'Router_CCIPReceiveConfirm');
        return {
            $: 'Router_CCIPReceiveConfirm',
            execId: ReceiveExecutorId.fromSlice(s),
        }
    },
    store(self: Router_CCIPReceiveConfirm, b: c.Builder): void {
        b.storeUint(0x1e55bbf6, 32);
        ReceiveExecutorId.store(self.execId, b);
    },
    toCell(self: Router_CCIPReceiveConfirm): c.Cell {
        return makeCellFrom<Router_CCIPReceiveConfirm>(self, Router_CCIPReceiveConfirm.store);
    }
}

/**
 > struct (0xf3388046) Router_RMNRemoteCurse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface Router_RMNRemoteCurse {
    readonly $: 'Router_RMNRemoteCurse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const Router_RMNRemoteCurse = {
    PREFIX: 0xf3388046,

    create(args: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }): Router_RMNRemoteCurse {
        return {
            $: 'Router_RMNRemoteCurse',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RMNRemoteCurse {
        loadAndCheckPrefix32(s, 0xf3388046, 'Router_RMNRemoteCurse');
        return {
            $: 'Router_RMNRemoteCurse',
            queryId: s.loadUintBig(64),
            subjects: s.loadRef(),
        }
    },
    store(self: Router_RMNRemoteCurse, b: c.Builder): void {
        b.storeUint(0xf3388046, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.subjects);
    },
    toCell(self: Router_RMNRemoteCurse): c.Cell {
        return makeCellFrom<Router_RMNRemoteCurse>(self, Router_RMNRemoteCurse.store);
    }
}

/**
 > struct (0x3f153a31) Router_RMNRemoteUncurse {
 >     queryId: uint64
 >     subjects: SnakedCell<uint128>
 > }
 */
export interface Router_RMNRemoteUncurse {
    readonly $: 'Router_RMNRemoteUncurse'
    queryId: uint64
    subjects: SnakedCell<uint128>
}

export const Router_RMNRemoteUncurse = {
    PREFIX: 0x3f153a31,

    create(args: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }): Router_RMNRemoteUncurse {
        return {
            $: 'Router_RMNRemoteUncurse',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RMNRemoteUncurse {
        loadAndCheckPrefix32(s, 0x3f153a31, 'Router_RMNRemoteUncurse');
        return {
            $: 'Router_RMNRemoteUncurse',
            queryId: s.loadUintBig(64),
            subjects: s.loadRef(),
        }
    },
    store(self: Router_RMNRemoteUncurse, b: c.Builder): void {
        b.storeUint(0x3f153a31, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.subjects);
    },
    toCell(self: Router_RMNRemoteUncurse): c.Cell {
        return makeCellFrom<Router_RMNRemoteUncurse>(self, Router_RMNRemoteUncurse.store);
    }
}

/**
 > struct (0x0b95aa4e) Router_RMNRemoteVerifyNotCursed {
 >     queryId: uint64
 >     subject: uint128
 > }
 */
export interface Router_RMNRemoteVerifyNotCursed {
    readonly $: 'Router_RMNRemoteVerifyNotCursed'
    queryId: uint64
    subject: uint128
}

export const Router_RMNRemoteVerifyNotCursed = {
    PREFIX: 0x0b95aa4e,

    create(args: {
        queryId: uint64
        subject: uint128
    }): Router_RMNRemoteVerifyNotCursed {
        return {
            $: 'Router_RMNRemoteVerifyNotCursed',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RMNRemoteVerifyNotCursed {
        loadAndCheckPrefix32(s, 0x0b95aa4e, 'Router_RMNRemoteVerifyNotCursed');
        return {
            $: 'Router_RMNRemoteVerifyNotCursed',
            queryId: s.loadUintBig(64),
            subject: s.loadUintBig(128),
        }
    },
    store(self: Router_RMNRemoteVerifyNotCursed, b: c.Builder): void {
        b.storeUint(0x0b95aa4e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.subject, 128);
    },
    toCell(self: Router_RMNRemoteVerifyNotCursed): c.Cell {
        return makeCellFrom<Router_RMNRemoteVerifyNotCursed>(self, Router_RMNRemoteVerifyNotCursed.store);
    }
}

/**
 > struct (0x22ba83b3) Router_RMNRemoteVerifyNotCursedResponse {
 >     queryId: uint64
 >     result: bool
 > }
 */
export interface Router_RMNRemoteVerifyNotCursedResponse {
    readonly $: 'Router_RMNRemoteVerifyNotCursedResponse'
    queryId: uint64
    result: boolean
}

export const Router_RMNRemoteVerifyNotCursedResponse = {
    PREFIX: 0x22ba83b3,

    create(args: {
        queryId: uint64
        result: boolean
    }): Router_RMNRemoteVerifyNotCursedResponse {
        return {
            $: 'Router_RMNRemoteVerifyNotCursedResponse',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RMNRemoteVerifyNotCursedResponse {
        loadAndCheckPrefix32(s, 0x22ba83b3, 'Router_RMNRemoteVerifyNotCursedResponse');
        return {
            $: 'Router_RMNRemoteVerifyNotCursedResponse',
            queryId: s.loadUintBig(64),
            result: s.loadBoolean(),
        }
    },
    store(self: Router_RMNRemoteVerifyNotCursedResponse, b: c.Builder): void {
        b.storeUint(0x22ba83b3, 32);
        b.storeUint(self.queryId, 64);
        b.storeBit(self.result);
    },
    toCell(self: Router_RMNRemoteVerifyNotCursedResponse): c.Cell {
        return makeCellFrom<Router_RMNRemoteVerifyNotCursedResponse>(self, Router_RMNRemoteVerifyNotCursedResponse.store);
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
 > struct (0xaf7a9ac6) Router_RMNOwnableMessage {
 >     content: RemainingBitsAndRefs
 > }
 */
export interface Router_RMNOwnableMessage {
    readonly $: 'Router_RMNOwnableMessage'
    content: RemainingBitsAndRefs
}

export const Router_RMNOwnableMessage = {
    PREFIX: 0xaf7a9ac6,

    create(args: {
        content: RemainingBitsAndRefs
    }): Router_RMNOwnableMessage {
        return {
            $: 'Router_RMNOwnableMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_RMNOwnableMessage {
        loadAndCheckPrefix32(s, 0xaf7a9ac6, 'Router_RMNOwnableMessage');
        return {
            $: 'Router_RMNOwnableMessage',
            content: loadTolkRemaining(s),
        }
    },
    store(self: Router_RMNOwnableMessage, b: c.Builder): void {
        b.storeUint(0xaf7a9ac6, 32);
        storeTolkRemaining(self.content, b);
    },
    toCell(self: Router_RMNOwnableMessage): c.Cell {
        return makeCellFrom<Router_RMNOwnableMessage>(self, Router_RMNOwnableMessage.store);
    }
}

/**
 > struct (0x78d0f21e) Router_CCIPSendACK {
 >     queryID: uint64
 >     messageId: uint256
 > }
 */
export interface Router_CCIPSendACK {
    readonly $: 'Router_CCIPSendACK'
    queryID: uint64
    messageId: uint256
}

export const Router_CCIPSendACK = {
    PREFIX: 0x78d0f21e,

    create(args: {
        queryID: uint64
        messageId: uint256
    }): Router_CCIPSendACK {
        return {
            $: 'Router_CCIPSendACK',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_CCIPSendACK {
        loadAndCheckPrefix32(s, 0x78d0f21e, 'Router_CCIPSendACK');
        return {
            $: 'Router_CCIPSendACK',
            queryID: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
        }
    },
    store(self: Router_CCIPSendACK, b: c.Builder): void {
        b.storeUint(0x78d0f21e, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.messageId, 256);
    },
    toCell(self: Router_CCIPSendACK): c.Cell {
        return makeCellFrom<Router_CCIPSendACK>(self, Router_CCIPSendACK.store);
    }
}

/**
 > struct (0x5a45d434) Router_CCIPSendNACK {
 >     queryID: uint64
 >     error: uint256
 > }
 */
export interface Router_CCIPSendNACK {
    readonly $: 'Router_CCIPSendNACK'
    queryID: uint64
    error: uint256
}

export const Router_CCIPSendNACK = {
    PREFIX: 0x5a45d434,

    create(args: {
        queryID: uint64
        error: uint256
    }): Router_CCIPSendNACK {
        return {
            $: 'Router_CCIPSendNACK',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_CCIPSendNACK {
        loadAndCheckPrefix32(s, 0x5a45d434, 'Router_CCIPSendNACK');
        return {
            $: 'Router_CCIPSendNACK',
            queryID: s.loadUintBig(64),
            error: s.loadUintBig(256),
        }
    },
    store(self: Router_CCIPSendNACK, b: c.Builder): void {
        b.storeUint(0x5a45d434, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.error, 256);
    },
    toCell(self: Router_CCIPSendNACK): c.Cell {
        return makeCellFrom<Router_CCIPSendNACK>(self, Router_CCIPSendNACK.store);
    }
}

/**
 > struct (0x4dd6aa82) Router_GetValidatedFee<T> {
 >     ccipSend: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface Router_GetValidatedFee<T> {
    readonly $: 'Router_GetValidatedFee'
    ccipSend: CellRef<Router_CCIPSend>
    context: T
}

export const Router_GetValidatedFee = {
    PREFIX: 0x4dd6aa82,

    create<T>(args: {
        ccipSend: CellRef<Router_CCIPSend>
        context: T
    }): Router_GetValidatedFee<T> {
        return {
            $: 'Router_GetValidatedFee',
            ...args
        }
    },
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
 > struct (0xfed7cfba) Router_TokenRegistrySetTokenInfo {
 >     tokenAddress: address
 >     tokenInfo: TokenRegistry_TokenInfo
 >     isNewEntry: bool
 > }
 */
export interface Router_TokenRegistrySetTokenInfo {
    readonly $: 'Router_TokenRegistrySetTokenInfo'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    isNewEntry: boolean
}

export const Router_TokenRegistrySetTokenInfo = {
    PREFIX: 0xfed7cfba,

    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }): Router_TokenRegistrySetTokenInfo {
        return {
            $: 'Router_TokenRegistrySetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_TokenRegistrySetTokenInfo {
        loadAndCheckPrefix32(s, 0xfed7cfba, 'Router_TokenRegistrySetTokenInfo');
        return {
            $: 'Router_TokenRegistrySetTokenInfo',
            tokenAddress: s.loadAddress(),
            tokenInfo: TokenRegistry_TokenInfo.fromSlice(s),
            isNewEntry: s.loadBoolean(),
        }
    },
    store(self: Router_TokenRegistrySetTokenInfo, b: c.Builder): void {
        b.storeUint(0xfed7cfba, 32);
        b.storeAddress(self.tokenAddress);
        TokenRegistry_TokenInfo.store(self.tokenInfo, b);
        b.storeBit(self.isNewEntry);
    },
    toCell(self: Router_TokenRegistrySetTokenInfo): c.Cell {
        return makeCellFrom<Router_TokenRegistrySetTokenInfo>(self, Router_TokenRegistrySetTokenInfo.store);
    }
}

/**
 > struct Router_GetValidatedFeeContext {
 >     routerContext: address
 >     userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
 > }
 */
export interface Router_GetValidatedFeeContext {
    readonly $: 'Router_GetValidatedFeeContext'
    routerContext: c.Address
    userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
}

export const Router_GetValidatedFeeContext = {
    create(args: {
        routerContext: c.Address
        userContext: RemainingBitsOrRef<RemainingBitsAndRefs>
    }): Router_GetValidatedFeeContext {
        return {
            $: 'Router_GetValidatedFeeContext',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_GetValidatedFeeContext {
        return {
            $: 'Router_GetValidatedFeeContext',
            routerContext: s.loadAddress(),
            userContext: loadTolkRemaining(s),
        }
    },
    store(self: Router_GetValidatedFeeContext, b: c.Builder): void {
        b.storeAddress(self.routerContext);
        storeTolkRemaining(self.userContext, b);
    },
    toCell(self: Router_GetValidatedFeeContext): c.Cell {
        return makeCellFrom<Router_GetValidatedFeeContext>(self, Router_GetValidatedFeeContext.store);
    }
}

/**
 > type Router_MessageValidated_RemainingBitsAndRefs = Router_MessageValidated<RemainingBitsAndRefs>
 */
export type Router_MessageValidated_RemainingBitsAndRefs = Router_MessageValidated<RemainingBitsAndRefs>

export const Router_MessageValidated_RemainingBitsAndRefs = {
    fromSlice(s: c.Slice): Router_MessageValidated_RemainingBitsAndRefs {
        return (() => {
            loadAndCheckPrefix32(s, 0x9e2155ec, 'Router_MessageValidated');
            return {
                $: 'Router_MessageValidated',
                fee: s.loadCoins(),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: loadTolkRemaining(s),
            }
        })();
    },
    store(self: Router_MessageValidated_RemainingBitsAndRefs, b: c.Builder): void {
        b.storeUint(0x9e2155ec, 32);
        b.storeCoins(self.fee);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        storeTolkRemaining(self.context, b);
    },
    toCell(self: Router_MessageValidated_RemainingBitsAndRefs): c.Cell {
        return makeCellFrom<Router_MessageValidated_RemainingBitsAndRefs>(self, Router_MessageValidated_RemainingBitsAndRefs.store);
    }
}

/**
 > struct (0x9e2155ec) Router_MessageValidated<T> {
 >     fee: coins
 >     msg: Cell<Router_CCIPSend>
 >     context: RemainingBitsOrRef<T>
 > }
 */
export interface Router_MessageValidated<T> {
    readonly $: 'Router_MessageValidated'
    fee: coins
    msg: CellRef<Router_CCIPSend>
    context: RemainingBitsOrRef<T>
}

export const Router_MessageValidated = {
    PREFIX: 0x9e2155ec,

    create<T>(args: {
        fee: coins
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsOrRef<T>
    }): Router_MessageValidated<T> {
        return {
            $: 'Router_MessageValidated',
            ...args
        }
    },
}

/**
 > type Router_MessageValidationFailed_RemainingBitsAndRefs = Router_MessageValidationFailed<RemainingBitsAndRefs>
 */
export type Router_MessageValidationFailed_RemainingBitsAndRefs = Router_MessageValidationFailed<RemainingBitsAndRefs>

export const Router_MessageValidationFailed_RemainingBitsAndRefs = {
    fromSlice(s: c.Slice): Router_MessageValidationFailed_RemainingBitsAndRefs {
        return (() => {
            loadAndCheckPrefix32(s, 0xec23c562, 'Router_MessageValidationFailed');
            return {
                $: 'Router_MessageValidationFailed',
                error: s.loadUintBig(256),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: loadTolkRemaining(s),
            }
        })();
    },
    store(self: Router_MessageValidationFailed_RemainingBitsAndRefs, b: c.Builder): void {
        b.storeUint(0xec23c562, 32);
        b.storeUint(self.error, 256);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        storeTolkRemaining(self.context, b);
    },
    toCell(self: Router_MessageValidationFailed_RemainingBitsAndRefs): c.Cell {
        return makeCellFrom<Router_MessageValidationFailed_RemainingBitsAndRefs>(self, Router_MessageValidationFailed_RemainingBitsAndRefs.store);
    }
}

/**
 > struct (0xec23c562) Router_MessageValidationFailed<T> {
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     context: RemainingBitsOrRef<T>
 > }
 */
export interface Router_MessageValidationFailed<T> {
    readonly $: 'Router_MessageValidationFailed'
    error: uint256
    msg: CellRef<Router_CCIPSend>
    context: RemainingBitsOrRef<T>
}

export const Router_MessageValidationFailed = {
    PREFIX: 0xec23c562,

    create<T>(args: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsOrRef<T>
    }): Router_MessageValidationFailed<T> {
        return {
            $: 'Router_MessageValidationFailed',
            ...args
        }
    },
}

/**
 > struct RMNRemote {
 >     admin: Ownable2Step
 >     cursedSubjects: CursedSubjects
 >     forwardUpdates: map<address, ()>
 > }
 */
export interface RMNRemote {
    readonly $: 'RMNRemote'
    admin: Ownable2Step
    cursedSubjects: CursedSubjects
    forwardUpdates: c.Dictionary<c.Address, []>
}

export const RMNRemote = {
    create(args: {
        admin: Ownable2Step
        cursedSubjects: CursedSubjects
        forwardUpdates: c.Dictionary<c.Address, []>
    }): RMNRemote {
        return {
            $: 'RMNRemote',
            ...args
        }
    },
    fromSlice(s: c.Slice): RMNRemote {
        return {
            $: 'RMNRemote',
            admin: Ownable2Step.fromSlice(s),
            cursedSubjects: CursedSubjects.fromSlice(s),
            forwardUpdates: c.Dictionary.load<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                (s) => [],
                (v,b) => { {} }
            ), s),
        }
    },
    store(self: RMNRemote, b: c.Builder): void {
        Ownable2Step.store(self.admin, b);
        CursedSubjects.store(self.cursedSubjects, b);
        b.storeDict<c.Address, []>(self.forwardUpdates, c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: RMNRemote): c.Cell {
        return makeCellFrom<RMNRemote>(self, RMNRemote.store);
    }
}

/**
 > struct Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     wrappedNative: address
 >     onRamps: map<uint64, address>
 >     offRamps: map<uint64, address>
 >     rmnRemote: Cell<RMNRemote>
 >     tokenRegistryDeployment: Cell<Router_TokenRegistryDeployment>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint32
    ownable: Ownable2Step
    wrappedNative: c.Address
    onRamps: c.Dictionary<uint64, c.Address>
    offRamps: c.Dictionary<uint64, c.Address>
    rmnRemote: CellRef<RMNRemote>
    tokenRegistryDeployment: CellRef<Router_TokenRegistryDeployment>
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        wrappedNative: c.Address
        onRamps: c.Dictionary<uint64, c.Address>
        offRamps: c.Dictionary<uint64, c.Address>
        rmnRemote: CellRef<RMNRemote>
        tokenRegistryDeployment: CellRef<Router_TokenRegistryDeployment>
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
            wrappedNative: s.loadAddress(),
            onRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            offRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            rmnRemote: loadCellRef<RMNRemote>(s, RMNRemote.fromSlice),
            tokenRegistryDeployment: loadCellRef<Router_TokenRegistryDeployment>(s, Router_TokenRegistryDeployment.fromSlice),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        b.storeAddress(self.wrappedNative);
        b.storeDict<uint64, c.Address>(self.onRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        b.storeDict<uint64, c.Address>(self.offRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        storeCellRef<RMNRemote>(self.rmnRemote, b, RMNRemote.store);
        storeCellRef<Router_TokenRegistryDeployment>(self.tokenRegistryDeployment, b, Router_TokenRegistryDeployment.store);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct OnRampSet {
 >     destChainSelectors: SnakedCell<uint64>
 >     onRamp: address?
 > }
 */
export interface OnRampSet {
    readonly $: 'OnRampSet'
    destChainSelectors: SnakedCell<uint64>
    onRamp: c.Address | null
}

export const OnRampSet = {
    create(args: {
        destChainSelectors: SnakedCell<uint64>
        onRamp: c.Address | null
    }): OnRampSet {
        return {
            $: 'OnRampSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRampSet {
        return {
            $: 'OnRampSet',
            destChainSelectors: s.loadRef(),
            onRamp: s.loadMaybeAddress(),
        }
    },
    store(self: OnRampSet, b: c.Builder): void {
        b.storeRef(self.destChainSelectors);
        b.storeAddress(self.onRamp);
    },
    toCell(self: OnRampSet): c.Cell {
        return makeCellFrom<OnRampSet>(self, OnRampSet.store);
    }
}

/**
 > struct OffRampAdded {
 >     sourceChainSelectors: SnakedCell<uint64>
 >     offRampAdded: address
 > }
 */
export interface OffRampAdded {
    readonly $: 'OffRampAdded'
    sourceChainSelectors: SnakedCell<uint64>
    offRampAdded: c.Address
}

export const OffRampAdded = {
    create(args: {
        sourceChainSelectors: SnakedCell<uint64>
        offRampAdded: c.Address
    }): OffRampAdded {
        return {
            $: 'OffRampAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRampAdded {
        return {
            $: 'OffRampAdded',
            sourceChainSelectors: s.loadRef(),
            offRampAdded: s.loadAddress(),
        }
    },
    store(self: OffRampAdded, b: c.Builder): void {
        b.storeRef(self.sourceChainSelectors);
        b.storeAddress(self.offRampAdded);
    },
    toCell(self: OffRampAdded): c.Cell {
        return makeCellFrom<OffRampAdded>(self, OffRampAdded.store);
    }
}

/**
 > struct OffRampRemoved {
 >     sourceChainSelectors: SnakedCell<uint64>
 >     offRampRemoved: address
 > }
 */
export interface OffRampRemoved {
    readonly $: 'OffRampRemoved'
    sourceChainSelectors: SnakedCell<uint64>
    offRampRemoved: c.Address
}

export const OffRampRemoved = {
    create(args: {
        sourceChainSelectors: SnakedCell<uint64>
        offRampRemoved: c.Address
    }): OffRampRemoved {
        return {
            $: 'OffRampRemoved',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRampRemoved {
        return {
            $: 'OffRampRemoved',
            sourceChainSelectors: s.loadRef(),
            offRampRemoved: s.loadAddress(),
        }
    },
    store(self: OffRampRemoved, b: c.Builder): void {
        b.storeRef(self.sourceChainSelectors);
        b.storeAddress(self.offRampRemoved);
    },
    toCell(self: OffRampRemoved): c.Cell {
        return makeCellFrom<OffRampRemoved>(self, OffRampRemoved.store);
    }
}

/**
 > struct Cursed {
 >     subject: uint128
 > }
 */
export interface Cursed {
    readonly $: 'Cursed'
    subject: uint128
}

export const Cursed = {
    create(args: {
        subject: uint128
    }): Cursed {
        return {
            $: 'Cursed',
            ...args
        }
    },
    fromSlice(s: c.Slice): Cursed {
        return {
            $: 'Cursed',
            subject: s.loadUintBig(128),
        }
    },
    store(self: Cursed, b: c.Builder): void {
        b.storeUint(self.subject, 128);
    },
    toCell(self: Cursed): c.Cell {
        return makeCellFrom<Cursed>(self, Cursed.store);
    }
}

/**
 > struct Uncursed {
 >     subject: uint128
 > }
 */
export interface Uncursed {
    readonly $: 'Uncursed'
    subject: uint128
}

export const Uncursed = {
    create(args: {
        subject: uint128
    }): Uncursed {
        return {
            $: 'Uncursed',
            ...args
        }
    },
    fromSlice(s: c.Slice): Uncursed {
        return {
            $: 'Uncursed',
            subject: s.loadUintBig(128),
        }
    },
    store(self: Uncursed, b: c.Builder): void {
        b.storeUint(self.subject, 128);
    },
    toCell(self: Uncursed): c.Cell {
        return makeCellFrom<Uncursed>(self, Uncursed.store);
    }
}

/**
 > struct MessageToOffRampBounced {
 >     offRamp: address
 >     execId: uint192
 > }
 */
export interface MessageToOffRampBounced {
    readonly $: 'MessageToOffRampBounced'
    offRamp: c.Address
    execId: uint192
}

export const MessageToOffRampBounced = {
    create(args: {
        offRamp: c.Address
        execId: uint192
    }): MessageToOffRampBounced {
        return {
            $: 'MessageToOffRampBounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): MessageToOffRampBounced {
        return {
            $: 'MessageToOffRampBounced',
            offRamp: s.loadAddress(),
            execId: s.loadUintBig(192),
        }
    },
    store(self: MessageToOffRampBounced, b: c.Builder): void {
        b.storeAddress(self.offRamp);
        b.storeUint(self.execId, 192);
    },
    toCell(self: MessageToOffRampBounced): c.Cell {
        return makeCellFrom<MessageToOffRampBounced>(self, MessageToOffRampBounced.store);
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
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address
 >     minterAddress: address
 >     enabled: bool
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address
    minterAddress: c.Address
    enabled: boolean
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address
        minterAddress: c.Address
        enabled: boolean
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadAddress(),
            minterAddress: s.loadAddress(),
            enabled: s.loadBoolean(),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeBit(self.enabled);
    },
    toCell(self: TokenRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_TokenInfo>(self, TokenRegistry_TokenInfo.store);
    }
}

// ————————————————————————————————————————————
//    class Router
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

export class Router implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'Upgradeable_Error.VersionMismatch': 19900,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'Withdrawable_Error.InsufficientBalance': 57100,
        'Router_Error.DestChainNotEnabled': 57100,
        'Router_Error.SourceChainNotEnabled': 57101,
        'Withdrawable_Error.HitReserve': 57101,
        'Router_Error.SenderIsNotOffRamp': 57102,
        'Withdrawable_Error.InvalidRequest': 57102,
        'Router_Error.OffRampNotSetForSelector': 57103,
        'Router_Error.OffRampAddressMismatch': 57104,
        'Router_Error.SubjectCursed': 57105,
        'Router_Error.NotOnRamp': 57106,
        'Router_Error.MissingTokenAmounts': 57107,
        'Router_Error.NoMultiTokenTransfers': 57108,
        'Router_Error.InsufficientFee': 57109,
        'Router_Error.TokenTransferNotThroughNotification': 57110,
        'Router_Error.TokenAmountMismatch': 57112,
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
            throw new Error(`Custom pack/unpack for 'Router.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new Router(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        wrappedNative: c.Address
        onRamps: c.Dictionary<uint64, c.Address>
        offRamps: c.Dictionary<uint64, c.Address>
        rmnRemote: CellRef<RMNRemote>
        tokenRegistryDeployment: CellRef<Router_TokenRegistryDeployment>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? Router.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new Router(address, initialState);
    }

    static createCellOfRouterCCIPSend(body: {
        queryID: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
    }) {
        return Router_CCIPSend.toCell(Router_CCIPSend.create(body));
    }

    static createCellOfRouterApplyRampUpdates(body: {
        queryId: uint64
        onRampUpdates: OnRamps | null
        offRampAdds: OffRamps | null
        offRampRemoves: OffRamps | null
    }) {
        return Router_ApplyRampUpdates.toCell(Router_ApplyRampUpdates.create(body));
    }

    static createCellOfRouterGetValidatedFeeRemainingBitsAndRefs(body: Router_GetValidatedFee_RemainingBitsAndRefs) {
        return Router_GetValidatedFee_RemainingBitsAndRefs.toCell(body);
    }

    static createCellOfOnRampMessageValidatedGetValidatedFeeContext(body: OnRamp_MessageValidated_GetValidatedFeeContext) {
        return OnRamp_MessageValidated_GetValidatedFeeContext.toCell(body);
    }

    static createCellOfOnRampMessageValidationFailedGetValidatedFeeContext(body: OnRamp_MessageValidationFailed_GetValidatedFeeContext) {
        return OnRamp_MessageValidationFailed_GetValidatedFeeContext.toCell(body);
    }

    static createCellOfRouterRouteMessage(body: {
        message: CellRef<Any2TVMMessage>
        execId: ReceiveExecutorId
        receiver: c.Address
        gasLimit: coins
    }) {
        return Router_RouteMessage.toCell(Router_RouteMessage.create(body));
    }

    static createCellOfRouterCCIPReceiveConfirm(body: {
        execId: ReceiveExecutorId
    }) {
        return Router_CCIPReceiveConfirm.toCell(Router_CCIPReceiveConfirm.create(body));
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

    static createCellOfRouterRMNRemoteCurse(body: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }) {
        return Router_RMNRemoteCurse.toCell(Router_RMNRemoteCurse.create(body));
    }

    static createCellOfRouterRMNRemoteUncurse(body: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }) {
        return Router_RMNRemoteUncurse.toCell(Router_RMNRemoteUncurse.create(body));
    }

    static createCellOfRouterRMNRemoteVerifyNotCursed(body: {
        queryId: uint64
        subject: uint128
    }) {
        return Router_RMNRemoteVerifyNotCursed.toCell(Router_RMNRemoteVerifyNotCursed.create(body));
    }

    static createCellOfRouterMessageSent(body: {
        queryID: uint64
        messageId: uint256
        destChainSelector: uint64
        sender: c.Address
    }) {
        return Router_MessageSent.toCell(Router_MessageSent.create(body));
    }

    static createCellOfRouterMessageRejected(body: {
        queryID: uint64
        destChainSelector: uint64
        sender: c.Address
        error: uint256
    }) {
        return Router_MessageRejected.toCell(Router_MessageRejected.create(body));
    }

    static createCellOfRouterLockOrBurn(body: {
        tokenPool: c.Address
        tokenAmount: TokenAmount
        destChainSelector: uint64
        executorAddress: c.Address
    }) {
        return Router_LockOrBurn.toCell(Router_LockOrBurn.create(body));
    }

    static createCellOfRouterRMNOwnableMessage(body: {
        content: RemainingBitsAndRefs
    }) {
        return Router_RMNOwnableMessage.toCell(Router_RMNOwnableMessage.create(body));
    }

    static createCellOfRouterTokenRegistrySetTokenInfo(body: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }) {
        return Router_TokenRegistrySetTokenInfo.toCell(Router_TokenRegistrySetTokenInfo.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendRouterCCIPSend(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_CCIPSend.toCell(Router_CCIPSend.create(body)),
            ...extraOptions
        });
    }

    async sendRouterApplyRampUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        onRampUpdates: OnRamps | null
        offRampAdds: OffRamps | null
        offRampRemoves: OffRamps | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_ApplyRampUpdates.toCell(Router_ApplyRampUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendRouterGetValidatedFeeRemainingBitsAndRefs(provider: ContractProvider, via: Sender, msgValue: coins, body: Router_GetValidatedFee_RemainingBitsAndRefs, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_GetValidatedFee_RemainingBitsAndRefs.toCell(body),
            ...extraOptions
        });
    }

    async sendOnRampMessageValidatedGetValidatedFeeContext(provider: ContractProvider, via: Sender, msgValue: coins, body: OnRamp_MessageValidated_GetValidatedFeeContext, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_MessageValidated_GetValidatedFeeContext.toCell(body),
            ...extraOptions
        });
    }

    async sendOnRampMessageValidationFailedGetValidatedFeeContext(provider: ContractProvider, via: Sender, msgValue: coins, body: OnRamp_MessageValidationFailed_GetValidatedFeeContext, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRamp_MessageValidationFailed_GetValidatedFeeContext.toCell(body),
            ...extraOptions
        });
    }

    async sendRouterRouteMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: CellRef<Any2TVMMessage>
        execId: ReceiveExecutorId
        receiver: c.Address
        gasLimit: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_RouteMessage.toCell(Router_RouteMessage.create(body)),
            ...extraOptions
        });
    }

    async sendRouterCCIPReceiveConfirm(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        execId: ReceiveExecutorId
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_CCIPReceiveConfirm.toCell(Router_CCIPReceiveConfirm.create(body)),
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

    async sendRouterRMNRemoteCurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_RMNRemoteCurse.toCell(Router_RMNRemoteCurse.create(body)),
            ...extraOptions
        });
    }

    async sendRouterRMNRemoteUncurse(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        subjects: SnakedCell<uint128>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_RMNRemoteUncurse.toCell(Router_RMNRemoteUncurse.create(body)),
            ...extraOptions
        });
    }

    async sendRouterRMNRemoteVerifyNotCursed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        subject: uint128
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_RMNRemoteVerifyNotCursed.toCell(Router_RMNRemoteVerifyNotCursed.create(body)),
            ...extraOptions
        });
    }

    async sendRouterMessageSent(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID: uint64
        messageId: uint256
        destChainSelector: uint64
        sender: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_MessageSent.toCell(Router_MessageSent.create(body)),
            ...extraOptions
        });
    }

    async sendRouterMessageRejected(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryID: uint64
        destChainSelector: uint64
        sender: c.Address
        error: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_MessageRejected.toCell(Router_MessageRejected.create(body)),
            ...extraOptions
        });
    }

    async sendRouterLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenPool: c.Address
        tokenAmount: TokenAmount
        destChainSelector: uint64
        executorAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_LockOrBurn.toCell(Router_LockOrBurn.create(body)),
            ...extraOptions
        });
    }

    async sendRouterRMNOwnableMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        content: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_RMNOwnableMessage.toCell(Router_RMNOwnableMessage.create(body)),
            ...extraOptions
        });
    }

    async sendRouterTokenRegistrySetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Router_TokenRegistrySetTokenInfo.toCell(Router_TokenRegistrySetTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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

    async getOnRamp(provider: ContractProvider, destChainSelector: uint64): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('onRamp', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readSlice().loadAddress();
    }

    async getOffRamp(provider: ContractProvider, sourceChainSelector: uint64): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('offRamp', [
            { type: 'int', value: sourceChainSelector },
        ]));
        return r.readSlice().loadAddress();
    }

    async getOnRamps(provider: ContractProvider): Promise<lisp_list<CellRef<Ramp>>> {
        const r = StackReader.fromGetMethod(1, await provider.get('onRamps', []));
        return r.readLispListOf<CellRef<Ramp>>(
            (r) => r.readCellRef<Ramp>(Ramp.fromSlice)
        );
    }

    async getOffRamps(provider: ContractProvider): Promise<lisp_list<CellRef<Ramp>>> {
        const r = StackReader.fromGetMethod(1, await provider.get('offRamps', []));
        return r.readLispListOf<CellRef<Ramp>>(
            (r) => r.readCellRef<Ramp>(Ramp.fromSlice)
        );
    }

    async getDestChainSelectors(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('destChainSelectors', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
    }

    async getReserve(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('reserve', []));
        return r.readBigInt();
    }
}
