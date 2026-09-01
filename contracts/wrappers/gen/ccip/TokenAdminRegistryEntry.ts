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

/**
 > struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {
 > }
 */
export interface TokenAdminRegistryEntry_GetTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_GetTokenInfo'
}

export const TokenAdminRegistryEntry_GetTokenInfo = {
    PREFIX: 0x7aef4c2d,

    create(): TokenAdminRegistryEntry_GetTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0x7aef4c2d, 'TokenAdminRegistryEntry_GetTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_GetTokenInfo',
        }
    },
    store(self: TokenAdminRegistryEntry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0x7aef4c2d, 32);
    },
    toCell(self: TokenAdminRegistryEntry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_GetTokenInfo>(self, TokenAdminRegistryEntry_GetTokenInfo.store);
    }
}

/**
 > struct (0x75f19aae) TokenAdminRegistryEntry_SetTokenInfo {
 >     info: TokenRegistry_TokenInfo
 > }
 */
export interface TokenAdminRegistryEntry_SetTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_SetTokenInfo'
    info: TokenRegistry_TokenInfo
}

export const TokenAdminRegistryEntry_SetTokenInfo = {
    PREFIX: 0x75f19aae,

    create(args: {
        info: TokenRegistry_TokenInfo
    }): TokenAdminRegistryEntry_SetTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_SetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_SetTokenInfo {
        loadAndCheckPrefix32(s, 0x75f19aae, 'TokenAdminRegistryEntry_SetTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_SetTokenInfo',
            info: TokenRegistry_TokenInfo.fromSlice(s),
        }
    },
    store(self: TokenAdminRegistryEntry_SetTokenInfo, b: c.Builder): void {
        b.storeUint(0x75f19aae, 32);
        TokenRegistry_TokenInfo.store(self.info, b);
    },
    toCell(self: TokenAdminRegistryEntry_SetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_SetTokenInfo>(self, TokenAdminRegistryEntry_SetTokenInfo.store);
    }
}

/**
 > struct (0x31580269) TokenAdminRegistryEntry_RegistrationInitialized {
 > }
 */
export interface TokenAdminRegistryEntry_RegistrationInitialized {
    readonly $: 'TokenAdminRegistryEntry_RegistrationInitialized'
}

export const TokenAdminRegistryEntry_RegistrationInitialized = {
    PREFIX: 0x31580269,

    create(): TokenAdminRegistryEntry_RegistrationInitialized {
        return {
            $: 'TokenAdminRegistryEntry_RegistrationInitialized',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RegistrationInitialized {
        loadAndCheckPrefix32(s, 0x31580269, 'TokenAdminRegistryEntry_RegistrationInitialized');
        return {
            $: 'TokenAdminRegistryEntry_RegistrationInitialized',
        }
    },
    store(self: TokenAdminRegistryEntry_RegistrationInitialized, b: c.Builder): void {
        b.storeUint(0x31580269, 32);
    },
    toCell(self: TokenAdminRegistryEntry_RegistrationInitialized): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RegistrationInitialized>(self, TokenAdminRegistryEntry_RegistrationInitialized.store);
    }
}

/**
 > struct (0x31d2bb6e) TokenAdminRegistryEntry_ProposeAdministrator {
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x31d2bb6e,

    create(args: {
        administrator: c.Address
    }): TokenAdminRegistryEntry_ProposeAdministrator {
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ProposeAdministrator {
        loadAndCheckPrefix32(s, 0x31d2bb6e, 'TokenAdminRegistryEntry_ProposeAdministrator');
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x31d2bb6e, 32);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x5f7f84e1) TokenAdminRegistryEntry_TransferAdminRole {
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x5f7f84e1,

    create(args: {
        newAdministrator: c.Address | null
    }): TokenAdminRegistryEntry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0x5f7f84e1, 'TokenAdminRegistryEntry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x5f7f84e1, 32);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistryEntry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TransferAdminRole>(self, TokenAdminRegistryEntry_TransferAdminRole.store);
    }
}

/**
 > struct (0xd1fbd97c) TokenAdminRegistryEntry_AcceptAdminRole {
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0xd1fbd97c,

    create(): TokenAdminRegistryEntry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0xd1fbd97c, 'TokenAdminRegistryEntry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0xd1fbd97c, 32);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct (0xa7c4c16c) TokenAdminRegistryEntry_SetPool {
 >     tokenPool: address
 >     enabled: bool
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    tokenPool: c.Address
    enabled: boolean
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa7c4c16c,

    create(args: {
        tokenPool: c.Address
        enabled: boolean
    }): TokenAdminRegistryEntry_SetPool {
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_SetPool {
        loadAndCheckPrefix32(s, 0xa7c4c16c, 'TokenAdminRegistryEntry_SetPool');
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            tokenPool: s.loadAddress(),
            enabled: s.loadBoolean(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa7c4c16c, 32);
        b.storeAddress(self.tokenPool);
        b.storeBit(self.enabled);
    },
    toCell(self: TokenAdminRegistryEntry_SetPool): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_SetPool>(self, TokenAdminRegistryEntry_SetPool.store);
    }
}

/**
 > struct (0x0a58e678) TokenAdminRegistryEntry_ReturnTokenInfo {
 >     minterAddress: address
 >     tokenPool: address?
 >     version: uint32
 > }
 */
export interface TokenAdminRegistryEntry_ReturnTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_ReturnTokenInfo'
    minterAddress: c.Address
    tokenPool: c.Address | null
    version: uint32
}

