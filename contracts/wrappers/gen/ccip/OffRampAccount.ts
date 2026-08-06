// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OffRampAccount contract in Tolk.
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

/**
 > struct OffRampAccount_Data {
 >     owner: address
 >     notificationTarget: address
 >     allowedJettonWallet: address?
 > }
 */
export interface OffRampAccount_Data {
    readonly $: 'OffRampAccount_Data'
    owner: c.Address
    notificationTarget: c.Address
    allowedJettonWallet: c.Address | null
}

export const OffRampAccount_Data = {
    create(args: {
        owner: c.Address
        notificationTarget: c.Address
        allowedJettonWallet: c.Address | null
    }): OffRampAccount_Data {
        return {
            $: 'OffRampAccount_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_Data {
        return {
            $: 'OffRampAccount_Data',
            owner: s.loadAddress(),
            notificationTarget: s.loadAddress(),
            allowedJettonWallet: s.loadMaybeAddress(),
        }
    },
    store(self: OffRampAccount_Data, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.notificationTarget);
        b.storeAddress(self.allowedJettonWallet);
    },
    toCell(self: OffRampAccount_Data): c.Cell {
        return makeCellFrom<OffRampAccount_Data>(self, OffRampAccount_Data.store);
    }
}

/**
 > struct (0xf1a2b3c4) OffRampAccount_Init {
 >     queryId: uint64
 >     allowedJettonWallet: address
 >     forwardPayload: cell?
 > }
 */
export interface OffRampAccount_Init {
    readonly $: 'OffRampAccount_Init'
    queryId: uint64
    allowedJettonWallet: c.Address
    forwardPayload: c.Cell | null
}

