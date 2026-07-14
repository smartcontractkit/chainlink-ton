// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TestLibMath contract in Tolk.
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

type uint8 = bigint
type uint256 = bigint

// ————————————————————————————————————————————
//    class TestLibMath
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

export class TestLibMath implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECFwEAAacAART/APSkE/S88sgLAQIBYgIDAgLOBAUCASALDAIBIAYHAgEgCAkAFz4kfJAhA8BxwDy9IABVCDCAJiE/yGhIrnDAJFw4pNbcHHgIMEAmIX/IaEivMMAkXDik1twcuCgcIAGpO2i7fshlSDAAMMAkX/ik1twIOAhwP+cMSCF/7qTMHBx4KNw4CDA/5wwIIX/upMwcHHgo3DgIcIAlSDCAMMAkXDinoT/IakEIrmVW3Bx2zHg4w6ocIAoAaQgwk2TMHBx4HF6kyLCAI4gInGwwAGchP8iqQQhvvKEZqgB3gKrACDCAJRRIKgC3gLoMDFwgAJIhwQCVIMEAwwCRcOKehP8hqQQivJVbcHHbMeCOKyHCAJUgwQDDAJFw4p6F/yKpBCG8lVtwctsx4J6F/yGpBCK8lVtwctsx4OLiAAm+rseAFAIBIA0OAgEgDxACASAREgAXtd1rPgAyYD5eHAYwACm2bsQ4IBIv8sQwjveYYBxSXl4cBhACAecTFAAXtunLPgBSYD5eHAYwAgFYFRYAFaQEA+AHJgPl4cBjAAe6PwAYAAe6rwA4');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TestLibMath(address);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async getSafeAdd(provider: ContractProvider, a: bigint, b: bigint): Promise<[
        bigint,
        bigint,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_safeAdd', [
            { type: 'int', value: a },
            { type: 'int', value: b },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
        ];
    }

    async getSafeProd(provider: ContractProvider, a: bigint, b: bigint): Promise<[
        bigint,
        bigint,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_safeProd', [
            { type: 'int', value: a },
            { type: 'int', value: b },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
        ];
    }

    async getSafePow10(provider: ContractProvider, n: uint8): Promise<[
        uint256,
        bigint,
    ]> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_safePow10', [
            { type: 'int', value: n },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
        ];
    }

    async getMustAdd(provider: ContractProvider, a: bigint, b: bigint, errCode: bigint): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_mustAdd', [
            { type: 'int', value: a },
            { type: 'int', value: b },
            { type: 'int', value: errCode },
        ]));
        return r.readBigInt();
    }

    async getMustProd(provider: ContractProvider, a: bigint, b: bigint, errCode: bigint): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_mustProd', [
            { type: 'int', value: a },
            { type: 'int', value: b },
            { type: 'int', value: errCode },
        ]));
        return r.readBigInt();
    }

    async getMustCastToCoin(provider: ContractProvider, value: coins, errCode: bigint): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_mustCastToCoin', [
            { type: 'int', value: value },
            { type: 'int', value: errCode },
        ]));
        return r.readBigInt();
    }

    async getMustPow10(provider: ContractProvider, n: uint8, errCode: bigint): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_mustPow10', [
            { type: 'int', value: n },
            { type: 'int', value: errCode },
        ]));
        return r.readBigInt();
    }
}
