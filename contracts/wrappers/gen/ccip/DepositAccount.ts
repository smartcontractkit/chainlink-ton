// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a DepositAccount contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

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

function dictToMap<K extends c.DictionaryKeyTypes, V>(d: c.Dictionary<K, V>): Map<K, V> {
    const map = new Map<K, V>();
    for (const [k, v] of d) {
        map.set(k, v);
    }
    return map;
}

function mapToDict<K extends c.DictionaryKeyTypes, V>(m: Map<K, V>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<V>): c.Dictionary<K, V> {
    const d = c.Dictionary.empty<K, V>(keySerializer, valueSerializer);
    for (const [k, v] of m) {
        d.set(k, v);
    }
    return d;
}


function dictToSet<K extends c.DictionaryKeyTypes>(d: c.Dictionary<K, []>): Set<K> {
    const set = new Set<K>();
    for (const k of d.keys()) {
        set.add(k);
    }
    return set;
}

function setToDict<K extends c.DictionaryKeyTypes>(s: Set<K>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<[]>): c.Dictionary<K, []> {
    const d = c.Dictionary.empty<K, []>(keySerializer, valueSerializer);
    for (const k of s) {
        d.set(k, []);
    }
    return d;
}


function storeTolkRemaining(v: RemainingBitsAndRefs, b: c.Builder): void {
    b.storeSlice(v);
}

function loadTolkRemaining(s: c.Slice): RemainingBitsAndRefs {
    let rest = s.clone();
    s.loadBits(s.remainingBits);
    while (s.remainingRefs) {
        s.loadRef();
    }
    return rest;
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
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

    readDictionary<K extends c.DictionaryKeyTypes, V>(keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<V>): c.Dictionary<K, V> {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return c.Dictionary.empty<K, V>(keySerializer, valueSerializer);
        }
        return c.Dictionary.loadDirect<K, V>(keySerializer, valueSerializer, this.readCell());
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
export type ExtraCurrenciesMap = Map<int32, varuint32>

export const ExtraCurrenciesMap = {
    fromSlice(s: c.Slice): ExtraCurrenciesMap {
        return dictToMap(c.Dictionary.load<int32, varuint32>(c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
                    (s) => s.loadVarUintBig(5),
                    (v,b) => b.storeVarUint(v, 5)
                ), s));
    },
    store(self: ExtraCurrenciesMap, b: c.Builder): void {
        b.storeDict<int32, varuint32>(mapToDict(self, c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
                        (s) => s.loadVarUintBig(5),
                        (v,b) => b.storeVarUint(v, 5)
                    )), c.Dictionary.Keys.BigInt(32), createDictionaryValue<varuint32>(
            (s) => s.loadVarUintBig(5),
            (v,b) => b.storeVarUint(v, 5)
        ));
    },
    toCell(self: ExtraCurrenciesMap): c.Cell {
        return makeCellFrom<ExtraCurrenciesMap>(self, ExtraCurrenciesMap.store);
    }
}

/**
 > struct DepositAccount_Data {
 >     owner: address
 >     proxy: address
 >     beneficiaries: map<address, ()>
 > }
 */
export interface DepositAccount_Data {
    readonly $: 'DepositAccount_Data'
    owner: c.Address
    proxy: c.Address
    beneficiaries: Set<c.Address>
}

