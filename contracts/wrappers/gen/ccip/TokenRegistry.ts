// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenRegistry contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

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

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
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

/**
 > struct (0xdd5d5127) TokenRegistry_GetTokenInfo {
 > }
 */
export interface TokenRegistry_GetTokenInfo {
    readonly $: 'TokenRegistry_GetTokenInfo'
}

export const TokenRegistry_GetTokenInfo = {
    PREFIX: 0xdd5d5127,

    create(): TokenRegistry_GetTokenInfo {
        return {
            $: 'TokenRegistry_GetTokenInfo',
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0xdd5d5127, 'TokenRegistry_GetTokenInfo');
        return {
            $: 'TokenRegistry_GetTokenInfo',
        }
    },
    store(self: TokenRegistry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0xdd5d5127, 32);
    },
    toCell(self: TokenRegistry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_GetTokenInfo>(self, TokenRegistry_GetTokenInfo.store);
    }
}

/**
 > struct (0xd24387a4) TokenRegistry_SetTokenInfo {
 >     info: TokenRegistry_TokenInfo
 > }
 */
export interface TokenRegistry_SetTokenInfo {
    readonly $: 'TokenRegistry_SetTokenInfo'
    info: TokenRegistry_TokenInfo
}

export const TokenRegistry_SetTokenInfo = {
    PREFIX: 0xd24387a4,

    create(args: {
        info: TokenRegistry_TokenInfo
    }): TokenRegistry_SetTokenInfo {
        return {
            $: 'TokenRegistry_SetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_SetTokenInfo {
        loadAndCheckPrefix32(s, 0xd24387a4, 'TokenRegistry_SetTokenInfo');
        return {
            $: 'TokenRegistry_SetTokenInfo',
            info: TokenRegistry_TokenInfo.fromSlice(s),
        }
    },
    store(self: TokenRegistry_SetTokenInfo, b: c.Builder): void {
        b.storeUint(0xd24387a4, 32);
        TokenRegistry_TokenInfo.store(self.info, b);
    },
    toCell(self: TokenRegistry_SetTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_SetTokenInfo>(self, TokenRegistry_SetTokenInfo.store);
    }
}

/**
 > struct (0xddccddb5) TokenRegistry_ReturnTokenInfo {
 >     minterAddress: address
 >     tokenPool: address?
 > }
 */
export interface TokenRegistry_ReturnTokenInfo {
    readonly $: 'TokenRegistry_ReturnTokenInfo'
    minterAddress: c.Address
    tokenPool: c.Address | null
}

export const TokenRegistry_ReturnTokenInfo = {
    PREFIX: 0xddccddb5,

    create(args: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }): TokenRegistry_ReturnTokenInfo {
        return {
            $: 'TokenRegistry_ReturnTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_ReturnTokenInfo {
        loadAndCheckPrefix32(s, 0xddccddb5, 'TokenRegistry_ReturnTokenInfo');
        return {
            $: 'TokenRegistry_ReturnTokenInfo',
            minterAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenRegistry_ReturnTokenInfo, b: c.Builder): void {
        b.storeUint(0xddccddb5, 32);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenRegistry_ReturnTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_ReturnTokenInfo>(self, TokenRegistry_ReturnTokenInfo.store);
    }
}

/**
 > struct TokenRegistry_Storage {
 >     tokenAddress: address
 >     tokenInfo: TokenRegistry_TokenInfo
 > }
 */
export interface TokenRegistry_Storage {
    readonly $: 'TokenRegistry_Storage'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
}

export const TokenRegistry_Storage = {
    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
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
        }
    },
    store(self: TokenRegistry_Storage, b: c.Builder): void {
        b.storeAddress(self.tokenAddress);
        TokenRegistry_TokenInfo.store(self.tokenInfo, b);
    },
    toCell(self: TokenRegistry_Storage): c.Cell {
        return makeCellFrom<TokenRegistry_Storage>(self, TokenRegistry_Storage.store);
    }
}

/**
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address
 >     minterAddress: address
 >     enabled: bool
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address
    minterAddress: c.Address
    enabled: boolean
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address
        minterAddress: c.Address
        enabled: boolean
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadAddress(),
            minterAddress: s.loadAddress(),
            enabled: s.loadBoolean(),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeBit(self.enabled);
    },
    toCell(self: TokenRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_TokenInfo>(self, TokenRegistry_TokenInfo.store);
    }
}

// ————————————————————————————————————————————
//    class TokenRegistry
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

export class TokenRegistry implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgEBAgEAiQABFP8A9KQT9LzyyAsBAPTT+JHyQCDXLCbq6ok8jjRb+JLtRND6SDH6SPpI0gDRbQGRMJEy4sjPk3czdtb6UvpUycjPhQgS+lJxzwtuzMmAQPsA4NcsJpIcPSSOJDH6SPpI1woA7UTQ+kj6SDH6SDHSADHRyPpSE/pS+lLKAMntVOAwhA8BxwDy9A==');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TokenRegistry(address);
    }

    static fromStorage(emptyStorage: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenRegistry.CodeCell,
            data: TokenRegistry_Storage.toCell(TokenRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenRegistry(address, initialState);
    }

    static createCellOfTokenRegistrySetTokenInfo(body: {
        info: TokenRegistry_TokenInfo
    }) {
        return TokenRegistry_SetTokenInfo.toCell(TokenRegistry_SetTokenInfo.create(body));
    }

    static createCellOfTokenRegistryGetTokenInfo(body: {
    }) {
        return TokenRegistry_GetTokenInfo.toCell(TokenRegistry_GetTokenInfo.create());
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendTokenRegistrySetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        info: TokenRegistry_TokenInfo
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenRegistry_SetTokenInfo.toCell(TokenRegistry_SetTokenInfo.create(body)),
            ...extraOptions
        });
    }

    async sendTokenRegistryGetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenRegistry_GetTokenInfo.toCell(TokenRegistry_GetTokenInfo.create()),
            ...extraOptions
        });
    }
}
