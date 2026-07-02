// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a LockReleaseLockboxTokenPool contract in Tolk.
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

type uint8 = bigint
type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint128 = bigint
type uint256 = bigint

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
        queryId: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args
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
        queryId: uint64
    }): ReturnExcessesBack {
        return {
            $: 'ReturnExcessesBack',
            ...args
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
 > struct TokenPool_AdminConfig {
 >     ownable: Cell<Ownable2Step>
 >     rmnProxy: address
 >     dynamicConfig: Cell<TokenPool_DynamicConfig>
 >     jettonClient: JettonClient
 >     allowedFinalityConfig: uint32
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: CellRef<Ownable2Step>
    rmnProxy: c.Address
    dynamicConfig: CellRef<TokenPool_DynamicConfig>
    jettonClient: JettonClient
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
    advancedPoolHooks: c.Address | null
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: CellRef<Ownable2Step>
        rmnProxy: c.Address
        dynamicConfig: CellRef<TokenPool_DynamicConfig>
        jettonClient: JettonClient
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
        advancedPoolHooks: c.Address | null
    }): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            allowedFinalityConfig: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            ownable: loadCellRef<Ownable2Step>(s, Ownable2Step.fromSlice),
            rmnProxy: s.loadAddress(),
            dynamicConfig: loadCellRef<TokenPool_DynamicConfig>(s, TokenPool_DynamicConfig.fromSlice),
            jettonClient: JettonClient.fromSlice(s),
            allowedFinalityConfig: s.loadUintBig(32),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        b.storeAddress(self.rmnProxy);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
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
 >     mirroredPolicy: Cell<TokenPool_MirroredPolicy>
 >     tokenDecimals: uint8
 >     remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>
 >     tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: CellRef<TokenPool_AdminConfig>
    mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
    tokenDecimals: uint8
    remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
    tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: CellRef<TokenPool_AdminConfig>
        mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
        tokenDecimals: uint8
        remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
        tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
    }): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            adminConfig: loadCellRef<TokenPool_AdminConfig>(s, TokenPool_AdminConfig.fromSlice),
            mirroredPolicy: loadCellRef<TokenPool_MirroredPolicy>(s, TokenPool_MirroredPolicy.fromSlice),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s),
            tokenTransferFeeConfigs: c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_MirroredPolicy>(self.mirroredPolicy, b, TokenPool_MirroredPolicy.store);
        b.storeUint(self.tokenDecimals, 8);
        b.storeDict<uint64, TokenPool_RemoteChainConfig>(self.remoteChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store));
        b.storeDict<uint64, TokenPool_TokenTransferFeeConfig>(self.tokenTransferFeeConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store));
    },
    toCell(self: TokenPool_Data): c.Cell {
        return makeCellFrom<TokenPool_Data>(self, TokenPool_Data.store);
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
    rateLimitAdmin: c.Address | null
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfig = {
    create(args: {
        router: c.Address
        rateLimitAdmin: c.Address | null
        feeAdmin: c.Address | null
    }): TokenPool_DynamicConfig {
        return {
            $: 'TokenPool_DynamicConfig',
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
 > struct TokenPool_MirroredPolicy {
 >     onRamps: map<uint64, address>
 >     offRamps: map<uint64, address>
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_MirroredPolicy {
    readonly $: 'TokenPool_MirroredPolicy'
    onRamps: c.Dictionary<uint64, c.Address>
    offRamps: c.Dictionary<uint64, c.Address>
    cursedSubjects: CursedSubjects
}

export const TokenPool_MirroredPolicy = {
    create(args: {
        onRamps: c.Dictionary<uint64, c.Address>
        offRamps: c.Dictionary<uint64, c.Address>
        cursedSubjects: CursedSubjects
    }): TokenPool_MirroredPolicy {
        return {
            $: 'TokenPool_MirroredPolicy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_MirroredPolicy {
        return {
            $: 'TokenPool_MirroredPolicy',
            onRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            offRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_MirroredPolicy, b: c.Builder): void {
        b.storeDict<uint64, c.Address>(self.onRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        b.storeDict<uint64, c.Address>(self.offRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_MirroredPolicy): c.Cell {
        return makeCellFrom<TokenPool_MirroredPolicy>(self, TokenPool_MirroredPolicy.store);
    }
}

/**
 > struct TokenPool_RampUpdate {
 >     remoteChainSelector: uint64
 >     onRamp: address?
 >     offRamp: address?
 > }
 */
export interface TokenPool_RampUpdate {
    readonly $: 'TokenPool_RampUpdate'
    remoteChainSelector: uint64
    onRamp: c.Address | null /* = null */
    offRamp: c.Address | null /* = null */
}

export const TokenPool_RampUpdate = {
    create(args: {
        remoteChainSelector: uint64
        onRamp?: c.Address | null /* = null */
        offRamp?: c.Address | null /* = null */
    }): TokenPool_RampUpdate {
        return {
            $: 'TokenPool_RampUpdate',
            onRamp: null,
            offRamp: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampUpdate {
        return {
            $: 'TokenPool_RampUpdate',
            remoteChainSelector: s.loadUintBig(64),
            onRamp: s.loadMaybeAddress(),
            offRamp: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_RampUpdate, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.onRamp);
        b.storeAddress(self.offRamp);
    },
    toCell(self: TokenPool_RampUpdate): c.Cell {
        return makeCellFrom<TokenPool_RampUpdate>(self, TokenPool_RampUpdate.store);
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
    outbound: CellRef<RateLimiter_TokenBucket>
    inbound: CellRef<RateLimiter_TokenBucket>
}

export const TokenPool_RateLimiterPair = {
    create(args: {
        outbound: CellRef<RateLimiter_TokenBucket>
        inbound: CellRef<RateLimiter_TokenBucket>
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
    outbound: CellRef<RateLimiter_Config>
    inbound: CellRef<RateLimiter_Config>
}

export const TokenPool_RateLimitConfigPair = {
    create(args: {
        outbound: CellRef<RateLimiter_Config>
        inbound: CellRef<RateLimiter_Config>
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
    remoteTokenAddress: CellRef<CrossChainAddress>
    rateLimitConfigs: CellRef<TokenPool_RateLimitConfigPair>
}

export const TokenPool_ChainUpdate = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddresses: SnakedCell<CrossChainAddress>
        remoteTokenAddress: CellRef<CrossChainAddress>
        rateLimitConfigs: CellRef<TokenPool_RateLimitConfigPair>
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
            remotePoolAddresses: s.loadRef(),
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            rateLimitConfigs: loadCellRef<TokenPool_RateLimitConfigPair>(s, TokenPool_RateLimitConfigPair.fromSlice),
        }
    },
    store(self: TokenPool_ChainUpdate, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeRef(self.remotePoolAddresses);
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
    remoteTokenAddress: CellRef<CrossChainAddress>
    remotePools: c.Dictionary<uint256, CellRef<CrossChainAddress>>
    rateLimiters: CellRef<TokenPool_RateLimiterPair>
    fastFinalityRateLimiters: CellRef<TokenPool_RateLimiterPair>
}

export const TokenPool_RemoteChainConfig = {
    create(args: {
        remoteTokenAddress: CellRef<CrossChainAddress>
        remotePools: c.Dictionary<uint256, CellRef<CrossChainAddress>>
        rateLimiters: CellRef<TokenPool_RateLimiterPair>
        fastFinalityRateLimiters: CellRef<TokenPool_RateLimiterPair>
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
            remotePools: c.Dictionary.load<uint256, CellRef<CrossChainAddress>>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<CrossChainAddress>>(
                (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
            ), s),
            rateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
            fastFinalityRateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
        }
    },
    store(self: TokenPool_RemoteChainConfig, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        b.storeDict<uint256, CellRef<CrossChainAddress>>(self.remotePools, c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<CrossChainAddress>>(
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
    outboundRateLimiterConfig: CellRef<RateLimiter_Config>
    inboundRateLimiterConfig: CellRef<RateLimiter_Config>
}

export const TokenPool_RateLimitConfigArgs = {
    create(args: {
        remoteChainSelector: uint64
        fastFinality: boolean
        outboundRateLimiterConfig: CellRef<RateLimiter_Config>
        inboundRateLimiterConfig: CellRef<RateLimiter_Config>
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
 >     feeAmount: uint256
 >     destTokenAmount: uint256
 >     out: TokenPool_LockOrBurnOutV1
 > }
 */
export interface TokenPool_LockOrBurnPrepared {
    readonly $: 'TokenPool_LockOrBurnPrepared'
    feeAmount: uint256
    destTokenAmount: uint256
    out: TokenPool_LockOrBurnOutV1
}

export const TokenPool_LockOrBurnPrepared = {
    create(args: {
        feeAmount: uint256
        destTokenAmount: uint256
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
            feeAmount: s.loadUintBig(256),
            destTokenAmount: s.loadUintBig(256),
            out: TokenPool_LockOrBurnOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnPrepared, b: c.Builder): void {
        b.storeUint(self.feeAmount, 256);
        b.storeUint(self.destTokenAmount, 256);
        TokenPool_LockOrBurnOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_LockOrBurnPrepared): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnPrepared>(self, TokenPool_LockOrBurnPrepared.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintPrepared {
 >     requestedFinalityConfig: uint32
 >     localAmount: uint256
 >     out: TokenPool_ReleaseOrMintOutV1
 > }
 */
export interface TokenPool_ReleaseOrMintPrepared {
    readonly $: 'TokenPool_ReleaseOrMintPrepared'
    requestedFinalityConfig: uint32
    localAmount: uint256
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintPrepared = {
    create(args: {
        requestedFinalityConfig: uint32
        localAmount: uint256
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
            localAmount: s.loadUintBig(256),
            out: TokenPool_ReleaseOrMintOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_ReleaseOrMintPrepared, b: c.Builder): void {
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeUint(self.localAmount, 256);
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
 >     finalityFeeUSDCents: uint256
 >     fastFinalityFeeUSDCents: uint256
 >     finalityTransferFeeBps: uint16
 >     fastFinalityTransferFeeBps: uint16
 >     isEnabled: bool
 > }
 */
export interface TokenPool_TokenTransferFeeConfig {
    readonly $: 'TokenPool_TokenTransferFeeConfig'
    destGasOverhead: uint32
    destBytesOverhead: uint32
    finalityFeeUSDCents: uint256
    fastFinalityFeeUSDCents: uint256
    finalityTransferFeeBps: uint16
    fastFinalityTransferFeeBps: uint16
    isEnabled: boolean
}

export const TokenPool_TokenTransferFeeConfig = {
    create(args: {
        destGasOverhead: uint32
        destBytesOverhead: uint32
        finalityFeeUSDCents: uint256
        fastFinalityFeeUSDCents: uint256
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
            finalityFeeUSDCents: s.loadUintBig(256),
            fastFinalityFeeUSDCents: s.loadUintBig(256),
            finalityTransferFeeBps: s.loadUintBig(16),
            fastFinalityTransferFeeBps: s.loadUintBig(16),
            isEnabled: s.loadBoolean(),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfig, b: c.Builder): void {
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
        b.storeUint(self.finalityFeeUSDCents, 256);
        b.storeUint(self.fastFinalityFeeUSDCents, 256);
        b.storeUint(self.finalityTransferFeeBps, 16);
        b.storeUint(self.fastFinalityTransferFeeBps, 16);
        b.storeBit(self.isEnabled);
    },
    toCell(self: TokenPool_TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfig>(self, TokenPool_TokenTransferFeeConfig.store);
    }
}

/**
 > struct TokenPool_Transfer<S, R> {
 >     id: uint256
 >     details: Cell<TokenPool_TransferDetails<S, R>>
 > }
 */
export interface TokenPool_Transfer<S, R> {
    readonly $: 'TokenPool_Transfer'
    id: uint256
    details: CellRef<TokenPool_TransferDetails<S, R>>
}

export const TokenPool_Transfer = {
    create<S, R>(args: {
        id: uint256
        details: CellRef<TokenPool_TransferDetails<S, R>>
    }): TokenPool_Transfer<S, R> {
        return {
            $: 'TokenPool_Transfer',
            ...args
        }
    },
}

/**
 > struct TokenPool_TransferDetails<S, R> {
 >     receiver: R
 >     remoteChainSelector: uint64
 >     originalSender: S
 >     amount: uint256
 >     localToken: address
 > }
 */
export interface TokenPool_TransferDetails<S, R> {
    readonly $: 'TokenPool_TransferDetails'
    receiver: R
    remoteChainSelector: uint64
    originalSender: S
    amount: uint256
    localToken: c.Address
}

export const TokenPool_TransferDetails = {
    create<S, R>(args: {
        receiver: R
        remoteChainSelector: uint64
        originalSender: S
        amount: uint256
        localToken: c.Address
    }): TokenPool_TransferDetails<S, R> {
        return {
            $: 'TokenPool_TransferDetails',
            ...args
        }
    },
}

/**
 > type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<address, Cell<CrossChainAddress>>
 */
export type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<c.Address, CellRef<CrossChainAddress>>

export const TokenPool_LockOrBurnTransfer = {
    fromSlice(s: c.Slice): TokenPool_LockOrBurnTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: s.loadAddress(),
                            amount: s.loadUintBig(256),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_LockOrBurnTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(self.details, b,
            (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
            b.storeUint(v.remoteChainSelector, 64);
            b.storeAddress(v.originalSender);
            b.storeUint(v.amount, 256);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_LockOrBurnTransfer): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnTransfer>(self, TokenPool_LockOrBurnTransfer.store);
    }
}

/**
 > type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<Cell<CrossChainAddress>, address>
 */
export type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<CellRef<CrossChainAddress>, c.Address>

export const TokenPool_ReleaseOrMintTransfer = {
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<CellRef<CrossChainAddress>, c.Address>>(s,
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
        storeCellRef<TokenPool_TransferDetails<CellRef<CrossChainAddress>, c.Address>>(self.details, b,
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
    destTokenAddress: CellRef<CrossChainAddress>
    destPoolData: c.Cell
}

export const TokenPool_LockOrBurnOutV1 = {
    create(args: {
        destTokenAddress: CellRef<CrossChainAddress>
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
    sourcePoolAddress: CellRef<CrossChainAddress>
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        transfer: TokenPool_ReleaseOrMintTransfer
        sourcePoolAddress: CellRef<CrossChainAddress>
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
 >     destinationAmount: uint256
 > }
 */
export interface TokenPool_ReleaseOrMintOutV1 {
    readonly $: 'TokenPool_ReleaseOrMintOutV1'
    destinationAmount: uint256
}

export const TokenPool_ReleaseOrMintOutV1 = {
    create(args: {
        destinationAmount: uint256
    }): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            destinationAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_ReleaseOrMintOutV1, b: c.Builder): void {
        b.storeUint(self.destinationAmount, 256);
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
        queryId: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }): TokenPool_ApplyChainUpdates {
        return {
            $: 'TokenPool_ApplyChainUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyChainUpdates {
        loadAndCheckPrefix32(s, 0x56f73d37, 'TokenPool_ApplyChainUpdates');
        return {
            $: 'TokenPool_ApplyChainUpdates',
            queryId: s.loadUintBig(64),
            remoteChainSelectorsToRemove: s.loadRef(),
            chainsToAdd: s.loadRef(),
        }
    },
    store(self: TokenPool_ApplyChainUpdates, b: c.Builder): void {
        b.storeUint(0x56f73d37, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.remoteChainSelectorsToRemove);
        b.storeRef(self.chainsToAdd);
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
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_AddRemotePool = {
    PREFIX: 0x17c242dc,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_AddRemotePool {
        return {
            $: 'TokenPool_AddRemotePool',
            ...args
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
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemoveRemotePool = {
    PREFIX: 0x426b8cc4,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemoveRemotePool {
        return {
            $: 'TokenPool_RemoveRemotePool',
            ...args
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
        queryId: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }): TokenPool_SetDynamicConfig {
        return {
            $: 'TokenPool_SetDynamicConfig',
            rateLimitAdmin: null,
            feeAdmin: null,
            ...args
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
        queryId: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_SetAllowedFinalityConfig {
        return {
            $: 'TokenPool_SetAllowedFinalityConfig',
            ...args
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
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_SetAdvancedPoolHooks {
        return {
            $: 'TokenPool_SetAdvancedPoolHooks',
            ...args
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
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }): TokenPool_SetRateLimitConfig {
        return {
            $: 'TokenPool_SetRateLimitConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRateLimitConfig {
        loadAndCheckPrefix32(s, 0x4fe2d26c, 'TokenPool_SetRateLimitConfig');
        return {
            $: 'TokenPool_SetRateLimitConfig',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
        }
    },
    store(self: TokenPool_SetRateLimitConfig, b: c.Builder): void {
        b.storeUint(0x4fe2d26c, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
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
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        loadAndCheckPrefix32(s, 0x30a1d1f7, 'TokenPool_ApplyTokenTransferFeeConfigUpdates');
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
            disableChainSelectors: s.loadRef(),
        }
    },
    store(self: TokenPool_ApplyTokenTransferFeeConfigUpdates, b: c.Builder): void {
        b.storeUint(0x30a1d1f7, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
        b.storeRef(self.disableChainSelectors);
    },
    toCell(self: TokenPool_ApplyTokenTransferFeeConfigUpdates): c.Cell {
        return makeCellFrom<TokenPool_ApplyTokenTransferFeeConfigUpdates>(self, TokenPool_ApplyTokenTransferFeeConfigUpdates.store);
    }
}

/**
 > struct (0xe30764be) TokenPool_UpdateRampAccess {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_RampUpdate>
 > }
 */
export interface TokenPool_UpdateRampAccess {
    readonly $: 'TokenPool_UpdateRampAccess'
    queryId: uint64
    updates: SnakedCell<TokenPool_RampUpdate>
}

export const TokenPool_UpdateRampAccess = {
    PREFIX: 0xe30764be,

    create(args: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }): TokenPool_UpdateRampAccess {
        return {
            $: 'TokenPool_UpdateRampAccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_UpdateRampAccess {
        loadAndCheckPrefix32(s, 0xe30764be, 'TokenPool_UpdateRampAccess');
        return {
            $: 'TokenPool_UpdateRampAccess',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
        }
    },
    store(self: TokenPool_UpdateRampAccess, b: c.Builder): void {
        b.storeUint(0xe30764be, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
    },
    toCell(self: TokenPool_UpdateRampAccess): c.Cell {
        return makeCellFrom<TokenPool_UpdateRampAccess>(self, TokenPool_UpdateRampAccess.store);
    }
}

/**
 > struct (0x9929b642) TokenPool_SetRMNProxy {
 >     queryId: uint64
 >     rmnProxy: address
 > }
 */
export interface TokenPool_SetRMNProxy {
    readonly $: 'TokenPool_SetRMNProxy'
    queryId: uint64
    rmnProxy: c.Address
}

export const TokenPool_SetRMNProxy = {
    PREFIX: 0x9929b642,

    create(args: {
        queryId: uint64
        rmnProxy: c.Address
    }): TokenPool_SetRMNProxy {
        return {
            $: 'TokenPool_SetRMNProxy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRMNProxy {
        loadAndCheckPrefix32(s, 0x9929b642, 'TokenPool_SetRMNProxy');
        return {
            $: 'TokenPool_SetRMNProxy',
            queryId: s.loadUintBig(64),
            rmnProxy: s.loadAddress(),
        }
    },
    store(self: TokenPool_SetRMNProxy, b: c.Builder): void {
        b.storeUint(0x9929b642, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.rmnProxy);
    },
    toCell(self: TokenPool_SetRMNProxy): c.Cell {
        return makeCellFrom<TokenPool_SetRMNProxy>(self, TokenPool_SetRMNProxy.store);
    }
}

/**
 > struct (0x9da4da09) TokenPool_SetCursedSubjects {
 >     queryId: uint64
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_SetCursedSubjects {
    readonly $: 'TokenPool_SetCursedSubjects'
    queryId: uint64
    cursedSubjects: CursedSubjects
}

export const TokenPool_SetCursedSubjects = {
    PREFIX: 0x9da4da09,

    create(args: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_SetCursedSubjects {
        return {
            $: 'TokenPool_SetCursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetCursedSubjects {
        loadAndCheckPrefix32(s, 0x9da4da09, 'TokenPool_SetCursedSubjects');
        return {
            $: 'TokenPool_SetCursedSubjects',
            queryId: s.loadUintBig(64),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_SetCursedSubjects, b: c.Builder): void {
        b.storeUint(0x9da4da09, 32);
        b.storeUint(self.queryId, 64);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_SetCursedSubjects): c.Cell {
        return makeCellFrom<TokenPool_SetCursedSubjects>(self, TokenPool_SetCursedSubjects.store);
    }
}

/**
 > struct (0xfa7da444) TokenPool_LockOrBurn {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     replyTo: address?
 > }
 */
export interface TokenPool_LockOrBurn {
    readonly $: 'TokenPool_LockOrBurn'
    queryId: uint64
    request: CellRef<TokenPool_LockOrBurnInV1>
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address | null
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }): TokenPool_LockOrBurn {
        return {
            $: 'TokenPool_LockOrBurn',
            ...args
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
            replyTo: s.loadMaybeAddress(),
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
    requestMsg: CellRef<TokenPool_LockOrBurn>
    prepared: CellRef<TokenPool_LockOrBurnPrepared>
}

export const TokenPool_LockOrBurnForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: CellRef<TokenPool_LockOrBurn>
        prepared: CellRef<TokenPool_LockOrBurnPrepared>
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
 >     replyTo: address?
 > }
 */
export interface TokenPool_ReleaseOrMint {
    readonly $: 'TokenPool_ReleaseOrMint'
    queryId: uint64
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    requestedFinalityConfig: uint32
    replyTo: c.Address | null /* = null */
}

export const TokenPool_ReleaseOrMint = {
    PREFIX: 0x351f77e3,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }): TokenPool_ReleaseOrMint {
        return {
            $: 'TokenPool_ReleaseOrMint',
            replyTo: null,
            ...args
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
 > struct (0x08f2ffb7) TokenPool_PreflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface TokenPool_PreflightCheckFinished {
    readonly $: 'TokenPool_PreflightCheckFinished'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
}

export const TokenPool_PreflightCheckFinished = {
    PREFIX: 0x08f2ffb7,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }): TokenPool_PreflightCheckFinished {
        return {
            $: 'TokenPool_PreflightCheckFinished',
            ...args
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
    forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
}

export const TokenPool_PreflightCheckFailed = {
    PREFIX: 0xa6dfa623,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }): TokenPool_PreflightCheckFailed {
        return {
            $: 'TokenPool_PreflightCheckFailed',
            ...args
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
    requestMsg: CellRef<TokenPool_ReleaseOrMint>
    prepared: CellRef<TokenPool_ReleaseOrMintPrepared>
}

export const TokenPool_ReleaseOrMintForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: CellRef<TokenPool_ReleaseOrMint>
        prepared: CellRef<TokenPool_ReleaseOrMintPrepared>
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
    forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
}

export const TokenPool_PostflightCheckFinished = {
    PREFIX: 0x9e2a6b66,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }): TokenPool_PostflightCheckFinished {
        return {
            $: 'TokenPool_PostflightCheckFinished',
            ...args
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
    forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
}

export const TokenPool_PostflightCheckFailed = {
    PREFIX: 0x21e71d87,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }): TokenPool_PostflightCheckFailed {
        return {
            $: 'TokenPool_PostflightCheckFailed',
            ...args
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
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_LockOrBurnWithdraw {
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            ...args
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
 > struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: uint256
 > }
 */
export interface TokenPool_LockOrBurnFinished {
    readonly $: 'TokenPool_LockOrBurnFinished'
    queryId: uint64
    out: CellRef<TokenPool_LockOrBurnOutV1>
    destTokenAmount: uint256
}

export const TokenPool_LockOrBurnFinished = {
    PREFIX: 0xf432a4e3,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
        destTokenAmount: uint256
    }): TokenPool_LockOrBurnFinished {
        return {
            $: 'TokenPool_LockOrBurnFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFinished {
        loadAndCheckPrefix32(s, 0xf432a4e3, 'TokenPool_LockOrBurnFinished');
        return {
            $: 'TokenPool_LockOrBurnFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockOrBurnFinished, b: c.Builder): void {
        b.storeUint(0xf432a4e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeUint(self.destTokenAmount, 256);
    },
    toCell(self: TokenPool_LockOrBurnFinished): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFinished>(self, TokenPool_LockOrBurnFinished.store);
    }
}

/**
 > struct (0x3476ea72) TokenPool_LockOrBurnFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_LockOrBurnFailure {
    readonly $: 'TokenPool_LockOrBurnFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_LockOrBurnFailure = {
    PREFIX: 0x3476ea72,

    create(args: {
        queryId: uint64
        errorCode: uint16
    }): TokenPool_LockOrBurnFailure {
        return {
            $: 'TokenPool_LockOrBurnFailure',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFailure {
        loadAndCheckPrefix32(s, 0x3476ea72, 'TokenPool_LockOrBurnFailure');
        return {
            $: 'TokenPool_LockOrBurnFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_LockOrBurnFailure, b: c.Builder): void {
        b.storeUint(0x3476ea72, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_LockOrBurnFailure): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFailure>(self, TokenPool_LockOrBurnFailure.store);
    }
}

/**
 > struct (0xe0e882f5) TokenPool_ReleaseOrMintFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface TokenPool_ReleaseOrMintFinished {
    readonly $: 'TokenPool_ReleaseOrMintFinished'
    queryId: uint64
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
}

export const TokenPool_ReleaseOrMintFinished = {
    PREFIX: 0xe0e882f5,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
    }): TokenPool_ReleaseOrMintFinished {
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFinished {
        loadAndCheckPrefix32(s, 0xe0e882f5, 'TokenPool_ReleaseOrMintFinished');
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintFinished, b: c.Builder): void {
        b.storeUint(0xe0e882f5, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintFinished): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFinished>(self, TokenPool_ReleaseOrMintFinished.store);
    }
}

/**
 > struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_ReleaseOrMintFailure {
    readonly $: 'TokenPool_ReleaseOrMintFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_ReleaseOrMintFailure = {
    PREFIX: 0xef0cb36e,

    create(args: {
        queryId: uint64
        errorCode: uint16
    }): TokenPool_ReleaseOrMintFailure {
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFailure {
        loadAndCheckPrefix32(s, 0xef0cb36e, 'TokenPool_ReleaseOrMintFailure');
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_ReleaseOrMintFailure, b: c.Builder): void {
        b.storeUint(0xef0cb36e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
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
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolAddedNotification = {
    PREFIX: 0x12cc4985,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolAddedNotification {
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            ...args
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
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolRemovedNotification = {
    PREFIX: 0xe17bf3cc,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolRemovedNotification {
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            ...args
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
        queryId: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_FinalityConfigSet {
        return {
            $: 'TokenPool_FinalityConfigSet',
            ...args
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
        queryId: uint64
        router: c.Address
        rateLimitAdmin: c.Address | null
        feeAdmin: c.Address | null
    }): TokenPool_DynamicConfigSet {
        return {
            $: 'TokenPool_DynamicConfigSet',
            ...args
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
        queryId: uint64
    }): TokenPool_RateLimitConfiguredNotification {
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            ...args
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
 > struct (0x15800161) TokenPool_CursedSubjectsSet {
 >     queryId: uint64
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_CursedSubjectsSet {
    readonly $: 'TokenPool_CursedSubjectsSet'
    queryId: uint64
    cursedSubjects: CursedSubjects
}

export const TokenPool_CursedSubjectsSet = {
    PREFIX: 0x15800161,

    create(args: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_CursedSubjectsSet {
        return {
            $: 'TokenPool_CursedSubjectsSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_CursedSubjectsSet {
        loadAndCheckPrefix32(s, 0x15800161, 'TokenPool_CursedSubjectsSet');
        return {
            $: 'TokenPool_CursedSubjectsSet',
            queryId: s.loadUintBig(64),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_CursedSubjectsSet, b: c.Builder): void {
        b.storeUint(0x15800161, 32);
        b.storeUint(self.queryId, 64);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_CursedSubjectsSet): c.Cell {
        return makeCellFrom<TokenPool_CursedSubjectsSet>(self, TokenPool_CursedSubjectsSet.store);
    }
}

/**
 > struct (0x3f5c1a2d) TokenPool_ChainUpdatesApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_ChainUpdatesApplied {
    readonly $: 'TokenPool_ChainUpdatesApplied'
    queryId: uint64
}

export const TokenPool_ChainUpdatesApplied = {
    PREFIX: 0x3f5c1a2d,

    create(args: {
        queryId: uint64
    }): TokenPool_ChainUpdatesApplied {
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainUpdatesApplied {
        loadAndCheckPrefix32(s, 0x3f5c1a2d, 'TokenPool_ChainUpdatesApplied');
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_ChainUpdatesApplied, b: c.Builder): void {
        b.storeUint(0x3f5c1a2d, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_ChainUpdatesApplied): c.Cell {
        return makeCellFrom<TokenPool_ChainUpdatesApplied>(self, TokenPool_ChainUpdatesApplied.store);
    }
}

/**
 > struct (0x8b3e4d17) TokenPool_RampAccessUpdatesApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_RampAccessUpdatesApplied {
    readonly $: 'TokenPool_RampAccessUpdatesApplied'
    queryId: uint64
}

export const TokenPool_RampAccessUpdatesApplied = {
    PREFIX: 0x8b3e4d17,

    create(args: {
        queryId: uint64
    }): TokenPool_RampAccessUpdatesApplied {
        return {
            $: 'TokenPool_RampAccessUpdatesApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampAccessUpdatesApplied {
        loadAndCheckPrefix32(s, 0x8b3e4d17, 'TokenPool_RampAccessUpdatesApplied');
        return {
            $: 'TokenPool_RampAccessUpdatesApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_RampAccessUpdatesApplied, b: c.Builder): void {
        b.storeUint(0x8b3e4d17, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_RampAccessUpdatesApplied): c.Cell {
        return makeCellFrom<TokenPool_RampAccessUpdatesApplied>(self, TokenPool_RampAccessUpdatesApplied.store);
    }
}

/**
 > struct (0x4a7e2b9c) TokenPool_FeeConfigApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_FeeConfigApplied {
    readonly $: 'TokenPool_FeeConfigApplied'
    queryId: uint64
}

export const TokenPool_FeeConfigApplied = {
    PREFIX: 0x4a7e2b9c,

    create(args: {
        queryId: uint64
    }): TokenPool_FeeConfigApplied {
        return {
            $: 'TokenPool_FeeConfigApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FeeConfigApplied {
        loadAndCheckPrefix32(s, 0x4a7e2b9c, 'TokenPool_FeeConfigApplied');
        return {
            $: 'TokenPool_FeeConfigApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_FeeConfigApplied, b: c.Builder): void {
        b.storeUint(0x4a7e2b9c, 32);
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
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_AdvancedPoolHooksSet {
        return {
            $: 'TokenPool_AdvancedPoolHooksSet',
            ...args
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
 > struct TokenPool_ChainAdded {
 >     remoteChainSelector: uint64
 >     remoteTokenAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_ChainAdded {
    readonly $: 'TokenPool_ChainAdded'
    remoteChainSelector: uint64
    remoteTokenAddress: CellRef<CrossChainAddress>
}

export const TokenPool_ChainAdded = {
    create(args: {
        remoteChainSelector: uint64
        remoteTokenAddress: CellRef<CrossChainAddress>
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
        }
    },
    store(self: TokenPool_ChainAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
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
 > struct TokenPool_OutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_OutboundRateLimitConsumed {
    readonly $: 'TokenPool_OutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_OutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_OutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_OutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitConsumed>(self, TokenPool_OutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_InboundRateLimitConsumed {
    readonly $: 'TokenPool_InboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_InboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_InboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_InboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitConsumed>(self, TokenPool_InboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityOutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityOutboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityOutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityOutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityOutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityOutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityOutboundRateLimitConsumed>(self, TokenPool_FastFinalityOutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityInboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityInboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityInboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityInboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityInboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityInboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityInboundRateLimitConsumed>(self, TokenPool_FastFinalityInboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_OutboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_OutboundRateLimitRefunded {
    readonly $: 'TokenPool_OutboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_OutboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_OutboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_OutboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitRefunded>(self, TokenPool_OutboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_InboundRateLimitRefunded {
    readonly $: 'TokenPool_InboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_InboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_InboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_InboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitRefunded>(self, TokenPool_InboundRateLimitRefunded.store);
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
    tokenTransferFeeConfig: CellRef<TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_TokenTransferFeeConfigUpdated = {
    create(args: {
        destChainSelector: uint64
        tokenTransferFeeConfig: CellRef<TokenPool_TokenTransferFeeConfig>
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
 > struct TokenPool_RampAccessUpdated {
 >     remoteChainSelector: uint64
 >     onRamp: address?
 >     offRamp: address?
 > }
 */
export interface TokenPool_RampAccessUpdated {
    readonly $: 'TokenPool_RampAccessUpdated'
    remoteChainSelector: uint64
    onRamp: c.Address | null /* = null */
    offRamp: c.Address | null /* = null */
}

export const TokenPool_RampAccessUpdated = {
    create(args: {
        remoteChainSelector: uint64
        onRamp?: c.Address | null /* = null */
        offRamp?: c.Address | null /* = null */
    }): TokenPool_RampAccessUpdated {
        return {
            $: 'TokenPool_RampAccessUpdated',
            onRamp: null,
            offRamp: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampAccessUpdated {
        return {
            $: 'TokenPool_RampAccessUpdated',
            remoteChainSelector: s.loadUintBig(64),
            onRamp: s.loadMaybeAddress(),
            offRamp: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_RampAccessUpdated, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.onRamp);
        b.storeAddress(self.offRamp);
    },
    toCell(self: TokenPool_RampAccessUpdated): c.Cell {
        return makeCellFrom<TokenPool_RampAccessUpdated>(self, TokenPool_RampAccessUpdated.store);
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
 > struct LockReleaseLockboxTokenPool_PendingLock {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface LockReleaseLockboxTokenPool_PendingLock {
    readonly $: 'LockReleaseLockboxTokenPool_PendingLock'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
}

export const LockReleaseLockboxTokenPool_PendingLock = {
    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }): LockReleaseLockboxTokenPool_PendingLock {
        return {
            $: 'LockReleaseLockboxTokenPool_PendingLock',
            ...args
        }
    },
    fromSlice(s: c.Slice): LockReleaseLockboxTokenPool_PendingLock {
        return {
            $: 'LockReleaseLockboxTokenPool_PendingLock',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: LockReleaseLockboxTokenPool_PendingLock, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: LockReleaseLockboxTokenPool_PendingLock): c.Cell {
        return makeCellFrom<LockReleaseLockboxTokenPool_PendingLock>(self, LockReleaseLockboxTokenPool_PendingLock.store);
    }
}

/**
 > struct LockReleaseLockboxTokenPool_PendingRelease {
 >     queryId: uint64
 >     replyTo: Cell<address?>
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface LockReleaseLockboxTokenPool_PendingRelease {
    readonly $: 'LockReleaseLockboxTokenPool_PendingRelease'
    queryId: uint64
    replyTo: CellRef<c.Address | null>
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
}

export const LockReleaseLockboxTokenPool_PendingRelease = {
    create(args: {
        queryId: uint64
        replyTo: CellRef<c.Address | null>
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
    }): LockReleaseLockboxTokenPool_PendingRelease {
        return {
            $: 'LockReleaseLockboxTokenPool_PendingRelease',
            ...args
        }
    },
    fromSlice(s: c.Slice): LockReleaseLockboxTokenPool_PendingRelease {
        return {
            $: 'LockReleaseLockboxTokenPool_PendingRelease',
            queryId: s.loadUintBig(64),
            replyTo: loadCellRef<c.Address | null>(s,
                (s) => s.loadMaybeAddress()
            ),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: LockReleaseLockboxTokenPool_PendingRelease, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        storeCellRef<c.Address | null>(self.replyTo, b,
            (v,b) => b.storeAddress(v)
        );
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: LockReleaseLockboxTokenPool_PendingRelease): c.Cell {
        return makeCellFrom<LockReleaseLockboxTokenPool_PendingRelease>(self, LockReleaseLockboxTokenPool_PendingRelease.store);
    }
}

/**
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 >     lockbox: address
 >     pendingLocks: map<uint64, Cell<LockReleaseLockboxTokenPool_PendingLock>>
 >     pendingReleases: map<uint64, Cell<LockReleaseLockboxTokenPool_PendingRelease>>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: CellRef<TokenPool_Data>
    lockbox: c.Address
    pendingLocks: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingLock>>
    pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingRelease>>
}

export const Storage = {
    create(args: {
        poolData: CellRef<TokenPool_Data>
        lockbox: c.Address
        pendingLocks: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingLock>>
        pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingRelease>>
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
            pendingLocks: c.Dictionary.load<uint64, CellRef<LockReleaseLockboxTokenPool_PendingLock>>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseLockboxTokenPool_PendingLock>>(
                (s) => loadCellRef<LockReleaseLockboxTokenPool_PendingLock>(s, LockReleaseLockboxTokenPool_PendingLock.fromSlice),
                (v,b) => storeCellRef<LockReleaseLockboxTokenPool_PendingLock>(v, b, LockReleaseLockboxTokenPool_PendingLock.store)
            ), s),
            pendingReleases: c.Dictionary.load<uint64, CellRef<LockReleaseLockboxTokenPool_PendingRelease>>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseLockboxTokenPool_PendingRelease>>(
                (s) => loadCellRef<LockReleaseLockboxTokenPool_PendingRelease>(s, LockReleaseLockboxTokenPool_PendingRelease.fromSlice),
                (v,b) => storeCellRef<LockReleaseLockboxTokenPool_PendingRelease>(v, b, LockReleaseLockboxTokenPool_PendingRelease.store)
            ), s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
        b.storeAddress(self.lockbox);
        b.storeDict<uint64, CellRef<LockReleaseLockboxTokenPool_PendingLock>>(self.pendingLocks, c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseLockboxTokenPool_PendingLock>>(
            (s) => loadCellRef<LockReleaseLockboxTokenPool_PendingLock>(s, LockReleaseLockboxTokenPool_PendingLock.fromSlice),
            (v,b) => storeCellRef<LockReleaseLockboxTokenPool_PendingLock>(v, b, LockReleaseLockboxTokenPool_PendingLock.store)
        ));
        b.storeDict<uint64, CellRef<LockReleaseLockboxTokenPool_PendingRelease>>(self.pendingReleases, c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseLockboxTokenPool_PendingRelease>>(
            (s) => loadCellRef<LockReleaseLockboxTokenPool_PendingRelease>(s, LockReleaseLockboxTokenPool_PendingRelease.fromSlice),
            (v,b) => storeCellRef<LockReleaseLockboxTokenPool_PendingRelease>(v, b, LockReleaseLockboxTokenPool_PendingRelease.store)
        ));
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct (0xde7934db) JettonLockBox_Deposited {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 > }
 */
export interface JettonLockBox_Deposited {
    readonly $: 'JettonLockBox_Deposited'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
}

export const JettonLockBox_Deposited = {
    PREFIX: 0xde7934db,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }): JettonLockBox_Deposited {
        return {
            $: 'JettonLockBox_Deposited',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposited {
        loadAndCheckPrefix32(s, 0xde7934db, 'JettonLockBox_Deposited');
        return {
            $: 'JettonLockBox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockBox_Deposited, b: c.Builder): void {
        b.storeUint(0xde7934db, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockBox_Deposited): c.Cell {
        return makeCellFrom<JettonLockBox_Deposited>(self, JettonLockBox_Deposited.store);
    }
}

/**
 > struct (0x3dfc5d66) JettonLockBox_WithdrawFailed {
 >     queryId: uint64
 >     token: address
 >     amount: coins
 >     recipientWallet: address
 > }
 */
export interface JettonLockBox_WithdrawFailed {
    readonly $: 'JettonLockBox_WithdrawFailed'
    queryId: uint64
    token: c.Address
    amount: coins
    recipientWallet: c.Address
}

export const JettonLockBox_WithdrawFailed = {
    PREFIX: 0x3dfc5d66,

    create(args: {
        queryId: uint64
        token: c.Address
        amount: coins
        recipientWallet: c.Address
    }): JettonLockBox_WithdrawFailed {
        return {
            $: 'JettonLockBox_WithdrawFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawFailed {
        loadAndCheckPrefix32(s, 0x3dfc5d66, 'JettonLockBox_WithdrawFailed');
        return {
            $: 'JettonLockBox_WithdrawFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
            recipientWallet: s.loadAddress(),
        }
    },
    store(self: JettonLockBox_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0x3dfc5d66, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
    },
    toCell(self: JettonLockBox_WithdrawFailed): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawFailed>(self, JettonLockBox_WithdrawFailed.store);
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
 >     lastUpdated: uint64
 >     isEnabled: bool
 >     capacity: uint128
 >     rate: uint128
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint128
    lastUpdated: uint64
    isEnabled: boolean
    capacity: uint128
    rate: uint128
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint128
        lastUpdated: uint64
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
            lastUpdated: s.loadUintBig(64),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(128),
            rate: s.loadUintBig(128),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 128);
        b.storeUint(self.lastUpdated, 64);
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
        'TokenPool_Error.InvalidTransferFeeBps': 14900,
        'TokenPool_Error.InvalidTokenTransferFeeConfig': 14901,
        'TokenPool_Error.ZeroAddressInvalid': 14903,
        'TokenPool_Error.NonExistentChain': 14904,
        'TokenPool_Error.ChainNotAllowed': 14905,
        'TokenPool_Error.CursedByRMN': 14906,
        'TokenPool_Error.ChainAlreadyExists': 14907,
        'TokenPool_Error.InvalidToken': 14909,
        'TokenPool_Error.Unauthorized': 14910,
        'TokenPool_Error.PoolAlreadyAdded': 14911,
        'TokenPool_Error.InvalidRemotePoolForChain': 14912,
        'TokenPool_Error.InvalidRemoteChainDecimals': 14913,
        'TokenPool_Error.OverflowDetected': 14914,
        'TokenPool_Error.UnsupportedOperation': 14917,
        'TokenPool_Error.InvalidRequestedFinality': 14921,
        'RateLimiter_Error.BucketOverfilled': 26300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 26301,
        'RateLimiter_Error.TokenRateLimitReached': 26302,
        'LockReleaseLockBoxTokenPool_Error.PendingLockAlreadyExists': 48700,
        'LockReleaseLockBoxTokenPool_Error.PendingLockNotFound': 48701,
        'LockReleaseLockBoxTokenPool_Error.PendingReleaseAlreadyExists': 48702,
        'LockReleaseLockBoxTokenPool_Error.LockboxNotConfigured': 48704,
        'LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender': 48705,
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
            throw new Error(`Custom pack/unpack for 'LockReleaseLockboxTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new LockReleaseLockboxTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: CellRef<TokenPool_Data>
        lockbox: c.Address
        pendingLocks: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingLock>>
        pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseLockboxTokenPool_PendingRelease>>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? LockReleaseLockboxTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new LockReleaseLockboxTokenPool(address, initialState);
    }

    static createCellOfTokenPoolLockOrBurn(body: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }) {
        return TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFinished(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }) {
        return TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }) {
        return TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolReleaseOrMint(body: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }) {
        return TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFinished(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }) {
        return TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }) {
        return TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolApplyChainUpdates(body: {
        queryId: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }) {
        return TokenPool_ApplyChainUpdates.toCell(TokenPool_ApplyChainUpdates.create(body));
    }

    static createCellOfTokenPoolAddRemotePool(body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }) {
        return TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body));
    }

    static createCellOfTokenPoolRemoveRemotePool(body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }) {
        return TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body));
    }

    static createCellOfTokenPoolSetDynamicConfig(body: {
        queryId: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }) {
        return TokenPool_SetDynamicConfig.toCell(TokenPool_SetDynamicConfig.create(body));
    }

    static createCellOfTokenPoolSetAllowedFinalityConfig(body: {
        queryId: uint64
        allowedFinalityConfig: uint32
    }) {
        return TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body));
    }

    static createCellOfTokenPoolSetAdvancedPoolHooks(body: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }) {
        return TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body));
    }

    static createCellOfTokenPoolSetRateLimitConfig(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }) {
        return TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body));
    }

    static createCellOfTokenPoolApplyTokenTransferFeeConfigUpdates(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }) {
        return TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body));
    }

    static createCellOfTokenPoolUpdateRampAccess(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }) {
        return TokenPool_UpdateRampAccess.toCell(TokenPool_UpdateRampAccess.create(body));
    }

    static createCellOfTokenPoolSetRMNProxy(body: {
        queryId: uint64
        rmnProxy: c.Address
    }) {
        return TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body));
    }

    static createCellOfTokenPoolSetCursedSubjects(body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }) {
        return TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body));
    }

    static createCellOfReturnExcessesBack(body: {
        queryId: uint64
    }) {
        return ReturnExcessesBack.toCell(ReturnExcessesBack.create(body));
    }

    static createCellOfJettonLockBoxDeposited(body: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }) {
        return JettonLockBox_Deposited.toCell(JettonLockBox_Deposited.create(body));
    }

    static createCellOfJettonLockBoxWithdrawFailed(body: {
        queryId: uint64
        token: c.Address
        amount: coins
        recipientWallet: c.Address
    }) {
        return JettonLockBox_WithdrawFailed.toCell(JettonLockBox_WithdrawFailed.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendTokenPoolLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body)),
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

    async sendTokenPoolPreflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyChainUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolRemoveRemotePool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetDynamicConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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
        queryId: uint64
        allowedFinalityConfig: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAdvancedPoolHooks(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetRateLimitConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyTokenTransferFeeConfigUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolUpdateRampAccess(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_UpdateRampAccess.toCell(TokenPool_UpdateRampAccess.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetRMNProxy(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        rmnProxy: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetCursedSubjects(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body)),
            ...extraOptions
        });
    }

    async sendReturnExcessesBack(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReturnExcessesBack.toCell(ReturnExcessesBack.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxDeposited(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Deposited.toCell(JettonLockBox_Deposited.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxWithdrawFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        token: c.Address
        amount: coins
        recipientWallet: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_WithdrawFailed.toCell(JettonLockBox_WithdrawFailed.create(body)),
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

    async getOnRamp(provider: ContractProvider, remoteChainSelector: uint64): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('onRamp', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getOffRamp(provider: ContractProvider, remoteChainSelector: uint64): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('offRamp', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getHasPendingLock(provider: ContractProvider, queryId: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasPendingLock', [
            { type: 'int', value: queryId },
        ]));
        return r.readBoolean();
    }

    async getHasPendingRelease(provider: ContractProvider, queryId: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasPendingRelease', [
            { type: 'int', value: queryId },
        ]));
        return r.readBoolean();
    }

    async getRMNProxy(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRMNProxy', []));
        return r.readSlice().loadAddress();
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

    async getIsRemotePool(provider: ContractProvider, remoteChainSelector: uint64, remotePoolAddress: CellRef<CrossChainAddress>): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isRemotePool', [
            { type: 'int', value: remoteChainSelector },
            { type: 'cell', cell: CrossChainAddress.toCell(remotePoolAddress.ref) },
        ]));
        return r.readBoolean();
    }

    async getRemoteToken(provider: ContractProvider, remoteChainSelector: uint64): Promise<CellRef<CrossChainAddress>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemoteToken', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice);
    }

    async getRemotePools(provider: ContractProvider, remoteChainSelector: uint64): Promise<lisp_list<CellRef<CrossChainAddress>>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemotePools', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readLispListOf<CellRef<CrossChainAddress>>(
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

    async getFee(provider: ContractProvider, localToken: c.Address, destChainSelector: uint64, amount: uint256, feeToken: c.Address, requestedFinalityConfig: uint32, tokenArgs: c.Cell | null): Promise<[
        uint256,
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

    async getFeeAmount(provider: ContractProvider, transfer: TokenPool_LockOrBurnTransfer, requestedFinalityConfig: uint32): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('getFeeAmount', [
            { type: 'int', value: transfer.id },
            { type: 'cell', cell: makeCellFrom<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(transfer.details.ref,
                (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
                b.storeUint(v.remoteChainSelector, 64);
                b.storeAddress(v.originalSender);
                b.storeUint(v.amount, 256);
                b.storeAddress(v.localToken); }
            ) },
            { type: 'int', value: requestedFinalityConfig },
        ]));
        return r.readBigInt();
    }
}