export const DepositAccount_Data = {
    create(args: {
        owner: c.Address
        proxy: c.Address
        beneficiaries: Set<c.Address>
    }): DepositAccount_Data {
        return {
            $: 'DepositAccount_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Data {
        return {
            $: 'DepositAccount_Data',
            owner: s.loadAddress(),
            proxy: s.loadAddress(),
            beneficiaries: dictToSet(c.Dictionary.load<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
        }
    },
    store(self: DepositAccount_Data, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.proxy);
        b.storeDict<c.Address, []>(setToDict(self.beneficiaries, c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: DepositAccount_Data): c.Cell {
        return makeCellFrom<DepositAccount_Data>(self, DepositAccount_Data.store);
    }
}

/**
 > struct (0x6890a205) DepositAccount_Init {
 >     queryId: uint64
 >     forwardPayload: cell?
 > }
 */
export interface DepositAccount_Init {
    readonly $: 'DepositAccount_Init'
    queryId: uint64
    forwardPayload: c.Cell | null
}

export const DepositAccount_Init = {
    PREFIX: 0x6890a205,

    create(args: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }): DepositAccount_Init {
        return {
            $: 'DepositAccount_Init',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Init {
        loadAndCheckPrefix32(s, 0x6890a205, 'DepositAccount_Init');
        return {
            $: 'DepositAccount_Init',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Init, b: c.Builder): void {
        b.storeUint(0x6890a205, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Init): c.Cell {
        return makeCellFrom<DepositAccount_Init>(self, DepositAccount_Init.store);
    }
}

/**
 > struct (0xda04630c) DepositAccount_Reply {
 >     queryId: uint64
 >     forwardPayload: cell?
 > }
 */
export interface DepositAccount_Reply {
    readonly $: 'DepositAccount_Reply'
    queryId: uint64
    forwardPayload: c.Cell | null
}

export const DepositAccount_Reply = {
    PREFIX: 0xda04630c,

    create(args: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }): DepositAccount_Reply {
        return {
            $: 'DepositAccount_Reply',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Reply {
        loadAndCheckPrefix32(s, 0xda04630c, 'DepositAccount_Reply');
        return {
            $: 'DepositAccount_Reply',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Reply, b: c.Builder): void {
        b.storeUint(0xda04630c, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Reply): c.Cell {
        return makeCellFrom<DepositAccount_Reply>(self, DepositAccount_Reply.store);
    }
}

/**
 > struct (0xb4fe5c0c) DepositAccount_ForwardNotification {
 >     message: Cell<DepositAccount_InMessageForward>
 > }
 */
export interface DepositAccount_ForwardNotification {
    readonly $: 'DepositAccount_ForwardNotification'
    message: DepositAccount_InMessageForward
}

export const DepositAccount_ForwardNotification = {
    PREFIX: 0xb4fe5c0c,

    create(args: {
        message: DepositAccount_InMessageForward
    }): DepositAccount_ForwardNotification {
        return {
            $: 'DepositAccount_ForwardNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_ForwardNotification {
        loadAndCheckPrefix32(s, 0xb4fe5c0c, 'DepositAccount_ForwardNotification');
        return {
            $: 'DepositAccount_ForwardNotification',
            message: loadCellRef<DepositAccount_InMessageForward>(s, DepositAccount_InMessageForward.fromSlice),
        }
    },
    store(self: DepositAccount_ForwardNotification, b: c.Builder): void {
        b.storeUint(0xb4fe5c0c, 32);
        storeCellRef<DepositAccount_InMessageForward>(self.message, b, DepositAccount_InMessageForward.store);
    },
    toCell(self: DepositAccount_ForwardNotification): c.Cell {
        return makeCellFrom<DepositAccount_ForwardNotification>(self, DepositAccount_ForwardNotification.store);
    }
}

/**
 > struct DepositAccount_InMessageForward {
 >     senderAddress: address
 >     valueCoins: coins
 >     valueExtra: ExtraCurrenciesMap
 >     originalForwardFee: coins
 >     createdLt: uint64
 >     createdAt: uint32
 >     body: cell
 > }
 */
export interface DepositAccount_InMessageForward {
    readonly $: 'DepositAccount_InMessageForward'
    senderAddress: c.Address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: c.Cell
}

export const DepositAccount_InMessageForward = {
    create(args: {
        senderAddress: c.Address
        valueCoins: coins
        valueExtra: ExtraCurrenciesMap
        originalForwardFee: coins
        createdLt: uint64
        createdAt: uint32
        body: c.Cell
    }): DepositAccount_InMessageForward {
        return {
            $: 'DepositAccount_InMessageForward',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_InMessageForward {
        return {
            $: 'DepositAccount_InMessageForward',
            senderAddress: s.loadAddress(),
            valueCoins: s.loadCoins(),
            valueExtra: ExtraCurrenciesMap.fromSlice(s),
            originalForwardFee: s.loadCoins(),
            createdLt: s.loadUintBig(64),
            createdAt: s.loadUintBig(32),
            body: s.loadRef(),
        }
    },
    store(self: DepositAccount_InMessageForward, b: c.Builder): void {
        b.storeAddress(self.senderAddress);
        b.storeCoins(self.valueCoins);
        ExtraCurrenciesMap.store(self.valueExtra, b);
        b.storeCoins(self.originalForwardFee);
        b.storeUint(self.createdLt, 64);
        b.storeUint(self.createdAt, 32);
        b.storeRef(self.body);
    },
    toCell(self: DepositAccount_InMessageForward): c.Cell {
        return makeCellFrom<DepositAccount_InMessageForward>(self, DepositAccount_InMessageForward.store);
    }
}

/**
 > struct (0x1936d112) DepositAccount_Withdraw {
 >     queryId: uint64
 >     walletAddress: address
 >     ask: Cell<AskToTransfer>
 > }
 */
export interface DepositAccount_Withdraw {
    readonly $: 'DepositAccount_Withdraw'
    queryId: uint64
    walletAddress: c.Address
    ask: AskToTransfer
}

export const DepositAccount_Withdraw = {
    PREFIX: 0x1936d112,

    create(args: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }): DepositAccount_Withdraw {
        return {
            $: 'DepositAccount_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Withdraw {
        loadAndCheckPrefix32(s, 0x1936d112, 'DepositAccount_Withdraw');
        return {
            $: 'DepositAccount_Withdraw',
            queryId: s.loadUintBig(64),
            walletAddress: s.loadAddress(),
            ask: loadCellRef<AskToTransfer>(s, AskToTransfer.fromSlice),
        }
    },
    store(self: DepositAccount_Withdraw, b: c.Builder): void {
        b.storeUint(0x1936d112, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.walletAddress);
        storeCellRef<AskToTransfer>(self.ask, b, AskToTransfer.store);
    },
    toCell(self: DepositAccount_Withdraw): c.Cell {
        return makeCellFrom<DepositAccount_Withdraw>(self, DepositAccount_Withdraw.store);
    }
}

/**
 > struct (0xa51b6cba) DepositAccount_WithdrawFailed {
 >     queryId: uint64
 >     walletAddress: address
 >     ask: Cell<AskToTransfer>
 > }
 */
export interface DepositAccount_WithdrawFailed {
    readonly $: 'DepositAccount_WithdrawFailed'
    queryId: uint64
    walletAddress: c.Address
    ask: AskToTransfer
}

export const DepositAccount_WithdrawFailed = {
    PREFIX: 0xa51b6cba,

    create(args: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }): DepositAccount_WithdrawFailed {
        return {
            $: 'DepositAccount_WithdrawFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_WithdrawFailed {
        loadAndCheckPrefix32(s, 0xa51b6cba, 'DepositAccount_WithdrawFailed');
        return {
            $: 'DepositAccount_WithdrawFailed',
            queryId: s.loadUintBig(64),
            walletAddress: s.loadAddress(),
            ask: loadCellRef<AskToTransfer>(s, AskToTransfer.fromSlice),
        }
    },
    store(self: DepositAccount_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0xa51b6cba, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.walletAddress);
        storeCellRef<AskToTransfer>(self.ask, b, AskToTransfer.store);
    },
    toCell(self: DepositAccount_WithdrawFailed): c.Cell {
        return makeCellFrom<DepositAccount_WithdrawFailed>(self, DepositAccount_WithdrawFailed.store);
    }
}

/**
 > struct (0x67dd47d3) DepositAccount_ForwardFailed {
 >     bouncedFrom: address
 >     bouncedBody: cell
 > }
 */
export interface DepositAccount_ForwardFailed {
    readonly $: 'DepositAccount_ForwardFailed'
    bouncedFrom: c.Address
    bouncedBody: c.Cell
}

export const DepositAccount_ForwardFailed = {
    PREFIX: 0x67dd47d3,

    create(args: {
        bouncedFrom: c.Address
        bouncedBody: c.Cell
    }): DepositAccount_ForwardFailed {
        return {
            $: 'DepositAccount_ForwardFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_ForwardFailed {
        loadAndCheckPrefix32(s, 0x67dd47d3, 'DepositAccount_ForwardFailed');
        return {
            $: 'DepositAccount_ForwardFailed',
            bouncedFrom: s.loadAddress(),
            bouncedBody: s.loadRef(),
        }
    },
    store(self: DepositAccount_ForwardFailed, b: c.Builder): void {
        b.storeUint(0x67dd47d3, 32);
        b.storeAddress(self.bouncedFrom);
        b.storeRef(self.bouncedBody);
    },
    toCell(self: DepositAccount_ForwardFailed): c.Cell {
        return makeCellFrom<DepositAccount_ForwardFailed>(self, DepositAccount_ForwardFailed.store);
    }
}

/**
 > type ForwardPayloadRemainder = RemainingBitsAndRefs
 */
export type ForwardPayloadRemainder = RemainingBitsAndRefs

export const ForwardPayloadRemainder = {
    fromSlice(s: c.Slice): ForwardPayloadRemainder {
        return loadTolkRemaining(s);
    },
    store(self: ForwardPayloadRemainder, b: c.Builder): void {
        storeTolkRemaining(self, b);
    },
    toCell(self: ForwardPayloadRemainder): c.Cell {
        return makeCellFrom<ForwardPayloadRemainder>(self, ForwardPayloadRemainder.store);
    }
}

/**
 > struct (0x0f8a7ea5) AskToTransfer {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferRecipient: address
 >     sendExcessesTo: address?
 >     customPayload: cell?
 >     forwardTonAmount: coins
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface AskToTransfer {
    readonly $: 'AskToTransfer'
    queryId: uint64
    jettonAmount: coins
    transferRecipient: c.Address
    sendExcessesTo: c.Address | null
    customPayload: c.Cell | null
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

export const AskToTransfer = {
    PREFIX: 0x0f8a7ea5,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): AskToTransfer {
        loadAndCheckPrefix32(s, 0x0f8a7ea5, 'AskToTransfer');
        return {
            $: 'AskToTransfer',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferRecipient: s.loadAddress(),
            sendExcessesTo: s.loadMaybeAddress(),
            customPayload: s.loadBoolean() ? s.loadRef() : null,
            forwardTonAmount: s.loadCoins(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: AskToTransfer, b: c.Builder): void {
        b.storeUint(0x0f8a7ea5, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferRecipient);
        b.storeAddress(self.sendExcessesTo);
        storeTolkNullable<c.Cell>(self.customPayload, b,
            (v,b) => b.storeRef(v)
        );
        b.storeCoins(self.forwardTonAmount);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: AskToTransfer): c.Cell {
        return makeCellFrom<AskToTransfer>(self, AskToTransfer.store);
    }
}

// ————————————————————————————————————————————
//    class DepositAccount
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

export class DepositAccount implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECFgEAA0kAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASAQEQIBIAYHAgFIDQ4CASAICQIBIAsMAfc+JGOM3BtbW1tbSXtRND6SPpI9ATR+JIjUZNRkwkQjRB8RlQQPUze8AWayPpS+lL0AMntVOBfA+BwbW1tbW0l7UTQ+kj6SPQE0fiS+Jf4kviX+Jj4kyn4OviU+JVWEsjOyQsREgsKEREKCREQCRC/EK4QnRC8EKsQmlYTgCgDRO2i7fs4BtcsI0SFECyYbHHTP/QF8AKOTtcsIMm2iJSOJTA3VhAHVhAHVhAHVhAHVhAHVhAHVhAHVhAHVhAHVhBQd/AE2zHhbHHTP/pI10wtUU1RTVFNUU1RTVFNUU1RTVFNRDTwA+J/gADhVYPABbHEDyPpSEvpS9ADJ7VSRMOCEDwHHAPL0AHMI8MAlShus8MAkXDimVR8uixVIyzacOCBH0BTPccF8vTIz4UIE/pSghDaBGMMzwuOyz/0AMmAQPsAgANUNTU1NsMAlSNus8MAkXDilFUC2oDgNTZbNCOBH0EDgQEL9ApvoTES8vQg0NcsIHxT9Szyv9M/MfoAMfpIMfpQMIEfQiFus5UExwXDAJMxM3DiE/L0yM+FiPpSz4QQc/oCcc8LZczJgFD7AIACVDg5OTkDwwCVJG6zwwCRcOKXRXZQMwTaseA0Nzc4BMj6UlAE+gIU9AAB+gISyz/LHxLMycjPhQgS+lKCELT+XAzPC47MyYBA+wB/gAZkNDU1AdcsJ/////Tyv9dMINDXLCB8U/Us4wIwMgPDAJUibrPDAJFw4pNY2mCOHDQ1W8jPhQgS+lKCEGfdR9PPC44S+lLMyYBA+wDif4A8Aymwh0z/6APpI+lD0BPoACcMAlSZus8MAkXDilhB4VRXawI5ANjg4ODjIz5A+KfqWIc8LP1AI+gIW+lJSQPpUE/QAUAT6AhPOycjPhQgS+lKCEKUbbLrPC44Tyz/6UszJgED7AOJ/AgEgEhMCAUgUFQBduRX40ImxpbmsuY2hhaW4udG9uLmNjaXAuRGVwb3NpdEFjY291bnSCLUwLjEuMIgAG7nQjtRND6SDH6SDH0BYABG10T2omh9JBhAAF7QDfaiaH0kGP0kGEA==');

    static Errors = {
        'DepositAccount_Error.OnlyOwner': 8000,
        'DepositAccount_Error.OnlyBeneficiary': 8001,
        'DepositAccount_Error.OnlySendExcessesToSender': 8002,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new DepositAccount(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        proxy: c.Address
        beneficiaries: Set<c.Address>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? DepositAccount.CodeCell,
            data: DepositAccount_Data.toCell(DepositAccount_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new DepositAccount(address, initialState);
    }

    static createCellOfDepositAccountInit(body: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }) {
        return DepositAccount_Init.toCell(DepositAccount_Init.create(body));
    }

    static createCellOfDepositAccountWithdraw(body: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }) {
        return DepositAccount_Withdraw.toCell(DepositAccount_Withdraw.create(body));
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

    async sendDepositAccountInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_Init.toCell(DepositAccount_Init.create(body)),
            ...extraOptions
        });
    }

    async sendDepositAccountWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_Withdraw.toCell(DepositAccount_Withdraw.create(body)),
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

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getOwner', []));
        return r.readSlice().loadAddress();
    }

    async getProxy(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getProxy', []));
        return r.readSlice().loadAddress();
    }

    async getBeneficiaries(provider: ContractProvider): Promise<Set<c.Address>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBeneficiaries', []));
        return dictToSet(r.readDictionary<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                    (s) => [],
                    (v,b) => { {} }
                )));
    }
}
