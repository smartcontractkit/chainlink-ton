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
 > type TokenAdminRegistryEntry_RootMessage = TokenAdminRegistryEntry_GetTokenInfo | TokenAdminRegistryEntry_ProposeAdministrator | TokenAdminRegistryEntry_TransferAdminRole | TokenAdminRegistryEntry_AcceptAdminRole | TokenAdminRegistryEntry_SetPool | TokenAdminRegistryEntry_VerifyToken
 */
export type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool
    | TokenAdminRegistryEntry_VerifyToken

export const TokenAdminRegistryEntry_RootMessage = {
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RootMessage {
        return lookupPrefix(s, 0x7aef4c2d, 32) ? TokenAdminRegistryEntry_GetTokenInfo.fromSlice(s) :
            lookupPrefix(s, 0x6dcbe573, 32) ? TokenAdminRegistryEntry_ProposeAdministrator.fromSlice(s) :
            lookupPrefix(s, 0x8b1503cf, 32) ? TokenAdminRegistryEntry_TransferAdminRole.fromSlice(s) :
            lookupPrefix(s, 0x39c6e872, 32) ? TokenAdminRegistryEntry_AcceptAdminRole.fromSlice(s) :
            lookupPrefix(s, 0xa64e05c9, 32) ? TokenAdminRegistryEntry_SetPool.fromSlice(s) :
            lookupPrefix(s, 0xa14b0288, 32) ? TokenAdminRegistryEntry_VerifyToken.fromSlice(s) :
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
 >     transferInitiator: address?
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    actor: c.Address
    tokenPool: c.Address | null
    transferInitiator: c.Address | null
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa64e05c9,

    create(args: {
        actor: c.Address
        tokenPool: c.Address | null
        transferInitiator: c.Address | null
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
            transferInitiator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa64e05c9, 32);
        b.storeAddress(self.actor);
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.transferInitiator);
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
 >     tokenInfo: Cell<TokenRegistry_TokenInfo>
 >     adminConfig: Cell<TokenRegistry_AdminConfig>
 >     enabled: bool
 > }
 */
export interface TokenRegistry_Storage {
    readonly $: 'TokenRegistry_Storage'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    adminConfig: TokenRegistry_AdminConfig
    enabled: boolean /* = false */
}

export const TokenRegistry_Storage = {
    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        adminConfig: TokenRegistry_AdminConfig
        enabled?: boolean /* = false */
    }): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            enabled: false,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            tokenAddress: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
            adminConfig: loadCellRef<TokenRegistry_AdminConfig>(s, TokenRegistry_AdminConfig.fromSlice),
            enabled: s.loadBoolean(),
        }
    },
    store(self: TokenRegistry_Storage, b: c.Builder): void {
        b.storeAddress(self.tokenAddress);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
        storeCellRef<TokenRegistry_AdminConfig>(self.adminConfig, b, TokenRegistry_AdminConfig.store);
        b.storeBit(self.enabled);
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
 > struct (0x2c76b973) RequestWalletAddress {
 >     queryId: uint64
 >     ownerAddress: address
 >     includeOwnerAddress: bool
 > }
 */
export interface RequestWalletAddress {
    readonly $: 'RequestWalletAddress'
    queryId: uint64
    ownerAddress: c.Address
    includeOwnerAddress: boolean
}

export const RequestWalletAddress = {
    PREFIX: 0x2c76b973,

    create(args: {
        queryId?: uint64
        ownerAddress: c.Address
        includeOwnerAddress: boolean
    }): RequestWalletAddress {
        return {
            $: 'RequestWalletAddress',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): RequestWalletAddress {
        loadAndCheckPrefix32(s, 0x2c76b973, 'RequestWalletAddress');
        return {
            $: 'RequestWalletAddress',
            queryId: s.loadUintBig(64),
            ownerAddress: s.loadAddress(),
            includeOwnerAddress: s.loadBoolean(),
        }
    },
    store(self: RequestWalletAddress, b: c.Builder): void {
        b.storeUint(0x2c76b973, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.ownerAddress);
        b.storeBit(self.includeOwnerAddress);
    },
    toCell(self: RequestWalletAddress): c.Cell {
        return makeCellFrom<RequestWalletAddress>(self, RequestWalletAddress.store);
    }
}

/**
 > struct (0xd1735400) ResponseWalletAddress {
 >     queryId: uint64
 >     jettonWalletAddress: address?
 >     ownerAddress: Cell<address>?
 > }
 */
export interface ResponseWalletAddress {
    readonly $: 'ResponseWalletAddress'
    queryId: uint64
    jettonWalletAddress: c.Address | null
    ownerAddress: c.Address | null
}

export const ResponseWalletAddress = {
    PREFIX: 0xd1735400,

    create(args: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }): ResponseWalletAddress {
        return {
            $: 'ResponseWalletAddress',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ResponseWalletAddress {
        loadAndCheckPrefix32(s, 0xd1735400, 'ResponseWalletAddress');
        return {
            $: 'ResponseWalletAddress',
            queryId: s.loadUintBig(64),
            jettonWalletAddress: s.loadMaybeAddress(),
            ownerAddress: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: ResponseWalletAddress, b: c.Builder): void {
        b.storeUint(0xd1735400, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.jettonWalletAddress);
        storeTolkNullable<c.Address>(self.ownerAddress, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: ResponseWalletAddress): c.Cell {
        return makeCellFrom<ResponseWalletAddress>(self, ResponseWalletAddress.store);
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
        enabled?: boolean /* = false */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistryEntry.CodeCell,
            data: TokenRegistry_Storage.toCell(TokenRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistryEntry(address, initialState);
    }

    static createCellOfTokenAdminRegistryEntryRegistrationInitialized(body: {
        queryId?: uint64
    }) {
        return TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create(body));
    }

    static createCellOfTokenAdminRegistryEntryMessageFromRoot(body: {
        queryId?: uint64
        minEntryVersion: uint16
        content: TokenAdminRegistryEntry_RootMessage
    }) {
        return TokenAdminRegistryEntry_MessageFromRoot.toCell(TokenAdminRegistryEntry_MessageFromRoot.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId?: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
    }

    static createCellOfTokenAdminRegistryEntryResume(body: {
        request: TokenAdminRegistryEntry_MessageFromRoot
    }) {
        return TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body));
    }

    static createCellOfResponseWalletAddress(body: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }) {
        return ResponseWalletAddress.toCell(ResponseWalletAddress.create(body));
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

    async sendTokenAdminRegistryEntryRegistrationInitialized(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryMessageFromRoot(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minEntryVersion: uint16
        content: TokenAdminRegistryEntry_RootMessage
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_MessageFromRoot.toCell(TokenAdminRegistryEntry_MessageFromRoot.create(body)),
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

    async sendTokenAdminRegistryEntryResume(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        request: TokenAdminRegistryEntry_MessageFromRoot
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body)),
            ...extraOptions
        });
    }

    async sendResponseWalletAddress(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ResponseWalletAddress.toCell(ResponseWalletAddress.create(body)),
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
        const r = StackReader.fromGetMethod(4, await provider.get('tokenInfo', []));
        return ({
            $: 'TokenRegistry_TokenInfo',
            tokenPool: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            transferInitiator: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            minterAddress: r.readSlice().loadAddress(),
            version: r.readBigInt(),
        });
    }

    async getEnabled(provider: ContractProvider): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('enabled', []));
        return r.readBoolean();
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
