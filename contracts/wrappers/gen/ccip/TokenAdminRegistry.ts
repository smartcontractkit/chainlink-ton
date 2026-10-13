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
 > struct (0x2fb10afd) TokenAdminRegistry_RefreshTransferInitiator {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_RefreshTransferInitiator {
    readonly $: 'TokenAdminRegistry_RefreshTransferInitiator'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_RefreshTransferInitiator = {
    PREFIX: 0x2fb10afd,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_RefreshTransferInitiator {
        return {
            $: 'TokenAdminRegistry_RefreshTransferInitiator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_RefreshTransferInitiator {
        loadAndCheckPrefix32(s, 0x2fb10afd, 'TokenAdminRegistry_RefreshTransferInitiator');
        return {
            $: 'TokenAdminRegistry_RefreshTransferInitiator',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_RefreshTransferInitiator, b: c.Builder): void {
        b.storeUint(0x2fb10afd, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_RefreshTransferInitiator): c.Cell {
        return makeCellFrom<TokenAdminRegistry_RefreshTransferInitiator>(self, TokenAdminRegistry_RefreshTransferInitiator.store);
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
 >     tokenPool: address?
 >     transferInitiator: Cell<address>?
 >     version: uint32
 > }
 */
export interface TokenAdminRegistry_TokenInfo {
    readonly $: 'TokenAdminRegistry_TokenInfo'
    queryId: uint64
    token: c.Address
    minterAddress: c.Address
    tokenPool: c.Address | null
    transferInitiator: c.Address | null
    version: uint32
}

export const TokenAdminRegistry_TokenInfo = {
    PREFIX: 0x0a9bf5d1,

    create(args: {
        queryId?: uint64
        token: c.Address
        minterAddress: c.Address
        tokenPool: c.Address | null
        transferInitiator: c.Address | null
        version: uint32
    }): TokenAdminRegistry_TokenInfo {
        return {
            $: 'TokenAdminRegistry_TokenInfo',
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
            tokenPool: s.loadMaybeAddress(),
            transferInitiator: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenAdminRegistry_TokenInfo, b: c.Builder): void {
        b.storeUint(0x0a9bf5d1, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
        storeTolkNullable<c.Address>(self.transferInitiator, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
        b.storeUint(self.version, 32);
    },
    toCell(self: TokenAdminRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_TokenInfo>(self, TokenAdminRegistry_TokenInfo.store);
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
 > type TokenAdminRegistryEntry_RootMessage = TokenAdminRegistryEntry_GetTokenInfo | TokenAdminRegistryEntry_ProposeAdministrator | TokenAdminRegistryEntry_TransferAdminRole | TokenAdminRegistryEntry_AcceptAdminRole | TokenAdminRegistryEntry_SetPool | TokenAdminRegistryEntry_VerifyToken | TokenAdminRegistryEntry_RefreshTransferInitiator
 */
export type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool
    | TokenAdminRegistryEntry_VerifyToken
    | TokenAdminRegistryEntry_RefreshTransferInitiator

export const TokenAdminRegistryEntry_RootMessage = {
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RootMessage {
        return lookupPrefix(s, 0x7aef4c2d, 32) ? TokenAdminRegistryEntry_GetTokenInfo.fromSlice(s) :
            lookupPrefix(s, 0x6dcbe573, 32) ? TokenAdminRegistryEntry_ProposeAdministrator.fromSlice(s) :
            lookupPrefix(s, 0x8b1503cf, 32) ? TokenAdminRegistryEntry_TransferAdminRole.fromSlice(s) :
            lookupPrefix(s, 0x39c6e872, 32) ? TokenAdminRegistryEntry_AcceptAdminRole.fromSlice(s) :
            lookupPrefix(s, 0xa64e05c9, 32) ? TokenAdminRegistryEntry_SetPool.fromSlice(s) :
            lookupPrefix(s, 0xa14b0288, 32) ? TokenAdminRegistryEntry_VerifyToken.fromSlice(s) :
            lookupPrefix(s, 0x91f8fb81, 32) ? TokenAdminRegistryEntry_RefreshTransferInitiator.fromSlice(s) :
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
            case 'TokenAdminRegistryEntry_RefreshTransferInitiator':
                TokenAdminRegistryEntry_RefreshTransferInitiator.store(self, b);
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
 > struct (0x91f8fb81) TokenAdminRegistryEntry_RefreshTransferInitiator {
 > }
 */
export interface TokenAdminRegistryEntry_RefreshTransferInitiator {
    readonly $: 'TokenAdminRegistryEntry_RefreshTransferInitiator'
}

export const TokenAdminRegistryEntry_RefreshTransferInitiator = {
    PREFIX: 0x91f8fb81,

    create(): TokenAdminRegistryEntry_RefreshTransferInitiator {
        return {
            $: 'TokenAdminRegistryEntry_RefreshTransferInitiator',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RefreshTransferInitiator {
        loadAndCheckPrefix32(s, 0x91f8fb81, 'TokenAdminRegistryEntry_RefreshTransferInitiator');
        return {
            $: 'TokenAdminRegistryEntry_RefreshTransferInitiator',
        }
    },
    store(self: TokenAdminRegistryEntry_RefreshTransferInitiator, b: c.Builder): void {
        b.storeUint(0x91f8fb81, 32);
    },
    toCell(self: TokenAdminRegistryEntry_RefreshTransferInitiator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RefreshTransferInitiator>(self, TokenAdminRegistryEntry_RefreshTransferInitiator.store);
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
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address | null
    transferInitiator: c.Address | null /* = null */
    minterAddress: c.Address
    version: uint32 /* = 1 */
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address | null
        transferInitiator?: c.Address | null /* = null */
        minterAddress: c.Address
        version?: uint32 /* = 1 */
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            transferInitiator: null,
            version: 1n,
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
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.transferInitiator);
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

    static createCellOfTokenAdminRegistryRefreshTransferInitiator(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_RefreshTransferInitiator.toCell(TokenAdminRegistry_RefreshTransferInitiator.create(body));
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

    async sendTokenAdminRegistryRefreshTransferInitiator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_RefreshTransferInitiator.toCell(TokenAdminRegistry_RefreshTransferInitiator.create(body)),
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
