// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a ContextExecutor contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type array<T> = T[]

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

function storeArrayOf<T>(v: array<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    // the compiler stores array<T> in chunks; in TypeScript, for simplicity, store "1 elem = 1 ref"
    let tail = null as c.Cell | null;
    for (let i = 0; i < v.length; ++i) {
        let chunkB = beginCell().storeMaybeRef(tail);
        storeFn_T(v[v.length - 1 - i], chunkB);
        tail = chunkB.endCell();
    }
    b.storeUint(v.length, 8);
    b.storeMaybeRef(tail);
}

function loadArrayOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): array<T> {
    let len = s.loadUint(8);
    let head = s.loadMaybeRef();
    let outArr = [] as array<T>;
    while (head != null) {
        let s = head.beginParse();
        head = s.loadMaybeRef();
        while (s.remainingBits || s.remainingRefs) {
            outArr.push(loadFn_T(s));
        }
    }
    if (len !== outArr.length) {
        throw new Error(`mismatch array binary data: expected ${len} elements, got ${outArr.length}`);
    }
    return outArr;
}

function createDictionaryValue<V>(loadFn_V: LoadCallback<V>, storeFn_V: StoreCallback<V>): c.DictionaryValue<V> {
    return {
        serialize(self: V, b: c.Builder) {
            storeFn_V(self, b);
        },
        parse(s: c.Slice): V {
            const value = loadFn_V(s);
            s.endParse();
            return value;
        }
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

type int32 = bigint

type uint32 = bigint
type uint64 = bigint

type varuint32 = bigint

/**
 > type ExtraCurrenciesMap = map<int32, varuint32>
 */
export type ExtraCurrenciesMap = c.Dictionary<int32, varuint32>

export const ExtraCurrenciesMap = {
    fromSlice(s: c.Slice): ExtraCurrenciesMap {
        return c.Dictionary.load<int32, varuint32>(c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
            (s) => s.loadVarUintBig(5),
            (v,b) => b.storeVarUint(v, 5)
        ), s);
    },
    store(self: ExtraCurrenciesMap, b: c.Builder): void {
        b.storeDict<int32, varuint32>(self, c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
            (s) => s.loadVarUintBig(5),
            (v,b) => b.storeVarUint(v, 5)
        ));
    },
    toCell(self: ExtraCurrenciesMap): c.Cell {
        return makeCellFrom<ExtraCurrenciesMap>(self, ExtraCurrenciesMap.store);
    }
}

/**
 > struct (0x3c50a300) ContextExecutor_Init<T> {
 >     queryId: uint64
 >     context: Cell<T>
 >     forwardFrom: array<address>
 > }
 */
export interface ContextExecutor_Init<T> {
    readonly $: 'ContextExecutor_Init'
    queryId: uint64
    context: CellRef<T>
    forwardFrom: array<c.Address>
}

export const ContextExecutor_Init = {
    PREFIX: 0x3c50a300,

    create<T>(args: {
        queryId: uint64
        context: CellRef<T>
        forwardFrom: array<c.Address>
    }): ContextExecutor_Init<T> {
        return {
            $: 'ContextExecutor_Init',
            ...args
        }
    },
}

/**
 > struct (0x3c50a301) ContextExecutor_Ask {
 >     queryId: uint64
 >     forwardPayload: cell
 > }
 */
export interface ContextExecutor_Ask {
    readonly $: 'ContextExecutor_Ask'
    queryId: uint64
    forwardPayload: c.Cell
}

export const ContextExecutor_Ask = {
    PREFIX: 0x3c50a301,

    create(args: {
        queryId: uint64
        forwardPayload: c.Cell
    }): ContextExecutor_Ask {
        return {
            $: 'ContextExecutor_Ask',
            ...args
        }
    },
    fromSlice(s: c.Slice): ContextExecutor_Ask {
        loadAndCheckPrefix32(s, 0x3c50a301, 'ContextExecutor_Ask');
        return {
            $: 'ContextExecutor_Ask',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadRef(),
        }
    },
    store(self: ContextExecutor_Ask, b: c.Builder): void {
        b.storeUint(0x3c50a301, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.forwardPayload);
    },
    toCell(self: ContextExecutor_Ask): c.Cell {
        return makeCellFrom<ContextExecutor_Ask>(self, ContextExecutor_Ask.store);
    }
}

