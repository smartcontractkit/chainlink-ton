// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenAdminRegistryEntry contract in Tolk.
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
 > struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {
 >     queryId: uint64
 > }
 */
export interface TokenAdminRegistryEntry_GetTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_GetTokenInfo'
    queryId: uint64
}

export const TokenAdminRegistryEntry_GetTokenInfo = {
    PREFIX: 0x7aef4c2d,

    create(args: {
        queryId?: uint64
    }): TokenAdminRegistryEntry_GetTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0x7aef4c2d, 'TokenAdminRegistryEntry_GetTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenAdminRegistryEntry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0x7aef4c2d, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenAdminRegistryEntry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_GetTokenInfo>(self, TokenAdminRegistryEntry_GetTokenInfo.store);
    }
}

/**
 > struct (0x4f60fff3) TokenAdminRegistryEntry_ResolveTokenInfo {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     requester: address
 > }
 */
export interface TokenAdminRegistryEntry_ResolveTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_ResolveTokenInfo'
    queryId: uint64
    minEntryVersion: uint16
    requester: c.Address
}

export const TokenAdminRegistryEntry_ResolveTokenInfo = {
    PREFIX: 0x4f60fff3,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        requester: c.Address
    }): TokenAdminRegistryEntry_ResolveTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ResolveTokenInfo {
        loadAndCheckPrefix32(s, 0x4f60fff3, 'TokenAdminRegistryEntry_ResolveTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            requester: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ResolveTokenInfo, b: c.Builder): void {
        b.storeUint(0x4f60fff3, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        b.storeAddress(self.requester);
    },
    toCell(self: TokenAdminRegistryEntry_ResolveTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ResolveTokenInfo>(self, TokenAdminRegistryEntry_ResolveTokenInfo.store);
    }
}

/**
 > struct (0x31580269) TokenAdminRegistryEntry_RegistrationInitialized {
 >     queryId: uint64
 > }
 */
export interface TokenAdminRegistryEntry_RegistrationInitialized {
    readonly $: 'TokenAdminRegistryEntry_RegistrationInitialized'
    queryId: uint64
}

export const TokenAdminRegistryEntry_RegistrationInitialized = {
    PREFIX: 0x31580269,

    create(args: {
        queryId?: uint64
    }): TokenAdminRegistryEntry_RegistrationInitialized {
        return {
            $: 'TokenAdminRegistryEntry_RegistrationInitialized',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RegistrationInitialized {
        loadAndCheckPrefix32(s, 0x31580269, 'TokenAdminRegistryEntry_RegistrationInitialized');
        return {
            $: 'TokenAdminRegistryEntry_RegistrationInitialized',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenAdminRegistryEntry_RegistrationInitialized, b: c.Builder): void {
        b.storeUint(0x31580269, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenAdminRegistryEntry_RegistrationInitialized): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RegistrationInitialized>(self, TokenAdminRegistryEntry_RegistrationInitialized.store);
    }
}

/**
 > struct (0x6dcbe573) TokenAdminRegistryEntry_ProposeAdministrator {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    queryId: uint64
    minEntryVersion: uint16
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x6dcbe573,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        administrator: c.Address
    }): TokenAdminRegistryEntry_ProposeAdministrator {
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ProposeAdministrator {
        loadAndCheckPrefix32(s, 0x6dcbe573, 'TokenAdminRegistryEntry_ProposeAdministrator');
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x6dcbe573, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     actor: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    queryId: uint64
    minEntryVersion: uint16
    actor: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x8b1503cf,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistryEntry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0x8b1503cf, 'TokenAdminRegistryEntry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            actor: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x8b1503cf, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        b.storeAddress(self.actor);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistryEntry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TransferAdminRole>(self, TokenAdminRegistryEntry_TransferAdminRole.store);
    }
}

/**
 > struct (0x39c6e872) TokenAdminRegistryEntry_AcceptAdminRole {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     actor: address
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
    queryId: uint64
    minEntryVersion: uint16
    actor: c.Address
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0x39c6e872,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
    }): TokenAdminRegistryEntry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0x39c6e872, 'TokenAdminRegistryEntry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            actor: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0x39c6e872, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        b.storeAddress(self.actor);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct (0xa64e05c9) TokenAdminRegistryEntry_SetPool {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     actor: address
 >     tokenPool: address?
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    queryId: uint64
    minEntryVersion: uint16
    actor: c.Address
    tokenPool: c.Address | null
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa64e05c9,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        tokenPool: c.Address | null
    }): TokenAdminRegistryEntry_SetPool {
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_SetPool {
        loadAndCheckPrefix32(s, 0xa64e05c9, 'TokenAdminRegistryEntry_SetPool');
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            actor: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa64e05c9, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
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
 >     pending: Cell<TokenAdminRegistryEntry_Pending>?
 > }
 */
export interface TokenAdminRegistryEntry_UpgradeAndResume {
    readonly $: 'TokenAdminRegistryEntry_UpgradeAndResume'
    queryId: uint64
    code: c.Cell
    pending: TokenAdminRegistryEntry_Pending | null
}

export const TokenAdminRegistryEntry_UpgradeAndResume = {
    PREFIX: 0x1fa23ab9,

    create(args: {
        queryId?: uint64
        code: c.Cell
        pending: TokenAdminRegistryEntry_Pending | null
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
            pending: s.loadBoolean() ? loadCellRef<TokenAdminRegistryEntry_Pending>(s, TokenAdminRegistryEntry_Pending.fromSlice) : null,
        }
    },
    store(self: TokenAdminRegistryEntry_UpgradeAndResume, b: c.Builder): void {
        b.storeUint(0x1fa23ab9, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.code);
        storeTolkNullable<TokenAdminRegistryEntry_Pending>(self.pending, b,
            (v,b) => storeCellRef<TokenAdminRegistryEntry_Pending>(v, b, TokenAdminRegistryEntry_Pending.store)
        );
    },
    toCell(self: TokenAdminRegistryEntry_UpgradeAndResume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_UpgradeAndResume>(self, TokenAdminRegistryEntry_UpgradeAndResume.store);
    }
}

/**
 > struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
 >     pending: Cell<TokenAdminRegistryEntry_Pending>
 > }
 */
export interface TokenAdminRegistryEntry_Resume {
    readonly $: 'TokenAdminRegistryEntry_Resume'
    pending: TokenAdminRegistryEntry_Pending
}

export const TokenAdminRegistryEntry_Resume = {
    PREFIX: 0x47d63a64,

    create(args: {
        pending: TokenAdminRegistryEntry_Pending
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
            pending: loadCellRef<TokenAdminRegistryEntry_Pending>(s, TokenAdminRegistryEntry_Pending.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_Resume, b: c.Builder): void {
        b.storeUint(0x47d63a64, 32);
        storeCellRef<TokenAdminRegistryEntry_Pending>(self.pending, b, TokenAdminRegistryEntry_Pending.store);
    },
    toCell(self: TokenAdminRegistryEntry_Resume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Resume>(self, TokenAdminRegistryEntry_Resume.store);
    }
}

/**
 > struct (0x0a58e678) TokenAdminRegistryEntry_ReturnTokenInfo {
 >     queryId: uint64
 >     minterAddress: address
 >     tokenPool: address?
 >     version: uint32
 > }
 */
export interface TokenAdminRegistryEntry_ReturnTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_ReturnTokenInfo'
    queryId: uint64
    minterAddress: c.Address
    tokenPool: c.Address | null
    version: uint32
}

export const TokenAdminRegistryEntry_ReturnTokenInfo = {
    PREFIX: 0x0a58e678,

    create(args: {
        queryId?: uint64
        minterAddress: c.Address
        tokenPool: c.Address | null
        version: uint32
    }): TokenAdminRegistryEntry_ReturnTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_ReturnTokenInfo',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ReturnTokenInfo {
        loadAndCheckPrefix32(s, 0x0a58e678, 'TokenAdminRegistryEntry_ReturnTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_ReturnTokenInfo',
            queryId: s.loadUintBig(64),
            minterAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenAdminRegistryEntry_ReturnTokenInfo, b: c.Builder): void {
        b.storeUint(0x0a58e678, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.version, 32);
    },
    toCell(self: TokenAdminRegistryEntry_ReturnTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ReturnTokenInfo>(self, TokenAdminRegistryEntry_ReturnTokenInfo.store);
    }
}

/**
 > struct TokenRegistry_AdminConfig {
 >     tokenAdminRegistry: address
 >     administrator: address?
 >     pendingAdministrator: address?
 > }
 */
export interface TokenRegistry_AdminConfig {
    readonly $: 'TokenRegistry_AdminConfig'
    tokenAdminRegistry: c.Address
    administrator: c.Address | null
    pendingAdministrator: c.Address | null
}

export const TokenRegistry_AdminConfig = {
    create(args: {
        tokenAdminRegistry: c.Address
        administrator: c.Address | null
        pendingAdministrator: c.Address | null
    }): TokenRegistry_AdminConfig {
        return {
            $: 'TokenRegistry_AdminConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_AdminConfig {
        return {
            $: 'TokenRegistry_AdminConfig',
            tokenAdminRegistry: s.loadAddress(),
            administrator: s.loadMaybeAddress(),
            pendingAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenRegistry_AdminConfig, b: c.Builder): void {
        b.storeAddress(self.tokenAdminRegistry);
        b.storeAddress(self.administrator);
        b.storeAddress(self.pendingAdministrator);
    },
    toCell(self: TokenRegistry_AdminConfig): c.Cell {
        return makeCellFrom<TokenRegistry_AdminConfig>(self, TokenRegistry_AdminConfig.store);
    }
}

/**
 > struct TokenRegistry_Storage {
 >     tokenAddress: address
 >     tokenInfo: TokenRegistry_TokenInfo
 >     adminConfig: Cell<TokenRegistry_AdminConfig>
 > }
 */
export interface TokenRegistry_Storage {
    readonly $: 'TokenRegistry_Storage'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    adminConfig: TokenRegistry_AdminConfig
}

export const TokenRegistry_Storage = {
    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        adminConfig: TokenRegistry_AdminConfig
    }): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            tokenAddress: s.loadAddress(),
            tokenInfo: TokenRegistry_TokenInfo.fromSlice(s),
            adminConfig: loadCellRef<TokenRegistry_AdminConfig>(s, TokenRegistry_AdminConfig.fromSlice),
        }
    },
    store(self: TokenRegistry_Storage, b: c.Builder): void {
        b.storeAddress(self.tokenAddress);
        TokenRegistry_TokenInfo.store(self.tokenInfo, b);
        storeCellRef<TokenRegistry_AdminConfig>(self.adminConfig, b, TokenRegistry_AdminConfig.store);
    },
    toCell(self: TokenRegistry_Storage): c.Cell {
        return makeCellFrom<TokenRegistry_Storage>(self, TokenRegistry_Storage.store);
    }
}

/**
 > enum TokenAdminRegistryEntry_Error { 5 variants }
 */
export type TokenAdminRegistryEntry_Error = bigint

export const TokenAdminRegistryEntry_Error = {
    Unauthorized: 45000n,
    OnlyPendingAdministrator: 45001n,
    AlreadyRegistered: 45002n,
    InvalidAdministrator: 45003n,
    VersionUnavailable: 45004n,

    fromSlice(s: c.Slice): TokenAdminRegistryEntry_Error {
        return s.loadUintBig(16);
    },
    store(self: TokenAdminRegistryEntry_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: TokenAdminRegistryEntry_Error): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Error>(self, TokenAdminRegistryEntry_Error.store);
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

/**
 > struct TokenAdminRegistryEntry_Pending {
 >     sender: address
 >     body: cell
 > }
 */
export interface TokenAdminRegistryEntry_Pending {
    readonly $: 'TokenAdminRegistryEntry_Pending'
    sender: c.Address
    body: c.Cell
}

export const TokenAdminRegistryEntry_Pending = {
    create(args: {
        sender: c.Address
        body: c.Cell
    }): TokenAdminRegistryEntry_Pending {
        return {
            $: 'TokenAdminRegistryEntry_Pending',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_Pending {
        return {
            $: 'TokenAdminRegistryEntry_Pending',
            sender: s.loadAddress(),
            body: s.loadRef(),
        }
    },
    store(self: TokenAdminRegistryEntry_Pending, b: c.Builder): void {
        b.storeAddress(self.sender);
        b.storeRef(self.body);
    },
    toCell(self: TokenAdminRegistryEntry_Pending): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Pending>(self, TokenAdminRegistryEntry_Pending.store);
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
 > struct (0x55b8b654) TokenAdminRegistry_EntryUpgradeRequest {
 >     queryId: uint64
 >     token: address
 >     pending: Cell<TokenAdminRegistryEntry_Pending>
 > }
 */
export interface TokenAdminRegistry_EntryUpgradeRequest {
    readonly $: 'TokenAdminRegistry_EntryUpgradeRequest'
    queryId: uint64
    token: c.Address
    pending: TokenAdminRegistryEntry_Pending
}

export const TokenAdminRegistry_EntryUpgradeRequest = {
    PREFIX: 0x55b8b654,

    create(args: {
        queryId?: uint64
        token: c.Address
        pending: TokenAdminRegistryEntry_Pending
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
            pending: loadCellRef<TokenAdminRegistryEntry_Pending>(s, TokenAdminRegistryEntry_Pending.fromSlice),
        }
    },
    store(self: TokenAdminRegistry_EntryUpgradeRequest, b: c.Builder): void {
        b.storeUint(0x55b8b654, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        storeCellRef<TokenAdminRegistryEntry_Pending>(self.pending, b, TokenAdminRegistryEntry_Pending.store);
    },
    toCell(self: TokenAdminRegistry_EntryUpgradeRequest): c.Cell {
        return makeCellFrom<TokenAdminRegistry_EntryUpgradeRequest>(self, TokenAdminRegistry_EntryUpgradeRequest.store);
    }
}

// ————————————————————————————————————————————
//    class TokenAdminRegistryEntry
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

export class TokenAdminRegistryEntry implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Upgradeable_Error.VersionMismatch': 19900,
        'TokenAdminRegistryEntry_Error.Unauthorized': 45000,
        'TokenAdminRegistryEntry_Error.OnlyPendingAdministrator': 45001,
        'TokenAdminRegistryEntry_Error.AlreadyRegistered': 45002,
        'TokenAdminRegistryEntry_Error.InvalidAdministrator': 45003,
        'TokenAdminRegistryEntry_Error.VersionUnavailable': 45004,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TokenAdminRegistryEntry(address);
    }

    static fromStorage(emptyStorage: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        adminConfig: TokenRegistry_AdminConfig
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistryEntry.CodeCell,
            data: TokenRegistry_Storage.toCell(TokenRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistryEntry(address, initialState);
    }

    static createCellOfTokenAdminRegistryEntryGetTokenInfo(body: {
        queryId?: uint64
    }) {
        return TokenAdminRegistryEntry_GetTokenInfo.toCell(TokenAdminRegistryEntry_GetTokenInfo.create(body));
    }

    static createCellOfTokenAdminRegistryEntryResolveTokenInfo(body: {
        queryId?: uint64
        minEntryVersion: uint16
        requester: c.Address
    }) {
        return TokenAdminRegistryEntry_ResolveTokenInfo.toCell(TokenAdminRegistryEntry_ResolveTokenInfo.create(body));
    }

    static createCellOfTokenAdminRegistryEntryRegistrationInitialized(body: {
        queryId?: uint64
    }) {
        return TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create(body));
    }

    static createCellOfTokenAdminRegistryEntryProposeAdministrator(body: {
        queryId?: uint64
        minEntryVersion: uint16
        administrator: c.Address
    }) {
        return TokenAdminRegistryEntry_ProposeAdministrator.toCell(TokenAdminRegistryEntry_ProposeAdministrator.create(body));
    }

    static createCellOfTokenAdminRegistryEntryTransferAdminRole(body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistryEntry_TransferAdminRole.toCell(TokenAdminRegistryEntry_TransferAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryEntryAcceptAdminRole(body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
    }) {
        return TokenAdminRegistryEntry_AcceptAdminRole.toCell(TokenAdminRegistryEntry_AcceptAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryEntrySetPool(body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        tokenPool: c.Address | null
    }) {
        return TokenAdminRegistryEntry_SetPool.toCell(TokenAdminRegistryEntry_SetPool.create(body));
    }

    static createCellOfTokenAdminRegistryEntryUpgradeAndResume(body: {
        queryId?: uint64
        code: c.Cell
        pending: TokenAdminRegistryEntry_Pending | null
    }) {
        return TokenAdminRegistryEntry_UpgradeAndResume.toCell(TokenAdminRegistryEntry_UpgradeAndResume.create(body));
    }

    static createCellOfTokenAdminRegistryEntryResume(body: {
        pending: TokenAdminRegistryEntry_Pending
    }) {
        return TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body));
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

    async sendTokenAdminRegistryEntryGetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_GetTokenInfo.toCell(TokenAdminRegistryEntry_GetTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryResolveTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        requester: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_ResolveTokenInfo.toCell(TokenAdminRegistryEntry_ResolveTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryRegistrationInitialized(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryProposeAdministrator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_ProposeAdministrator.toCell(TokenAdminRegistryEntry_ProposeAdministrator.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryTransferAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_TransferAdminRole.toCell(TokenAdminRegistryEntry_TransferAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryAcceptAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_AcceptAdminRole.toCell(TokenAdminRegistryEntry_AcceptAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntrySetPool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        actor: c.Address
        tokenPool: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_SetPool.toCell(TokenAdminRegistryEntry_SetPool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryUpgradeAndResume(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        code: c.Cell
        pending: TokenAdminRegistryEntry_Pending | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_UpgradeAndResume.toCell(TokenAdminRegistryEntry_UpgradeAndResume.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryResume(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        pending: TokenAdminRegistryEntry_Pending
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body)),
            ...extraOptions
        });
    }

    async getTokenAdminRegistryConfig(provider: ContractProvider): Promise<TokenRegistry_AdminConfig> {
        const r = StackReader.fromGetMethod(3, await provider.get('tokenAdminRegistryConfig', []));
        return ({
            $: 'TokenRegistry_AdminConfig',
            tokenAdminRegistry: r.readSlice().loadAddress(),
            administrator: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            pendingAdministrator: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
        });
    }

    async getTokenInfo(provider: ContractProvider): Promise<TokenRegistry_TokenInfo> {
        const r = StackReader.fromGetMethod(3, await provider.get('tokenInfo', []));
        return ({
            $: 'TokenRegistry_TokenInfo',
            tokenPool: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            minterAddress: r.readSlice().loadAddress(),
            version: r.readBigInt(),
        });
    }

    async getEntryVersion(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('entryVersion', []));
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
}
