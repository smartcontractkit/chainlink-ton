// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a LockReleaseTokenPool contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

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
}

// ————————————————————————————————————————————
//   custom packToBuilder and unpackFromSlice
//

type CustomPackToBuilderFn<T> = (self: T, b: c.Builder) => void
type CustomUnpackFromSliceFn<T> = (s: c.Slice) => T

let customSerializersRegistry: Map<string, [CustomPackToBuilderFn<any> | null, CustomUnpackFromSliceFn<any> | null]> = new Map;

function ensureCustomSerializerRegistered(typeName: string) {
    if (!customSerializersRegistry.has(typeName)) {
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'LockReleaseTokenPool.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > LockReleaseTokenPool.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: CellRef<Ownable2Step>
    rmnProxy: c.Address
    dynamicConfig: CellRef<TokenPool_DynamicConfig>
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: CellRef<Ownable2Step>
        rmnProxy: c.Address
        dynamicConfig: CellRef<TokenPool_DynamicConfig>
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
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
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        b.storeAddress(self.rmnProxy);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_AdminConfig): c.Cell {
        return makeCellFrom<TokenPool_AdminConfig>(self, TokenPool_AdminConfig.store);
    }
}

/**
 > struct TokenPool_Data {
 >     adminConfig: Cell<TokenPool_AdminConfig>
 >     mirroredPolicy: Cell<TokenPool_MirroredPolicy>
 >     token: address
 >     tokenDecimals: uint8
 >     remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>
 >     tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: CellRef<TokenPool_AdminConfig>
    mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
    token: c.Address
    tokenDecimals: uint8
    remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
    tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: CellRef<TokenPool_AdminConfig>
        mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
        token: c.Address
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
            token: s.loadAddress(),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s),
            tokenTransferFeeConfigs: c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_MirroredPolicy>(self.mirroredPolicy, b, TokenPool_MirroredPolicy.store);
        b.storeAddress(self.token);
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
 > struct TokenPool_TokenTransferFeeConfig {
 >     isEnabled: bool
 >     finalityFeeUSDCents: uint256
 >     fastFinalityFeeUSDCents: uint256
 >     destGasOverhead: uint32
 >     destBytesOverhead: uint32
 >     finalityTransferFeeBps: uint16
 >     fastFinalityTransferFeeBps: uint16
 > }
 */
export interface TokenPool_TokenTransferFeeConfig {
    readonly $: 'TokenPool_TokenTransferFeeConfig'
    isEnabled: boolean
    finalityFeeUSDCents: uint256
    fastFinalityFeeUSDCents: uint256
    destGasOverhead: uint32
    destBytesOverhead: uint32
    finalityTransferFeeBps: uint16
    fastFinalityTransferFeeBps: uint16
}

export const TokenPool_TokenTransferFeeConfig = {
    create(args: {
        isEnabled: boolean
        finalityFeeUSDCents: uint256
        fastFinalityFeeUSDCents: uint256
        destGasOverhead: uint32
        destBytesOverhead: uint32
        finalityTransferFeeBps: uint16
        fastFinalityTransferFeeBps: uint16
    }): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            isEnabled: s.loadBoolean(),
            finalityFeeUSDCents: s.loadUintBig(256),
            fastFinalityFeeUSDCents: s.loadUintBig(256),
            destGasOverhead: s.loadUintBig(32),
            destBytesOverhead: s.loadUintBig(32),
            finalityTransferFeeBps: s.loadUintBig(16),
            fastFinalityTransferFeeBps: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfig, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.finalityFeeUSDCents, 256);
        b.storeUint(self.fastFinalityFeeUSDCents, 256);
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
        b.storeUint(self.finalityTransferFeeBps, 16);
        b.storeUint(self.fastFinalityTransferFeeBps, 16);
    },
    toCell(self: TokenPool_TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfig>(self, TokenPool_TokenTransferFeeConfig.store);
    }
}

/**
 > struct TokenPool_LockOrBurnInV1 {
 >     receiver: Cell<CrossChainAddress>
 >     remoteChainSelector: uint64
 >     originalSender: address
 >     amount: uint256
 >     localToken: address
 > }
 */
