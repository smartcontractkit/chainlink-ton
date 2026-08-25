// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a MockTokenPool contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

type array<T> = T[]

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
}

// ————————————————————————————————————————————
//   custom packToBuilder and unpackFromSlice
//

type CustomPackToBuilderFn<T> = (self: T, b: c.Builder) => void
type CustomUnpackFromSliceFn<T> = (s: c.Slice) => T

let customSerializersRegistry: Map<string, [CustomPackToBuilderFn<any> | null, CustomUnpackFromSliceFn<any> | null]> = new Map;

function ensureCustomSerializerRegistered(typeName: string) {
    if (!customSerializersRegistry.has(typeName)) {
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'MockTokenPool.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > MockTokenPool.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint120 = bigint
type uint128 = bigint
type uint256 = bigint

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
 > struct TokenPool_AdminConfig {
 >     ownable: Cell<Ownable2Step>
 >     rmnProxy: address?
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
    rmnProxy: c.Address | null
    dynamicConfig: TokenPool_DynamicConfig
    jettonClient: JettonClient
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
    advancedPoolHooks: c.Address | null /* = null */
    deployableCode: c.Cell | null /* = null */
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: Ownable2Step
        rmnProxy: c.Address | null
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
            rmnProxy: s.loadMaybeAddress(),
            dynamicConfig: loadCellRef<TokenPool_DynamicConfig>(s, TokenPool_DynamicConfig.fromSlice),
            jettonClient: JettonClient.fromSlice(s),
            allowedFinalityConfig: s.loadUintBig(32),
            advancedPoolHooks: s.loadMaybeAddress(),
            deployableCode: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        b.storeAddress(self.rmnProxy);
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
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: TokenPool_AdminConfig
    localPolicy: TokenPool_LocalPolicy
    tokenDecimals: uint8
    remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
    tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: TokenPool_AdminConfig
        localPolicy: TokenPool_LocalPolicy
        tokenDecimals: uint8
        remoteChainConfigs: Map<uint64, TokenPool_RemoteChainConfig> /* = [] as map<uint64, TokenPool_RemoteChainConfig> */
        tokenTransferFeeConfigs: Map<uint64, TokenPool_TokenTransferFeeConfig> /* = [] as map<uint64, TokenPool_TokenTransferFeeConfig> */
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
            localPolicy: loadCellRef<TokenPool_LocalPolicy>(s, TokenPool_LocalPolicy.fromSlice),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: dictToMap(c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s)),
            tokenTransferFeeConfigs: dictToMap(c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s)),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_LocalPolicy>(self.localPolicy, b, TokenPool_LocalPolicy.store);
        b.storeUint(self.tokenDecimals, 8);
        b.storeDict<uint64, TokenPool_RemoteChainConfig>(mapToDict(self.remoteChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store));
        b.storeDict<uint64, TokenPool_TokenTransferFeeConfig>(mapToDict(self.tokenTransferFeeConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store)), c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store));
    },
    toCell(self: TokenPool_Data): c.Cell {
        return makeCellFrom<TokenPool_Data>(self, TokenPool_Data.store);
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
 >     allowedDepositNamespaces: map<uint32, bool>
 > }
 */
export interface TokenPool_SetAllowedDepositNamespaces {
    readonly $: 'TokenPool_SetAllowedDepositNamespaces'
    queryId: uint64
    allowedDepositNamespaces: Map<uint32, boolean>
}

