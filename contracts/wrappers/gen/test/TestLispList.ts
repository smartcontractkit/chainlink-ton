// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TestLispList contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

// TypeScript wrappers flatten a TVM linked list `[1 [2 [3 null]]]` to `[1 2 3]`
type lisp_list<T> = T[]

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

function storeLispListOf<T>(v: lisp_list<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {

        let tail = c.Cell.EMPTY;
        for (let i = 0; i < v.length; ++i) {
            let itemB = beginCell();
            itemB.storeRef(tail);
            storeFn_T(v[i], itemB);
            tail = itemB.endCell();
        }
        b.storeRef(tail);
      
}

function loadLispListOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): lisp_list<T> {
    let outArr = [] as lisp_list<T>;
    let head = s.loadRef().beginParse();
    while (head.remainingRefs) {
        let tailSnaked = head.loadRef();
        let headValue = loadFn_T(head);
        head.endParse();    // ensure no data is present besides T
        outArr.unshift(headValue);
        head = tailSnaked.beginParse();
    }
    return outArr;
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

type uint8 = bigint

/**
 > struct LispListContainer {
 >     values: lisp_list<Cell<Byte>>
 > }
 */
export interface LispListContainer {
    readonly $: 'LispListContainer'
    values: lisp_list<Byte>
}

export const LispListContainer = {
    create(args: {
        values: lisp_list<Byte>
    }): LispListContainer {
        return {
            $: 'LispListContainer',
            ...args
        }
    },
    fromSlice(s: c.Slice): LispListContainer {
        return {
            $: 'LispListContainer',
            values: loadLispListOf<Byte>(s,
                (s) => loadCellRef<Byte>(s, Byte.fromSlice)
            ),
        }
    },
    store(self: LispListContainer, b: c.Builder): void {
        storeLispListOf<Byte>(self.values, b,
            (v,b) => storeCellRef<Byte>(v, b, Byte.store)
        );
    },
    toCell(self: LispListContainer): c.Cell {
        return makeCellFrom<LispListContainer>(self, LispListContainer.store);
    }
}

/**
 > struct Byte {
 >     value: uint8
 > }
 */
export interface Byte {
    readonly $: 'Byte'
    value: uint8
}

export const Byte = {
    create(args: {
        value: uint8
    }): Byte {
        return {
            $: 'Byte',
            ...args
        }
    },
    fromSlice(s: c.Slice): Byte {
        return {
            $: 'Byte',
            value: s.loadUintBig(8),
        }
    },
    store(self: Byte, b: c.Builder): void {
        b.storeUint(self.value, 8);
    },
    toCell(self: Byte): c.Cell {
        return makeCellFrom<Byte>(self, Byte.store);
    }
}

// ————————————————————————————————————————————
//    class TestLispList
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

export class TestLispList implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgEBBwEAfQABFP8A9KQT9LzyyAsBAgFiAgMAGND4kfJAhA8BxwDy9AICcQQFAU2zQttyM+ECskBbwLIz4QGyQFvAsiIkyJus5jIzAJvIgPMyegyzMmAGAFOwYrQbQHUAdCUIMcAs5nU1NFQA28CAtDoMNFvIgHQ0wfRAW8iMNDTB9GAAAA==');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TestLispList(address);
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

    async getEncodedList(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('encodedList', []));
        return r.readCell();
    }

    async getDecodeList(provider: ContractProvider, encoded: c.Cell): Promise<[
        uint8,
        uint8,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('decodeList', [
            { type: 'cell', cell: encoded },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
        ];
    }
}
