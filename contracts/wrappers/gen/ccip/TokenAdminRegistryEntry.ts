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
 >     tokenVerified: bool
 >     pendingPool: address?
 > }
 */
export interface TokenRegistry_Storage {
    readonly $: 'TokenRegistry_Storage'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    adminConfig: TokenRegistry_AdminConfig
    tokenVerified: boolean /* = false */
    pendingPool: c.Address | null /* = null */
}

export const TokenRegistry_Storage = {
    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        adminConfig: TokenRegistry_AdminConfig
        tokenVerified?: boolean /* = false */
        pendingPool?: c.Address | null /* = null */
    }): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            tokenVerified: false,
            pendingPool: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_Storage {
        return {
            $: 'TokenRegistry_Storage',
            tokenAddress: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
            adminConfig: loadCellRef<TokenRegistry_AdminConfig>(s, TokenRegistry_AdminConfig.fromSlice),
            tokenVerified: s.loadBoolean(),
            pendingPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenRegistry_Storage, b: c.Builder): void {
        b.storeAddress(self.tokenAddress);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
        storeCellRef<TokenRegistry_AdminConfig>(self.adminConfig, b, TokenRegistry_AdminConfig.store);
        b.storeBit(self.tokenVerified);
        b.storeAddress(self.pendingPool);
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

/**
 > struct (0x500b10e4) TokenPool_GetTransferInitiator {
 >     queryId: uint64
 > }
 */
export interface TokenPool_GetTransferInitiator {
    readonly $: 'TokenPool_GetTransferInitiator'
    queryId: uint64
}

export const TokenPool_GetTransferInitiator = {
    PREFIX: 0x500b10e4,

    create(args: {
        queryId?: uint64
    }): TokenPool_GetTransferInitiator {
        return {
            $: 'TokenPool_GetTransferInitiator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_GetTransferInitiator {
        loadAndCheckPrefix32(s, 0x500b10e4, 'TokenPool_GetTransferInitiator');
        return {
            $: 'TokenPool_GetTransferInitiator',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_GetTransferInitiator, b: c.Builder): void {
        b.storeUint(0x500b10e4, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_GetTransferInitiator): c.Cell {
        return makeCellFrom<TokenPool_GetTransferInitiator>(self, TokenPool_GetTransferInitiator.store);
    }
}

/**
 > struct (0x904443b3) TokenPool_TransferInitiator {
 >     queryId: uint64
 >     transferInitiator: address?
 > }
 */
export interface TokenPool_TransferInitiator {
    readonly $: 'TokenPool_TransferInitiator'
    queryId: uint64
    transferInitiator: c.Address | null
}

export const TokenPool_TransferInitiator = {
    PREFIX: 0x904443b3,

    create(args: {
        queryId?: uint64
        transferInitiator: c.Address | null
    }): TokenPool_TransferInitiator {
        return {
            $: 'TokenPool_TransferInitiator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_TransferInitiator {
        loadAndCheckPrefix32(s, 0x904443b3, 'TokenPool_TransferInitiator');
        return {
            $: 'TokenPool_TransferInitiator',
            queryId: s.loadUintBig(64),
            transferInitiator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_TransferInitiator, b: c.Builder): void {
        b.storeUint(0x904443b3, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.transferInitiator);
    },
    toCell(self: TokenPool_TransferInitiator): c.Cell {
        return makeCellFrom<TokenPool_TransferInitiator>(self, TokenPool_TransferInitiator.store);
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
        tokenVerified?: boolean /* = false */
        pendingPool?: c.Address | null /* = null */
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

    static createCellOfTokenPoolTransferInitiator(body: {
        queryId?: uint64
        transferInitiator: c.Address | null
    }) {
        return TokenPool_TransferInitiator.toCell(TokenPool_TransferInitiator.create(body));
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

    async sendTokenPoolTransferInitiator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        transferInitiator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_TransferInitiator.toCell(TokenPool_TransferInitiator.create(body)),
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
