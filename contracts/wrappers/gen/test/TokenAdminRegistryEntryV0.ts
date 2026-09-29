// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenAdminRegistryEntryV0 contract in Tolk.
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
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

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
//    class TokenAdminRegistryEntryV0
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

export class TokenAdminRegistryEntryV0 implements c.Contract {
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
        return new TokenAdminRegistryEntryV0(address);
    }

    static fromStorage(emptyStorage: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        adminConfig: TokenRegistry_AdminConfig
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistryEntryV0.CodeCell,
            data: TokenRegistry_Storage.toCell(TokenRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistryEntryV0(address, initialState);
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

    async getEntryVersion(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('entryVersion', []));
        return r.readBigInt();
    }
}
