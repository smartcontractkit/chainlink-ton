// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a UpgradeTarget contract in Tolk.
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

/**
 > struct UpgradeTarget_Storage {
 >     previousStorage: cell
 >     previousVersion: cell
 >     lastSender: address?
 >     lastBody: cell?
 > }
 */
export interface UpgradeTarget_Storage {
    readonly $: 'UpgradeTarget_Storage'
    previousStorage: c.Cell
    previousVersion: c.Cell
    lastSender: c.Address | null
    lastBody: c.Cell | null
}

export const UpgradeTarget_Storage = {
    create(args: {
        previousStorage: c.Cell
        previousVersion: c.Cell
        lastSender: c.Address | null
        lastBody: c.Cell | null
    }): UpgradeTarget_Storage {
        return {
            $: 'UpgradeTarget_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpgradeTarget_Storage {
        return {
            $: 'UpgradeTarget_Storage',
            previousStorage: s.loadRef(),
            previousVersion: s.loadRef(),
            lastSender: s.loadMaybeAddress(),
            lastBody: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: UpgradeTarget_Storage, b: c.Builder): void {
        b.storeRef(self.previousStorage);
        b.storeRef(self.previousVersion);
        b.storeAddress(self.lastSender);
        storeTolkNullable<c.Cell>(self.lastBody, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: UpgradeTarget_Storage): c.Cell {
        return makeCellFrom<UpgradeTarget_Storage>(self, UpgradeTarget_Storage.store);
    }
}

// ————————————————————————————————————————————
//    class UpgradeTarget
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

export class UpgradeTarget implements c.Contract {
    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new UpgradeTarget(address);
    }

    static fromStorage(emptyStorage: {
        previousStorage: c.Cell
        previousVersion: c.Cell
        lastSender: c.Address | null
        lastBody: c.Cell | null
    }, deployedOptions?: DeployedAddrOptions) {
        if (!deployedOptions?.overrideContractCode) {
            throw new Error('UpgradeTarget.fromStorage requires deployedOptions.overrideContractCode');
        }
        const initialState = {
            code: deployedOptions.overrideContractCode,
            data: UpgradeTarget_Storage.toCell(UpgradeTarget_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new UpgradeTarget(address, initialState);
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

    async getPreviousStorage(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('previousStorage', []));
        return r.readCell();
    }

    async getPreviousVersion(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('previousVersion', []));
        return r.readCell();
    }

    async getLastSender(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('lastSender', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getLastBody(provider: ContractProvider): Promise<c.Cell | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('lastBody', []));
        return r.readNullable<c.Cell>(
            (r) => r.readCell()
        );
    }
}
