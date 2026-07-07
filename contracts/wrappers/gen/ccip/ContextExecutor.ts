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

    readArrayOf<T>(readFn_T: (nestedReader: StackReader) => T): T[] {
        const subItems = this.popExpecting<c.Tuple>('tuple').items;
        const subReader = new StackReader(subItems);
        // array len N => N subItems => N calls to readFn_T
        return [...subItems].map(_ => readFn_T(subReader));
    }

    readTuple<T>(expectedN: number, readFn_T: (nestedReader: StackReader) => T): T {
        const subItems = this.popExpecting<c.Tuple>('tuple').items;
        if (subItems.length !== expectedN) {
            throw new Error(`expected ${expectedN} items in a tuple, got ${subItems.length}`);
        }
        return readFn_T(new StackReader(subItems));
    }

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
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
 > struct (0x44e61eec) ContextExecutor_Set<T> {
 >     queryId: uint64
 >     context: Cell<T>
 >     forwardFrom: array<address>
 > }
 */
export interface ContextExecutor_Set<T> {
    readonly $: 'ContextExecutor_Set'
    queryId: uint64
    context: CellRef<T>
    forwardFrom: array<c.Address>
}

export const ContextExecutor_Set = {
    PREFIX: 0x44e61eec,

    create<T>(args: {
        queryId: uint64
        context: CellRef<T>
        forwardFrom: array<c.Address>
    }): ContextExecutor_Set<T> {
        return {
            $: 'ContextExecutor_Set',
            ...args
        }
    },
}

/**
 > struct (0xcad4d1d0) ContextExecutor_Ask {
 >     queryId: uint64
 >     forwardPayload: cell
 >     done: bool
 > }
 */
export interface ContextExecutor_Ask {
    readonly $: 'ContextExecutor_Ask'
    queryId: uint64
    forwardPayload: c.Cell
    done: boolean
}

export const ContextExecutor_Ask = {
    PREFIX: 0xcad4d1d0,

    create(args: {
        queryId: uint64
        forwardPayload: c.Cell
        done: boolean
    }): ContextExecutor_Ask {
        return {
            $: 'ContextExecutor_Ask',
            ...args
        }
    },
    fromSlice(s: c.Slice): ContextExecutor_Ask {
        loadAndCheckPrefix32(s, 0xcad4d1d0, 'ContextExecutor_Ask');
        return {
            $: 'ContextExecutor_Ask',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadRef(),
            done: s.loadBoolean(),
        }
    },
    store(self: ContextExecutor_Ask, b: c.Builder): void {
        b.storeUint(0xcad4d1d0, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.forwardPayload);
        b.storeBit(self.done);
    },
    toCell(self: ContextExecutor_Ask): c.Cell {
        return makeCellFrom<ContextExecutor_Ask>(self, ContextExecutor_Ask.store);
    }
}

/**
 > struct (0x93e5bbc5) ContextExecutor_Reply<T> {
 >     queryId: uint64
 >     id: uint64
 >     context: Cell<T>
 >     forwardFrom: array<address>
 >     forwardPayload: cell
 >     done: bool
 > }
 */
export interface ContextExecutor_Reply<T> {
    readonly $: 'ContextExecutor_Reply'
    queryId: uint64
    id: uint64
    context: CellRef<T>
    forwardFrom: array<c.Address>
    forwardPayload: c.Cell
    done: boolean
}

export const ContextExecutor_Reply = {
    PREFIX: 0x93e5bbc5,

    create<T>(args: {
        queryId: uint64
        id: uint64
        context: CellRef<T>
        forwardFrom: array<c.Address>
        forwardPayload: c.Cell
        done: boolean
    }): ContextExecutor_Reply<T> {
        return {
            $: 'ContextExecutor_Reply',
            ...args
        }
    },
}

