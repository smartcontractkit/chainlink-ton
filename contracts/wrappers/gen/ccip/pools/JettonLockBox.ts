// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a JettonLockBox contract in Tolk.
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
 > struct Storage {
 >     id: uint64
 >     initializer: address?
 >     minterAddress: address
 >     walletAddress: address?
 >     rbac: AccessControl_Data
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint64
    initializer: c.Address | null /* = null */
    minterAddress: c.Address
    walletAddress: c.Address | null
    rbac: AccessControl_Data
}

export const Storage = {
    create(args: {
        id: uint64
        initializer?: c.Address | null /* = null */
        minterAddress: c.Address
        walletAddress: c.Address | null
        rbac: AccessControl_Data
    }): Storage {
        return {
            $: 'Storage',
            initializer: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            id: s.loadUintBig(64),
            initializer: s.loadMaybeAddress(),
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
 > }
 */
export interface JettonLockBox_Deposit {
    readonly $: 'JettonLockBox_Deposit'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    context: c.Cell | null
}

export const JettonLockBox_Deposit = {
    PREFIX: 0x9e9ec361,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        context: c.Cell | null
    }): JettonLockBox_Deposit {
        return {
            $: 'JettonLockBox_Deposit',
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
    },
    toCell(self: JettonLockBox_Deposit): c.Cell {
        return makeCellFrom<JettonLockBox_Deposit>(self, JettonLockBox_Deposit.store);
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
 >     recipientWallet: address
 >     extra: Cell<JettonLockBox_WithdrawExtra>?
 > }
 */
export interface JettonLockBox_Withdraw {
    readonly $: 'JettonLockBox_Withdraw'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    recipientWallet: c.Address
    extra: JettonLockBox_WithdrawExtra | null
}

export const JettonLockBox_Withdraw = {
    PREFIX: 0xd065c306,

    create(args: {
        queryId?: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
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
            recipientWallet: s.loadAddress(),
            extra: s.loadBoolean() ? loadCellRef<JettonLockBox_WithdrawExtra>(s, JettonLockBox_WithdrawExtra.fromSlice) : null,
        }
    },
    store(self: JettonLockBox_Withdraw, b: c.Builder): void {
        b.storeUint(0xd065c306, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
        storeTolkNullable<JettonLockBox_WithdrawExtra>(self.extra, b,
            (v,b) => storeCellRef<JettonLockBox_WithdrawExtra>(v, b, JettonLockBox_WithdrawExtra.store)
        );
    },
    toCell(self: JettonLockBox_Withdraw): c.Cell {
        return makeCellFrom<JettonLockBox_Withdraw>(self, JettonLockBox_Withdraw.store);
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
 >     errorCode: uint16
 >     returnAttempted: bool
 > }
 */
export interface JettonLockBox_DepositFailed {
    readonly $: 'JettonLockBox_DepositFailed'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: JettonLockBox_Deposit | null
    errorCode: uint16
    returnAttempted: boolean
}

export const JettonLockBox_DepositFailed = {
    PREFIX: 0x5e28ebd8,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: JettonLockBox_Deposit | null
        errorCode: uint16
        returnAttempted: boolean
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
            errorCode: s.loadUintBig(16),
            returnAttempted: s.loadBoolean(),
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
        b.storeUint(self.errorCode, 16);
        b.storeBit(self.returnAttempted);
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
        'JettonLockBox_Error.TokenAmountCannotBeZero': 56700,
        'JettonLockBox_Error.RecipientCannotBeZeroAddress': 56701,
        'JettonLockBox_Error.UnsupportedToken': 56702,
        'JettonLockBox_Error.ContractAlreadyInitialized': 56703,
        'JettonLockBox_Error.ContractNotInitialized': 56704,
        'JettonLockBox_Error.MissingOrMalformedForwardPayload': 56705,
        'JettonLockBox_Error.UnauthorizedInitializer': 56706,
        'JettonLockBox_Error.NotEnoughValue': 56707,
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
        initializer?: c.Address | null /* = null */
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
        recipientWallet: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }) {
        return JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body));
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
        recipientWallet: c.Address
        extra: JettonLockBox_WithdrawExtra | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body)),
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
