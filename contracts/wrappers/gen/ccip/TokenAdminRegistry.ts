// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenAdminRegistry contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

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

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
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
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
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
 > struct (0xbe8621a2) TokenAdminRegistry_RegisterToken {
 >     queryId: uint64
 >     tokenAddress: address
 >     tokenInfo: Cell<TokenRegistry_TokenInfo>
 >     administrator: address
 > }
 */
export interface TokenAdminRegistry_RegisterToken {
    readonly $: 'TokenAdminRegistry_RegisterToken'
    queryId: uint64
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    administrator: c.Address
}

export const TokenAdminRegistry_RegisterToken = {
    PREFIX: 0xbe8621a2,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }): TokenAdminRegistry_RegisterToken {
        return {
            $: 'TokenAdminRegistry_RegisterToken',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_RegisterToken {
        loadAndCheckPrefix32(s, 0xbe8621a2, 'TokenAdminRegistry_RegisterToken');
        return {
            $: 'TokenAdminRegistry_RegisterToken',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_RegisterToken, b: c.Builder): void {
        b.storeUint(0xbe8621a2, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistry_RegisterToken): c.Cell {
        return makeCellFrom<TokenAdminRegistry_RegisterToken>(self, TokenAdminRegistry_RegisterToken.store);
    }
}

/**
 > struct (0xfddaa034) TokenAdminRegistry_OverridePendingAdministrator {
 >     queryId: uint64
 >     tokenAddress: address
 >     administrator: address
 > }
 */
export interface TokenAdminRegistry_OverridePendingAdministrator {
    readonly $: 'TokenAdminRegistry_OverridePendingAdministrator'
    queryId: uint64
    tokenAddress: c.Address
    administrator: c.Address
}

export const TokenAdminRegistry_OverridePendingAdministrator = {
    PREFIX: 0xfddaa034,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }): TokenAdminRegistry_OverridePendingAdministrator {
        return {
            $: 'TokenAdminRegistry_OverridePendingAdministrator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_OverridePendingAdministrator {
        loadAndCheckPrefix32(s, 0xfddaa034, 'TokenAdminRegistry_OverridePendingAdministrator');
        return {
            $: 'TokenAdminRegistry_OverridePendingAdministrator',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_OverridePendingAdministrator, b: c.Builder): void {
        b.storeUint(0xfddaa034, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistry_OverridePendingAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistry_OverridePendingAdministrator>(self, TokenAdminRegistry_OverridePendingAdministrator.store);
    }
}

/**
 > struct (0xdc67ebd0) TokenAdminRegistry_TransferAdminRole {
 >     queryId: uint64
 >     tokenAddress: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistry_TransferAdminRole {
    readonly $: 'TokenAdminRegistry_TransferAdminRole'
    queryId: uint64
    tokenAddress: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistry_TransferAdminRole = {
    PREFIX: 0xdc67ebd0,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistry_TransferAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0xdc67ebd0, 'TokenAdminRegistry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistry_TransferAdminRole',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0xdc67ebd0, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistry_TransferAdminRole>(self, TokenAdminRegistry_TransferAdminRole.store);
    }
}

/**
 > struct (0xbe28e166) TokenAdminRegistry_AcceptAdminRole {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistry_AcceptAdminRole'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_AcceptAdminRole = {
    PREFIX: 0xbe28e166,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistry_AcceptAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0xbe28e166, 'TokenAdminRegistry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistry_AcceptAdminRole',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0xbe28e166, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AcceptAdminRole>(self, TokenAdminRegistry_AcceptAdminRole.store);
    }
}

/**
 > struct (0x37bcaede) TokenAdminRegistry_SetPool {
 >     queryId: uint64
 >     tokenAddress: address
 >     tokenPool: address?
 > }
 */
export interface TokenAdminRegistry_SetPool {
    readonly $: 'TokenAdminRegistry_SetPool'
    queryId: uint64
    tokenAddress: c.Address
    tokenPool: c.Address | null
}

export const TokenAdminRegistry_SetPool = {
    PREFIX: 0x37bcaede,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenPool: c.Address | null
    }): TokenAdminRegistry_SetPool {
        return {
            $: 'TokenAdminRegistry_SetPool',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_SetPool {
        loadAndCheckPrefix32(s, 0x37bcaede, 'TokenAdminRegistry_SetPool');
        return {
            $: 'TokenAdminRegistry_SetPool',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_SetPool, b: c.Builder): void {
        b.storeUint(0x37bcaede, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenAdminRegistry_SetPool): c.Cell {
        return makeCellFrom<TokenAdminRegistry_SetPool>(self, TokenAdminRegistry_SetPool.store);
    }
}

/**
 > struct (0xbb82eda5) TokenAdminRegistry_RefreshPoolConfig {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_RefreshPoolConfig {
    readonly $: 'TokenAdminRegistry_RefreshPoolConfig'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_RefreshPoolConfig = {
    PREFIX: 0xbb82eda5,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_RefreshPoolConfig {
        return {
            $: 'TokenAdminRegistry_RefreshPoolConfig',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_RefreshPoolConfig {
        loadAndCheckPrefix32(s, 0xbb82eda5, 'TokenAdminRegistry_RefreshPoolConfig');
        return {
            $: 'TokenAdminRegistry_RefreshPoolConfig',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_RefreshPoolConfig, b: c.Builder): void {
        b.storeUint(0xbb82eda5, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_RefreshPoolConfig): c.Cell {
        return makeCellFrom<TokenAdminRegistry_RefreshPoolConfig>(self, TokenAdminRegistry_RefreshPoolConfig.store);
    }
}

/**
 > struct (0x182affc2) TokenAdminRegistry_VerifyToken {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_VerifyToken {
    readonly $: 'TokenAdminRegistry_VerifyToken'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_VerifyToken = {
    PREFIX: 0x182affc2,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_VerifyToken {
        return {
            $: 'TokenAdminRegistry_VerifyToken',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_VerifyToken {
        loadAndCheckPrefix32(s, 0x182affc2, 'TokenAdminRegistry_VerifyToken');
        return {
            $: 'TokenAdminRegistry_VerifyToken',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_VerifyToken, b: c.Builder): void {
        b.storeUint(0x182affc2, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_VerifyToken): c.Cell {
        return makeCellFrom<TokenAdminRegistry_VerifyToken>(self, TokenAdminRegistry_VerifyToken.store);
    }
}

/**
 > struct (0xec5f855e) TokenAdminRegistry_GetTokenInfo {
 >     queryId: uint64
 >     token: address
 > }
 */
export interface TokenAdminRegistry_GetTokenInfo {
    readonly $: 'TokenAdminRegistry_GetTokenInfo'
    queryId: uint64
    token: c.Address
}

export const TokenAdminRegistry_GetTokenInfo = {
    PREFIX: 0xec5f855e,

    create(args: {
        queryId?: uint64
        token: c.Address
    }): TokenAdminRegistry_GetTokenInfo {
        return {
            $: 'TokenAdminRegistry_GetTokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0xec5f855e, 'TokenAdminRegistry_GetTokenInfo');
        return {
            $: 'TokenAdminRegistry_GetTokenInfo',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0xec5f855e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
    },
    toCell(self: TokenAdminRegistry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_GetTokenInfo>(self, TokenAdminRegistry_GetTokenInfo.store);
    }
}

/**
 > struct (0x0a9bf5d1) TokenAdminRegistry_TokenInfo {
 >     queryId: uint64
 >     token: address
 >     minterAddress: address
 >     version: uint32
 >     poolInfo: Cell<TokenAdminRegistry_PoolInfo>?
 > }
 */
export interface TokenAdminRegistry_TokenInfo {
    readonly $: 'TokenAdminRegistry_TokenInfo'
    queryId: uint64
    token: c.Address
    minterAddress: c.Address
    version: uint32
    poolInfo: TokenAdminRegistry_PoolInfo | null /* = null */
}

export const TokenAdminRegistry_TokenInfo = {
    PREFIX: 0x0a9bf5d1,

    create(args: {
        queryId?: uint64
        token: c.Address
        minterAddress: c.Address
        version: uint32
        poolInfo?: TokenAdminRegistry_PoolInfo | null /* = null */
    }): TokenAdminRegistry_TokenInfo {
        return {
            $: 'TokenAdminRegistry_TokenInfo',
            poolInfo: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_TokenInfo {
        loadAndCheckPrefix32(s, 0x0a9bf5d1, 'TokenAdminRegistry_TokenInfo');
        return {
            $: 'TokenAdminRegistry_TokenInfo',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            minterAddress: s.loadAddress(),
            version: s.loadUintBig(32),
            poolInfo: s.loadBoolean() ? loadCellRef<TokenAdminRegistry_PoolInfo>(s, TokenAdminRegistry_PoolInfo.fromSlice) : null,
        }
    },
    store(self: TokenAdminRegistry_TokenInfo, b: c.Builder): void {
        b.storeUint(0x0a9bf5d1, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.minterAddress);
        b.storeUint(self.version, 32);
        storeTolkNullable<TokenAdminRegistry_PoolInfo>(self.poolInfo, b,
            (v,b) => storeCellRef<TokenAdminRegistry_PoolInfo>(v, b, TokenAdminRegistry_PoolInfo.store)
        );
    },
    toCell(self: TokenAdminRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_TokenInfo>(self, TokenAdminRegistry_TokenInfo.store);
    }
}

/**
 > struct TokenAdminRegistry_PoolInfo {
 >     tokenPool: address
 >     transferInitiator: address?
 >     admission: Cell<TokenPool_AdmissionBudget>
 > }
 */
export interface TokenAdminRegistry_PoolInfo {
    readonly $: 'TokenAdminRegistry_PoolInfo'
    tokenPool: c.Address
    transferInitiator: c.Address | null
    admission: TokenPool_AdmissionBudget
}

export const TokenAdminRegistry_PoolInfo = {
    create(args: {
        tokenPool: c.Address
        transferInitiator: c.Address | null
        admission: TokenPool_AdmissionBudget
    }): TokenAdminRegistry_PoolInfo {
        return {
            $: 'TokenAdminRegistry_PoolInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_PoolInfo {
        return {
            $: 'TokenAdminRegistry_PoolInfo',
            tokenPool: s.loadAddress(),
            transferInitiator: s.loadMaybeAddress(),
            admission: loadCellRef<TokenPool_AdmissionBudget>(s, TokenPool_AdmissionBudget.fromSlice),
        }
    },
    store(self: TokenAdminRegistry_PoolInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.transferInitiator);
        storeCellRef<TokenPool_AdmissionBudget>(self.admission, b, TokenPool_AdmissionBudget.store);
    },
    toCell(self: TokenAdminRegistry_PoolInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_PoolInfo>(self, TokenAdminRegistry_PoolInfo.store);
    }
}

/**
 > struct (0xe533c614) TokenAdminRegistry_GetTokenInfoFailed {
 >     queryId: uint64
 >     token: address
 > }
 */
export interface TokenAdminRegistry_GetTokenInfoFailed {
    readonly $: 'TokenAdminRegistry_GetTokenInfoFailed'
    queryId: uint64
    token: c.Address
}

export const TokenAdminRegistry_GetTokenInfoFailed = {
    PREFIX: 0xe533c614,

    create(args: {
        queryId?: uint64
        token: c.Address
    }): TokenAdminRegistry_GetTokenInfoFailed {
        return {
            $: 'TokenAdminRegistry_GetTokenInfoFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_GetTokenInfoFailed {
        loadAndCheckPrefix32(s, 0xe533c614, 'TokenAdminRegistry_GetTokenInfoFailed');
        return {
            $: 'TokenAdminRegistry_GetTokenInfoFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_GetTokenInfoFailed, b: c.Builder): void {
        b.storeUint(0xe533c614, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
    },
    toCell(self: TokenAdminRegistry_GetTokenInfoFailed): c.Cell {
        return makeCellFrom<TokenAdminRegistry_GetTokenInfoFailed>(self, TokenAdminRegistry_GetTokenInfoFailed.store);
    }
}

/**
 > struct (0x55b8b654) TokenAdminRegistry_EntryUpgradeRequest {
 >     queryId: uint64
 >     token: address
 >     request: Cell<TokenAdminRegistryEntry_MessageFromRoot>
 > }
 */
export interface TokenAdminRegistry_EntryUpgradeRequest {
    readonly $: 'TokenAdminRegistry_EntryUpgradeRequest'
    queryId: uint64
    token: c.Address
    request: TokenAdminRegistryEntry_MessageFromRoot
}

export const TokenAdminRegistry_EntryUpgradeRequest = {
    PREFIX: 0x55b8b654,

    create(args: {
        queryId?: uint64
        token: c.Address
        request: TokenAdminRegistryEntry_MessageFromRoot
    }): TokenAdminRegistry_EntryUpgradeRequest {
        return {
            $: 'TokenAdminRegistry_EntryUpgradeRequest',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_EntryUpgradeRequest {
        loadAndCheckPrefix32(s, 0x55b8b654, 'TokenAdminRegistry_EntryUpgradeRequest');
        return {
            $: 'TokenAdminRegistry_EntryUpgradeRequest',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            request: loadCellRef<TokenAdminRegistryEntry_MessageFromRoot>(s, TokenAdminRegistryEntry_MessageFromRoot.fromSlice),
        }
    },
    store(self: TokenAdminRegistry_EntryUpgradeRequest, b: c.Builder): void {
        b.storeUint(0x55b8b654, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        storeCellRef<TokenAdminRegistryEntry_MessageFromRoot>(self.request, b, TokenAdminRegistryEntry_MessageFromRoot.store);
    },
    toCell(self: TokenAdminRegistry_EntryUpgradeRequest): c.Cell {
        return makeCellFrom<TokenAdminRegistry_EntryUpgradeRequest>(self, TokenAdminRegistry_EntryUpgradeRequest.store);
    }
}

/**
 > struct (0x4d52f09d) TokenAdminRegistry_UpgradeEntry {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_UpgradeEntry {
    readonly $: 'TokenAdminRegistry_UpgradeEntry'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_UpgradeEntry = {
    PREFIX: 0x4d52f09d,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_UpgradeEntry {
        return {
            $: 'TokenAdminRegistry_UpgradeEntry',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_UpgradeEntry {
        loadAndCheckPrefix32(s, 0x4d52f09d, 'TokenAdminRegistry_UpgradeEntry');
        return {
            $: 'TokenAdminRegistry_UpgradeEntry',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_UpgradeEntry, b: c.Builder): void {
        b.storeUint(0x4d52f09d, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_UpgradeEntry): c.Cell {
        return makeCellFrom<TokenAdminRegistry_UpgradeEntry>(self, TokenAdminRegistry_UpgradeEntry.store);
    }
}

/**
 > struct (0x140b1e91) TokenAdminRegistry_AdministratorTransferRequested {
 >     queryId: uint64
 >     token: address
 >     currentAdministrator: address?
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistry_AdministratorTransferRequested {
    readonly $: 'TokenAdminRegistry_AdministratorTransferRequested'
    queryId: uint64
    token: c.Address
    currentAdministrator: c.Address | null
    newAdministrator: c.Address | null
}

export const TokenAdminRegistry_AdministratorTransferRequested = {
    PREFIX: 0x140b1e91,

    create(args: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }): TokenAdminRegistry_AdministratorTransferRequested {
        return {
            $: 'TokenAdminRegistry_AdministratorTransferRequested',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AdministratorTransferRequested {
        loadAndCheckPrefix32(s, 0x140b1e91, 'TokenAdminRegistry_AdministratorTransferRequested');
        return {
            $: 'TokenAdminRegistry_AdministratorTransferRequested',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            currentAdministrator: s.loadMaybeAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_AdministratorTransferRequested, b: c.Builder): void {
        b.storeUint(0x140b1e91, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.currentAdministrator);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_AdministratorTransferRequested): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AdministratorTransferRequested>(self, TokenAdminRegistry_AdministratorTransferRequested.store);
    }
}

/**
 > struct (0xe2c74db4) TokenAdminRegistry_AdministratorTransferred {
 >     queryId: uint64
 >     token: address
 >     newAdministrator: address
 > }
 */
export interface TokenAdminRegistry_AdministratorTransferred {
    readonly $: 'TokenAdminRegistry_AdministratorTransferred'
    queryId: uint64
    token: c.Address
    newAdministrator: c.Address
}

export const TokenAdminRegistry_AdministratorTransferred = {
    PREFIX: 0xe2c74db4,

    create(args: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }): TokenAdminRegistry_AdministratorTransferred {
        return {
            $: 'TokenAdminRegistry_AdministratorTransferred',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AdministratorTransferred {
        loadAndCheckPrefix32(s, 0xe2c74db4, 'TokenAdminRegistry_AdministratorTransferred');
        return {
            $: 'TokenAdminRegistry_AdministratorTransferred',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            newAdministrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_AdministratorTransferred, b: c.Builder): void {
        b.storeUint(0xe2c74db4, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_AdministratorTransferred): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AdministratorTransferred>(self, TokenAdminRegistry_AdministratorTransferred.store);
    }
}

/**
 > struct (0xcef01a87) TokenAdminRegistry_PoolSet {
 >     queryId: uint64
 >     token: address
 >     previousPool: address?
 >     newPool: address?
 >     transferInitiator: Cell<address>?
 > }
 */
export interface TokenAdminRegistry_PoolSet {
    readonly $: 'TokenAdminRegistry_PoolSet'
    queryId: uint64
    token: c.Address
    previousPool: c.Address | null
    newPool: c.Address | null
    transferInitiator: c.Address | null
}

export const TokenAdminRegistry_PoolSet = {
    PREFIX: 0xcef01a87,

    create(args: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
        transferInitiator: c.Address | null
    }): TokenAdminRegistry_PoolSet {
        return {
            $: 'TokenAdminRegistry_PoolSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_PoolSet {
        loadAndCheckPrefix32(s, 0xcef01a87, 'TokenAdminRegistry_PoolSet');
        return {
            $: 'TokenAdminRegistry_PoolSet',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            previousPool: s.loadMaybeAddress(),
            newPool: s.loadMaybeAddress(),
            transferInitiator: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: TokenAdminRegistry_PoolSet, b: c.Builder): void {
        b.storeUint(0xcef01a87, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.previousPool);
        b.storeAddress(self.newPool);
        storeTolkNullable<c.Address>(self.transferInitiator, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: TokenAdminRegistry_PoolSet): c.Cell {
        return makeCellFrom<TokenAdminRegistry_PoolSet>(self, TokenAdminRegistry_PoolSet.store);
    }
}

/**
 > struct TokenAdminRegistry_Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 > }
 */
export interface TokenAdminRegistry_Storage {
    readonly $: 'TokenAdminRegistry_Storage'
    id: uint32
    ownable: Ownable2Step
}

export const TokenAdminRegistry_Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
    }): TokenAdminRegistry_Storage {
        return {
            $: 'TokenAdminRegistry_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_Storage {
        return {
            $: 'TokenAdminRegistry_Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
        }
    },
    store(self: TokenAdminRegistry_Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
    },
    toCell(self: TokenAdminRegistry_Storage): c.Cell {
        return makeCellFrom<TokenAdminRegistry_Storage>(self, TokenAdminRegistry_Storage.store);
    }
}

/**
 > enum TokenAdminRegistry_Error { 2 variants }
 */
export type TokenAdminRegistry_Error = bigint

export const TokenAdminRegistry_Error = {
    UnauthorizedEntry: 50800n,
    InsufficientValue: 50801n,

    fromSlice(s: c.Slice): TokenAdminRegistry_Error {
        return s.loadUintBig(16);
    },
    store(self: TokenAdminRegistry_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: TokenAdminRegistry_Error): c.Cell {
        return makeCellFrom<TokenAdminRegistry_Error>(self, TokenAdminRegistry_Error.store);
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
 > type TokenAdminRegistryEntry_RootMessage = TokenAdminRegistryEntry_GetTokenInfo | TokenAdminRegistryEntry_ProposeAdministrator | TokenAdminRegistryEntry_TransferAdminRole | TokenAdminRegistryEntry_AcceptAdminRole | TokenAdminRegistryEntry_SetPool | TokenAdminRegistryEntry_VerifyToken | TokenAdminRegistryEntry_RefreshPoolConfig
 */
export type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool
    | TokenAdminRegistryEntry_VerifyToken
    | TokenAdminRegistryEntry_RefreshPoolConfig

export const TokenAdminRegistryEntry_RootMessage = {
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RootMessage {
        return lookupPrefix(s, 0x7aef4c2d, 32) ? TokenAdminRegistryEntry_GetTokenInfo.fromSlice(s) :
            lookupPrefix(s, 0x6dcbe573, 32) ? TokenAdminRegistryEntry_ProposeAdministrator.fromSlice(s) :
            lookupPrefix(s, 0x8b1503cf, 32) ? TokenAdminRegistryEntry_TransferAdminRole.fromSlice(s) :
            lookupPrefix(s, 0x39c6e872, 32) ? TokenAdminRegistryEntry_AcceptAdminRole.fromSlice(s) :
            lookupPrefix(s, 0xa64e05c9, 32) ? TokenAdminRegistryEntry_SetPool.fromSlice(s) :
            lookupPrefix(s, 0xa14b0288, 32) ? TokenAdminRegistryEntry_VerifyToken.fromSlice(s) :
            lookupPrefix(s, 0xecf005ba, 32) ? TokenAdminRegistryEntry_RefreshPoolConfig.fromSlice(s) :
            throwNonePrefixMatch('TokenAdminRegistryEntry_RootMessage');
    },
    store(self: TokenAdminRegistryEntry_RootMessage, b: c.Builder): void {
        switch (self.$) {
            case 'TokenAdminRegistryEntry_GetTokenInfo':
                TokenAdminRegistryEntry_GetTokenInfo.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_ProposeAdministrator':
                TokenAdminRegistryEntry_ProposeAdministrator.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_TransferAdminRole':
                TokenAdminRegistryEntry_TransferAdminRole.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_AcceptAdminRole':
                TokenAdminRegistryEntry_AcceptAdminRole.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_SetPool':
                TokenAdminRegistryEntry_SetPool.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_VerifyToken':
                TokenAdminRegistryEntry_VerifyToken.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_RefreshPoolConfig':
                TokenAdminRegistryEntry_RefreshPoolConfig.store(self, b);
                break;
        }
    },
    toCell(self: TokenAdminRegistryEntry_RootMessage): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RootMessage>(self, TokenAdminRegistryEntry_RootMessage.store);
    }
}

/**
 > struct (0x558e7559) TokenAdminRegistryEntry_MessageFromRoot {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     content: Cell<TokenAdminRegistryEntry_RootMessage>
 > }
 */
export interface TokenAdminRegistryEntry_MessageFromRoot {
    readonly $: 'TokenAdminRegistryEntry_MessageFromRoot'
    queryId: uint64
    minEntryVersion: uint16
    content: TokenAdminRegistryEntry_RootMessage
}

export const TokenAdminRegistryEntry_MessageFromRoot = {
    PREFIX: 0x558e7559,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        content: TokenAdminRegistryEntry_RootMessage
    }): TokenAdminRegistryEntry_MessageFromRoot {
        return {
            $: 'TokenAdminRegistryEntry_MessageFromRoot',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_MessageFromRoot {
        loadAndCheckPrefix32(s, 0x558e7559, 'TokenAdminRegistryEntry_MessageFromRoot');
        return {
            $: 'TokenAdminRegistryEntry_MessageFromRoot',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            content: loadCellRef<TokenAdminRegistryEntry_RootMessage>(s, TokenAdminRegistryEntry_RootMessage.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_MessageFromRoot, b: c.Builder): void {
        b.storeUint(0x558e7559, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        storeCellRef<TokenAdminRegistryEntry_RootMessage>(self.content, b, TokenAdminRegistryEntry_RootMessage.store);
    },
    toCell(self: TokenAdminRegistryEntry_MessageFromRoot): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_MessageFromRoot>(self, TokenAdminRegistryEntry_MessageFromRoot.store);
    }
}

/**
 > struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {
 >     token: address
 >     requester: address
 > }
 */
export interface TokenAdminRegistryEntry_GetTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_GetTokenInfo'
    token: c.Address
    requester: c.Address
}

export const TokenAdminRegistryEntry_GetTokenInfo = {
    PREFIX: 0x7aef4c2d,

    create(args: {
        token: c.Address
        requester: c.Address
    }): TokenAdminRegistryEntry_GetTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0x7aef4c2d, 'TokenAdminRegistryEntry_GetTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
            token: s.loadAddress(),
            requester: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0x7aef4c2d, 32);
        b.storeAddress(self.token);
        b.storeAddress(self.requester);
    },
    toCell(self: TokenAdminRegistryEntry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_GetTokenInfo>(self, TokenAdminRegistryEntry_GetTokenInfo.store);
    }
}

/**
 > struct (0x4e1c9ad5) TokenAdminRegistryEntry_TokenInfo {
 >     queryId: uint64
 >     token: address
 >     requester: address
 >     tokenInfo: Cell<TokenRegistry_TokenInfo>
 > }
 */
export interface TokenAdminRegistryEntry_TokenInfo {
    readonly $: 'TokenAdminRegistryEntry_TokenInfo'
    queryId: uint64
    token: c.Address
    requester: c.Address
    tokenInfo: TokenRegistry_TokenInfo
}

export const TokenAdminRegistryEntry_TokenInfo = {
    PREFIX: 0x4e1c9ad5,

    create(args: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }): TokenAdminRegistryEntry_TokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_TokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TokenInfo {
        loadAndCheckPrefix32(s, 0x4e1c9ad5, 'TokenAdminRegistryEntry_TokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_TokenInfo',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            requester: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_TokenInfo, b: c.Builder): void {
        b.storeUint(0x4e1c9ad5, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.requester);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
    },
    toCell(self: TokenAdminRegistryEntry_TokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TokenInfo>(self, TokenAdminRegistryEntry_TokenInfo.store);
    }
}

/**
 > struct (0x6dcbe573) TokenAdminRegistryEntry_ProposeAdministrator {
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x6dcbe573,

    create(args: {
        administrator: c.Address
    }): TokenAdminRegistryEntry_ProposeAdministrator {
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ProposeAdministrator {
        loadAndCheckPrefix32(s, 0x6dcbe573, 'TokenAdminRegistryEntry_ProposeAdministrator');
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x6dcbe573, 32);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
 >     actor: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    actor: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x8b1503cf,

    create(args: {
        actor: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistryEntry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0x8b1503cf, 'TokenAdminRegistryEntry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            actor: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x8b1503cf, 32);
        b.storeAddress(self.actor);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistryEntry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TransferAdminRole>(self, TokenAdminRegistryEntry_TransferAdminRole.store);
    }
}

/**
 > struct (0x39c6e872) TokenAdminRegistryEntry_AcceptAdminRole {
 >     actor: address
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
    actor: c.Address
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0x39c6e872,

    create(args: {
        actor: c.Address
    }): TokenAdminRegistryEntry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0x39c6e872, 'TokenAdminRegistryEntry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            actor: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0x39c6e872, 32);
        b.storeAddress(self.actor);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct (0xa64e05c9) TokenAdminRegistryEntry_SetPool {
 >     actor: address
 >     tokenPool: address?
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    actor: c.Address
    tokenPool: c.Address | null
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa64e05c9,

    create(args: {
        actor: c.Address
        tokenPool: c.Address | null
    }): TokenAdminRegistryEntry_SetPool {
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_SetPool {
        loadAndCheckPrefix32(s, 0xa64e05c9, 'TokenAdminRegistryEntry_SetPool');
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            actor: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa64e05c9, 32);
        b.storeAddress(self.actor);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenAdminRegistryEntry_SetPool): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_SetPool>(self, TokenAdminRegistryEntry_SetPool.store);
    }
}

/**
 > struct (0xa14b0288) TokenAdminRegistryEntry_VerifyToken {
 > }
 */
export interface TokenAdminRegistryEntry_VerifyToken {
    readonly $: 'TokenAdminRegistryEntry_VerifyToken'
}

export const TokenAdminRegistryEntry_VerifyToken = {
    PREFIX: 0xa14b0288,

    create(): TokenAdminRegistryEntry_VerifyToken {
        return {
            $: 'TokenAdminRegistryEntry_VerifyToken',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_VerifyToken {
        loadAndCheckPrefix32(s, 0xa14b0288, 'TokenAdminRegistryEntry_VerifyToken');
        return {
            $: 'TokenAdminRegistryEntry_VerifyToken',
        }
    },
    store(self: TokenAdminRegistryEntry_VerifyToken, b: c.Builder): void {
        b.storeUint(0xa14b0288, 32);
    },
    toCell(self: TokenAdminRegistryEntry_VerifyToken): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_VerifyToken>(self, TokenAdminRegistryEntry_VerifyToken.store);
    }
}

/**
 > struct (0xecf005ba) TokenAdminRegistryEntry_RefreshPoolConfig {
 > }
 */
export interface TokenAdminRegistryEntry_RefreshPoolConfig {
    readonly $: 'TokenAdminRegistryEntry_RefreshPoolConfig'
}

export const TokenAdminRegistryEntry_RefreshPoolConfig = {
    PREFIX: 0xecf005ba,

    create(): TokenAdminRegistryEntry_RefreshPoolConfig {
        return {
            $: 'TokenAdminRegistryEntry_RefreshPoolConfig',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RefreshPoolConfig {
        loadAndCheckPrefix32(s, 0xecf005ba, 'TokenAdminRegistryEntry_RefreshPoolConfig');
        return {
            $: 'TokenAdminRegistryEntry_RefreshPoolConfig',
        }
    },
    store(self: TokenAdminRegistryEntry_RefreshPoolConfig, b: c.Builder): void {
        b.storeUint(0xecf005ba, 32);
    },
    toCell(self: TokenAdminRegistryEntry_RefreshPoolConfig): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RefreshPoolConfig>(self, TokenAdminRegistryEntry_RefreshPoolConfig.store);
    }
}

/**
 > struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
 >     request: Cell<TokenAdminRegistryEntry_MessageFromRoot>
 > }
 */
export interface TokenAdminRegistryEntry_Resume {
    readonly $: 'TokenAdminRegistryEntry_Resume'
    request: TokenAdminRegistryEntry_MessageFromRoot
}

export const TokenAdminRegistryEntry_Resume = {
    PREFIX: 0x47d63a64,

    create(args: {
        request: TokenAdminRegistryEntry_MessageFromRoot
    }): TokenAdminRegistryEntry_Resume {
        return {
            $: 'TokenAdminRegistryEntry_Resume',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_Resume {
        loadAndCheckPrefix32(s, 0x47d63a64, 'TokenAdminRegistryEntry_Resume');
        return {
            $: 'TokenAdminRegistryEntry_Resume',
            request: loadCellRef<TokenAdminRegistryEntry_MessageFromRoot>(s, TokenAdminRegistryEntry_MessageFromRoot.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_Resume, b: c.Builder): void {
        b.storeUint(0x47d63a64, 32);
        storeCellRef<TokenAdminRegistryEntry_MessageFromRoot>(self.request, b, TokenAdminRegistryEntry_MessageFromRoot.store);
    },
    toCell(self: TokenAdminRegistryEntry_Resume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Resume>(self, TokenAdminRegistryEntry_Resume.store);
    }
}

/**
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address?
 >     transferInitiator: address?
 >     minterAddress: address
 >     version: uint32
 >     admission: Cell<TokenPool_AdmissionBudget>?
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address | null
    transferInitiator: c.Address | null /* = null */
    minterAddress: c.Address
    version: uint32 /* = 1 */
    admission: TokenPool_AdmissionBudget | null /* = null */
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address | null
        transferInitiator?: c.Address | null /* = null */
        minterAddress: c.Address
        version?: uint32 /* = 1 */
        admission?: TokenPool_AdmissionBudget | null /* = null */
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            transferInitiator: null,
            version: 1n,
            admission: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadMaybeAddress(),
            transferInitiator: s.loadMaybeAddress(),
            minterAddress: s.loadAddress(),
            version: s.loadUintBig(32),
            admission: s.loadBoolean() ? loadCellRef<TokenPool_AdmissionBudget>(s, TokenPool_AdmissionBudget.fromSlice) : null,
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.transferInitiator);
        b.storeAddress(self.minterAddress);
        b.storeUint(self.version, 32);
        storeTolkNullable<TokenPool_AdmissionBudget>(self.admission, b,
            (v,b) => storeCellRef<TokenPool_AdmissionBudget>(v, b, TokenPool_AdmissionBudget.store)
        );
    },
    toCell(self: TokenRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_TokenInfo>(self, TokenRegistry_TokenInfo.store);
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

// ————————————————————————————————————————————
//    class TokenAdminRegistry
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

export class TokenAdminRegistry implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECZgEAFZsAART/APSkE/S88sgLAQIBYgIDAgLGBCwCAUgWFwIBzwUGAgEgBwgCASASEwRTPiRkvAC4CDXLCX0MQ0U4wLXLCfu1QGk4wLXLCbjP16E4wLXLCXxRws0gCQoLDAGpO2i7fvXLCeQ2+0MjkTXLCfPFPJUlFtw2zHhggDCiiNus/L0IYIAwooExwUT8vQgbQPXCz+LAgHIyz8V+lIS+lLJyM+HIBTOcc8LYRPMyXD7AOMNf4BED/jHtRNDTHzH6SDD4koIAwogCxwXy9NM/+kjU+kgwghAIWDsAiPgoyPpSz5AAAAAOUlD6UsmI+ChtAcj6UvpUFfpUyW0HyPpSFswVzM+BFfpUyYIQBkIsQMjPkMVgCaYXyz/JyM+Sw7FFXhTMzFAF+gLMycjPiQgBUyPIz4TQzMxdJA0E9DHtRNDTHzH6SDD4koIAwogCxwXy9IIAxnH4l4IKFg7AvvL00z/6SPpIMG2BAIhUMSHwAzGI+CjI+lLPkAAAAA4U+lLJUAPIz4TQzMz5FsjPigBAy//PUMjPkbcvlc4S+lLJyM+FgCPDAM8KAM+EQBL6Us+EECLAAuMPXRoOGwL8MYIAxnH4l4IKFg7AvvL00z/6SPpQMPiSgQCKVHEg8AMxiPgoyPpSz5AAAAAOFfpSyVAEyM+E0MzM+RbIz4oAQMv/z1DIz5IsVA8+EvpSEvpUycjPhYAjwwDPCgDPhEAS+lLPhBAiwAKVbBJz+gKeAsADlAFx+gKUAc+EIOLiXRsE/I96MYIAxnH4l4IKFg7AvvL00z/6SDD4km2BAItUMSHwAzGI+CjI+lLPkAAAAA4U+lLJUAPIz4TQzMz5FsjPigBAy//PUMjPkOcbocoS+lLJyM+FgCPDAM8KAM+EQBL6Us+EECLAApVsEnP6Ap4CwAOUAXH6ApQBz4Qg4uLgiV0bDxAALvkWzwv/UAT6AoEAjc8LcBLMzMzJcPsAABwCwAOUAXH6ApQBz4Qg4gAIN7yu3gT+1yeP+jGCAMZx+JeCEAUQ/0C+8vTTP/pI+lAw+JKBAIxUcSDwAzGI+CjI+lLPkAAAAA4V+lLJUATIz4TQzMz5FsjPigBAy//PUMjPkpk4FyYS+lIS+lTJyM+FgCPDAM8KAM+EQBL6Us+EECLAAp4CwAOUAXH6ApQBz4Qg4uMN4F0aGxwAZmwS0z/6SDCCAMKIUTTHBRPy9IIAwolTI8cFs/L0IYsCyM+HIM5wzwthEss/EvpSyXD7AALtCDXCx+CEP////69kTDg1ywn////9PK/10zQ1ywirHOqzJnTP9MPMdSBAI+OEdcsIj6x0ySS8j/h1G1ZgQCQ4gHRgQCPuo4SMdDXLCKsc6rM8r/TP9MPMdTR39DXLCPXemFsl/pI+kiBAInjDgHRgQCJuuMCXwOAUFQAVDGBAIkyupFy4HCAA4NcsI25fK5yW+khtgQCIjl3XLCRYqB58l/pI+lCBAIqOSdcsIc43Q5SW+khtgQCLjjbXLCUycC5Ml/pI+lCBAIyOItcsJQpYFESVbW2BAI2OENcsJ2eALdSS8j/hbW2BAI7iQTDiQTDiQzDiQTDiQzAAMsjPhQj6UoIQ5TPGFM8LjhLLP/pSyYBA+wAAZbkV+NCZsaW5rLmNoYWluLnRvbi5jY2lwLlRva2VuQWRtaW5SZWdpc3RyeYItTEuNi4wiAIBIBgZABe0o72omhpj5j9JBhAAHbddfaiaGmPmP0kGP0oGEAAKbBJz+gIALIIQVY51Wc8LhRLLP8+IAAbMyYBA+wAEKonXJ+MC1ywicOTWrOMC1ywircWypB0eHyAACOxfhV4C/jHTP/pIMPiSgQCJVHIQ8AMxiPgoyPpSz5AAAAAOUkD6UskByM+E0MzM+RbIz4oAQMv/z1DIz5HrvTC2FPpSEvpSycjPhYAiwwDPCgDPhEAT+lLPhBAhwAKUMXP6ApwBwAOTcfoCk8+EIOLighBVjnVZzwuFEss/z4gABszJgEBdPgL+Me1E0NMfMfpIMfpQMdHTP/pI+kjXTPiSiPgoyPpSz5AAAAAOUlD6UskByM+E0MzM+RbIz4oAQMv/z1ABggDGcALHBfL00PpQ+lD6SNMf9ATRbSVus5UhbrPDAJFw4pwwBMj6UhP6VBPMyViUECU0W+LIz5Aqb9dGFss/FPpSFF0hBMjjAtcsImqXhOyPUTGCAMZx+JeCCJiWgL7y9NM/+kgwiPgoyPpSz5AAAAAOEvpSyQHIz4TQzMz5FsjPigBAy//PUIBAiMjPhYgT+lKCEAqoEe3PC44Tyz/MyQH7AODXLCBVQI9sIl0kIwAy+lITyx/0AMnIz4UIEvpScc8LbszJgED7AAP+Me1E0NMfMfpIMfpQMdHTP/pI10z4koj4KMj6Us+QAAAADhT6UslQA8jPhNDMzPkWyM+KAEDL/89QAoIAxnADxwUS8vT4knB0+wKCCJiWgHCIyM+FiFJA+lJQA/oCghAKqBHtzwuKFcs/zMlQA/sAINDXLCKsc6rM8r/TPzHTD10kJQT6jl8x7UTQ0x8x+kgw+JKCAMKIAscF8vTTPzHXTJPxA+gAk/ED6QAg2gEj+wQj0O0e7VPtREAT2iHtVCH5AAHaAXADyMwSy//OycjPjxgABIIQoztJjs8L93HPC2HMyQH7AODXLCCgWPSM4wLXLCcWOm2k4wLXLCZ3gNQ84wJVVldYART/APSkE/S88sgLKAL+MdTR0NcsI9d6YWyOcNcsI25fK5yW+khtgQCIjl3XLCRYqB58l/pI+lCBAIqOSdcsIc43Q5SW+khtgQCLjjbXLCUycC5Ml/pI+lCBAIyOItcsJQpYFESVbW2BAI2OENcsJ2eALdSS8j/hbW2BAI7iQTDiQTDiQzDiQTDiQzDjDSYnAA76SPpIgQCJAH4B0fADyM+FgCHDAM8KAM+EQBP6Us+EECLAApVsEnP6Ap4CwAOUAXH6ApQBz4Qg4uKCEEfWOmTPC4XMyYMG+wACAWIpKgICxissAgEgTU4CAc0tLgIDo9JLTAIBIC8wAgFIR0gCASAxMgIBIERFBJ8+JHjAiDXLCGKwBNM4wLXLCKsc6rMjicx+JLtRNDUMddMggCvyAHQ+kj6UDH6UDHREscF8vTTP9MP10xw8AHg1ywgVUCPbOMC1ywiPrHTJIDM0NTYE5wiwgGOSIIAr8wBs/L07UTQ+kjUMddM0PpI+lAx+lAx0cjPkVY51WYlzws/FMsPEszJyM+FiBP6UoIQVbi2VM8LjhPLPxL6UszJgED7AOAwMdDXLCPXemFs4wLXLCNuXyuc4wLXLCRYqB584wLXLCHON0OUgOjs8PQH00x8x1ywiQAMHjI7k7UTQ+kgx0wAx+lAwIG6zlviSxwXDAJIwcOKOxdcLP+1E0PpI1NTXCgAC0PpQ+lAx+kjTH/QEMdFtbW0CyPpU+lQT+lLLH/QAyW0lyPpSEswTzBPKAPpUye1UIG6SXwPjDpEw4uDXLCFjtcucMdw3Af4x1ws/+JLtRND6SNTU0gD6UNEi0PpIMfpQ+lDRggCvyPgoGccFGPL0ggCvywFulSZus8MAkXDi8vRtyM+QUCx6RijPCz9SYPpS+lQW+lTJ7UTQ+kgx1DHU0gAx+lAx0YIImJaAAdD6SPpQMfpQMdHIz4WI+lIB+gJxzwtqzMlxOADsMfiS7UTQ1DHXTIIAr8gB0PpI+lAx+lAx0RLHBfL00z8x10z4KiH5AAH5ALqRMI5Fk/ED6ACT8QPpACDaASP7BCPQ7R7tU+1EQBPaIe1UIfkAAdoBcAPIzBLL/87JyM+PGAAEghCjO0mOzwv3cc8LYczJAfsA4gDSjjMx+JLtRNDUMddMggCvyAHQ+kj6UDH6UDHREscF8vTXTNDXLCKsc6rM8r/TP9MP1NF/8AHg1ywmi5qgBJsx0z/6UPQF+JLwAuDXLCDkUgXEnjHTP/pQ+gD6ADD4kvAE4DCEDwHHAPL0AKZtbSBukjBtlMj6UsniyM+TO8BqHhXLPxP6UvpU+lT0AMntRND6SDHUMdTSADH6UDHRggiYloAB0PpI+lAx+lAx0cjPhYj6UgH6AnHPC2rMyXH7AAHe+wAC0PpQ+lAx+kjTH/QEMdEibpJfBI4lNm1tbQLI+lT6VBL6UhbLHxX0AMkjyPpSzMwhzwoAUjD6VMntVOKRMI4mggkxLQD4KMjPhYgT+lIB+gKCECx2uXPPC4ojzws/+lLPgclx+wDiIG6RW+MOOQA8ggr68IDIz4WIEvpSAfoCghBIAGDxzwuKyz/JcfsAANL6SDH6SDDtRND6SNTU0gD6UNEBk27DAJIwcOKOHgHQ+lAx+lD6SNMf9ATRbcj6VBT6VBL6Ussf9ADJAd/Q+kj6UDH6UDHRyM+ROHJrVhXLPxL6UhL6UszJyM+FCBL6UnHPC27MyYBA+wAB/vpIMO1E0PpI1NTSAPpQMALQ+kj6UPpQMdGCAK/KIW7y9CYCyPpSUhD6VBL6VMklyPpSFcwUzMoA+lTJ7VTIz5BQLHpGFMs/+lIS+lT6VMntRND6SDHUMdTSADH6UDHRggiYloAB0PpI+lAx+lAx0cjPhYj6UgH6AnHPC2rMyXE+Af76SPpQMO1E0PpI1NTSAPpQMALQ+kj6UPpQMdGCAK/IIW6zllGBxwXDAJI4cOIY8vRUZXDI+lIY+lT6VMkkyPpSFMwTzBLKAPpUye1UyM+QUCx6RhTLPxP6UvpU+lTJ7UTQ+kgx1DHU0gAx+lAx0YIImJaAAdD6SPpQMfpQMdHIPwK24wLXLCUycC5Ml/pI+lAw8APg1ywlClgURI4zMO1E0PpI1woAkVuOJYIJMS0A+CjIz4WIE/pSAfoCghAsdrlzzwuKEss/+lLPgclx+wDi4NcsJ2eALdQx4wLyP0FCAAT7AAEiic8W+lIB+gJxzwtqzMlx+wBAAAFiAf76SDDtRND6SNTU0gD6UDAC0PpI+lAx+lDRggCvySFus5ZScscFwwCSMXDi8vQlbQLI+lL6VPpUySTI+lIUzBPMEsoA+lTJ7VTIz5OLHTbSE8s/EvpS+lLJ7UTQ+kgx1DHU0gAx+lAx0YIImJaAAdD6SPpQMfpQMdHIz4WI+lIBQwCW7UTQ+kgx1NMAMfpQMCBus5ExjhEw0PpQ+lAx+kgx0x8x9AQx0eIgbpFbjh6CCvrwgMjPhYgS+lIB+gKCEEgAYPHPC4rLP8lx+wDiABb6AnHPC2rMyXH7AABpDEy7UTQ+kjU1NIA+lAwUWTHBbOSMH+SwwDikjN/lANuwwDikl8E4AHI+lLMzM+D+lTJ7VSAB9ztRND6SNTU1woAIdD6SDH6UPpQMdGCAK/IIW6zlQfHBcMAkzE2cOIW8vQjbo4vIwPI+lISzMwTygAS+lTJ7VSCCvrwgMjPhYgS+lIB+gKCEEgAYPHPC4rLP8lx+wDhXwXtRND6SNTU1woAAtD6UPpQMfpI0x/0BDHRbW2BGAPJtAsj6VPpUE/pSyx/0AMltJcj6UhLME8wTygD6VMntVCBukl8D4G1tIG6SMG2UyPpSyeLIz5M7wGoeFcs/E/pS+lT6VPQAye1E0PpIMdQx1NIAMfpQMdGCCJiWgAHQ+kj6UDH6UDHRyM+FiPpSAfoCcc8LaszJcfsAAvU7aLt++1E0PpI1NTSAPpQMAPQ+lD6UPpI0x/0BDHRJm6zllOGxwXDAJFw4pI2bY4UI26Rf5dTg8cFs8MA4pRfDdsx4AbiU4vIUA36AlAL+gLJCsj6VBv6VPpSFcsfF/QAySTI+lLMEszKABX6VMntVFMh8AWzkjN/4w6BJSgAdCFukjFu4CBukltw4McFgAA5RNPAFs8MAAK6OUiNukjNtlQPI+lLJ4sjPkzvAah4Vyz8S+lL6VPpU9ADJ7UTQ+kgx1DHU0gAx+lAx0YIImJaAAdD6SPpQMfpQMdHIz4WI+lIB+gJxzwtqzMlx+wDgXwUACyBTbzy8IAAPItTEuNi4wiACASBPUAAHvZDDjAIBIFFSAD27BS7UTQ+kgx1NQx0gAx+lAx0dD6UPpQ+kjTH/QE0YAG+2K/GhW2NLc1lzG0MLS3Fzo3txcxsbS4Fyo3tbK3ILI2tLcpMrO0ubo5PKK3Ojk8wRamJcbFxhEAIBSFNUADWuY3aiaH0kGOoY6hjpAH0oaIDJt2GASRg4cUAANa9LdqJofSQY6hjqaQAY/SgY6Oh9JH0ofShowAHiMe1E0NMfMfpIMfpQMdHTP/pI+lD6UDD4koj4KMj6Us+QAAAADlJQ+lLJAcjPhNDMzPkWyM+KAEDL/89QAYIAxnACxwXy9HDIz5BQLHpGFcs/E/pS+lT6VMnIz48YAASCEARN52nPC/dxzwthzMkB+wBdAdox7UTQ0x8x+kgx+lAx0dM/+kj6SDD4koj4KMj6Us+QAAAADlJA+lLJAcjPhNDMzPkWyM+KAEDL/89QAYIAxnACxwXy9HDIz5OLHTbSFMs/EvpS+lLJyM+PGAAEghBOSbeFzwv3cc8LYczJAfsAXQHqMe1E0NMfMfpIMfpQMdHTP/pI+lD6UPQF+JKI+CjI+lLPkAAAAA5SYPpSyQHIz4TQzMz5FsjPigBAy//PUAGCAMZwAscF8vRwyM+TO8BqHhbLPxT6UhL6VPpU9ADJyM+PGAAEghAMkZlPzwv3cc8LYczJAfsAXQNoidcn4wLXLCXcF20s4wIw7UTQ1h/6SPpQMPiSJPABmzMByM76UvpUye1U4F8DhA8BxwDy9FlaWwAIGCr/wgL+MYIAxnH4l4ILRzvAvvL00z/6SDBtbQGBAI1RIvADMYj4KMj6Us+QAAAADhP6UslYyM+E0MzM+RbIz4oAQMv/z1DIz5KFLAoiycjPhYAjwwDPCgDPhEAS+lLPhBAiwAKVbBJz+gKeAsADlAFx+gKUAc+EIOLighBVjnVZzwuFEl1cAv4xggDGcfiXghAFEP9AvvL00z/6SDBtbQGBAI5RIvADMYj4KMj6Us+QAAAADhP6UslYyM+E0MzM+RbIz4oAQMv/z1DIz5OzwBbqycjPhYAjwwDPCgDPhEAS+lLPhBAiwAKVbBJz+gKeAsADlAFx+gKUAc+EIOLighBVjnVZzwuFXV4AGMs/z4gABszJgED7AAEU/wD0pBP0vPLIC18AGhLLP8+IAAbMyYBA+wACAWJgYQCk0PiR8kDtRND6SDCBI/D4kljHBfL01ywl0jMiPJjU10wB+wTtVODXLCWHYoq8jiDU1PoA10wD+wQB7VT4KMjPhQj6UgH6AnHPC2rMyXH7AODyPwIBSGJjAgEgZGUACbhoWAXIAFO2K/Gg62NLc1lzG0MLS3Fzo3txc2NLEXIjK4Nje8sLE2MsEWpiXGBcYRAAGbXFECR+FAQQgfd+UJA=');

    static Errors = {
        'Upgradeable_Error.VersionMismatch': 19900,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'TokenAdminRegistry_Error.UnauthorizedEntry': 50800,
        'TokenAdminRegistry_Error.InsufficientValue': 50801,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TokenAdminRegistry(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistry.CodeCell,
            data: TokenAdminRegistry_Storage.toCell(TokenAdminRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistry(address, initialState);
    }

    static createCellOfTokenAdminRegistryRegisterToken(body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }) {
        return TokenAdminRegistry_RegisterToken.toCell(TokenAdminRegistry_RegisterToken.create(body));
    }

    static createCellOfTokenAdminRegistryOverridePendingAdministrator(body: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }) {
        return TokenAdminRegistry_OverridePendingAdministrator.toCell(TokenAdminRegistry_OverridePendingAdministrator.create(body));
    }

    static createCellOfTokenAdminRegistryTransferAdminRole(body: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistry_TransferAdminRole.toCell(TokenAdminRegistry_TransferAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryAcceptAdminRole(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_AcceptAdminRole.toCell(TokenAdminRegistry_AcceptAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistrySetPool(body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenPool: c.Address | null
    }) {
        return TokenAdminRegistry_SetPool.toCell(TokenAdminRegistry_SetPool.create(body));
    }

    static createCellOfTokenAdminRegistryGetTokenInfo(body: {
        queryId?: uint64
        token: c.Address
    }) {
        return TokenAdminRegistry_GetTokenInfo.toCell(TokenAdminRegistry_GetTokenInfo.create(body));
    }

    static createCellOfTokenAdminRegistryEntryTokenInfo(body: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }) {
        return TokenAdminRegistryEntry_TokenInfo.toCell(TokenAdminRegistryEntry_TokenInfo.create(body));
    }

    static createCellOfTokenAdminRegistryEntryUpgradeRequest(body: {
        queryId?: uint64
        token: c.Address
        request: TokenAdminRegistryEntry_MessageFromRoot
    }) {
        return TokenAdminRegistry_EntryUpgradeRequest.toCell(TokenAdminRegistry_EntryUpgradeRequest.create(body));
    }

    static createCellOfTokenAdminRegistryUpgradeEntry(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_UpgradeEntry.toCell(TokenAdminRegistry_UpgradeEntry.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId?: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
    }

    static createCellOfTokenAdminRegistryAdministratorTransferRequested(body: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistry_AdministratorTransferRequested.toCell(TokenAdminRegistry_AdministratorTransferRequested.create(body));
    }

    static createCellOfTokenAdminRegistryAdministratorTransferred(body: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }) {
        return TokenAdminRegistry_AdministratorTransferred.toCell(TokenAdminRegistry_AdministratorTransferred.create(body));
    }

    static createCellOfTokenAdminRegistryPoolSet(body: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
        transferInitiator: c.Address | null
    }) {
        return TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body));
    }

    static createCellOfTokenAdminRegistryVerifyToken(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_VerifyToken.toCell(TokenAdminRegistry_VerifyToken.create(body));
    }

    static createCellOfTokenAdminRegistryRefreshPoolConfig(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_RefreshPoolConfig.toCell(TokenAdminRegistry_RefreshPoolConfig.create(body));
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

    async sendTokenAdminRegistryRegisterToken(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_RegisterToken.toCell(TokenAdminRegistry_RegisterToken.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryOverridePendingAdministrator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_OverridePendingAdministrator.toCell(TokenAdminRegistry_OverridePendingAdministrator.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryTransferAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_TransferAdminRole.toCell(TokenAdminRegistry_TransferAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryAcceptAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AcceptAdminRole.toCell(TokenAdminRegistry_AcceptAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistrySetPool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenPool: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_SetPool.toCell(TokenAdminRegistry_SetPool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryGetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_GetTokenInfo.toCell(TokenAdminRegistry_GetTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_TokenInfo.toCell(TokenAdminRegistryEntry_TokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryUpgradeRequest(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        request: TokenAdminRegistryEntry_MessageFromRoot
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_EntryUpgradeRequest.toCell(TokenAdminRegistry_EntryUpgradeRequest.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryUpgradeEntry(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_UpgradeEntry.toCell(TokenAdminRegistry_UpgradeEntry.create(body)),
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

    async sendTokenAdminRegistryAdministratorTransferRequested(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AdministratorTransferRequested.toCell(TokenAdminRegistry_AdministratorTransferRequested.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryAdministratorTransferred(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AdministratorTransferred.toCell(TokenAdminRegistry_AdministratorTransferred.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryPoolSet(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
        transferInitiator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryVerifyToken(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_VerifyToken.toCell(TokenAdminRegistry_VerifyToken.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryRefreshPoolConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_RefreshPoolConfig.toCell(TokenAdminRegistry_RefreshPoolConfig.create(body)),
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
}