export const TokenPool_SetAllowedDepositNamespaces = {
    PREFIX: 0x84384142,

    create(args: {
        queryId?: uint64
        allowedDepositNamespaces: Map<uint32, boolean>
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
            allowedDepositNamespaces: dictToMap(c.Dictionary.load<uint32, boolean>(c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool(), s)),
        }
    },
    store(self: TokenPool_SetAllowedDepositNamespaces, b: c.Builder): void {
        b.storeUint(0x84384142, 32);
        b.storeUint(self.queryId, 64);
        b.storeDict<uint32, boolean>(mapToDict(self.allowedDepositNamespaces, c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool()), c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool());
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
 > struct (0x9929b642) TokenPool_SetRMNProxy {
 >     queryId: uint64
 >     rmnProxy: address?
 > }
 */
export interface TokenPool_SetRMNProxy {
    readonly $: 'TokenPool_SetRMNProxy'
    queryId: uint64
    rmnProxy: c.Address | null
}

export const TokenPool_SetRMNProxy = {
    PREFIX: 0x9929b642,

    create(args: {
        queryId?: uint64
        rmnProxy: c.Address | null
    }): TokenPool_SetRMNProxy {
        return {
            $: 'TokenPool_SetRMNProxy',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRMNProxy {
        loadAndCheckPrefix32(s, 0x9929b642, 'TokenPool_SetRMNProxy');
        return {
            $: 'TokenPool_SetRMNProxy',
            queryId: s.loadUintBig(64),
            rmnProxy: s.loadMaybeAddress(),
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
        queryId?: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_SetCursedSubjects {
        return {
            $: 'TokenPool_SetCursedSubjects',
            ...args,
            queryId: args.queryId ?? 0n
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
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address | null
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
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
 > struct (0x4129d109) TokenPool_PreflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     amountPostFee: coins
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PreflightCheck {
    readonly $: 'TokenPool_PreflightCheck'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    amountPostFee: coins
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PreflightCheck = {
    PREFIX: 0x4129d109,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        amountPostFee: coins
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PreflightCheck {
        return {
            $: 'TokenPool_PreflightCheck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheck {
        loadAndCheckPrefix32(s, 0x4129d109, 'TokenPool_PreflightCheck');
        return {
            $: 'TokenPool_PreflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            tokenArgs: s.loadBoolean() ? s.loadRef() : null,
            amountPostFee: s.loadCoins(),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PreflightCheck, b: c.Builder): void {
        b.storeUint(0x4129d109, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeTolkNullable<c.Cell>(self.tokenArgs, b,
            (v,b) => b.storeRef(v)
        );
        b.storeCoins(self.amountPostFee);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PreflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheck>(self, TokenPool_PreflightCheck.store);
    }
}

/**
 > struct (0x703c2b58) TokenPool_PostflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     localAmount: coins
 >     requestedFinalityConfig: uint32
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PostflightCheck {
    readonly $: 'TokenPool_PostflightCheck'
    queryId: uint64
    request: TokenPool_ReleaseOrMintInV1
    localAmount: coins
    requestedFinalityConfig: uint32
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PostflightCheck = {
    PREFIX: 0x703c2b58,

    create(args: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        localAmount: coins
        requestedFinalityConfig: uint32
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PostflightCheck {
        return {
            $: 'TokenPool_PostflightCheck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheck {
        loadAndCheckPrefix32(s, 0x703c2b58, 'TokenPool_PostflightCheck');
        return {
            $: 'TokenPool_PostflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            localAmount: s.loadCoins(),
            requestedFinalityConfig: s.loadUintBig(32),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PostflightCheck, b: c.Builder): void {
        b.storeUint(0x703c2b58, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeCoins(self.localAmount);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PostflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheck>(self, TokenPool_PostflightCheck.store);
    }
}

/**
 > struct (0xc5476d2b) TokenPool_GetCCVs {
 >     queryId: uint64
 >     localToken: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     requestedFinalityConfig: uint32
 >     direction: uint8
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
    direction: uint8
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
        direction: uint8
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
            direction: s.loadUintBig(8),
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
        b.storeUint(self.direction, 8);
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
 >     direction: uint8
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
    direction: uint8
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
        direction: uint8
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
            direction: s.loadUintBig(8),
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
        b.storeUint(self.direction, 8);
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
 > struct (0x30612b17) TokenPool_QueryCCVsReply {
 >     queryId: uint64
 >     requiredCCVs: SnakedCell<address>
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_QueryCCVsReply {
    readonly $: 'TokenPool_QueryCCVsReply'
    queryId: uint64
    requiredCCVs: SnakedCell<c.Address>
    replyPayload: c.Cell | null
}

export const TokenPool_QueryCCVsReply = {
    PREFIX: 0x30612b17,

    create(args: {
        queryId?: uint64
        requiredCCVs: SnakedCell<c.Address>
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
            requiredCCVs: loadSnakedCellOf(s, (s) => s.loadAddress()),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_QueryCCVsReply, b: c.Builder): void {
        b.storeUint(0x30612b17, 32);
        b.storeUint(self.queryId, 64);
        storeSnakedCellOf(self.requiredCCVs, b, (v, b) => b.storeAddress(v));
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
        queryId?: uint64
        errorCode: uint16
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
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintFinished = {
    PREFIX: 0xe0e882f5,

    create(args: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintFinished {
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            ...args,
            queryId: args.queryId ?? 0n
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
        queryId?: uint64
        errorCode: uint16
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
 > struct (0xe5d08b2e) TokenPool_RMNProxySet {
 >     queryId: uint64
 >     rmnProxy: address?
 > }
 */
export interface TokenPool_RMNProxySet {
    readonly $: 'TokenPool_RMNProxySet'
    queryId: uint64
    rmnProxy: c.Address | null
}

export const TokenPool_RMNProxySet = {
    PREFIX: 0xe5d08b2e,

    create(args: {
        queryId?: uint64
        rmnProxy: c.Address | null
    }): TokenPool_RMNProxySet {
        return {
            $: 'TokenPool_RMNProxySet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_RMNProxySet {
        loadAndCheckPrefix32(s, 0xe5d08b2e, 'TokenPool_RMNProxySet');
        return {
            $: 'TokenPool_RMNProxySet',
            queryId: s.loadUintBig(64),
            rmnProxy: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_RMNProxySet, b: c.Builder): void {
        b.storeUint(0xe5d08b2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.rmnProxy);
    },
    toCell(self: TokenPool_RMNProxySet): c.Cell {
        return makeCellFrom<TokenPool_RMNProxySet>(self, TokenPool_RMNProxySet.store);
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
        queryId?: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_CursedSubjectsSet {
        return {
            $: 'TokenPool_CursedSubjectsSet',
            ...args,
            queryId: args.queryId ?? 0n
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
 > struct JettonWithdrawable_FeeTokenWithdrawn {
 >     wallet: address
 >     amount: coins
 > }
 */
export interface JettonWithdrawable_FeeTokenWithdrawn {
    readonly $: 'JettonWithdrawable_FeeTokenWithdrawn'
    wallet: c.Address
    amount: coins
}

export const JettonWithdrawable_FeeTokenWithdrawn = {
    create(args: {
        wallet: c.Address
        amount: coins
    }): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            wallet: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonWithdrawable_FeeTokenWithdrawn, b: c.Builder): void {
        b.storeAddress(self.wallet);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonWithdrawable_FeeTokenWithdrawn): c.Cell {
        return makeCellFrom<JettonWithdrawable_FeeTokenWithdrawn>(self, JettonWithdrawable_FeeTokenWithdrawn.store);
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
 >     allowedDepositNamespaces: map<uint32, bool>
 > }
 */
export interface TokenPool_DynamicConfig {
    readonly $: 'TokenPool_DynamicConfig'
    router: c.Address
    rateLimitAdmin: c.Address | null /* = null */
    feeAdmin: c.Address | null
    allowedDepositNamespaces: Map<uint32, boolean> /* = [] as map<uint32, bool> */
}

export const TokenPool_DynamicConfig = {
    create(args: {
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin: c.Address | null
        allowedDepositNamespaces: Map<uint32, boolean> /* = [] as map<uint32, bool> */
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
            allowedDepositNamespaces: dictToMap(c.Dictionary.load<uint32, boolean>(c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool(), s)),
        }
    },
    store(self: TokenPool_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
        b.storeDict<uint32, boolean>(mapToDict(self.allowedDepositNamespaces, c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool()), c.Dictionary.Keys.BigUint(32), c.Dictionary.Values.Bool());
    },
    toCell(self: TokenPool_DynamicConfig): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfig>(self, TokenPool_DynamicConfig.store);
    }
}

/**
 > struct TokenPool_LocalPolicy {
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_LocalPolicy {
    readonly $: 'TokenPool_LocalPolicy'
    cursedSubjects: CursedSubjects
}

export const TokenPool_LocalPolicy = {
    create(args: {
        cursedSubjects: CursedSubjects
    }): TokenPool_LocalPolicy {
        return {
            $: 'TokenPool_LocalPolicy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LocalPolicy {
        return {
            $: 'TokenPool_LocalPolicy',
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_LocalPolicy, b: c.Builder): void {
        CursedSubjects.store(self.cursedSubjects, b);
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
 > }
 */
export interface TokenPool_ChainAdded {
    readonly $: 'TokenPool_ChainAdded'
    remoteChainSelector: uint64
    remoteTokenAddress: CrossChainAddress
}

export const TokenPool_ChainAdded = {
    create(args: {
        remoteChainSelector: uint64
        remoteTokenAddress: CrossChainAddress
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
 > struct RateLimiter_Config {
 >     isEnabled: bool
 >     capacity: uint120
 >     rate: uint120
 > }
 */
export interface RateLimiter_Config {
    readonly $: 'RateLimiter_Config'
    isEnabled: boolean
    capacity: uint120
    rate: uint120
}

export const RateLimiter_Config = {
    create(args: {
        isEnabled: boolean
        capacity: uint120
        rate: uint120
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
            capacity: s.loadUintBig(120),
            rate: s.loadUintBig(120),
        }
    },
    store(self: RateLimiter_Config, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 120);
        b.storeUint(self.rate, 120);
    },
    toCell(self: RateLimiter_Config): c.Cell {
        return makeCellFrom<RateLimiter_Config>(self, RateLimiter_Config.store);
    }
}

/**
 > struct RateLimiter_TokenBucket {
 >     tokens: uint120
 >     lastUpdated: uint64
 >     isEnabled: bool
 >     capacity: uint120
 >     rate: uint120
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint120
    lastUpdated: uint64
    isEnabled: boolean
    capacity: uint120
    rate: uint120
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint120
        lastUpdated: uint64
        isEnabled: boolean
        capacity: uint120
        rate: uint120
    }): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            tokens: s.loadUintBig(120),
            lastUpdated: s.loadUintBig(64),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(120),
            rate: s.loadUintBig(120),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 120);
        b.storeUint(self.lastUpdated, 64);
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 120);
        b.storeUint(self.rate, 120);
    },
    toCell(self: RateLimiter_TokenBucket): c.Cell {
        return makeCellFrom<RateLimiter_TokenBucket>(self, RateLimiter_TokenBucket.store);
    }
}

// ————————————————————————————————————————————
//    class MockTokenPool
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

export class MockTokenPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECnQEAJzYAART/APSkE/S88sgLAQICzQIDAgEgBAUAH9TFsIiFus5THBcMAkltw4oCASAGBwIBIGBhAgEgCAkCASATFAIBIAoLAgEgDxACASAMDQGpXtou371ywnkNvtDI5E1ywnzxTyVJRbcNsx4YIAwoojbrPy9CGCAMKKBMcFE/L0IG0D1ws/iwIByMs/FfpSEvpSycjPhyAUznHPC2ETzMlw+wDjDX+A4AxT4kfJA7UTQ1NEg0NTU0wf0BPQE0W1tbW1tbW1tbW1tgQCH+JL4lxESERMREhERERIREREQEREREA8REA8Q71YU8Aps0Y4SNQPIzBLMywf0APQAycjMye1U4F8FhA8BxwDy9IABpCDCTZMwcHHgcXqTIsIAjiAicbDAAZyE/yKpBCG+8oRmqAHeAqsAIMIAlFEgqALeAugwMXCAAZmwS0z/6SDCCAMKIUTTHBRPy9IIAwolTI8cFs/L0IYsCyM+HIM5wzwthEss/EvpSyXD7AABXUhbpJbcOCCaQAAAAAAAAAAAAAAAAAAASKDBvQOb6Exklt/4AGDBvQOb6ExgCASAREgCPDAjs5F/lSDAAMMA4pEw4FNS+CMnoRBoXjQQN0iAUoDwCDVRZbmVgT+t8vDgUzS5jhBfBSCVgT+u8vDhMIE/rvLw4FA0oVA0gAFkMCOzkX+VIMAAwwDikTDgU1L4IyehEGheNBA3SIBSgPAINVBFoFAFtghERAOACASAkJQIBIBUWAgEgFxgCASAhIgH1CbDAJUrbrPDAJFw4psGERIGK9p2BRERBeAj0NP/1NEg0NM/+kgx+gD6SDCBOj1WHdDUMfpQMdQx+kgwWMcF8vSBOjkiVhqAQPQOb6Ex8vRWG1YbVhtWG1YbVhtWG1YbVhtWG1YbVhtWG1YbVhtWG1YbVhtWE/ANVhsCgGQBNFD+Xww0NYE6OgTQ9ATRIfAFsxTy9MMAlSBus8MAkXDiktog4F8DgA/5WGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwJWGwIBERUBERRWGPAOZqEl4w+BOjhRMYBA9A5voRTy9ALU9AQx1DHUMdFWGMjL/8nIz5Pp9pESKc8LPyjPFCfPCx9SYPQAUlD6VMnIJPoCGhscAv5WGtDUMfpQMdQx+kgx1DHTH/pQMfQEMdFSYPAJgTo4I1YZgED0Dm+hEvL01PQE1NTR0NTU0QHQ03fTP9IA03fTd9EijjNWI9DUMfpQMdQx+kgwUqDwBgTIy3cTyz/KAMt3y3fJyMzMyQPIzBL0AMzMUjIRGYBA9EPjDlYa0NQxHR4B/oE6OCNWGYBA9A5voRLy9NT0BNTU0QHQ1NTRAdDTd9M/0gDTd9N30VYj0NQx+lAx1DH6SDBSoPAGBMjLdxPLP8oAy3fLd8nIzMzJA8jMEvQAEszMUjIRGYBA9ENWGtDUMfpQMdQx+kgwI8jLP/pSVhj6AsnIz48YAASCEM9QWfwgAMZWGvoCI88UIs8UyStWHglWHglWHlGQCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCVYeCQgRHggHER0HBhEcBgURGwUEER4EAxEdA1nwDwIREwJQRAMB9l8JgTo4I1YZgED0Dm+hEvL01PQE1NTRAdDU1NEB0NN30z/SANN303fRViPQ1DH6UDHUMfpIMFKg8AYEyMt3E8s/ygDLd8t3ycjMzMkDyMwS9AASzMxSMhEZgED0Q1Ya0NQx+lAx1DH6SDAjyMs/+lJWGPoCycjPjxgABB8AVvpQMdQx+kgwI8jLP/pSVhj6AsnIz48YAASCEOukjAvPC/dxzwthzMlw+wAAJIIQz1BZ/M8L93HPC2HMyXD7AAAYzwv3cc8LYczJcPsAAJcVxFXEV8OMzPQ0z/6SDH6ADACgED0Dm+hk18DcOHTHzHTHzH6ADH6ADHTD9MP0gDRk18EcOEDkTCRMuKBOjQigScQufL0qIEnEKkEgAZcODk5OTo6Ojo6Ojo7Ozs7BMMAlShus8MAkXDinToQSQgQR0YVRBMC2pHgNTY2B9DUMfpQMdQx+kgx1DHTHzH6UPQEMdEgbuMDXwhwgIwCYJdD6ADH6ANQx1DHR+CgFyPpSE8wWzMnIz5EEp0QmFcs/EswWyx8U9ABQBPoCEvpSEvQAycjPhYgS+lLPhBBz+gJxzwtlzMmAQPsAfwIBICYnAgEgKCkANQgjhU2XLyVgT+s8vDgUVKooBS2CPgjUETgW4AApCGRW+GBOkkhlAK6wwCTbCFw4vL0gA2c7aLt+yDXLCfT7SIknmwh0z/U0x/0BPpQMPALj5TXLCBHl/28jwnXLCU2/TEc4w/jDeJ/gKissAfEVhfQ1DH6UDHU+kgx1DHTHzH6UDH0BDHR0PpI+lAx+lAx9AQx0SaBOj4CxwXy9CbDAJUsbrPDAJFw4pgGERIGLNpxDOAREREXEREREBEWERAPERUPDhEUDg0REw0MERIMCxEXCwoRFgoJERUJCBEUCAcREwcGERIGgXgP4bCHTPzHXTFYT0NQx+lAx1DH6SDHUMdMfMfpQ9AQx0YE6PiFus5UDxwXDAJMxMnDiEvL00PpIMdTU0SHQ1ywn0+0iJPK/0z8x1NcLHwHQ0/8x10zQAtAC1ws/AvoAMfoAMAHjD9DXLCfT7SIk8r/TP9Qx0x8x9AH6UDAgbi0uLwPa1ywjmxaE5I4SMdM/+gD6UFUD8YAQgBmAEts4j8/XLCGo+78cnGwh0z/U0x/6UDDwFI+41ywk8VNbNI8t1ywhDzjsPI6i1ywmKjtpXI4XbCHTP/pI0z/6ANMf0wf0BPpI9AVt8BvjDuMN4w3i4jM0NQL+bCHTPzHXTFYT0NQx+lAx1DH6SDHUMdMfMfpQ9AQx0YE6PiFus5UDxwXDAJMxMnDiEvL00PpI1NTRAdAB0AHXLCfT7SIk8r/TP9TTH/QE+lAwBfoA+gDU10zIz5Pp9pESKM8LPxfMFcsfE/QAUmD6VMnIWPoCWPoCEswSzMnIiVxdAvyBOjgiVhOAQPQOb6ES8vTU9ATU1NEg0NTU0QHQ03fTP9IA03fTd9EijjhfBgHQ1NTRAdDTd9M/0gDTd9N30VYd0NQx+lAx1DH6SDBSoPAHBMjLdxPLP8oAy3fLd8nIzMzJAeMNA8jMEvQAzMxSIhETgED0Q1YU0NQx+lAx1DEwMQH2gTo4IlYTgED0Dm+hEvL01PQE1NTRAdDU1NEB0NN30z/SANN303fRVh3Q1DH6UDHUMfpIMFKg8AcEyMt3E8s/ygDLd8t3ycjMzMkDyMwS9AASzMxSIhETgED0Q1YU0NQx+lAx1DH6SDACyMs/EvpSARER+gLJyM+PGAAEMgA+kVuOGsjPhQj6UoIQNHbqcs8Ljss/z4jpFsmAQPsA4gBWNlYd0NQx+lAx1DH6SDAQRRA0QTBUJqDwBwTIy3cTyz/KAMt3y3fJyMzMyQBQ+kgwAsjLPxL6UgEREfoCycjPjxgABIIQFB9+LM8L93HPC2HMyXD7AAAkghAw66vbzwv3cc8LYczJcPsABP7XLCaRSiasjmBsIdM/+kjTP/oA0x/TB/QE9AVWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWF1YXVhdWF/AdCMjLHxfLH1AF+gJQA/oCyw/LD8oAAfoCygDJ+ChZ8BuPlNcsIYMJWLyPCdcsIre56bzjD+MNNjc4OQP2bCHTPzHXTFYT0NQx+lAx1DH6SDHUMdMfMfpQ9AQx0YE6PiFus5UDxwXDAJMxMnDiEvL00PpIMdTU0SHQ1ywhqPu/HPK/0z8x1NcLHwHQ0/8x10zQAtAC+kgx1ws/AtMfMfoAMAHjD9DXLCGo+78c8r/TP9MfMfpQMCBuVldYAL5sIdM/MddMVhPQ1DH6UDHUMfpIMdQx0x8x+lD0BDHRgTo+IW6zlQPHBcMAkzEycOIS8vTQ+kjU1NEB0AHQAdcsIaj7vxzyv9M/1NMf+lAwBNMf+gD6ADAQVhBFEDTwGgP+bCHTP9TXTFYV0NT6UDHUMfpIMdQx0x8x+lAx9AQx0dD6SPpQMdEkggDCiALHBfL0AdCUIMcAs44/INdLAZEwm4E0vAHAAfL010zQ4tM/UhARFIBA9FuBOjgB8vTIz48YAASCECeQgovPC/dwzwthEss/yXD7ABES6DDQioroMDo7PAMo1ywgvhIW5I8J1ywiE1xmJOMP4w1AQUIA+mwh0z/U9AVWFdDUMfpQMdQx+kgx1DHTHzH6UPQEMdGBOj4hbrOVBccFwwCTMTRw4hTy9IE6RiNus/L0AtD6SPQE9AUgbo4QMMjPkbHCy3YTyz8TzPQAyY4SyM+QVjdfVhTLPxTMEswS9ADJ4sjPhQgS+lJxzwtuzMmAQPsAAALiAAggxwCzAf4g10sBkTCbgTS8AcAB8vTXTNDi0z/U1NSBOjcj0NMHIcFB8oUBqgLXGNHXScMA8vSBOjslVheAQPQOb6Exs/L0AdDU1NFtAtDSANN303fR+CMiyMt3yz8TygDLd8t3yQHQ0gDTd9N30fgjIsjLd8s/E8oAy3fLd8kByMzMyfgjPQAuyM+FCBL6UoIQrXgz188Ljss/yYBA+wABtHDIy3fLP3DPC/DJ+CNwyMt3yz9wzwvwyQHIzMzJJAbQlCDHALOK6DAFyMwS9ADME8xSMhEVgED0Q8jPjxgABIIQ7TfEvM8L93DPC2ETyz8BERMBzMlw+wARET4B/iDXSwGRMJuBNLwBwAHy9NdM0OLTByHBQfKFAaoC1xjIItdJIKk4AvJFqwIgwUHyhc8LBxLOyYE6NyHQ0wchwUHyhQGqAtcY0ddJwwDy9CD5AIE6P1MWgwf0Dm+hMbPy9FRBFoMH9BfIz48YAASCEL8NGrbPC/dwzwthKc8LPxU/AArMyXD7AAH2bCHTP9M/10xWFdDU+lAx1DH6SDHUMdMfMfpQMfQEMdHQ+kj6UDHRJIIAwogCxwXy9IE6OCJWFIBA9A5voTHy9IE6OCJWFIBA9A5voRLy9NT0BNTU0ST5AFADgwf0W4E6QAHy9APIzBP0ABLMzFIiERSAQPRDyM+PGAAEQwLq1ywmu4lAhI7q1ywh4oUc3I5fbCHTP9cLHxEU0NT6UNT6SNTTHzH6UPQE0SbQ+kj6UDHRKYIAwogCxwXy9FYaB8jMFvpUFMwS+lLME8sfEvpU9ADJyM+FCBP6UoIQQmpxO88Ljss/ARETAcsfyYBA+wDjDuMNREUB/mwh0z/TP9dMVhXQ1PpQMdQx+kgx1DHTHzH6UDH0BDHR0PpI+lAx0SSCAMKIAscF8vSBOjgiVhSAQPQOb6Ex8vSBOjgiVhSAQPQOb6ES8vTU9ATU1NGBOjcl0NMHIcFB8oUBqgLXGNHXScMA8vQk+QCBOj9TFIMH9A5voTGz8vRVAHCCELwUx+jPC/dwzwthIs8LP1YTzxTJcPsAyM+FCBT6UoIQ4XvzzM8LjhLLP8s/AREQAczJgED7AAP41ywh+uT6vI9x1ywhw0cYTI5cbCHTP/QFERTQ1PpQ1PpI1NMf+lD0BDHRJtD6SPpQMdEpggDCiALHBfL0VhoHyMwW+lQUzBL6UszLH/pU9ADJyM+FCBP6UoIQidYC5c8Ljss/ARETAfQAyYBA+wCPCdcsJCHCChTjD+LjDUZHSAH6bCHTP/pI+lD6UDARFtDU+lDUMfpI1NMf+lD0BNEm0PpI+lAx0SuCAMKIAscF8vSBOjeLAirHBbPy9G0pyPpSUpD6VFYeAfpU9ADJB8jMFvpUFswT+lLMyx8S+lT0AMnIz5Lc14wyFMs/EvpS+lQBERQB+lTJyM+FCBL6UnFUAPRsIdM/9AURFNDU+lDU+kjU0x/6UPQE0SfQ+kj6UDHRKoIAwogCxwXy9AXQ+kj6UPpQ9AQx0QLI+lL6VPpUAREbAfQAyQbIzBX6VBXM+lITzMsfAREVAfpUAREUAfQAycjPhQgS+lKCEMH/46bPC44BERMByz/JgED7AAP81ywifxaTZI9z1ywhhQ6PvI7o1ywkyU2yFI5dbCHTP/pQMBEU0NT6UDHU+kjU0x/6UPQE0SbQ+kj6UDHRKYIAwogCxwXy9FYaB8jMF/pUFcwT+lLMyx/6VPQAycjPhQgT+lKCEOXQiy7PC47LPwEREwH6VMmAQPsA4w7jDeMNSUpLALxsIdM/+lAwERTQ1PpQ1PpI1NMf+lAx9ATRJtD6SPpQMdEpggDCiALHBfL0VhoHyMwW+lQUzBL6UszLHxL6VPQAycjPhQgT+lKCEDyGnYDPC47LPwEREwH6VMmAQPsAAfLXLCTtJtBMjm5sIdM/9AVWFNDU+lDUMfpIMdQx0x8x+lAx9AQx0QHQ+kj6UDHRJIE6PgLHBZIxf44QIW6zllJCxwXDAJIxcOLDAOLy9BET0PQEMdFWEsj0AMnIz4UIE/pSghAVgAFhzwuOyz8BERIB9ADJgED7AOMOTAL+bCHTP9TXTFYV0NT6UDHUMfpIMdQx0x8x+lAx9AQx0dD6SPpQMdEkggDCiALHBfL0AdCUIMcAs4roMNCUIMcAs446INdLAZEwm4E0vAHAAfL010zQ4tM/UhAREoBA9FswyM+PGAAEghDWRsfRzwv3cM8LYRLLP8lw+wAREOgwyE5PAdRsIdM/10xWFNDU+lAx1PpIMdQx0x8x+lAx9AQx0dD6SPpQ+lD0BNEE0PpI+lAx0ZLwHgBUJYDsXySBOj4DxwWSMH+U2gHDAOLy9NCUIMcAs4roMMjPhQgS+lKCEN17DHHPC47LP8mAQPsAUQHu1ywgaATK5I5UMDFWE9DU+lDU+kjU0x/6UPQE0QfQ+kj6UNFBCinwA44qOFcaERnI+lIW+lTJyMwT+lTM+lISzAERFAHLH/pUARESAfQAyRERf9sx4BCJXwnHANsx4THTP28AAdMH9AWTIG6ziugwIW+IuvKJ8B9NAFrQ9ASOJvpI+gDXLCB8U/Us8r/TP/oA+kj6UPQE+gCLCAxVgG8Jb4wjxwAU5jAB/iDXSwGRMJuBNLwBwAHy9NdM0OLTP9Mf0x/6APoA0w/TD9IAgTo4KVYcgED0Dm+hMfL0gTo1IvL0gTo0JIEnELny9IE6NCOBJxC58vSBOjUowgDy9CfIyx8nzwsfJvoCJfoCJM8LDyPPCw8izwoAUpIRG4BA9EMHyMsfFssfUARQASyJzxYS+lKCECjLzGTPC47LP8mAQPsAkABU+gJY+gLLD8sPygDJyM+PGAAEghD75h8Vzwv3cM8LYRPLPxLMyXD7ABERAvwg10sBkTCbgTS8AcAB8vTXTNDi0z/SANTUgTo4JVYXgED0Dm+hEvL01PQE1NTRJ44/AdDUMdQx0SXQ0gDTd9N30fgjIsjLd8s/E8oAy3fLd8kl0NIA03fTd9H4IyLIy3fLPxPKAMt3y3fJAcjMzMkB4w0DyMwS9ADMzFJSERdSUwB60NQx1DHRJdDSANN303fR+CMiyMt3yz8TygDLd8t3ySXQ0gDTd9N30fgjIsjLd8s/E8oAy3fLd8kByMzMyQBKgED0Q8jPjxgABIIQ/52/ds8L93DPC2EVyz8TygDMzMlw+wAREQASzwtuzMmAQPsAAKpURRSDB/QXyM+PGAAEghC/DRq2zwv3cM8LYSbPCz8lzxTJcPsAA8jME/QAEszMUiIRFIBA9EPIz4UIFPpSghASzEmFzwuOEss/yz8BERABzMmAQPsAAv6BOjgiVhOAQPQOb6ES8vTU9ATU1NEg0NTU0dDTd9M/0gDTd9N30SKOOF8GAdDU1NHQ03fTP9IA03fTd9FWHdDUMfpQMdQx+kgwUqDwBwTIy3cTyz/KAMt3y3fJAcjMzMkB4w0DyMwS9ADMzFIiEROAQPRDVhTQ1DH6UDHUMfpIWVoB9oE6OCJWE4BA9A5voRLy9NT0BNTU0QHQ1NTR0NN30z/SANN303fRVh3Q1DH6UDHUMfpIMFKg8AcEyMt3E8s/ygDLd8t3yQHIzMzJA8jMEvQAEszMUiIRE4BA9ENWFNDUMfpQMdQx+kgwAsjLPxL6UgEREfoCycjPjxgABFsAPpFbjhrIz4UI+lKCEO8Ms27PC47LP8+I6RbJgED7AOIAWDZWHdDUMfpQMdQx+kgwEEUQNEEwVCag8AcEyMt3E8s/ygDLd8t3yQHIzMzJAEwwAsjLPxL6UgEREfoCycjPjxgABIIQNH/8fM8L93HPC2HMyXD7AAAkghB0Ca2Pzwv3cc8LYczJcPsAAAjno1BBADzPFhPLPxT6UhPMEszJyM+FiBL6UnHPC27MyYBA+wAB/gURFwUEERYEAxEVAwIRFAIBERMBERJWF1YXVhdWF1YXVhfwDASOIF8EVxJXElcSVxJXElcSCxERCwoREAoQnxCOEH0QbFVV4MjPk+n2kRJWG88LPwERGgHMAREYAcsfAREWAfQAVhQB+lTJyAERFvoCAREW+gIBERYBzAERFAFfAJzMycjPk56NQQYBERYByz8BERYB+lIBEREBzAEREwHMycjPhYgf+lJxzwtuHszJgED7AAsREQsKERAKEJ8QjhB9EGwQWxBKEDlIFkVVBwMCASBiYwIBIIGCAgEgZGUCASBxcgIBIGZnAgEgbm8C9QmwwCVKW6zwwCRcOKZMAUREQUo2mEM4IE6PlYY0NQx+lAx1DH6SNdM+CjIz4QC+lIS+lLJAcjPhNDMzPkWyM+KAEDL/89QJ8cF8vRWF1YXVhdWF1YXVhdWF1YXVhdWF1YXVhdWF1YXVhdWF1YXVhdWF1YXVhdWF1YXioGhpAY07aLt+1cSVxBfDyLQ1DH6UDHU+kgx1DHTHzH6UDH0BDHR0PpI+lAx+lAx9ATRUyHHBZJfBeAggCD0hm+lMpEBiuiBOj7y8IG0ABlvwEwP+7eO6gBd/7RGPcSH0BCFumDEgxwCSMG3gktHQ4vpI1NTRVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBVhoBERpWGIrt47qAGX/tEYrtQe3xAfL/7UHt8WprbACoMRBHEDZFdvAT+CdvEFMBvJGikltw4vgvoHL7AgHQ1ywn0+0iJPK/0z/UMdMfMfQB+lAwIG6SXwOOGcjPhQj6UoIQNHbqcs8Ljss/yw/JgQCC+wDiANQg0NcsJ9PtIiTyv9dM0NP/MddM0NM/MfpI+gAwgTpIURi68vSBOkcmbrPy9FYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYaAVYXAfARWPASAAYB8v8AnlMF0NQx+lAx1DH6SDHUMdMfMfpQMfQE0YE6PiFus/L0JMj6UhLLH1Jg+lLJAcjPhNDMzPkWyM+KAEDL/89QJMcFlF8G2zHgIYAg9HxvpTIB9QowwCVKm6zwwCRcOKYCBEUCCrakQzgbDMzMwLQAdAB1ywn0+0iJPK/0z/U0x8x9AH6UDAB0NP/MdTR0NQx0z/6SDH6ADH6SNEE+gAx+gDU10wGyPpSF/pSIfoCycjPjxgABIIQN91vbs8L93DPC2ETyz8SzMlw+wAhboHAAgwwIG6SXwTgghAF9eEAbYsEyM+QPin6lhbLP1AE+gJSIPpSEvpUEvQAz4QgEs7JyM+FCBP6UgH6AnHPC2rMyXP7AIABOkl8FjiEEyMwTzMnIz4WIE/pSghD0MqTjzwuOyz/MAfoCyYBA+wDiAgEgc3QCASB/gAH3FYW0NQx+lAx1PpIMdQx0x8x+lAx9AQx0dD6SPpQMfpQMfQEMdElgTo+AscF8vQlwwCVL26zwwCRcOKbNAQREARVAi7aUQzgERERFhERERARFREQDxEUDw4REw4NERINDBEWDAsRFQsKERQKCRETCQgREggHERYHBhEVBoHUB9QlwwCVLm6zwwCRcOKbBRERBS7aZQQREATgItDT/zHU1PQE9AQx0QLQ+kgx0z/UMdP/+kjRgTo9VhzQ1DH6UDHUMfpIMFjHBfL0gTo5IlYZgED0Dm+hMfL0VhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGoHcB/AURFAUEERMEAxESAwIRFgIBERUBERRWE1YTVhhWGFYY8BUDjhxfA1cSVxJXElcSVxIMEREMCxEQCxCvEJ4QjVVH4BEUERkRFBETERgRExESERcREhERERYREREQERUREA8RFA8OERMODRESDQwREQwLERALEK8QnhCNEHwQa3YAEhBaEEkQOFjwGgH8VhpWE/ANVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhpWGlYaVhOBOkARFvAWE/L0VhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBVhkBERTwF5LwGAASVhoCVhoCVhoCeAP+VhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCVhoCgBR/7RHaASDBAJF/liCEd7zDAOKVgTpC8vDgI+MPIlYVyM+Q1H3fjifPCz8mzxQlzwsfUkD6VMkiyMsfIvoCVhj6AskpVhwIVhwIVhxRgAhWHHl6ewL+VhjQ1DH6UDHUMfpIMdQx0x/6UDH0BDHRUkDwCYE6OCJWF4BA9A5voRLy9NT0BNTU0dDU1NHQ03fTP9IA03fTd9EijjRWIdDUMfpQMdQx+kgwUqDwBgTIy3cTyz/KAMt3y3fJAcjMzMkDyMwS9ADMzFIiEReAQPRD4w5WGNDUMXx9AfSBOjgiVheAQPQOb6ES8vTU9ATU1NEB0NTU0dDTd9M/0gDTd9N30VYh0NQx+lAx1DH6SDBSoPAGBMjLdxPLP8oAy3fLd8kByMzMyQPIzBL0ABLMzFIiEReAQPRDVhjQ1DH6UDHUMfpIMALIyz8S+lJWFfoCycjPjxgABH4AdghWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAhWHAgHERwHBhEbBgURGgVQQ/AZAxESAfZfCYE6OCJWF4BA9A5voRLy9NT0BNTU0QHQ1NTR0NN30z/SANN303fRViHQ1DH6UDHUMfpIMFKg8AYEyMt3E8s/ygDLd8t3yQHIzMzJA8jMEvQAEszMUiIRF4BA9ENWGNDUMfpQMdQx+kgwIsjLP/pSVhb6AsnIz48YAAR+AFj6UDHUMfpIMALIyz8S+lJWFfoCycjPjxgABIIQy8QOW88L93HPC2HMyXD7AAAkghCLsl+ozwv3cc8LYczJcPsAAE0VxFXEV8OMwKAQPQOb6GSW3Dh1DH0BNQx1DHRAfkAAYMH9A5voTGAAXRXEV8PMiBukTDgMdCBOkEh10mDB7qXIddKwADDAJFw4vL00//RgTpBIYQHu/L0gAgEgg4QCASCRkgIBIIWGAgEgiIkAexXEV8PMlMhupJsIeBTIbydAqLwAZWBOkLy8OCpBOACofABlYE6QvLw4IE6QiGZhP8iqQQjvsMAkX/i8vSogAYsNzg4ODg4ODg5OTk6Ojo6AsMAlSBus8MAkXDilzkQOFUC2oHgMDMzBtDUMfpQMdQx+kgx1DHTHzH6UPQEMdEgbuMDXwdwghwCKIdDTHzH6APoAMdH4KAjI+lIUzBLMycjPkcDwrWIWyz8UzAH6AssfE/pS9ADJyM+FiBL6Us+EEHP6AnHPC2XMyYBA+wB/AdUKMMAlS9us8MAkXDimAgRFAgv2pEM4DIzA9DT/zHU1DH0BDH0BDHR0PpI0z/UMdP/MfpI0QLI+lLJAsj6Uhf6UlAD+gISzMnIz48YAASCEOnADJfPC/dwzwthFcs/FMzJcPsAIm6SXwPjDoIoE8wyVhvQ1DH6UDHUMfpIMdQx0x/6UDH0BDHRUlDwCYE6PVYc0NQx+lAx1DH6SDApxwXy9IE6OSdWGoBA9A5voTHy9ClWHNDUMfpQMdQx+kgx1DHTHzH6UPQEMdEgbuMDW2xiiCJujhDIz5BWN19WFMs/E8zM9ADJ4w3Igi4yNjgA6yAH6AsnIz4WIE/pSghDg6IL1zwuOyz/MyYBA+wAB/jtWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWHAFWGQERGVYYVhhWGPAc+CgHyPpSEvQAEvQAycjPkxUdtK4Zyz8X+lIVyz9QBfoCyx8Tywf0APpS9ADJyM+FiBL6Us+EEHP6AnGPAAAAHjLIz5Gxwst2E8s/zPQAyQEgic8WEvpScc8LbszJgED7AJAAEs8LZczJgED7AAABQgIBIJOUAgEgmJkC9whljDwHRhfCOE0W1YTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTAVYTARET8BeS8BgAAREUAQEREwEBERIBARERAQEREAEfHh0cGxoZGBcWFRRDMIAUf+0R2gEgwQCRf+MO4wKCVlgHfGzENDU1NTUTgED0Dm+hILORf44ZIdMfMdMfMfoAMfoAMdMPMdMPMdIA0bPDAOKOIjMzAY4QAdMf0x/6APoA0w/TD9IA0ZgxcFRwAFMAcOJVBnDgMNMf0x/6APoA0w/TD9IA0ScKkjc34w4QR1Ujf4JcADCCEd7zDAAAKgTpC8vAAZDlUQRiSNybegTo0KIEnELny9FJoqIEnEKkEFqEgwQCRf5YghHe8wwDilYE6QvLw4AcFAB0NFsgbrOUxwXDAJJbcOKAB9wkwwCVJW6zwwCRcOKYBBEQBCXaUQzgMYT/gTpEVhbQ1PpQMdT6SDHUMdMfMfpQMfQEMdHQ+kj6UPpQ9ATRBND6SPpQMdGS8CAAVCWg7F9SYscFkjB/lNoBwwDi8vSCANmYIm+IwAHy9CFvEG8pXwiCANmYVhfQ1DH6UDGCaAW7UMfpI10z4KMjPhAL6UhL6UskByM+E0MzM+RbIz4oAQMv/z1ASxwXy9G1wVHADb4iSXLmK6F8JmwH8IaRSc2+BbylRx6BRtaCCANmXLIIQBfXhAKBWErvy9IsCJccFloIA2ZTy8OAtbrOOKVNNjiHtou37cCFviJJcuY4QIaRSM2+BJMcFlV8Ef9sx4OhfBHDYs8MAkXDiloIA2ZXy8OCCANmWU2+78vSCANmVA24T8vTIz5JQ+KB6nADAVhEB+lLJJcjPkD4p+pYYyz9QB/oCFPpSEvpUFPQAAfoCGM7JyM+FiFJA+lJQA/oCz4Fz+gJxzwtlEszJgBD7AMjPjxgABIIQqodQKc8L93DPC2ES+lJQBfoCyXD7ABAj');

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
        'TokenPool_Error.CallerIsNotOwnerOrFeeAdmin': 14916,
        'TokenPool_Error.MissingForwardPayload': 14918,
        'TokenPool_Error.MissingTransferInitiator': 14919,
        'TokenPool_Error.AmountMismatch': 14920,
        'TokenPool_Error.InvalidRequestedFinality': 14921,
        'RateLimiter_Error.BucketOverfilled': 16300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 16301,
        'RateLimiter_Error.TokenRateLimitReached': 16302,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'JettonWithdrawable_Error.ZeroAddressNotAllowed': 55700,
        'JettonWithdrawable_Error.UnallowedRecipient': 55701,
        'JettonWithdrawable_Error.MaxAmountExceeded': 55702,
        'JettonWithdrawable_Error.InsufficientValue': 55703,
        'JettonWithdrawable_Error.InvalidWithdrawWallet': 55704,
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
            throw new Error(`Custom pack/unpack for 'MockTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new MockTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: TokenPool_Data
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? MockTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new MockTokenPool(address, initialState);
    }

    static createCellOfTokenPoolLockOrBurn(body: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
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

    static createCellOfTokenPoolReleaseOrMint(body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }) {
        return TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body));
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
        direction: uint8
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
        direction: uint8
        extraData: c.Cell | null
        forwardPayload: c.Cell | null
    }) {
        return TokenPool_GetCCVsAndFees.toCell(TokenPool_GetCCVsAndFees.create(body));
    }

    static createCellOfTokenPoolQueryCCVsReply(body: {
        queryId?: uint64
        requiredCCVs: SnakedCell<c.Address>
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
        allowedDepositNamespaces: Map<uint32, boolean>
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

    static createCellOfTokenPoolSetRMNProxy(body: {
        queryId?: uint64
        rmnProxy: c.Address | null
    }) {
        return TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body));
    }

    static createCellOfTokenPoolSetCursedSubjects(body: {
        queryId?: uint64
        cursedSubjects: CursedSubjects
    }) {
        return TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body));
    }

    static createCellOfJettonWithdrawableWithdraw(body: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }) {
        return JettonWithdrawable_Withdraw.toCell(JettonWithdrawable_Withdraw.create(body));
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
        replyTo: c.Address | null
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

    async sendTokenPoolReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        request: TokenPool_ReleaseOrMintInV1
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
        direction: uint8
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
        direction: uint8
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
        requiredCCVs: SnakedCell<c.Address>
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
        allowedDepositNamespaces: Map<uint32, boolean>
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

    async sendTokenPoolSetRMNProxy(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        rmnProxy: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetCursedSubjects(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        cursedSubjects: CursedSubjects
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body)),
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
}