/**
 > struct (0x55b412b9) ContextExecutor_ForwardNotification<T> {
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
    PREFIX: 0x55b412b9,

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
    static CodeCell = c.Cell.fromBase64('te6ccgECFAEAA5AAART/APSkE/S88sgLAQIBYgIDAgLOBAUCASAMDQIBIAYHAElO2i7ftsIjJwIW+Ikly5jhAhpFIzb4EkxwWVXwR/2zHg6F8EcIAas+JHyQO1E0NM/+kjUbwAB0wf0BJMhbrOOEgHQ9ASa+khQVW+MJMcAFeYwAegxIm+IWLryidH4kviX+Jj4k3D4OviU+JUqyM7J8AHjAl8EhA8BxwDy9IAgC9wg0NcsIicw92TjAtcsJlamjoSOZmxh0z/U1woAyM+ST5bvFhPLPyfPCz8lzxQkb4hzbVRyIakGjhsByPQAUyG2CFEioSKZU5BvgVj6UgGk5AHJAqHkMDECywf0AMwhzwoAycjPhQgT+lJxzwtuEszJAYMGgEDjBPsAf+CAJCgB2NALIyz/6Uswhb4hzbVRyIakGjhsByPQAUyG2CFEioSKZU2BvgVj6UgGk5AHJAqHkMDEzzwsH9ADJ7VQB/jhfBjKCAKpQXccF8vTTP9RvAAHTB/QFkyBus44Q0PQEmvpIUERvjCPHABTmMOgwIW+IuvKJcMjLP8nIz5JPlu8WFMs/Js8LPyLPFCFviHNtVHIhqQaOGwHI9ABTIbYIUSKhIplTYG+BWPpSAaTkAckCoeQwMQLLB/QAE8zPgckLAOwwVHqYU6nwAo5mBsj6UlAF+gIT9AAB+gLLP8sfzMnIz5FW0ErmJc8LPyPPFCJviHNtVHIhqQaOGwHI9ABTIbYIUSKhIplTcG+BWPpSAaTkAckCoeQwMQLLB/QAzMnIz4UIUkD6UnHPC27MyYBA+wB/4Gxh0McAACbIz4UIFPpScc8LbhPMyYBA+wB/AgEgDg8Abbzsh2omhpn/0kGOoYt4AA6YP6AkmQt1nHCQDoegJNfSQoKrfGEmOACvMYAPQYkTfEGYFdeUTowCAnIQEQIBIBITAF6pX40I2xpbmsuY2hhaW4udG9uLmNjaXAuQ29udGV4dEV4ZWN1dG9ygi1MC4xLjCABsqFrtRNDTPzH6SDHUMW8AAdMH9ASTIW6zjhIB0PQEmvpIUFVvjCTHABXmMAHoMSJviFi68onRAG20o72omhpn5j9JGoYt4AA6YP6AkmQt1nHCQDoegJNfSQoKrfGEmOACvMYAPQYkTfEGYFdeUTowAG20AX2omhpn5j9JBjqN4AA6YP6AkmQt1nHCQDoegJNfSQoKrfGEmOACvMYAPQYkTfEGYFdeUTow');

    static Errors = {
        'ContextExecutor_Error.OnlyCallableByOwner': 43600,
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

    static createCellOfContextExecutorSetCell_(body: {
        queryId: uint64
        context: CellRef<c.Cell>
        forwardFrom: array<c.Address>
    }) {
        return makeCellFrom<ContextExecutor_Set<c.Cell>>(ContextExecutor_Set.create<c.Cell>(body),
            (v,b) => { b.storeUint(0x44e61eec, 32);
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
        done: boolean
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

    async sendContextExecutorSetCell_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        context: CellRef<c.Cell>
        forwardFrom: array<c.Address>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<ContextExecutor_Set<c.Cell>>(ContextExecutor_Set.create<c.Cell>(body),
                (v,b) => { b.storeUint(0x44e61eec, 32);
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
        done: boolean
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

    async getId(provider: ContractProvider): Promise<uint64> {
        const r = StackReader.fromGetMethod(1, await provider.get('id', []));
        return r.readBigInt();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getContext(provider: ContractProvider): Promise<CellRef<c.Cell>> {
        const r = StackReader.fromGetMethod(1, await provider.get('context', []));
        return r.readCellRef<c.Cell>(
            (s) => s.loadRef()
        );
    }

    async getForwardFrom(provider: ContractProvider): Promise<array<c.Address>> {
        const r = StackReader.fromGetMethod(1, await provider.get('forwardFrom', []));
        return r.readArrayOf<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }
}
