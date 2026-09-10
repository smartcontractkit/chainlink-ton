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

type uint32 = bigint
type uint64 = bigint

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
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    queryId: uint64
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x6dcbe573,

    create(args: {
        queryId?: uint64
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
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x6dcbe573, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
 >     queryId: uint64
 >     actor: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    queryId: uint64
    actor: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x8b1503cf,

    create(args: {
        queryId?: uint64
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
            actor: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x8b1503cf, 32);
        b.storeUint(self.queryId, 64);
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
 >     actor: address
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
    queryId: uint64
    actor: c.Address
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0x39c6e872,

    create(args: {
        queryId?: uint64
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
            actor: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0x39c6e872, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.actor);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct (0xa64e05c9) TokenAdminRegistryEntry_SetPool {
 >     queryId: uint64
 >     tokenPool: address?
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    queryId: uint64
    tokenPool: c.Address | null
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa64e05c9,

    create(args: {
        queryId?: uint64
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
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa64e05c9, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenAdminRegistryEntry_SetPool): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_SetPool>(self, TokenAdminRegistryEntry_SetPool.store);
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
 > enum TokenAdminRegistryEntry_Error { 4 variants }
 */
export type TokenAdminRegistryEntry_Error = bigint

export const TokenAdminRegistryEntry_Error = {
    Unauthorized: 45000n,
    OnlyPendingAdministrator: 45001n,
    AlreadyRegistered: 45002n,
    InvalidAdministrator: 45003n,

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
    static CodeCell = c.Cell.fromBase64('te6ccgECEgEAA9UAART/APSkE/S88sgLAQIBYgIDAgLPBAUCAUgQEQTTPiR8kAg1ywj13phbI44MdcLP/iS7UTQ+kgx+lD6SNMf1DHRyM+QKWOZ4hXLP/pS+lQSyx/JyM+FCBL6UnHPC27MyYBA+wDg1ywhisATTOMC1ywjbl8rnOMC1ywkWKgefOMC1ywhzjdDlIAYHCAkAHQhbpIxbuAgbpJbcODHBYAH+MdcLP/iS7UTQ+kj6UDH6SDHTHzHU0dD6SDH6UPpQ0YIAr8j4KBXHBRTy9IIAr8sBbpUibrPDAJFw4vL0bcjPkFAsekYUyz/6UhL6VPpUye1E0PpIMfpQMfpIMdMfMdTRgggPQkAB0PpI+lAx+lAx0cjPhYj6UgH6AnHPC2rMyQoB+jHTP/pIMPiS7UTQ+kj6UPpI0x/XTND6SPpQ+lAx0YIAr8hRcscFF/L0ggCvyiZu8vSCAK/LiwIoxwWz8vRSYMj6UlJg+lT6VMkkyPpSFPpUEvpSyx/Mye1UyM+QUCx6RhTLPxP6UhL6VPpUye1E0PpIMfpQMfpIMdMfMdTRDAH+MdM/+kj6UDD4ku1E0PpI+lD6SNMf10zQ+kj6UPpQMdGCAK/IUXLHBRfy9IIAr8gmbrOWUYbHBcMAkjhw4hjy9FNFCMj6Uhb6VBf6VMkjyPpSE/pU+lIVyx8UzMntVMjPkFAsekYUyz8S+lIS+lT6VMntRND6SDH6UDH6SDHTHwsC/o78MdM/+kgw+JLtRND6SPpQ+kjTH9dM0PpI+lAx+lDRggCvyFFyxwUX8vSCAK/JJm6zllJ3xwXDAJI2cOIW8vQlbQbI+lL6VBX6VMkjyPpSE/pU+lITyx8SzMntVMjPk4sdNtITyz8S+lL6UsntRND6SDH6UDH6SDHTHzHU0eAMDQAGcPsAAEox1NGCCA9CQAHQ+kj6UDH6UDHRyM+FiPpSAfoCcc8LaszJcPsAAESCCA9CQAHQ+kj6UDH6UDHRyM+FiPpSAfoCcc8LaszJcPsAArqJ1yeOzzHTP/pQMPiS7UTQ+kj6UPpI0x/XTCDQ+kgx+lD6UDHRggCvyCFus5UHxwXDAJMxNnDiFvL0U1PI+lL6VBL6UssfE8zJ7VRTEvABkl8E4w7gMIQPAccA8vQODwAIpk4FyQCMyM+TO8BqHhTLPxP6UhL6VPpUye1E0PpIMfpQMfpIMdMfMdTRgggPQkAB0PpI+lAx+lAx0cjPhYj6UgH6AnHPC2rMyXD7AAA3uulu1E0PpIMfpQMfpIMdMfMdTR0PpI+lD6UNGAAjuwUu1E0PpIMfpQ+kjTH9Qx0Y');

    static Errors = {
        'TokenAdminRegistryEntry_Error.Unauthorized': 45000,
        'TokenAdminRegistryEntry_Error.OnlyPendingAdministrator': 45001,
        'TokenAdminRegistryEntry_Error.AlreadyRegistered': 45002,
        'TokenAdminRegistryEntry_Error.InvalidAdministrator': 45003,
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

    static createCellOfTokenAdminRegistryEntryRegistrationInitialized(body: {
        queryId?: uint64
    }) {
        return TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create(body));
    }

    static createCellOfTokenAdminRegistryEntryProposeAdministrator(body: {
        queryId?: uint64
        administrator: c.Address
    }) {
        return TokenAdminRegistryEntry_ProposeAdministrator.toCell(TokenAdminRegistryEntry_ProposeAdministrator.create(body));
    }

    static createCellOfTokenAdminRegistryEntryTransferAdminRole(body: {
        queryId?: uint64
        actor: c.Address
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistryEntry_TransferAdminRole.toCell(TokenAdminRegistryEntry_TransferAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryEntryAcceptAdminRole(body: {
        queryId?: uint64
        actor: c.Address
    }) {
        return TokenAdminRegistryEntry_AcceptAdminRole.toCell(TokenAdminRegistryEntry_AcceptAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryEntrySetPool(body: {
        queryId?: uint64
        tokenPool: c.Address | null
    }) {
        return TokenAdminRegistryEntry_SetPool.toCell(TokenAdminRegistryEntry_SetPool.create(body));
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
        tokenPool: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_SetPool.toCell(TokenAdminRegistryEntry_SetPool.create(body)),
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
}