/**
 > struct (0x3c50a302) ContextExecutor_Reply<T> {
 >     queryId: uint64
 >     id: uint64
 >     context: Cell<T>
 >     forwardFrom: array<address>
 >     forwardPayload: cell
 > }
 */
export interface ContextExecutor_Reply<T> {
    readonly $: 'ContextExecutor_Reply'
    queryId: uint64
    id: uint64
    context: CellRef<T>
    forwardFrom: array<c.Address>
    forwardPayload: c.Cell
}

export const ContextExecutor_Reply = {
    PREFIX: 0x3c50a302,

    create<T>(args: {
        queryId: uint64
        id: uint64
        context: CellRef<T>
        forwardFrom: array<c.Address>
        forwardPayload: c.Cell
    }): ContextExecutor_Reply<T> {
        return {
            $: 'ContextExecutor_Reply',
            ...args
        }
    },
}

/**
 > struct (0x3c50a303) ContextExecutor_ForwardNotification<T> {
 >     id: uint64
 >     context: Cell<T>
 >     forwardFrom: array<address>
 >     message: Cell<ContextExecutor_InMessageForward>
 > }
 */
export interface ContextExecutor_ForwardNotification<T> {
    readonly $: 'ContextExecutor_ForwardNotification'
    id: uint64
    context: CellRef<T>
    forwardFrom: array<c.Address>
    message: CellRef<ContextExecutor_InMessageForward>
}

export const ContextExecutor_ForwardNotification = {
    PREFIX: 0x3c50a303,

    create<T>(args: {
        id: uint64
        context: CellRef<T>
        forwardFrom: array<c.Address>
        message: CellRef<ContextExecutor_InMessageForward>
    }): ContextExecutor_ForwardNotification<T> {
        return {
            $: 'ContextExecutor_ForwardNotification',
            ...args
        }
    },
}

/**
 > struct ContextExecutor_Data<C> {
 >     id: uint64
 >     owner: address
 >     context: Cell<C>
 >     forwardFrom: array<address>
 > }
 */
export interface ContextExecutor_Data<C> {
    readonly $: 'ContextExecutor_Data'
    id: uint64
    owner: c.Address
    context: CellRef<C>
    forwardFrom: array<c.Address>
}

export const ContextExecutor_Data = {
    create<C>(args: {
        id: uint64
        owner: c.Address
        context: CellRef<C>
        forwardFrom: array<c.Address>
    }): ContextExecutor_Data<C> {
        return {
            $: 'ContextExecutor_Data',
            ...args
        }
    },
}

/**
 > struct ContextExecutor_InMessageForward {
 >     senderAddress: address
 >     valueCoins: coins
 >     valueExtra: ExtraCurrenciesMap
 >     originalForwardFee: coins
 >     createdLt: uint64
 >     createdAt: uint32
 >     body: cell
 > }
 */
export interface ContextExecutor_InMessageForward {
    readonly $: 'ContextExecutor_InMessageForward'
    senderAddress: c.Address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: c.Cell
}

export const ContextExecutor_InMessageForward = {
    create(args: {
        senderAddress: c.Address
        valueCoins: coins
        valueExtra: ExtraCurrenciesMap
        originalForwardFee: coins
        createdLt: uint64
        createdAt: uint32
        body: c.Cell
    }): ContextExecutor_InMessageForward {
        return {
            $: 'ContextExecutor_InMessageForward',
            ...args
        }
    },
    fromSlice(s: c.Slice): ContextExecutor_InMessageForward {
        return {
            $: 'ContextExecutor_InMessageForward',
            senderAddress: s.loadAddress(),
            valueCoins: s.loadCoins(),
            valueExtra: ExtraCurrenciesMap.fromSlice(s),
            originalForwardFee: s.loadCoins(),
            createdLt: s.loadUintBig(64),
            createdAt: s.loadUintBig(32),
            body: s.loadRef(),
        }
    },
    store(self: ContextExecutor_InMessageForward, b: c.Builder): void {
        b.storeAddress(self.senderAddress);
        b.storeCoins(self.valueCoins);
        ExtraCurrenciesMap.store(self.valueExtra, b);
        b.storeCoins(self.originalForwardFee);
        b.storeUint(self.createdLt, 64);
        b.storeUint(self.createdAt, 32);
        b.storeRef(self.body);
    },
    toCell(self: ContextExecutor_InMessageForward): c.Cell {
        return makeCellFrom<ContextExecutor_InMessageForward>(self, ContextExecutor_InMessageForward.store);
    }
}

// ————————————————————————————————————————————
//    class ContextExecutor
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