export const TokenAdminRegistryEntry_ReturnTokenInfo = {
    PREFIX: 0x0a58e678,

    create(args: {
        minterAddress: c.Address
        tokenPool: c.Address | null
        version: uint32
    }): TokenAdminRegistryEntry_ReturnTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_ReturnTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ReturnTokenInfo {
        loadAndCheckPrefix32(s, 0x0a58e678, 'TokenAdminRegistryEntry_ReturnTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_ReturnTokenInfo',
            minterAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenAdminRegistryEntry_ReturnTokenInfo, b: c.Builder): void {
        b.storeUint(0x0a58e678, 32);
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
 >     tokenPool: address
 >     minterAddress: address
 >     enabled: bool
 >     version: uint32
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address
    minterAddress: c.Address
    enabled: boolean
    version: uint32 /* = 1 */
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address
        minterAddress: c.Address
        enabled: boolean
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
            tokenPool: s.loadAddress(),
            minterAddress: s.loadAddress(),
            enabled: s.loadBoolean(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeBit(self.enabled);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECEgEABDYAART/APSkE/S88sgLAQIBYgIDBNzQ+JHyQCDXLCPXemFsjjxb+JLtRND6SDH6SPpI0gDTH9Qx0W0CkjECkTPiyM+QKWOZ4hL6UvpUyx/JyM+FCBL6UnHPC27MyYBA+wDg1ywjr4zVdOMC1ywhisATTOMC1ywhjpXbdOMC1ywi+/wnDAQFBgcCAUgQEQCMMfpI+kjSANcLH/iS7UTQ+kj6SDH6SDHSADHTHzHXTCDQ+kj6UDH6UDHRA4IAr8gExwUT8vTI+lIV+lIT+lLKAMsfzMntVAH+W/iS7UTQ+kj6SDH6SDHSADHTHzHU0dD6SDH6UPpQ0YIAr8j4KBXHBRTy9IIAr8sBbpUibrPDAJFw4vL0bcjPkFAsekYS+lL6VPpUye1E0PpIMfpIMfpIMdIAMdMfMdTRgggPQkAB0PpI+lAx+lAx0cjPhYj6UgH6AnHPC2rMyQgB+jH6SDD4ku1E0PpI+kj6SNIA0x/XTND6SPpQ+lAx0YIAr8hRgscFGPL0ggCvyidu8vSCAK/LiwIpxwWz8vRScMj6UlJw+lT6VMklyPpSFfpSE/pSygDLH8zJ7VTIz5BQLHpG+lL6VPpUye1E0PpIMfpIMfpIMdIAMdMfMdTRCQP84wLXLCaP3svk4wLXLCU+JgtkjuEx+kjXCgD4ku1E0PpI+kj6SNIA0x/XTCDQ+kgx+lD6UDHRggCvyCFus5UIxwXDAJMxN3DiF/L0VHdkyPpSEvpSFPpSE8oAEssfFMzJ7VRTBMcFs5F/lVMjvcMA4pJfBeMN4DCEDwHHAPL0CgsMAAZw+wAARIIID0JAAdD6SPpQMfpQMdHIz4WI+lIB+gJxzwtqzMlw+wAB/jH6UDD4ku1E0PpI+kj6SNIA0x/XTND6SPpQ+lAx0YIAr8ghbrOWUYHHBcMAkjhw4hjy9FRncMj6Uhj6VPpUySXI+lIV+lIT+lLKAMsfzMntVMjPkFAsekb6UvpU+lTJ7UTQ+kgx+kgx+kgx0gAx0x8x1NGCCA9CQAHQ+kj6UDENAvxb+JLtRND6SPpI+kjSANMf10zQ+kj6UDH6UNGCAK/JIW6zllKCxwXDAJIxcOLy9CZtAsj6UvpU+lTJJcj6UhX6UhP6UsoAyx/Mye1UyM+Tix020vpS+lLJ7UTQ+kgx+kgx+kgx0gAx0x8x1NGCCA9CQAHQ+kj6UDH6UDHRyIkODwCWyM+TO8BqHhL6UvpSE/pSEsoAygDJ7UTQ+kgx+kgx+kgx0gAx0x8x1NGCCA9CQAHQ+kj6UDH6UDHRyM+FiPpSAfoCcc8LaszJcPsAACz6UDHRyM+FiPpSAfoCcc8LaszJcPsAAAFiACDPFvpSAfoCcc8LaszJcPsAAD266W7UTQ+kgx+kgx+kgx0gAx0x8x1NHQ+kj6UPpQ0YACe7BS7UTQ+kgx+kj6SNIA0x/UMdGA==');

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

    static createCellOfTokenAdminRegistryEntrySetTokenInfo(body: {
        info: TokenRegistry_TokenInfo
    }) {
        return TokenAdminRegistryEntry_SetTokenInfo.toCell(TokenAdminRegistryEntry_SetTokenInfo.create(body));
    }

    static createCellOfTokenAdminRegistryEntryGetTokenInfo(body: {
    }) {
        return TokenAdminRegistryEntry_GetTokenInfo.toCell(TokenAdminRegistryEntry_GetTokenInfo.create());
    }

    static createCellOfTokenAdminRegistryEntryRegistrationInitialized(body: {
    }) {
        return TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create());
    }

    static createCellOfTokenAdminRegistryEntryProposeAdministrator(body: {
        administrator: c.Address
    }) {
        return TokenAdminRegistryEntry_ProposeAdministrator.toCell(TokenAdminRegistryEntry_ProposeAdministrator.create(body));
    }

    static createCellOfTokenAdminRegistryEntryTransferAdminRole(body: {
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistryEntry_TransferAdminRole.toCell(TokenAdminRegistryEntry_TransferAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryEntryAcceptAdminRole(body: {
    }) {
        return TokenAdminRegistryEntry_AcceptAdminRole.toCell(TokenAdminRegistryEntry_AcceptAdminRole.create());
    }

    static createCellOfTokenAdminRegistryEntrySetPool(body: {
        tokenPool: c.Address
        enabled: boolean
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

    async sendTokenAdminRegistryEntrySetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        info: TokenRegistry_TokenInfo
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_SetTokenInfo.toCell(TokenAdminRegistryEntry_SetTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryGetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_GetTokenInfo.toCell(TokenAdminRegistryEntry_GetTokenInfo.create()),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryRegistrationInitialized(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_RegistrationInitialized.toCell(TokenAdminRegistryEntry_RegistrationInitialized.create()),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryProposeAdministrator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_ProposeAdministrator.toCell(TokenAdminRegistryEntry_ProposeAdministrator.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryTransferAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_TransferAdminRole.toCell(TokenAdminRegistryEntry_TransferAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntryAcceptAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_AcceptAdminRole.toCell(TokenAdminRegistryEntry_AcceptAdminRole.create()),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryEntrySetPool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenPool: c.Address
        enabled: boolean
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
        const r = StackReader.fromGetMethod(4, await provider.get('tokenInfo', []));
        return ({
            $: 'TokenRegistry_TokenInfo',
            tokenPool: r.readSlice().loadAddress(),
            minterAddress: r.readSlice().loadAddress(),
            enabled: r.readBoolean(),
            version: r.readBigInt(),
        });
    }
}
