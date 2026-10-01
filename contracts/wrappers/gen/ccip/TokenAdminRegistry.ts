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
 > struct (0x8f422c44) TokenAdminRegistry_TokenInfoResolved {
 >     queryId: uint64
 >     token: address
 >     requester: address
 >     tokenInfo: Cell<TokenRegistry_TokenInfo>
 > }
 */
export interface TokenAdminRegistry_TokenInfoResolved {
    readonly $: 'TokenAdminRegistry_TokenInfoResolved'
    queryId: uint64
    token: c.Address
    requester: c.Address
    tokenInfo: TokenRegistry_TokenInfo
}

export const TokenAdminRegistry_TokenInfoResolved = {
    PREFIX: 0x8f422c44,

    create(args: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }): TokenAdminRegistry_TokenInfoResolved {
        return {
            $: 'TokenAdminRegistry_TokenInfoResolved',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_TokenInfoResolved {
        loadAndCheckPrefix32(s, 0x8f422c44, 'TokenAdminRegistry_TokenInfoResolved');
        return {
            $: 'TokenAdminRegistry_TokenInfoResolved',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            requester: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
        }
    },
    store(self: TokenAdminRegistry_TokenInfoResolved, b: c.Builder): void {
        b.storeUint(0x8f422c44, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.requester);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
    },
    toCell(self: TokenAdminRegistry_TokenInfoResolved): c.Cell {
        return makeCellFrom<TokenAdminRegistry_TokenInfoResolved>(self, TokenAdminRegistry_TokenInfoResolved.store);
    }
}

/**
 > struct (0x8db6ef6c) TokenAdminRegistry_ReturnTokenInfo {
 >     queryId: uint64
 >     token: address
 >     minterAddress: address
 >     tokenPool: address?
 >     version: uint32
 > }
 */
export interface TokenAdminRegistry_ReturnTokenInfo {
    readonly $: 'TokenAdminRegistry_ReturnTokenInfo'
    queryId: uint64
    token: c.Address
    minterAddress: c.Address
    tokenPool: c.Address | null
    version: uint32
}

export const TokenAdminRegistry_ReturnTokenInfo = {
    PREFIX: 0x8db6ef6c,

    create(args: {
        queryId?: uint64
        token: c.Address
        minterAddress: c.Address
        tokenPool: c.Address | null
        version: uint32
    }): TokenAdminRegistry_ReturnTokenInfo {
        return {
            $: 'TokenAdminRegistry_ReturnTokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_ReturnTokenInfo {
        loadAndCheckPrefix32(s, 0x8db6ef6c, 'TokenAdminRegistry_ReturnTokenInfo');
        return {
            $: 'TokenAdminRegistry_ReturnTokenInfo',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            minterAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenAdminRegistry_ReturnTokenInfo, b: c.Builder): void {
        b.storeUint(0x8db6ef6c, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.version, 32);
    },
    toCell(self: TokenAdminRegistry_ReturnTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_ReturnTokenInfo>(self, TokenAdminRegistry_ReturnTokenInfo.store);
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
 > }
 */
export interface TokenAdminRegistry_PoolSet {
    readonly $: 'TokenAdminRegistry_PoolSet'
    queryId: uint64
    token: c.Address
    previousPool: c.Address | null
    newPool: c.Address | null
}

export const TokenAdminRegistry_PoolSet = {
    PREFIX: 0xcef01a87,

    create(args: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
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
        }
    },
    store(self: TokenAdminRegistry_PoolSet, b: c.Builder): void {
        b.storeUint(0xcef01a87, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.previousPool);
        b.storeAddress(self.newPool);
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
 > type TokenAdminRegistryEntry_RootMessage = TokenAdminRegistryEntry_ResolveTokenInfo | TokenAdminRegistryEntry_ProposeAdministrator | TokenAdminRegistryEntry_TransferAdminRole | TokenAdminRegistryEntry_AcceptAdminRole | TokenAdminRegistryEntry_SetPool
 */
export type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_ResolveTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool

export const TokenAdminRegistryEntry_RootMessage = {
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RootMessage {
        return lookupPrefix(s, 0x4f60fff3, 32) ? TokenAdminRegistryEntry_ResolveTokenInfo.fromSlice(s) :
            lookupPrefix(s, 0x6dcbe573, 32) ? TokenAdminRegistryEntry_ProposeAdministrator.fromSlice(s) :
            lookupPrefix(s, 0x8b1503cf, 32) ? TokenAdminRegistryEntry_TransferAdminRole.fromSlice(s) :
            lookupPrefix(s, 0x39c6e872, 32) ? TokenAdminRegistryEntry_AcceptAdminRole.fromSlice(s) :
            lookupPrefix(s, 0xa64e05c9, 32) ? TokenAdminRegistryEntry_SetPool.fromSlice(s) :
            throwNonePrefixMatch('TokenAdminRegistryEntry_RootMessage');
    },
    store(self: TokenAdminRegistryEntry_RootMessage, b: c.Builder): void {
        switch (self.$) {
            case 'TokenAdminRegistryEntry_ResolveTokenInfo':
                TokenAdminRegistryEntry_ResolveTokenInfo.store(self, b);
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
 > struct (0x4f60fff3) TokenAdminRegistryEntry_ResolveTokenInfo {
 >     requester: address
 > }
 */
export interface TokenAdminRegistryEntry_ResolveTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_ResolveTokenInfo'
    requester: c.Address
}

export const TokenAdminRegistryEntry_ResolveTokenInfo = {
    PREFIX: 0x4f60fff3,

    create(args: {
        requester: c.Address
    }): TokenAdminRegistryEntry_ResolveTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ResolveTokenInfo {
        loadAndCheckPrefix32(s, 0x4f60fff3, 'TokenAdminRegistryEntry_ResolveTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            requester: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ResolveTokenInfo, b: c.Builder): void {
        b.storeUint(0x4f60fff3, 32);
        b.storeAddress(self.requester);
    },
    toCell(self: TokenAdminRegistryEntry_ResolveTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ResolveTokenInfo>(self, TokenAdminRegistryEntry_ResolveTokenInfo.store);
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
 > struct (0x1fa23ab9) TokenAdminRegistryEntry_UpgradeAndResume {
 >     queryId: uint64
 >     code: cell
 >     request: Cell<TokenAdminRegistryEntry_MessageFromRoot>?
 > }
 */
export interface TokenAdminRegistryEntry_UpgradeAndResume {
    readonly $: 'TokenAdminRegistryEntry_UpgradeAndResume'
    queryId: uint64
    code: c.Cell
    request: TokenAdminRegistryEntry_MessageFromRoot | null
}

export const TokenAdminRegistryEntry_UpgradeAndResume = {
    PREFIX: 0x1fa23ab9,

    create(args: {
        queryId?: uint64
        code: c.Cell
        request: TokenAdminRegistryEntry_MessageFromRoot | null
    }): TokenAdminRegistryEntry_UpgradeAndResume {
        return {
            $: 'TokenAdminRegistryEntry_UpgradeAndResume',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_UpgradeAndResume {
        loadAndCheckPrefix32(s, 0x1fa23ab9, 'TokenAdminRegistryEntry_UpgradeAndResume');
        return {
            $: 'TokenAdminRegistryEntry_UpgradeAndResume',
            queryId: s.loadUintBig(64),
            code: s.loadRef(),
            request: s.loadBoolean() ? loadCellRef<TokenAdminRegistryEntry_MessageFromRoot>(s, TokenAdminRegistryEntry_MessageFromRoot.fromSlice) : null,
        }
    },
    store(self: TokenAdminRegistryEntry_UpgradeAndResume, b: c.Builder): void {
        b.storeUint(0x1fa23ab9, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.code);
        storeTolkNullable<TokenAdminRegistryEntry_MessageFromRoot>(self.request, b,
            (v,b) => storeCellRef<TokenAdminRegistryEntry_MessageFromRoot>(v, b, TokenAdminRegistryEntry_MessageFromRoot.store)
        );
    },
    toCell(self: TokenAdminRegistryEntry_UpgradeAndResume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_UpgradeAndResume>(self, TokenAdminRegistryEntry_UpgradeAndResume.store);
    }
}

/**
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address?
 >     minterAddress: address
 >     version: uint32
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address | null
    minterAddress: c.Address
    version: uint32 /* = 1 */
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address | null
        minterAddress: c.Address
        version?: uint32 /* = 1 */
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            version: 1n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadMaybeAddress(),
            minterAddress: s.loadAddress(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeUint(self.version, 32);
    },
    toCell(self: TokenRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_TokenInfo>(self, TokenRegistry_TokenInfo.store);
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
    static CodeCell = c.Cell.fromBase64('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');

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

    static createCellOfTokenAdminRegistryTokenInfoResolved(body: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }) {
        return TokenAdminRegistry_TokenInfoResolved.toCell(TokenAdminRegistry_TokenInfoResolved.create(body));
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
    }) {
        return TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body));
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

    async sendTokenAdminRegistryTokenInfoResolved(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        requester: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_TokenInfoResolved.toCell(TokenAdminRegistry_TokenInfoResolved.create(body)),
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
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body)),
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