export class ContextExecutor implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECDQEAAoQAART/APSkE/S88sgLAQIBYgIDAgLOBAUAX6AivxoRtjS3NZcxtDC0txc6N7cXMbG0uBcht7c6Mrw6Irwysbq6N7lBFqYFxiXGEQIBIAYHAElO2i7ftsIjJwIW+Ikly5jhAhpFIzb4EkxwWVXwR/2zHg6F8EcIAas+JHyQO1E0NM/+kjUbwAB0wf0BJMhbrOOEgHQ9ASa+khQVW+MJMcAFeYwAegxIm+IWLryidH4kviX+Jj4k3D4OviU+JUqyM7J8AHjAl8EhA8BxwDy9IAgD9wg0NcsIeKFGATjAtcsIeKFGAyOWmxh0z/XTMjPkPFCjAoSyz8mzws/JM8UI2+Ic21UciGpBo4bAcj0AFMhtghRIqEimVOAb4FY+lIBpOQByQKh5DAxAssH9ADMycjPhYgS+lJxzwtuzMmAQPsAf+AwVHqYU6nwAuMCbGGAJCgsAdjQCyMs/+lLMIW+Ic21UciGpBo4bAcj0AFMhtghRIqEimVNgb4FY+lIBpOQByQKh5DAxM88LB/QAye1UAf44XwYy0z/UbwAB0wf0BZMgbrOOEND0BJr6SFBEb4wjxwAU5jDoMCFviLryiXDIyz/JyM+Q8UKMChTLPybPCz8izxQhb4hzbVRyIakGjhsByPQAUyG2CFEioSKZU2BvgVj6UgGk5AHJAqHkMDECywf0ABPMycjPhYgU+lJxzwtuDADKJsj6UlAG+gIU9ABY+gLLP8sfzMnIz5DxQowOJs8LPyTPFCNviHNtVHIhqQaOGwHI9ABTIbYIUSKhIplTgG+BWPpSAaTkAckCoeQwMQLLB/QAzMnIz4UIEvpScc8LbszJgED7AH8ABtDHAAAQE8zJgED7AH8=');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new ContextExecutor(address);
    }

    static fromStorage(emptyStorage: {
        id: uint64
        owner: c.Address
        context: CellRef<c.Cell>
        forwardFrom: array<c.Address>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? ContextExecutor.CodeCell,
            data: makeCellFrom<ContextExecutor_Data<c.Cell>>(ContextExecutor_Data.create<c.Cell>(emptyStorage),
                (v,b) => { b.storeUint(v.id, 64);
                b.storeAddress(v.owner);
                storeCellRef<c.Cell>(v.context, b,
                    (v,b) => b.storeRef(v)
                );
                storeArrayOf<c.Address>(v.forwardFrom, b,
                    (v,b) => b.storeAddress(v)
                ); }
            ),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new ContextExecutor(address, initialState);
    }

    static createCellOfContextExecutorInitCell_(body: {
        queryId: uint64
        context: CellRef<c.Cell>
        forwardFrom: array<c.Address>
    }) {
        return makeCellFrom<ContextExecutor_Init<c.Cell>>(ContextExecutor_Init.create<c.Cell>(body),
            (v,b) => { b.storeUint(0x3c50a300, 32);
            b.storeUint(v.queryId, 64);
            storeCellRef<c.Cell>(v.context, b,
                (v,b) => b.storeRef(v)
            );
            storeArrayOf<c.Address>(v.forwardFrom, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    }

    static createCellOfContextExecutorAsk(body: {
        queryId: uint64
        forwardPayload: c.Cell
    }) {
        return ContextExecutor_Ask.toCell(ContextExecutor_Ask.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendContextExecutorInitCell_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        context: CellRef<c.Cell>
        forwardFrom: array<c.Address>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<ContextExecutor_Init<c.Cell>>(ContextExecutor_Init.create<c.Cell>(body),
                (v,b) => { b.storeUint(0x3c50a300, 32);
                b.storeUint(v.queryId, 64);
                storeCellRef<c.Cell>(v.context, b,
                    (v,b) => b.storeRef(v)
                );
                storeArrayOf<c.Address>(v.forwardFrom, b,
                    (v,b) => b.storeAddress(v)
                ); }
            ),
            ...extraOptions
        });
    }

    async sendContextExecutorAsk(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ContextExecutor_Ask.toCell(ContextExecutor_Ask.create(body)),
            ...extraOptions
        });
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
