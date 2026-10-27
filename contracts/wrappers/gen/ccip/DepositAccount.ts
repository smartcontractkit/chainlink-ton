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

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
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

type uint16 = bigint
type uint64 = bigint

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
 > struct (0x7362d09c) TransferNotificationForRecipient {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferInitiator: address?
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface TransferNotificationForRecipient {
    readonly $: 'TransferNotificationForRecipient'
    queryId: uint64
    jettonAmount: coins
    transferInitiator: c.Address | null
    forwardPayload: ForwardPayloadRemainder
}

export const TransferNotificationForRecipient = {
    PREFIX: 0x7362d09c,

    create(args: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TransferNotificationForRecipient {
        loadAndCheckPrefix32(s, 0x7362d09c, 'TransferNotificationForRecipient');
        return {
            $: 'TransferNotificationForRecipient',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferInitiator: s.loadMaybeAddress(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: TransferNotificationForRecipient, b: c.Builder): void {
        b.storeUint(0x7362d09c, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferInitiator);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: TransferNotificationForRecipient): c.Cell {
        return makeCellFrom<TransferNotificationForRecipient>(self, TransferNotificationForRecipient.store);
    }
}

/**
 > struct (0x2c76b973) RequestWalletAddress {
 >     queryId: uint64
 >     ownerAddress: address
 >     includeOwnerAddress: bool
 > }
 */
export interface RequestWalletAddress {
    readonly $: 'RequestWalletAddress'
    queryId: uint64
    ownerAddress: c.Address
    includeOwnerAddress: boolean
}

export const RequestWalletAddress = {
    PREFIX: 0x2c76b973,

    create(args: {
        queryId?: uint64
        ownerAddress: c.Address
        includeOwnerAddress: boolean
    }): RequestWalletAddress {
        return {
            $: 'RequestWalletAddress',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): RequestWalletAddress {
        loadAndCheckPrefix32(s, 0x2c76b973, 'RequestWalletAddress');
        return {
            $: 'RequestWalletAddress',
            queryId: s.loadUintBig(64),
            ownerAddress: s.loadAddress(),
            includeOwnerAddress: s.loadBoolean(),
        }
    },
    store(self: RequestWalletAddress, b: c.Builder): void {
        b.storeUint(0x2c76b973, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.ownerAddress);
        b.storeBit(self.includeOwnerAddress);
    },
    toCell(self: RequestWalletAddress): c.Cell {
        return makeCellFrom<RequestWalletAddress>(self, RequestWalletAddress.store);
    }
}

/**
 > struct (0xd1735400) ResponseWalletAddress {
 >     queryId: uint64
 >     jettonWalletAddress: address?
 >     ownerAddress: Cell<address>?
 > }
 */
export interface ResponseWalletAddress {
    readonly $: 'ResponseWalletAddress'
    queryId: uint64
    jettonWalletAddress: c.Address | null
    ownerAddress: c.Address | null
}

export const ResponseWalletAddress = {
    PREFIX: 0xd1735400,

    create(args: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }): ResponseWalletAddress {
        return {
            $: 'ResponseWalletAddress',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): ResponseWalletAddress {
        loadAndCheckPrefix32(s, 0xd1735400, 'ResponseWalletAddress');
        return {
            $: 'ResponseWalletAddress',
            queryId: s.loadUintBig(64),
            jettonWalletAddress: s.loadMaybeAddress(),
            ownerAddress: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: ResponseWalletAddress, b: c.Builder): void {
        b.storeUint(0xd1735400, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.jettonWalletAddress);
        storeTolkNullable<c.Address>(self.ownerAddress, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: ResponseWalletAddress): c.Cell {
        return makeCellFrom<ResponseWalletAddress>(self, ResponseWalletAddress.store);
    }
}

/**
 > struct DepositAccount_Data {
 >     owner: address
 >     user: address
 >     token: address
 >     beneficiaries: map<address, ()>
 >     wallet: Cell<address>?
 >     pendingInit: Cell<DepositAccount_PendingInit>?
 > }
 */
export interface DepositAccount_Data {
    readonly $: 'DepositAccount_Data'
    owner: c.Address
    user: c.Address
    token: c.Address
    beneficiaries: Set<c.Address>
    wallet: c.Address | null /* = null */
    pendingInit: DepositAccount_PendingInit | null /* = null */
}

export const DepositAccount_Data = {
    create(args: {
        owner: c.Address
        user: c.Address
        token: c.Address
        beneficiaries: Set<c.Address>
        wallet?: c.Address | null /* = null */
        pendingInit?: DepositAccount_PendingInit | null /* = null */
    }): DepositAccount_Data {
        return {
            $: 'DepositAccount_Data',
            wallet: null,
            pendingInit: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Data {
        return {
            $: 'DepositAccount_Data',
            owner: s.loadAddress(),
            user: s.loadAddress(),
            token: s.loadAddress(),
            beneficiaries: dictToSet(c.Dictionary.load<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                            (s) => [],
                            (v,b) => { {} }
                        ), s)),
            wallet: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
            pendingInit: s.loadBoolean() ? loadCellRef<DepositAccount_PendingInit>(s, DepositAccount_PendingInit.fromSlice) : null,
        }
    },
    store(self: DepositAccount_Data, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.user);
        b.storeAddress(self.token);
        b.storeDict<c.Address, []>(setToDict(self.beneficiaries, c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                        (s) => [],
                        (v,b) => { {} }
                    )), c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
        storeTolkNullable<c.Address>(self.wallet, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
        storeTolkNullable<DepositAccount_PendingInit>(self.pendingInit, b,
            (v,b) => storeCellRef<DepositAccount_PendingInit>(v, b, DepositAccount_PendingInit.store)
        );
    },
    toCell(self: DepositAccount_Data): c.Cell {
        return makeCellFrom<DepositAccount_Data>(self, DepositAccount_Data.store);
    }
}

/**
 > struct DepositAccount_PendingInit {
 >     queryId: uint64
 >     context: cell?
 > }
 */
export interface DepositAccount_PendingInit {
    readonly $: 'DepositAccount_PendingInit'
    queryId: uint64
    context: c.Cell | null
}

export const DepositAccount_PendingInit = {
    create(args: {
        queryId?: uint64
        context: c.Cell | null
    }): DepositAccount_PendingInit {
        return {
            $: 'DepositAccount_PendingInit',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_PendingInit {
        return {
            $: 'DepositAccount_PendingInit',
            queryId: s.loadUintBig(64),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_PendingInit, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_PendingInit): c.Cell {
        return makeCellFrom<DepositAccount_PendingInit>(self, DepositAccount_PendingInit.store);
    }
}

/**
 > struct (0x6890a205) DepositAccount_Init {
 >     queryId: uint64
 >     context: cell?
 > }
 */
export interface DepositAccount_Init {
    readonly $: 'DepositAccount_Init'
    queryId: uint64
    context: c.Cell | null
}

export const DepositAccount_Init = {
    PREFIX: 0x6890a205,

    create(args: {
        queryId?: uint64
        context: c.Cell | null
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
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Init, b: c.Builder): void {
        b.storeUint(0x6890a205, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Init): c.Cell {
        return makeCellFrom<DepositAccount_Init>(self, DepositAccount_Init.store);
    }
}

/**
 > struct (0x784d98e9) DepositAccount_Initialized {
 >     queryId: uint64
 >     context: cell?
 > }
 */
export interface DepositAccount_Initialized {
    readonly $: 'DepositAccount_Initialized'
    queryId: uint64
    context: c.Cell | null
}

export const DepositAccount_Initialized = {
    PREFIX: 0x784d98e9,

    create(args: {
        queryId?: uint64
        context: c.Cell | null
    }): DepositAccount_Initialized {
        return {
            $: 'DepositAccount_Initialized',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_Initialized {
        loadAndCheckPrefix32(s, 0x784d98e9, 'DepositAccount_Initialized');
        return {
            $: 'DepositAccount_Initialized',
            queryId: s.loadUintBig(64),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_Initialized, b: c.Builder): void {
        b.storeUint(0x784d98e9, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_Initialized): c.Cell {
        return makeCellFrom<DepositAccount_Initialized>(self, DepositAccount_Initialized.store);
    }
}

/**
 > struct (0x9293d68e) DepositAccount_WalletUnavailable {
 >     queryId: uint64
 >     context: cell?
 > }
 */
export interface DepositAccount_WalletUnavailable {
    readonly $: 'DepositAccount_WalletUnavailable'
    queryId: uint64
    context: c.Cell | null
}

export const DepositAccount_WalletUnavailable = {
    PREFIX: 0x9293d68e,

    create(args: {
        queryId?: uint64
        context: c.Cell | null
    }): DepositAccount_WalletUnavailable {
        return {
            $: 'DepositAccount_WalletUnavailable',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): DepositAccount_WalletUnavailable {
        loadAndCheckPrefix32(s, 0x9293d68e, 'DepositAccount_WalletUnavailable');
        return {
            $: 'DepositAccount_WalletUnavailable',
            queryId: s.loadUintBig(64),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: DepositAccount_WalletUnavailable, b: c.Builder): void {
        b.storeUint(0x9293d68e, 32);
        b.storeUint(self.queryId, 64);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: DepositAccount_WalletUnavailable): c.Cell {
        return makeCellFrom<DepositAccount_WalletUnavailable>(self, DepositAccount_WalletUnavailable.store);
    }
}

/**
 > struct (0xb4fe5c0c) DepositAccount_ForwardNotification {
 >     notification: Cell<TransferNotificationForRecipient>
 > }
 */
export interface DepositAccount_ForwardNotification {
    readonly $: 'DepositAccount_ForwardNotification'
    notification: TransferNotificationForRecipient
}

export const DepositAccount_ForwardNotification = {
    PREFIX: 0xb4fe5c0c,

    create(args: {
        notification: TransferNotificationForRecipient
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
            notification: loadCellRef<TransferNotificationForRecipient>(s, TransferNotificationForRecipient.fromSlice),
        }
    },
    store(self: DepositAccount_ForwardNotification, b: c.Builder): void {
        b.storeUint(0xb4fe5c0c, 32);
        storeCellRef<TransferNotificationForRecipient>(self.notification, b, TransferNotificationForRecipient.store);
    },
    toCell(self: DepositAccount_ForwardNotification): c.Cell {
        return makeCellFrom<DepositAccount_ForwardNotification>(self, DepositAccount_ForwardNotification.store);
    }
}

/**
 > struct (0x1936d112) DepositAccount_Withdraw {
 >     queryId: uint64
 >     ask: Cell<AskToTransfer>
 > }
 */
export interface DepositAccount_Withdraw {
    readonly $: 'DepositAccount_Withdraw'
    queryId: uint64
    ask: AskToTransfer
}

export const DepositAccount_Withdraw = {
    PREFIX: 0x1936d112,

    create(args: {
        queryId?: uint64
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
            ask: loadCellRef<AskToTransfer>(s, AskToTransfer.fromSlice),
        }
    },
    store(self: DepositAccount_Withdraw, b: c.Builder): void {
        b.storeUint(0x1936d112, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<AskToTransfer>(self.ask, b, AskToTransfer.store);
    },
    toCell(self: DepositAccount_Withdraw): c.Cell {
        return makeCellFrom<DepositAccount_Withdraw>(self, DepositAccount_Withdraw.store);
    }
}

/**
 > struct (0xa51b6cba) DepositAccount_WithdrawFailed {
 >     queryId: uint64
 >     user: address
 >     token: address
 >     walletAddress: address
 >     ask: Cell<AskToTransfer>
 > }
 */
export interface DepositAccount_WithdrawFailed {
    readonly $: 'DepositAccount_WithdrawFailed'
    queryId: uint64
    user: c.Address
    token: c.Address
    walletAddress: c.Address
    ask: AskToTransfer
}

export const DepositAccount_WithdrawFailed = {
    PREFIX: 0xa51b6cba,

    create(args: {
        queryId?: uint64
        user: c.Address
        token: c.Address
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
            user: s.loadAddress(),
            token: s.loadAddress(),
            walletAddress: s.loadAddress(),
            ask: loadCellRef<AskToTransfer>(s, AskToTransfer.fromSlice),
        }
    },
    store(self: DepositAccount_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0xa51b6cba, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.user);
        b.storeAddress(self.token);
        b.storeAddress(self.walletAddress);
        storeCellRef<AskToTransfer>(self.ask, b, AskToTransfer.store);
    },
    toCell(self: DepositAccount_WithdrawFailed): c.Cell {
        return makeCellFrom<DepositAccount_WithdrawFailed>(self, DepositAccount_WithdrawFailed.store);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECIQEABNcAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASATFAIBIAYHAgFIEBEEZ0+JHjAiDXLCNEhRAsnDHTP/QF+JL4l1rwA+DXLCDJtoiU4wLXLCObFoTk4wLXLCaLmqAEgICQoLAfde1E0PpI+kj6SPQE9AT0BNGCAM0UU6bHBfL0IW6CCHoSACGCCExLQHDjBKCCAM0a+CdvEIIK+vCAI6C+lAu7wwCTMTpw4hry9AiOJV8FMoIK+vCAcPsCyM+FCBP6UoIQeE2Y6c8LjhLLP/QAyYMG+wDhOIIAzRcHbhfy9IDwH61ywn////9PK/10zQ1ywgfFP1LI5d0z/6APpI+lD0BPoA+JLtRND6SDH6SPpIMMjPkD4p+pYqzws/UAn6Ahf6UlJQ+lQU9ABY+gLOycjPkpRtsuoWyz8T+lIT+lL6UhLMycjPhQgS+lJxzwtuzMmAQPsA4NcsIWO1y5wx4wIMAPAx0z8x10z4ku1E0PpIMfpIMfpIMfQE9AUiggDNFQOBAQv0Cm+hMRLy9IIAzRshbrPy9CLQ1ywgfFP1LPK/0z8x+gAx+kgx+lAwggDNFiFus5UDxwXDAJMxMnDiEvL00PpI0cjPhYj6Us+EEHP6AnHPC2XMyYBQ+wAAqNM/MfoAMfpQMfiS7UTQ+kgx+kj6SDH0AfQFIG6zmdD6SNESxwXDAJMwMXDilgHxgATaIZIxbeIB8AUByM7JyM+FCBL6UoIQtP5cDM8LjszJgED7AAL+jv0x0z8x+lAw+JLtRND6SPpI+kj0BPQE9ATRggDNGFF0xwUX8vSCAM0ZJm6z8vQmbpYwJcj6UsnfBm6zBdDTP/QE0W2CCvrwgHD7AgeOG8jPhQhSYPpSghCSk9aOzwuOEss/9ADJgwb7AOMNA8j6UhL6UvpS9AAS9AD0AMntVA0OAKrtRND6SPpI+kj0BPQE9ATRIG6SXwaOPdDTP/QE0W2CCvrwgHD7AsjPhQhSgPpSghCSk9aOzwuOE8s/9ADJgwb7AAXI+lIU+lIS+lL0APQA9ADJ7VTiADbIz4UIUmD6UoIQeE2Y6c8LjhLLP/QAyYMG+wAAEuAwhA8BxwDy9ACOJMjLPxT0AMkCyPpS+lJSIPpSFPQAFPQAEvQAye1UgghMS0D4KMjPhYgU+lIB+gLPgXP6AoIQLHa5c88Lhcs/+lLPgclx+wABKztou37lVtt2zEw7eO6iu1B7fEB8v+ASAA0IW6RMeAwgAN4g9AQhbpgxIMcAkjBt4JLR0OIgbrOTyM7JkjBt4gH0BCFumDEgxwCSMG3gktHQ4iBulTBtbW1wjhfXLCFrCwBkmfpI9AT0BYEAhOAwbW1tcOJsIpExkTDiIG6UMG3bMeDQ1ywkRwd59PK/+kjR2zECASAVFgIBIBscAgEgFxgCAUgZGgBttivxoVNjS3NZcxtDC0txc6N7cXMbG0uBcwsbG3urc6FyIyuDe5tLogsbG3urc6QRamBcYlxhEAAbtcUQQBmilAQQgfd+UJAAC7GhYECDYAAhs0I7UTQ+kgx+kgx+kgx9AWAAEbjontRND6SDCAIBIB0eAgHLHyAAO7YKPaiaH0kGP0kGP0kGPoA+gKQN0kYNspofSRo8UAAbuF7UTQ+kgx+kgx+kgwgAFb6+1E0PpIMfpIMI');

    static Errors = {
        'DepositAccount_Error.OnlyOwner': 52500,
        'DepositAccount_Error.OnlyBeneficiary': 52501,
        'DepositAccount_Error.OnlySendExcessesToSender': 52502,
        'DepositAccount_Error.InitPending': 52503,
        'DepositAccount_Error.OnlyToken': 52504,
        'DepositAccount_Error.NoPendingInit': 52505,
        'DepositAccount_Error.NotEnoughValue': 52506,
        'DepositAccount_Error.WalletUnknown': 52507,
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
        user: c.Address
        token: c.Address
        beneficiaries: Set<c.Address>
        wallet?: c.Address | null /* = null */
        pendingInit?: DepositAccount_PendingInit | null /* = null */
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
        context: c.Cell | null
    }) {
        return DepositAccount_Init.toCell(DepositAccount_Init.create(body));
    }

    static createCellOfDepositAccountWithdraw(body: {
        queryId?: uint64
        ask: AskToTransfer
    }) {
        return DepositAccount_Withdraw.toCell(DepositAccount_Withdraw.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
    }

    static createCellOfResponseWalletAddress(body: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }) {
        return ResponseWalletAddress.toCell(ResponseWalletAddress.create(body));
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
        context: c.Cell | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_Init.toCell(DepositAccount_Init.create(body)),
            ...extraOptions
        });
    }

    async sendDepositAccountWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        ask: AskToTransfer
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: DepositAccount_Withdraw.toCell(DepositAccount_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body)),
            ...extraOptions
        });
    }

    async sendResponseWalletAddress(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ResponseWalletAddress.toCell(ResponseWalletAddress.create(body)),
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

    async getFacilityId(provider: ContractProvider): Promise<uint16> {
        const r = StackReader.fromGetMethod(1, await provider.get('facilityId', []));
        return r.readBigInt();
    }

    async getErrorCode(provider: ContractProvider, local: uint16): Promise<uint16> {
        const r = StackReader.fromGetMethod(1, await provider.get('errorCode', [
            { type: 'int', value: local },
        ]));
        return r.readBigInt();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getOwner', []));
        return r.readSlice().loadAddress();
    }

    async getUser(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getUser', []));
        return r.readSlice().loadAddress();
    }

    async getToken(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getToken', []));
        return r.readSlice().loadAddress();
    }

    async getWallet(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getWallet', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getBeneficiaries(provider: ContractProvider): Promise<Set<c.Address>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBeneficiaries', []));
        return dictToSet(r.readDictionary<c.Address, []>(c.Dictionary.Keys.Address(), createDictionaryValue<[]>(
                    (s) => [],
                    (v,b) => { {} }
                )));
    }
}
