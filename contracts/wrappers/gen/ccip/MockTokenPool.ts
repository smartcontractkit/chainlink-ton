// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a MockTokenPool contract in Tolk.
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
 > struct (0x7dd8f942) MockTokenPool_LockOrBurn {
 >     tokenAmount: TokenAmount
 >     notify: address
 > }
 */
export interface MockTokenPool_LockOrBurn {
    readonly $: 'MockTokenPool_LockOrBurn'
    tokenAmount: TokenAmount
    notify: c.Address
}

export const MockTokenPool_LockOrBurn = {
    PREFIX: 0x7dd8f942,

    create(args: {
        tokenAmount: TokenAmount
        notify: c.Address
    }): MockTokenPool_LockOrBurn {
        return {
            $: 'MockTokenPool_LockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): MockTokenPool_LockOrBurn {
        loadAndCheckPrefix32(s, 0x7dd8f942, 'MockTokenPool_LockOrBurn');
        return {
            $: 'MockTokenPool_LockOrBurn',
            tokenAmount: TokenAmount.fromSlice(s),
            notify: s.loadAddress(),
        }
    },
    store(self: MockTokenPool_LockOrBurn, b: c.Builder): void {
        b.storeUint(0x7dd8f942, 32);
        TokenAmount.store(self.tokenAmount, b);
        b.storeAddress(self.notify);
    },
    toCell(self: MockTokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<MockTokenPool_LockOrBurn>(self, MockTokenPool_LockOrBurn.store);
    }
}

/**
 > struct (0x4c700579) TokenPool_NotifySuccessfulLockOrBurn {
 > }
 */
export interface TokenPool_NotifySuccessfulLockOrBurn {
    readonly $: 'TokenPool_NotifySuccessfulLockOrBurn'
}

export const TokenPool_NotifySuccessfulLockOrBurn = {
    PREFIX: 0x4c700579,

    create(): TokenPool_NotifySuccessfulLockOrBurn {
        return {
            $: 'TokenPool_NotifySuccessfulLockOrBurn',
        }
    },
    fromSlice(s: c.Slice): TokenPool_NotifySuccessfulLockOrBurn {
        loadAndCheckPrefix32(s, 0x4c700579, 'TokenPool_NotifySuccessfulLockOrBurn');
        return {
            $: 'TokenPool_NotifySuccessfulLockOrBurn',
        }
    },
    store(self: TokenPool_NotifySuccessfulLockOrBurn, b: c.Builder): void {
        b.storeUint(0x4c700579, 32);
    },
    toCell(self: TokenPool_NotifySuccessfulLockOrBurn): c.Cell {
        return makeCellFrom<TokenPool_NotifySuccessfulLockOrBurn>(self, TokenPool_NotifySuccessfulLockOrBurn.store);
    }
}

/**
 > struct TokenAmount {
 >     amount: coins
 >     token: address
 > }
 */
export interface TokenAmount {
    readonly $: 'TokenAmount'
    amount: coins
    token: c.Address
}

export const TokenAmount = {
    create(args: {
        amount: coins
        token: c.Address
    }): TokenAmount {
        return {
            $: 'TokenAmount',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAmount {
        return {
            $: 'TokenAmount',
            amount: s.loadCoins(),
            token: s.loadAddress(),
        }
    },
    store(self: TokenAmount, b: c.Builder): void {
        b.storeCoins(self.amount);
        b.storeAddress(self.token);
    },
    toCell(self: TokenAmount): c.Cell {
        return makeCellFrom<TokenAmount>(self, TokenAmount.store);
    }
}

// ————————————————————————————————————————————
//    class MockTokenPool
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

export class MockTokenPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgEBAgEAOgABFP8A9KQT9LzyyAsBAFbT+JHyQNcsI+7HyhTyv/oAMfpIMfpIMMjPhQj6UoIQTHAFec8LjsmDBvsA');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new MockTokenPool(address);
    }

    static createCellOfMockTokenPoolLockOrBurn(body: {
        tokenAmount: TokenAmount
        notify: c.Address
    }) {
        return MockTokenPool_LockOrBurn.toCell(MockTokenPool_LockOrBurn.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendMockTokenPoolLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenAmount: TokenAmount
        notify: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MockTokenPool_LockOrBurn.toCell(MockTokenPool_LockOrBurn.create(body)),
            ...extraOptions
        });
    }
}