export const OffRampAccount_Init = {
    PREFIX: 0xf1a2b3c4,

    create(args: {
        queryId?: uint64
        allowedJettonWallet: c.Address
        forwardPayload: c.Cell | null
    }): OffRampAccount_Init {
        return {
            $: 'OffRampAccount_Init',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_Init {
        loadAndCheckPrefix32(s, 0xf1a2b3c4, 'OffRampAccount_Init');
        return {
            $: 'OffRampAccount_Init',
            queryId: s.loadUintBig(64),
            allowedJettonWallet: s.loadAddress(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: OffRampAccount_Init, b: c.Builder): void {
        b.storeUint(0xf1a2b3c4, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.allowedJettonWallet);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: OffRampAccount_Init): c.Cell {
        return makeCellFrom<OffRampAccount_Init>(self, OffRampAccount_Init.store);
    }
}

/**
 > struct (0xd2e3f4a5) OffRampAccount_Reply {
 >     queryId: uint64
 >     forwardPayload: cell?
 > }
 */
export interface OffRampAccount_Reply {
    readonly $: 'OffRampAccount_Reply'
    queryId: uint64
    forwardPayload: c.Cell | null
}

export const OffRampAccount_Reply = {
    PREFIX: 0xd2e3f4a5,

    create(args: {
        queryId?: uint64
        forwardPayload: c.Cell | null
    }): OffRampAccount_Reply {
        return {
            $: 'OffRampAccount_Reply',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_Reply {
        loadAndCheckPrefix32(s, 0xd2e3f4a5, 'OffRampAccount_Reply');
        return {
            $: 'OffRampAccount_Reply',
            queryId: s.loadUintBig(64),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: OffRampAccount_Reply, b: c.Builder): void {
        b.storeUint(0xd2e3f4a5, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: OffRampAccount_Reply): c.Cell {
        return makeCellFrom<OffRampAccount_Reply>(self, OffRampAccount_Reply.store);
    }
}

/**
 > struct (0xa7b8c9d0) OffRampAccount_ForwardNotification {
 >     message: Cell<OffRampAccount_InMessageForward>
 > }
 */
export interface OffRampAccount_ForwardNotification {
    readonly $: 'OffRampAccount_ForwardNotification'
    message: OffRampAccount_InMessageForward
}

export const OffRampAccount_ForwardNotification = {
    PREFIX: 0xa7b8c9d0,

    create(args: {
        message: OffRampAccount_InMessageForward
    }): OffRampAccount_ForwardNotification {
        return {
            $: 'OffRampAccount_ForwardNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_ForwardNotification {
        loadAndCheckPrefix32(s, 0xa7b8c9d0, 'OffRampAccount_ForwardNotification');
        return {
            $: 'OffRampAccount_ForwardNotification',
            message: loadCellRef<OffRampAccount_InMessageForward>(s, OffRampAccount_InMessageForward.fromSlice),
        }
    },
    store(self: OffRampAccount_ForwardNotification, b: c.Builder): void {
        b.storeUint(0xa7b8c9d0, 32);
        storeCellRef<OffRampAccount_InMessageForward>(self.message, b, OffRampAccount_InMessageForward.store);
    },
    toCell(self: OffRampAccount_ForwardNotification): c.Cell {
        return makeCellFrom<OffRampAccount_ForwardNotification>(self, OffRampAccount_ForwardNotification.store);
    }
}

/**
 > struct OffRampAccount_InMessageForward {
 >     senderAddress: address
 >     valueCoins: coins
 >     valueExtra: ExtraCurrenciesMap
 >     originalForwardFee: coins
 >     createdLt: uint64
 >     createdAt: uint32
 >     body: cell
 > }
 */
export interface OffRampAccount_InMessageForward {
    readonly $: 'OffRampAccount_InMessageForward'
    senderAddress: c.Address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: c.Cell
}

export const OffRampAccount_InMessageForward = {
    create(args: {
        senderAddress: c.Address
        valueCoins: coins
        valueExtra: ExtraCurrenciesMap
        originalForwardFee: coins
        createdLt: uint64
        createdAt: uint32
        body: c.Cell
    }): OffRampAccount_InMessageForward {
        return {
            $: 'OffRampAccount_InMessageForward',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_InMessageForward {
        return {
            $: 'OffRampAccount_InMessageForward',
            senderAddress: s.loadAddress(),
            valueCoins: s.loadCoins(),
            valueExtra: ExtraCurrenciesMap.fromSlice(s),
            originalForwardFee: s.loadCoins(),
            createdLt: s.loadUintBig(64),
            createdAt: s.loadUintBig(32),
            body: s.loadRef(),
        }
    },
    store(self: OffRampAccount_InMessageForward, b: c.Builder): void {
        b.storeAddress(self.senderAddress);
        b.storeCoins(self.valueCoins);
        ExtraCurrenciesMap.store(self.valueExtra, b);
        b.storeCoins(self.originalForwardFee);
        b.storeUint(self.createdLt, 64);
        b.storeUint(self.createdAt, 32);
        b.storeRef(self.body);
    },
    toCell(self: OffRampAccount_InMessageForward): c.Cell {
        return makeCellFrom<OffRampAccount_InMessageForward>(self, OffRampAccount_InMessageForward.store);
    }
}

/**
 > struct (0xe3f4a5b6) OffRampAccount_Withdraw {
 >     queryId: uint64
 >     walletAddress: address
 >     recipient: address
 >     amount: coins
 > }
 */
export interface OffRampAccount_Withdraw {
    readonly $: 'OffRampAccount_Withdraw'
    queryId: uint64
    walletAddress: c.Address
    recipient: c.Address
    amount: coins
}

export const OffRampAccount_Withdraw = {
    PREFIX: 0xe3f4a5b6,

    create(args: {
        queryId?: uint64
        walletAddress: c.Address
        recipient: c.Address
        amount: coins
    }): OffRampAccount_Withdraw {
        return {
            $: 'OffRampAccount_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRampAccount_Withdraw {
        loadAndCheckPrefix32(s, 0xe3f4a5b6, 'OffRampAccount_Withdraw');
        return {
            $: 'OffRampAccount_Withdraw',
            queryId: s.loadUintBig(64),
            walletAddress: s.loadAddress(),
            recipient: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: OffRampAccount_Withdraw, b: c.Builder): void {
        b.storeUint(0xe3f4a5b6, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.walletAddress);
        b.storeAddress(self.recipient);
        b.storeCoins(self.amount);
    },
    toCell(self: OffRampAccount_Withdraw): c.Cell {
        return makeCellFrom<OffRampAccount_Withdraw>(self, OffRampAccount_Withdraw.store);
    }
}

// ————————————————————————————————————————————
//    class OffRampAccount
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

export class OffRampAccount implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECCgEAAYYAART/APSkE/S88sgLAQIBYgIDAvTQ+JHyQO1E0PpI+kj6UNEj1ywnjRWeJI48MTMC0z/6SPQF+JKBEANRFscF8vTIz4UIUlD6UoIQ0uP0pc8LjhPLPxL0AMmAQPsAAcj6UhL6UvpUye1U4NcsJx+lLbTjAjAyIW6zl/iSWMcFwwCSMXDi4wIwhA8BxwDy9AQFAgEgBgcAvjQD0z/6SPpI+gAw+JKBEANRF8cF8vSCEAX14QBtbYsEyM+QPin6lhjLP1AE+gIU+lIT+lT0AM+EIBPOycjPhYgS+lJY+gLPgXP6AnHPC2XMyXH7AAHI+lL6UvpUye1UAH74kviX+Jj4k3D4OviU+JUHyM7JBcj6UlAE+gIS9AAB+gLLPxPLHxLMycjPhQgS+lKCEKe4ydDPC47MyYBA+wAAXbyK/GhE2NLc1lzG0MLS3Fzo3txcxsbS4FyezMykwtrggsbG3urc6QRamBcYlxhEAgHHCAkAF67Q9qJofSQY/SQYQAARr0T2omh9JBhA');

    static Errors = {
        'OffRampAccount_Error.OnlyOwner': 4099,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new OffRampAccount(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        notificationTarget: c.Address
        allowedJettonWallet: c.Address | null
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OffRampAccount.CodeCell,
            data: OffRampAccount_Data.toCell(OffRampAccount_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OffRampAccount(address, initialState);
    }

    static createCellOfOffRampAccountInit(body: {
        queryId?: uint64
        allowedJettonWallet: c.Address
        forwardPayload: c.Cell | null
    }) {
        return OffRampAccount_Init.toCell(OffRampAccount_Init.create(body));
    }

    static createCellOfOffRampAccountWithdraw(body: {
        queryId?: uint64
        walletAddress: c.Address
        recipient: c.Address
        amount: coins
    }) {
        return OffRampAccount_Withdraw.toCell(OffRampAccount_Withdraw.create(body));
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

    async sendOffRampAccountInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        allowedJettonWallet: c.Address
        forwardPayload: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRampAccount_Init.toCell(OffRampAccount_Init.create(body)),
            ...extraOptions
        });
    }

    async sendOffRampAccountWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        walletAddress: c.Address
        recipient: c.Address
        amount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OffRampAccount_Withdraw.toCell(OffRampAccount_Withdraw.create(body)),
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

    async getNotificationTarget(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getNotificationTarget', []));
        return r.readSlice().loadAddress();
    }
}