export interface TokenPool_LockOrBurnInV1 {
    readonly $: 'TokenPool_LockOrBurnInV1'
    receiver: CellRef<CrossChainAddress>
    remoteChainSelector: uint64
    originalSender: c.Address
    amount: uint256
    localToken: c.Address
}

export const TokenPool_LockOrBurnInV1 = {
    create(args: {
        receiver: CellRef<CrossChainAddress>
        remoteChainSelector: uint64
        originalSender: c.Address
        amount: uint256
        localToken: c.Address
    }): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remoteChainSelector: s.loadUintBig(64),
            originalSender: s.loadAddress(),
            amount: s.loadUintBig(256),
            localToken: s.loadAddress(),
        }
    },
    store(self: TokenPool_LockOrBurnInV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.receiver, b, CrossChainAddress.store);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.originalSender);
        b.storeUint(self.amount, 256);
        b.storeAddress(self.localToken);
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
 >     originalSender: Cell<CrossChainAddress>
 >     remoteChainSelector: uint64
 >     receiver: address
 >     sourceDenominatedAmount: uint256
 >     localToken: address
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     sourcePoolData: cell?
 >     offchainTokenData: cell?
 > }
 */
export interface TokenPool_ReleaseOrMintInV1 {
    readonly $: 'TokenPool_ReleaseOrMintInV1'
    originalSender: CellRef<CrossChainAddress>
    remoteChainSelector: uint64
    receiver: c.Address
    sourceDenominatedAmount: uint256
    localToken: c.Address
    sourcePoolAddress: CellRef<CrossChainAddress>
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        originalSender: CellRef<CrossChainAddress>
        remoteChainSelector: uint64
        receiver: c.Address
        sourceDenominatedAmount: uint256
        localToken: c.Address
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
            originalSender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remoteChainSelector: s.loadUintBig(64),
            receiver: s.loadAddress(),
            sourceDenominatedAmount: s.loadUintBig(256),
            localToken: s.loadAddress(),
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            sourcePoolData: s.loadBoolean() ? s.loadRef() : null,
            offchainTokenData: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_ReleaseOrMintInV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.originalSender, b, CrossChainAddress.store);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.receiver);
        b.storeUint(self.sourceDenominatedAmount, 256);
        b.storeAddress(self.localToken);
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
 > struct (0x2c906eb7) TokenPool_UpdateCursedSubjects {
 >     queryId: uint64
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_UpdateCursedSubjects {
    readonly $: 'TokenPool_UpdateCursedSubjects'
    queryId: uint64
    cursedSubjects: CursedSubjects
}

export const TokenPool_UpdateCursedSubjects = {
    PREFIX: 0x2c906eb7,

    create(args: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_UpdateCursedSubjects {
        return {
            $: 'TokenPool_UpdateCursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_UpdateCursedSubjects {
        loadAndCheckPrefix32(s, 0x2c906eb7, 'TokenPool_UpdateCursedSubjects');
        return {
            $: 'TokenPool_UpdateCursedSubjects',
            queryId: s.loadUintBig(64),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_UpdateCursedSubjects, b: c.Builder): void {
        b.storeUint(0x2c906eb7, 32);
        b.storeUint(self.queryId, 64);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_UpdateCursedSubjects): c.Cell {
        return makeCellFrom<TokenPool_UpdateCursedSubjects>(self, TokenPool_UpdateCursedSubjects.store);
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
 >     requestMsg: Cell<TokenPool_LockOrBurn>
 >     prepared: Cell<TokenPool_LockOrBurnPrepared>
 > }
 */
export interface TokenPool_LockOrBurnForwardPayload {
    readonly $: 'TokenPool_LockOrBurnForwardPayload'
    requestMsg: CellRef<TokenPool_LockOrBurn>
    prepared: CellRef<TokenPool_LockOrBurnPrepared>
}

export const TokenPool_LockOrBurnForwardPayload = {
    create(args: {
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
            requestMsg: loadCellRef<TokenPool_LockOrBurn>(s, TokenPool_LockOrBurn.fromSlice),
            prepared: loadCellRef<TokenPool_LockOrBurnPrepared>(s, TokenPool_LockOrBurnPrepared.fromSlice),
        }
    },
    store(self: TokenPool_LockOrBurnForwardPayload, b: c.Builder): void {
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
 > struct (0xfa7da440) TokenPool_PreflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_PreflightCheckFinished {
    readonly $: 'TokenPool_PreflightCheckFinished'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PreflightCheckFinished = {
    PREFIX: 0xfa7da440,

    create(args: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PreflightCheckFinished {
        return {
            $: 'TokenPool_PreflightCheckFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFinished {
        loadAndCheckPrefix32(s, 0xfa7da440, 'TokenPool_PreflightCheckFinished');
        return {
            $: 'TokenPool_PreflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_PreflightCheckFinished, b: c.Builder): void {
        b.storeUint(0xfa7da440, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_PreflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFinished>(self, TokenPool_PreflightCheckFinished.store);
    }
}

/**
 > struct (0xfa7da441) TokenPool_PreflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_PreflightCheckFailed {
    readonly $: 'TokenPool_PreflightCheckFailed'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PreflightCheckFailed = {
    PREFIX: 0xfa7da441,

    create(args: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PreflightCheckFailed {
        return {
            $: 'TokenPool_PreflightCheckFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFailed {
        loadAndCheckPrefix32(s, 0xfa7da441, 'TokenPool_PreflightCheckFailed');
        return {
            $: 'TokenPool_PreflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_PreflightCheckFailed, b: c.Builder): void {
        b.storeUint(0xfa7da441, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_PreflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFailed>(self, TokenPool_PreflightCheckFailed.store);
    }
}

/**
 > struct (0xfa7da442) TokenPool_PostflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_PostflightCheckFinished {
    readonly $: 'TokenPool_PostflightCheckFinished'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PostflightCheckFinished = {
    PREFIX: 0xfa7da442,

    create(args: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PostflightCheckFinished {
        return {
            $: 'TokenPool_PostflightCheckFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFinished {
        loadAndCheckPrefix32(s, 0xfa7da442, 'TokenPool_PostflightCheckFinished');
        return {
            $: 'TokenPool_PostflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_PostflightCheckFinished, b: c.Builder): void {
        b.storeUint(0xfa7da442, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_PostflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFinished>(self, TokenPool_PostflightCheckFinished.store);
    }
}

/**
 > struct (0xfa7da443) TokenPool_PostflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_PostflightCheckFailed {
    readonly $: 'TokenPool_PostflightCheckFailed'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_PostflightCheckFailed = {
    PREFIX: 0xfa7da443,

    create(args: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_PostflightCheckFailed {
        return {
            $: 'TokenPool_PostflightCheckFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFailed {
        loadAndCheckPrefix32(s, 0xfa7da443, 'TokenPool_PostflightCheckFailed');
        return {
            $: 'TokenPool_PostflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_PostflightCheckFailed, b: c.Builder): void {
        b.storeUint(0xfa7da443, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_PostflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFailed>(self, TokenPool_PostflightCheckFailed.store);
    }
}

/**
 > struct (0xfa7da444) TokenPool_LockOrBurnWithdraw {
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
    PREFIX: 0xfa7da444,

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
        loadAndCheckPrefix32(s, 0xfa7da444, 'TokenPool_LockOrBurnWithdraw');
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnWithdraw, b: c.Builder): void {
        b.storeUint(0xfa7da444, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_LockOrBurnWithdraw): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnWithdraw>(self, TokenPool_LockOrBurnWithdraw.store);
    }
}

/**
 > struct (0x6c060424) TokenPool_LockOrBurnFinished {
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
    PREFIX: 0x6c060424,

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
        loadAndCheckPrefix32(s, 0x6c060424, 'TokenPool_LockOrBurnFinished');
        return {
            $: 'TokenPool_LockOrBurnFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockOrBurnFinished, b: c.Builder): void {
        b.storeUint(0x6c060424, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeUint(self.destTokenAmount, 256);
    },
    toCell(self: TokenPool_LockOrBurnFinished): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFinished>(self, TokenPool_LockOrBurnFinished.store);
    }
}

/**
 > struct (0xef0cb360) TokenPool_LockOrBurnFailure {
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
    PREFIX: 0xef0cb360,

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
        loadAndCheckPrefix32(s, 0xef0cb360, 'TokenPool_LockOrBurnFailure');
        return {
            $: 'TokenPool_LockOrBurnFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_LockOrBurnFailure, b: c.Builder): void {
        b.storeUint(0xef0cb360, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_LockOrBurnFailure): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFailure>(self, TokenPool_LockOrBurnFailure.store);
    }
}

/**
 > struct (0x78dc2232) TokenPool_ReleaseOrMintFinished {
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
    PREFIX: 0x78dc2232,

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
        loadAndCheckPrefix32(s, 0x78dc2232, 'TokenPool_ReleaseOrMintFinished');
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintFinished, b: c.Builder): void {
        b.storeUint(0x78dc2232, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintFinished): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFinished>(self, TokenPool_ReleaseOrMintFinished.store);
    }
}

/**
 > struct (0xef0cb361) TokenPool_ReleaseOrMintFailure {
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
    PREFIX: 0xef0cb361,

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
        loadAndCheckPrefix32(s, 0xef0cb361, 'TokenPool_ReleaseOrMintFailure');
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_ReleaseOrMintFailure, b: c.Builder): void {
        b.storeUint(0xef0cb361, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_ReleaseOrMintFailure): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFailure>(self, TokenPool_ReleaseOrMintFailure.store);
    }
}

/**
 > struct (0x17c242d3) TokenPool_RemotePoolAddedNotification {
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
    PREFIX: 0x17c242d3,

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
        loadAndCheckPrefix32(s, 0x17c242d3, 'TokenPool_RemotePoolAddedNotification');
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolAddedNotification, b: c.Builder): void {
        b.storeUint(0x17c242d3, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolAddedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolAddedNotification>(self, TokenPool_RemotePoolAddedNotification.store);
    }
}

/**
 > struct (0x17c242d1) TokenPool_RemotePoolRemovedNotification {
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
    PREFIX: 0x17c242d1,

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
        loadAndCheckPrefix32(s, 0x17c242d1, 'TokenPool_RemotePoolRemovedNotification');
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolRemovedNotification, b: c.Builder): void {
        b.storeUint(0x17c242d1, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolRemovedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolRemovedNotification>(self, TokenPool_RemotePoolRemovedNotification.store);
    }
}

/**
 > struct (0x3c50a39c) TokenPool_FinalityConfigSet {
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
    PREFIX: 0x3c50a39c,

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
        loadAndCheckPrefix32(s, 0x3c50a39c, 'TokenPool_FinalityConfigSet');
        return {
            $: 'TokenPool_FinalityConfigSet',
            queryId: s.loadUintBig(64),
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_FinalityConfigSet, b: c.Builder): void {
        b.storeUint(0x3c50a39c, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_FinalityConfigSet): c.Cell {
        return makeCellFrom<TokenPool_FinalityConfigSet>(self, TokenPool_FinalityConfigSet.store);
    }
}

/**
 > struct (0x3c50a39d) TokenPool_DynamicConfigSet {
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
    PREFIX: 0x3c50a39d,

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
        loadAndCheckPrefix32(s, 0x3c50a39d, 'TokenPool_DynamicConfigSet');
        return {
            $: 'TokenPool_DynamicConfigSet',
            queryId: s.loadUintBig(64),
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_DynamicConfigSet, b: c.Builder): void {
        b.storeUint(0x3c50a39d, 32);
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
 > struct (0x3c50a39e) TokenPool_RateLimitConfiguredNotification {
 >     queryId: uint64
 > }
 */
export interface TokenPool_RateLimitConfiguredNotification {
    readonly $: 'TokenPool_RateLimitConfiguredNotification'
    queryId: uint64
}

export const TokenPool_RateLimitConfiguredNotification = {
    PREFIX: 0x3c50a39e,

    create(args: {
        queryId: uint64
    }): TokenPool_RateLimitConfiguredNotification {
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfiguredNotification {
        loadAndCheckPrefix32(s, 0x3c50a39e, 'TokenPool_RateLimitConfiguredNotification');
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_RateLimitConfiguredNotification, b: c.Builder): void {
        b.storeUint(0x3c50a39e, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_RateLimitConfiguredNotification): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfiguredNotification>(self, TokenPool_RateLimitConfiguredNotification.store);
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
    details: CellRef<TokenPool_LockedOrBurnedDetails>
}

export const TokenPool_LockedOrBurned = {
    create(args: {
        remoteChainSelector: uint64
        details: CellRef<TokenPool_LockedOrBurnedDetails>
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
 >     amount: uint256
 > }
 */
export interface TokenPool_LockedOrBurnedDetails {
    readonly $: 'TokenPool_LockedOrBurnedDetails'
    token: c.Address
    sender: c.Address
    amount: uint256
}

export const TokenPool_LockedOrBurnedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        amount: uint256
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
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockedOrBurnedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        b.storeUint(self.amount, 256);
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
    details: CellRef<TokenPool_ReleasedOrMintedDetails>
}

export const TokenPool_ReleasedOrMinted = {
    create(args: {
        remoteChainSelector: uint64
        details: CellRef<TokenPool_ReleasedOrMintedDetails>
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
 >     recipient: Cell<address>
 >     amount: uint256
 > }
 */
export interface TokenPool_ReleasedOrMintedDetails {
    readonly $: 'TokenPool_ReleasedOrMintedDetails'
    token: c.Address
    sender: c.Address
    recipient: CellRef<c.Address>
    amount: uint256
}

export const TokenPool_ReleasedOrMintedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        recipient: CellRef<c.Address>
        amount: uint256
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
            recipient: loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_ReleasedOrMintedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        storeCellRef<c.Address>(self.recipient, b,
            (v,b) => b.storeAddress(v)
        );
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_ReleasedOrMintedDetails): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMintedDetails>(self, TokenPool_ReleasedOrMintedDetails.store);
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
 > struct TokenPool_RemotePoolAdded {
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolAdded {
    readonly $: 'TokenPool_RemotePoolAdded'
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolAdded = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
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
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolRemoved = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
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
 > struct TokenPool_CursedSubjectsUpdated {
 > }
 */
export interface TokenPool_CursedSubjectsUpdated {
    readonly $: 'TokenPool_CursedSubjectsUpdated'
}

export const TokenPool_CursedSubjectsUpdated = {
    create(): TokenPool_CursedSubjectsUpdated {
        return {
            $: 'TokenPool_CursedSubjectsUpdated',
        }
    },
    fromSlice(s: c.Slice): TokenPool_CursedSubjectsUpdated {
        return {
            $: 'TokenPool_CursedSubjectsUpdated',
        }
    },
    store(self: TokenPool_CursedSubjectsUpdated, b: c.Builder): void {
    },
    toCell(self: TokenPool_CursedSubjectsUpdated): c.Cell {
        return makeCellFrom<TokenPool_CursedSubjectsUpdated>(self, TokenPool_CursedSubjectsUpdated.store);
    }
}

/**
 > type LockReleaseTokenPool_InMessage = ReturnExcessesBack
 */
export type LockReleaseTokenPool_InMessage = ReturnExcessesBack

export const LockReleaseTokenPool_InMessage = {
    fromSlice(s: c.Slice): LockReleaseTokenPool_InMessage {
        return ReturnExcessesBack.fromSlice(s);
    },
    store(self: LockReleaseTokenPool_InMessage, b: c.Builder): void {
        ReturnExcessesBack.store(self, b);
    },
    toCell(self: LockReleaseTokenPool_InMessage): c.Cell {
        return makeCellFrom<LockReleaseTokenPool_InMessage>(self, LockReleaseTokenPool_InMessage.store);
    }
}

/**
 > struct LockReleaseTokenPool_PendingRelease {
 >     replyTo: address?
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 >     expectedSender: address
 > }
 */
export interface LockReleaseTokenPool_PendingRelease {
    readonly $: 'LockReleaseTokenPool_PendingRelease'
    replyTo: c.Address | null
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
    expectedSender: c.Address
}

export const LockReleaseTokenPool_PendingRelease = {
    create(args: {
        replyTo: c.Address | null
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
        expectedSender: c.Address
    }): LockReleaseTokenPool_PendingRelease {
        return {
            $: 'LockReleaseTokenPool_PendingRelease',
            ...args
        }
    },
    fromSlice(s: c.Slice): LockReleaseTokenPool_PendingRelease {
        return {
            $: 'LockReleaseTokenPool_PendingRelease',
            replyTo: s.loadMaybeAddress(),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
            expectedSender: s.loadAddress(),
        }
    },
    store(self: LockReleaseTokenPool_PendingRelease, b: c.Builder): void {
        b.storeAddress(self.replyTo);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
        b.storeAddress(self.expectedSender);
    },
    toCell(self: LockReleaseTokenPool_PendingRelease): c.Cell {
        return makeCellFrom<LockReleaseTokenPool_PendingRelease>(self, LockReleaseTokenPool_PendingRelease.store);
    }
}

/**
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 >     jettonClient: Cell<JettonClient>
 >     pendingReleases: map<uint64, Cell<LockReleaseTokenPool_PendingRelease>>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: CellRef<TokenPool_Data>
    jettonClient: CellRef<JettonClient>
    pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseTokenPool_PendingRelease>>
}

export const Storage = {
    create(args: {
        poolData: CellRef<TokenPool_Data>
        jettonClient: CellRef<JettonClient>
        pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseTokenPool_PendingRelease>>
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
            jettonClient: loadCellRef<JettonClient>(s, JettonClient.fromSlice),
            pendingReleases: c.Dictionary.load<uint64, CellRef<LockReleaseTokenPool_PendingRelease>>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseTokenPool_PendingRelease>>(
                (s) => loadCellRef<LockReleaseTokenPool_PendingRelease>(s, LockReleaseTokenPool_PendingRelease.fromSlice),
                (v,b) => storeCellRef<LockReleaseTokenPool_PendingRelease>(v, b, LockReleaseTokenPool_PendingRelease.store)
            ), s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
        storeCellRef<JettonClient>(self.jettonClient, b, JettonClient.store);
        b.storeDict<uint64, CellRef<LockReleaseTokenPool_PendingRelease>>(self.pendingReleases, c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<LockReleaseTokenPool_PendingRelease>>(
            (s) => loadCellRef<LockReleaseTokenPool_PendingRelease>(s, LockReleaseTokenPool_PendingRelease.fromSlice),
            (v,b) => storeCellRef<LockReleaseTokenPool_PendingRelease>(v, b, LockReleaseTokenPool_PendingRelease.store)
        ));
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
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
//    class LockReleaseTokenPool
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

export class LockReleaseTokenPool implements c.Contract {
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
        'Error.PendingReleaseAlreadyExists': 26301,
        'RateLimiter_Error.TokenRateLimitReached': 26302,
        'Error.PendingReleaseNotFound': 26302,
        'Error.UnexpectedReleaseConfirmationSender': 26303,
        'Error.UnexpectedReleaseBounce': 26304,
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
            throw new Error(`Custom pack/unpack for 'LockReleaseTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new LockReleaseTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: CellRef<TokenPool_Data>
        jettonClient: CellRef<JettonClient>
        pendingReleases: c.Dictionary<uint64, CellRef<LockReleaseTokenPool_PendingRelease>>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? LockReleaseTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new LockReleaseTokenPool(address, initialState);
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
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }) {
        return TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
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
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }) {
        return TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
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

    static createCellOfTokenPoolUpdateCursedSubjects(body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }) {
        return TokenPool_UpdateCursedSubjects.toCell(TokenPool_UpdateCursedSubjects.create(body));
    }

    static createCellOfLockReleaseTokenPoolInMessage(body: LockReleaseTokenPool_InMessage) {
        return LockReleaseTokenPool_InMessage.toCell(body);
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
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
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
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
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

    async sendTokenPoolUpdateCursedSubjects(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_UpdateCursedSubjects.toCell(TokenPool_UpdateCursedSubjects.create(body)),
            ...extraOptions
        });
    }

    async sendLockReleaseTokenPoolInMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: LockReleaseTokenPool_InMessage, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: LockReleaseTokenPool_InMessage.toCell(body),
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

    async getPendingOwner(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('pendingOwner', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }
}
