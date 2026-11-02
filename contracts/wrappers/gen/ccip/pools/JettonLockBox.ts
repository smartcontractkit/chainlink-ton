// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a JettonLockBox contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

type array<T> = T[]

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

type int32 = bigint

type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint256 = bigint

/**
 > struct AccessControl_Data {
 >     roles: map<uint256, Cell<AccessControl_RoleData>>
 > }
 */
export interface AccessControl_Data {
    readonly $: 'AccessControl_Data'
    roles: Map<uint256, AccessControl_RoleData> /* = [] as map<uint256, Cell<AccessControl_RoleData>> */
}

export const AccessControl_Data = {
    create(args: {
        roles: Map<uint256, AccessControl_RoleData> /* = [] as map<uint256, Cell<AccessControl_RoleData>> */
    }): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            roles: dictToMap(c.Dictionary.load<uint256, AccessControl_RoleData>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
                            (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                            (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
                        ), s)),
        }
    },
    store(self: AccessControl_Data, b: c.Builder): void {
        b.storeDict<uint256, AccessControl_RoleData>(mapToDict(self.roles, c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
                        (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                        (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
                    )), c.Dictionary.Keys.BigUint(256), createDictionaryValue<AccessControl_RoleData>(
            (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
            (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
        ));
    },
    toCell(self: AccessControl_Data): c.Cell {
        return makeCellFrom<AccessControl_Data>(self, AccessControl_Data.store);
    }
}

/**
 > struct AccessControl_RoleData {
 >     adminRole: uint256
 >     membersLen: uint64
 >     hasRole: map<address, bool>
 > }
 */
export interface AccessControl_RoleData {
    readonly $: 'AccessControl_RoleData'
    adminRole: uint256
    membersLen: uint64
    hasRole: Map<c.Address, boolean> /* = [] as map<address, bool> */
}

export const AccessControl_RoleData = {
    create(args: {
        adminRole: uint256
        membersLen: uint64
        hasRole: Map<c.Address, boolean> /* = [] as map<address, bool> */
    }): AccessControl_RoleData {
        return {
            $: 'AccessControl_RoleData',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleData {
        return {
            $: 'AccessControl_RoleData',
            adminRole: s.loadUintBig(256),
            membersLen: s.loadUintBig(64),
            hasRole: dictToMap(c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s)),
        }
    },
    store(self: AccessControl_RoleData, b: c.Builder): void {
        b.storeUint(self.adminRole, 256);
        b.storeUint(self.membersLen, 64);
        b.storeDict<c.Address, boolean>(mapToDict(self.hasRole, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool()), c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: AccessControl_RoleData): c.Cell {
        return makeCellFrom<AccessControl_RoleData>(self, AccessControl_RoleData.store);
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
 > struct (0xf343fc1b) Withdrawable_Withdraw {
 >     queryId: uint64
 >     destination: address
 >     amount: coins
 >     reserve: coins?
 >     drainAllAvailable: bool
 > }
 */
export interface Withdrawable_Withdraw {
    readonly $: 'Withdrawable_Withdraw'
    queryId: uint64
    destination: c.Address
    amount: coins
    reserve: coins | null
    drainAllAvailable: boolean
}

export const Withdrawable_Withdraw = {
    PREFIX: 0xf343fc1b,

    create(args: {
        queryId?: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }): Withdrawable_Withdraw {
        return {
            $: 'Withdrawable_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Withdrawable_Withdraw {
        loadAndCheckPrefix32(s, 0xf343fc1b, 'Withdrawable_Withdraw');
        return {
            $: 'Withdrawable_Withdraw',
            queryId: s.loadUintBig(64),
            destination: s.loadAddress(),
            amount: s.loadCoins(),
            reserve: s.loadBoolean() ? s.loadCoins() : null,
            drainAllAvailable: s.loadBoolean(),
        }
    },
    store(self: Withdrawable_Withdraw, b: c.Builder): void {
        b.storeUint(0xf343fc1b, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.destination);
        b.storeCoins(self.amount);
        storeTolkNullable<coins>(self.reserve, b,
            (v,b) => b.storeCoins(v)
        );
        b.storeBit(self.drainAllAvailable);
    },
    toCell(self: Withdrawable_Withdraw): c.Cell {
        return makeCellFrom<Withdrawable_Withdraw>(self, Withdrawable_Withdraw.store);
    }
}

/**
 > struct JettonWithdrawable_WithdrawFeeTransfer {
 >     wallet: address
 >     value: coins
 >     msg: AskToTransfer
 > }
 */
export interface JettonWithdrawable_WithdrawFeeTransfer {
    readonly $: 'JettonWithdrawable_WithdrawFeeTransfer'
    wallet: c.Address
    value: coins
    msg: AskToTransfer
}

export const JettonWithdrawable_WithdrawFeeTransfer = {
    create(args: {
        wallet: c.Address
        value: coins
        msg: AskToTransfer
    }): JettonWithdrawable_WithdrawFeeTransfer {
        return {
            $: 'JettonWithdrawable_WithdrawFeeTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_WithdrawFeeTransfer {
        return {
            $: 'JettonWithdrawable_WithdrawFeeTransfer',
            wallet: s.loadAddress(),
            value: s.loadCoins(),
            msg: AskToTransfer.fromSlice(s),
        }
    },
    store(self: JettonWithdrawable_WithdrawFeeTransfer, b: c.Builder): void {
        b.storeAddress(self.wallet);
        b.storeCoins(self.value);
        AskToTransfer.store(self.msg, b);
    },
    toCell(self: JettonWithdrawable_WithdrawFeeTransfer): c.Cell {
        return makeCellFrom<JettonWithdrawable_WithdrawFeeTransfer>(self, JettonWithdrawable_WithdrawFeeTransfer.store);
    }
}

/**
 > struct (0x0d00995c) JettonWithdrawable_Withdraw {
 >     queryId: uint64
 >     transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
 > }
 */
export interface JettonWithdrawable_Withdraw {
    readonly $: 'JettonWithdrawable_Withdraw'
    queryId: uint64
    transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
}

export const JettonWithdrawable_Withdraw = {
    PREFIX: 0x0d00995c,

    create(args: {
        queryId?: uint64
        transfers: array<JettonWithdrawable_WithdrawFeeTransfer>
    }): JettonWithdrawable_Withdraw {
        return {
            $: 'JettonWithdrawable_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_Withdraw {
        loadAndCheckPrefix32(s, 0x0d00995c, 'JettonWithdrawable_Withdraw');
        return {
            $: 'JettonWithdrawable_Withdraw',
            queryId: s.loadUintBig(64),
            transfers: loadArrayOf<JettonWithdrawable_WithdrawFeeTransfer>(s, JettonWithdrawable_WithdrawFeeTransfer.fromSlice),
        }
    },
    store(self: JettonWithdrawable_Withdraw, b: c.Builder): void {
        b.storeUint(0x0d00995c, 32);
        b.storeUint(self.queryId, 64);
        storeArrayOf<JettonWithdrawable_WithdrawFeeTransfer>(self.transfers, b, JettonWithdrawable_WithdrawFeeTransfer.store);
    },
    toCell(self: JettonWithdrawable_Withdraw): c.Cell {
        return makeCellFrom<JettonWithdrawable_Withdraw>(self, JettonWithdrawable_Withdraw.store);
    }
}

/**
 > struct JettonWithdrawable_FeeTokenWithdrawn {
 >     wallet: address
 >     amount: coins
 > }
 */
export interface JettonWithdrawable_FeeTokenWithdrawn {
    readonly $: 'JettonWithdrawable_FeeTokenWithdrawn'
    wallet: c.Address
    amount: coins
}

export const JettonWithdrawable_FeeTokenWithdrawn = {
    create(args: {
        wallet: c.Address
        amount: coins
    }): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonWithdrawable_FeeTokenWithdrawn {
        return {
            $: 'JettonWithdrawable_FeeTokenWithdrawn',
            wallet: s.loadAddress(),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonWithdrawable_FeeTokenWithdrawn, b: c.Builder): void {
        b.storeAddress(self.wallet);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonWithdrawable_FeeTokenWithdrawn): c.Cell {
        return makeCellFrom<JettonWithdrawable_FeeTokenWithdrawn>(self, JettonWithdrawable_FeeTokenWithdrawn.store);
    }
}

/**
 > struct Storage {
 >     id: uint64
 >     initializer: address
 >     minterAddress: address
 >     walletAddress: address?
 >     rbac: AccessControl_Data
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint64
    initializer: c.Address
    minterAddress: c.Address
    walletAddress: c.Address | null
    rbac: AccessControl_Data
}

export const Storage = {
    create(args: {
        id: uint64
        initializer: c.Address
        minterAddress: c.Address
        walletAddress: c.Address | null
        rbac: AccessControl_Data
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            id: s.loadUintBig(64),
            initializer: s.loadAddress(),
            minterAddress: s.loadAddress(),
            walletAddress: s.loadMaybeAddress(),
            rbac: AccessControl_Data.fromSlice(s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 64);
        b.storeAddress(self.initializer);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.walletAddress);
        AccessControl_Data.store(self.rbac, b);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct (0x9e9ec361) JettonLockBox_Deposit {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     context: cell?
 >     extra: Cell<JettonLockBox_DepositExtra>?
 > }
 */
export interface JettonLockBox_Deposit {
    readonly $: 'JettonLockBox_Deposit'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    context: c.Cell | null
    extra: JettonLockBox_DepositExtra | null /* = null */
}

export const JettonLockBox_Deposit = {
    PREFIX: 0x9e9ec361,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        context: c.Cell | null
        extra?: JettonLockBox_DepositExtra | null /* = null */
    }): JettonLockBox_Deposit {
        return {
            $: 'JettonLockBox_Deposit',
            extra: null,
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposit {
        loadAndCheckPrefix32(s, 0x9e9ec361, 'JettonLockBox_Deposit');
        return {
            $: 'JettonLockBox_Deposit',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? s.loadRef() : null,
            extra: s.loadBoolean() ? loadCellRef<JettonLockBox_DepositExtra>(s, JettonLockBox_DepositExtra.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_Deposit, b: c.Builder): void {
        b.storeUint(0x9e9ec361, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<JettonLockBox_DepositExtra>(self.extra, b,
            (v,b) => storeCellRef<JettonLockBox_DepositExtra>(v, b, JettonLockBox_DepositExtra.store)
        );
    },
    toCell(self: JettonLockBox_Deposit): c.Cell {
        return makeCellFrom<JettonLockBox_Deposit>(self, JettonLockBox_Deposit.store);
    }
}

/**
 > struct JettonLockBox_DepositExtra {
 >     returnTo: address?
 >     failureValue: coins
 >     sendExcessesTo: address?
 > }
 */
export interface JettonLockBox_DepositExtra {
    readonly $: 'JettonLockBox_DepositExtra'
    returnTo: c.Address | null /* = null */
    failureValue: coins /* = 0 */
    sendExcessesTo: c.Address | null /* = null */
}

export const JettonLockBox_DepositExtra = {
    create(args: {
        returnTo?: c.Address | null /* = null */
        failureValue?: coins /* = 0 */
        sendExcessesTo?: c.Address | null /* = null */
    }): JettonLockBox_DepositExtra {
        return {
            $: 'JettonLockBox_DepositExtra',
            returnTo: null,
            failureValue: 0n,
            sendExcessesTo: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_DepositExtra {
        return {
            $: 'JettonLockBox_DepositExtra',
            returnTo: s.loadMaybeAddress(),
            failureValue: s.loadCoins(),
            sendExcessesTo: s.loadMaybeAddress(),
        }
    },
    store(self: JettonLockBox_DepositExtra, b: c.Builder): void {
        b.storeAddress(self.returnTo);
        b.storeCoins(self.failureValue);
        b.storeAddress(self.sendExcessesTo);
    },
    toCell(self: JettonLockBox_DepositExtra): c.Cell {
        return makeCellFrom<JettonLockBox_DepositExtra>(self, JettonLockBox_DepositExtra.store);
    }
}

/**
 > struct JettonLockBox_WithdrawExtra {
 >     sendExcessesTo: address?
 >     forwardTonAmount: coins
 >     forwardPayload: cell?
 > }
 */
export interface JettonLockBox_WithdrawExtra {
    readonly $: 'JettonLockBox_WithdrawExtra'
    sendExcessesTo: c.Address | null
    forwardTonAmount: coins
    forwardPayload: c.Cell | null
}

export const JettonLockBox_WithdrawExtra = {
    create(args: {
        sendExcessesTo: c.Address | null
        forwardTonAmount: coins
        forwardPayload: c.Cell | null
    }): JettonLockBox_WithdrawExtra {
        return {
            $: 'JettonLockBox_WithdrawExtra',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawExtra {
        return {
            $: 'JettonLockBox_WithdrawExtra',
            sendExcessesTo: s.loadMaybeAddress(),
            forwardTonAmount: s.loadCoins(),
            forwardPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: JettonLockBox_WithdrawExtra, b: c.Builder): void {
        b.storeAddress(self.sendExcessesTo);
        b.storeCoins(self.forwardTonAmount);
        storeTolkNullable<c.Cell>(self.forwardPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: JettonLockBox_WithdrawExtra): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawExtra>(self, JettonLockBox_WithdrawExtra.store);
    }
}

/**
 > struct (0xd065c306) JettonLockBox_Withdraw {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     recipient: address
 >     extra: Cell<JettonLockBox_WithdrawExtra>?
 > }
 */
export interface JettonLockBox_Withdraw {
    readonly $: 'JettonLockBox_Withdraw'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    recipient: c.Address
    extra: JettonLockBox_WithdrawExtra | null
}

export const JettonLockBox_Withdraw = {
    PREFIX: 0xd065c306,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipient: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }): JettonLockBox_Withdraw {
        return {
            $: 'JettonLockBox_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Withdraw {
        loadAndCheckPrefix32(s, 0xd065c306, 'JettonLockBox_Withdraw');
        return {
            $: 'JettonLockBox_Withdraw',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            recipient: s.loadAddress(),
            extra: s.loadBoolean() ? loadCellRef<JettonLockBox_WithdrawExtra>(s, JettonLockBox_WithdrawExtra.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_Withdraw, b: c.Builder): void {
        b.storeUint(0xd065c306, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipient);
        storeTolkNullable<JettonLockBox_WithdrawExtra>(self.extra, b,
            (v,b) => storeCellRef<JettonLockBox_WithdrawExtra>(v, b, JettonLockBox_WithdrawExtra.store)
        );
    },
    toCell(self: JettonLockBox_Withdraw): c.Cell {
        return makeCellFrom<JettonLockBox_Withdraw>(self, JettonLockBox_Withdraw.store);
    }
}

/**
 > struct (0x0440d11a) JettonLockBox_WithdrawRescue {
 >     withdrawMsg: JettonWithdrawable_Withdraw
 > }
 */
export interface JettonLockBox_WithdrawRescue {
    readonly $: 'JettonLockBox_WithdrawRescue'
    withdrawMsg: JettonWithdrawable_Withdraw
}

export const JettonLockBox_WithdrawRescue = {
    PREFIX: 0x0440d11a,

    create(args: {
        withdrawMsg: JettonWithdrawable_Withdraw
    }): JettonLockBox_WithdrawRescue {
        return {
            $: 'JettonLockBox_WithdrawRescue',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawRescue {
        loadAndCheckPrefix32(s, 0x0440d11a, 'JettonLockBox_WithdrawRescue');
        return {
            $: 'JettonLockBox_WithdrawRescue',
            withdrawMsg: JettonWithdrawable_Withdraw.fromSlice(s),
        }
    },
    store(self: JettonLockBox_WithdrawRescue, b: c.Builder): void {
        b.storeUint(0x0440d11a, 32);
        JettonWithdrawable_Withdraw.store(self.withdrawMsg, b);
    },
    toCell(self: JettonLockBox_WithdrawRescue): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawRescue>(self, JettonLockBox_WithdrawRescue.store);
    }
}

/**
 > struct (0x6d077f2e) JettonLockBox_Deposited {
 >     queryId: uint64
 >     token: address
 >     depositor: address
 >     amount: coins
 >     context: cell?
 > }
 */
export interface JettonLockBox_Deposited {
    readonly $: 'JettonLockBox_Deposited'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: c.Cell | null
}

export const JettonLockBox_Deposited = {
    PREFIX: 0x6d077f2e,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: c.Cell | null
    }): JettonLockBox_Deposited {
        return {
            $: 'JettonLockBox_Deposited',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposited {
        loadAndCheckPrefix32(s, 0x6d077f2e, 'JettonLockBox_Deposited');
        return {
            $: 'JettonLockBox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            depositor: s.loadAddress(),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: JettonLockBox_Deposited, b: c.Builder): void {
        b.storeUint(0x6d077f2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.depositor);
        b.storeCoins(self.amount);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: JettonLockBox_Deposited): c.Cell {
        return makeCellFrom<JettonLockBox_Deposited>(self, JettonLockBox_Deposited.store);
    }
}

/**
 > struct (0x5e28ebd8) JettonLockBox_DepositFailed {
 >     queryId: uint64
 >     token: address
 >     depositor: address
 >     amount: coins
 >     context: Cell<JettonLockBox_Deposit>?
 >     errorCode: int32
 > }
 */
export interface JettonLockBox_DepositFailed {
    readonly $: 'JettonLockBox_DepositFailed'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: JettonLockBox_Deposit | null
    errorCode: int32
}

export const JettonLockBox_DepositFailed = {
    PREFIX: 0x5e28ebd8,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: JettonLockBox_Deposit | null
        errorCode: int32
    }): JettonLockBox_DepositFailed {
        return {
            $: 'JettonLockBox_DepositFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_DepositFailed {
        loadAndCheckPrefix32(s, 0x5e28ebd8, 'JettonLockBox_DepositFailed');
        return {
            $: 'JettonLockBox_DepositFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            depositor: s.loadAddress(),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? loadCellRef<JettonLockBox_Deposit>(s, JettonLockBox_Deposit.fromSlice) : null,
            errorCode: s.loadIntBig(32),
        }
    },
    store(self: JettonLockBox_DepositFailed, b: c.Builder): void {
        b.storeUint(0x5e28ebd8, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.depositor);
        b.storeCoins(self.amount);
        storeTolkNullable<JettonLockBox_Deposit>(self.context, b,
            (v,b) => storeCellRef<JettonLockBox_Deposit>(v, b, JettonLockBox_Deposit.store)
        );
        b.storeInt(self.errorCode, 32);
    },
    toCell(self: JettonLockBox_DepositFailed): c.Cell {
        return makeCellFrom<JettonLockBox_DepositFailed>(self, JettonLockBox_DepositFailed.store);
    }
}

/**
 > struct (0xffa6eeb9) JettonLockBox_Init {
 >     queryId: uint64
 >     minterAddress: address
 >     walletAddress: address
 >     admin: address?
 > }
 */
export interface JettonLockBox_Init {
    readonly $: 'JettonLockBox_Init'
    queryId: uint64
    minterAddress: c.Address
    walletAddress: c.Address
    admin: c.Address | null
}

export const JettonLockBox_Init = {
    PREFIX: 0xffa6eeb9,

    create(args: {
        queryId?: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }): JettonLockBox_Init {
        return {
            $: 'JettonLockBox_Init',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Init {
        loadAndCheckPrefix32(s, 0xffa6eeb9, 'JettonLockBox_Init');
        return {
            $: 'JettonLockBox_Init',
            queryId: s.loadUintBig(64),
            minterAddress: s.loadAddress(),
            walletAddress: s.loadAddress(),
            admin: s.loadMaybeAddress(),
        }
    },
    store(self: JettonLockBox_Init, b: c.Builder): void {
        b.storeUint(0xffa6eeb9, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.walletAddress);
        b.storeAddress(self.admin);
    },
    toCell(self: JettonLockBox_Init): c.Cell {
        return makeCellFrom<JettonLockBox_Init>(self, JettonLockBox_Init.store);
    }
}

/**
 > struct (0xe9f4e311) JettonLockBox_Initialized {
 >     queryId: uint64
 >     minterAddress: address
 >     walletAddress: address
 >     admin: address
 > }
 */
export interface JettonLockBox_Initialized {
    readonly $: 'JettonLockBox_Initialized'
    queryId: uint64
    minterAddress: c.Address
    walletAddress: c.Address
    admin: c.Address
}

export const JettonLockBox_Initialized = {
    PREFIX: 0xe9f4e311,

    create(args: {
        queryId?: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address
    }): JettonLockBox_Initialized {
        return {
            $: 'JettonLockBox_Initialized',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Initialized {
        loadAndCheckPrefix32(s, 0xe9f4e311, 'JettonLockBox_Initialized');
        return {
            $: 'JettonLockBox_Initialized',
            queryId: s.loadUintBig(64),
            minterAddress: s.loadAddress(),
            walletAddress: s.loadAddress(),
            admin: s.loadAddress(),
        }
    },
    store(self: JettonLockBox_Initialized, b: c.Builder): void {
        b.storeUint(0xe9f4e311, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.walletAddress);
        b.storeAddress(self.admin);
    },
    toCell(self: JettonLockBox_Initialized): c.Cell {
        return makeCellFrom<JettonLockBox_Initialized>(self, JettonLockBox_Initialized.store);
    }
}

/**
 > struct (0x60bae556) JettonLockBox_WithdrawFailed {
 >     queryId: uint64
 >     token: address
 >     context: Cell<JettonLockBox_Withdraw>?
 > }
 */
export interface JettonLockBox_WithdrawFailed {
    readonly $: 'JettonLockBox_WithdrawFailed'
    queryId: uint64
    token: c.Address
    context: JettonLockBox_Withdraw | null
}

export const JettonLockBox_WithdrawFailed = {
    PREFIX: 0x60bae556,

    create(args: {
        queryId?: uint64
        token: c.Address
        context: JettonLockBox_Withdraw | null
    }): JettonLockBox_WithdrawFailed {
        return {
            $: 'JettonLockBox_WithdrawFailed',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawFailed {
        loadAndCheckPrefix32(s, 0x60bae556, 'JettonLockBox_WithdrawFailed');
        return {
            $: 'JettonLockBox_WithdrawFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            context: s.loadBoolean() ? loadCellRef<JettonLockBox_Withdraw>(s, JettonLockBox_Withdraw.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0x60bae556, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        storeTolkNullable<JettonLockBox_Withdraw>(self.context, b,
            (v,b) => storeCellRef<JettonLockBox_Withdraw>(v, b, JettonLockBox_Withdraw.store)
        );
    },
    toCell(self: JettonLockBox_WithdrawFailed): c.Cell {
        return makeCellFrom<JettonLockBox_WithdrawFailed>(self, JettonLockBox_WithdrawFailed.store);
    }
}

// ————————————————————————————————————————————
//    class JettonLockBox
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

export class JettonLockBox implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'AccessControl_Error.UnauthorizedAccount': 47400,
        'AccessControl_Error.BadConfirmation': 47401,
        'JettonWithdrawable_Error.ZeroAddressNotAllowed': 55700,
        'JettonWithdrawable_Error.UnallowedRecipient': 55701,
        'JettonWithdrawable_Error.MaxAmountExceeded': 55702,
        'JettonLockBox_Error.TokenAmountCannotBeZero': 56700,
        'JettonLockBox_Error.RecipientCannotBeZeroAddress': 56701,
        'JettonLockBox_Error.UnsupportedToken': 56702,
        'JettonLockBox_Error.ContractAlreadyInitialized': 56703,
        'JettonLockBox_Error.ContractNotInitialized': 56704,
        'JettonLockBox_Error.MissingOrMalformedForwardPayload': 56705,
        'JettonLockBox_Error.UnauthorizedInitializer': 56706,
        'JettonLockBox_Error.NotEnoughValue': 56707,
        'Withdrawable_Error.InsufficientBalance': 57100,
        'Withdrawable_Error.HitReserve': 57101,
        'Withdrawable_Error.InvalidRequest': 57102,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new JettonLockBox(address);
    }

    static fromStorage(emptyStorage: {
        id: uint64
        initializer: c.Address
        minterAddress: c.Address
        walletAddress: c.Address | null
        rbac: AccessControl_Data
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? JettonLockBox.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new JettonLockBox(address, initialState);
    }

    static createCellOfJettonLockBoxInit(body: {
        queryId?: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }) {
        return JettonLockBox_Init.toCell(JettonLockBox_Init.create(body));
    }

    static createCellOfJettonLockBoxWithdraw(body: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipient: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }) {
        return JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body));
    }

    static createCellOfJettonLockBoxWithdrawRescue(body: {
        withdrawMsg: JettonWithdrawable_Withdraw
    }) {
        return JettonLockBox_WithdrawRescue.toCell(JettonLockBox_WithdrawRescue.create(body));
    }

    static createCellOfWithdrawableWithdraw(body: {
        queryId?: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }) {
        return Withdrawable_Withdraw.toCell(Withdrawable_Withdraw.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
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

    async sendJettonLockBoxInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Init.toCell(JettonLockBox_Init.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipient: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockBoxWithdrawRescue(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        withdrawMsg: JettonWithdrawable_Withdraw
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_WithdrawRescue.toCell(JettonLockBox_WithdrawRescue.create(body)),
            ...extraOptions
        });
    }

    async sendWithdrawableWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        destination: c.Address
        amount: coins
        reserve: coins | null
        drainAllAvailable: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Withdrawable_Withdraw.toCell(Withdrawable_Withdraw.create(body)),
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

    async getToken(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('token', []));
        return r.readSlice().loadAddress();
    }

    async getWallet(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('wallet', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getIsSupportedToken(provider: ContractProvider, token: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isSupportedToken', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getHasRole(provider: ContractProvider, role: uint256, account: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasRole', [
            { type: 'int', value: role },
            { type: 'slice', cell: makeCellFrom<c.Address>(account,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getRoleAdmin(provider: ContractProvider, role: uint256): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleAdmin', [
            { type: 'int', value: role },
        ]));
        return r.readBigInt();
    }

    async getRoleMemberCount(provider: ContractProvider, role: uint256): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberCount', [
            { type: 'int', value: role },
        ]));
        return r.readBigInt();
    }

    async getRoleMember(provider: ContractProvider, role: uint256, index: uint32): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMember', [
            { type: 'int', value: role },
            { type: 'int', value: index },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMemberFirst(provider: ContractProvider, role: uint256): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberFirst', [
            { type: 'int', value: role },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMemberNext(provider: ContractProvider, role: uint256, pivot: c.Address): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMemberNext', [
            { type: 'int', value: role },
            { type: 'slice', cell: makeCellFrom<c.Address>(pivot,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getRoleMembers(provider: ContractProvider, role: uint256): Promise<Map<c.Address, boolean>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMembers', [
            { type: 'int', value: role },
        ]));
        return dictToMap(r.readDictionary<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool()));
    }
}
