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

type uint32 = bigint
type uint64 = bigint
type uint256 = bigint

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
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args
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
 > struct AccessControl_Data {
 >     roles: map<uint256, Cell<AccessControl_RoleData>>
 > }
 */
export interface AccessControl_Data {
    readonly $: 'AccessControl_Data'
    roles: c.Dictionary<uint256, CellRef<AccessControl_RoleData>>
}

export const AccessControl_Data = {
    create(args: {
        roles: c.Dictionary<uint256, CellRef<AccessControl_RoleData>>
    }): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_Data {
        return {
            $: 'AccessControl_Data',
            roles: c.Dictionary.load<uint256, CellRef<AccessControl_RoleData>>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<AccessControl_RoleData>>(
                (s) => loadCellRef<AccessControl_RoleData>(s, AccessControl_RoleData.fromSlice),
                (v,b) => storeCellRef<AccessControl_RoleData>(v, b, AccessControl_RoleData.store)
            ), s),
        }
    },
    store(self: AccessControl_Data, b: c.Builder): void {
        b.storeDict<uint256, CellRef<AccessControl_RoleData>>(self.roles, c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<AccessControl_RoleData>>(
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
    hasRole: c.Dictionary<c.Address, boolean>
}

export const AccessControl_RoleData = {
    create(args: {
        adminRole: uint256
        membersLen: uint64
        hasRole: c.Dictionary<c.Address, boolean>
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
            hasRole: c.Dictionary.load<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool(), s),
        }
    },
    store(self: AccessControl_RoleData, b: c.Builder): void {
        b.storeUint(self.adminRole, 256);
        b.storeUint(self.membersLen, 64);
        b.storeDict<c.Address, boolean>(self.hasRole, c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    },
    toCell(self: AccessControl_RoleData): c.Cell {
        return makeCellFrom<AccessControl_RoleData>(self, AccessControl_RoleData.store);
    }
}

/**
 > struct Storage {
 >     id: uint64
 >     minterAddress: address
 >     walletAddress: address?
 >     rbac: AccessControl_Data
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint64
    minterAddress: c.Address
    walletAddress: c.Address | null
    rbac: AccessControl_Data
}

export const Storage = {
    create(args: {
        id: uint64
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
            minterAddress: s.loadAddress(),
            walletAddress: s.loadMaybeAddress(),
            rbac: AccessControl_Data.fromSlice(s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 64);
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
 > }
 */
export interface JettonLockBox_Deposit {
    readonly $: 'JettonLockBox_Deposit'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
}

export const JettonLockBox_Deposit = {
    PREFIX: 0x9e9ec361,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }): JettonLockBox_Deposit {
        return {
            $: 'JettonLockBox_Deposit',
            ...args
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
        }
    },
    store(self: JettonLockBox_Deposit, b: c.Builder): void {
        b.storeUint(0x9e9ec361, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockBox_Deposit): c.Cell {
        return makeCellFrom<JettonLockBox_Deposit>(self, JettonLockBox_Deposit.store);
    }
}

/**
 > struct JettonLockBox_WithdrawExtra {
 >     sendExcessesTo: address?
 > }
 */
export interface JettonLockBox_WithdrawExtra {
    readonly $: 'JettonLockBox_WithdrawExtra'
    sendExcessesTo: c.Address | null
}

export const JettonLockBox_WithdrawExtra = {
    create(args: {
        sendExcessesTo: c.Address | null
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
        }
    },
    store(self: JettonLockBox_WithdrawExtra, b: c.Builder): void {
        b.storeAddress(self.sendExcessesTo);
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
    extra: CellRef<JettonLockBox_WithdrawExtra> | null
}

export const JettonLockBox_Withdraw = {
    PREFIX: 0xd065c306,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockBox_WithdrawExtra> | null
    }): JettonLockBox_Withdraw {
        return {
            $: 'JettonLockBox_Withdraw',
            ...args
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
        storeTolkNullable<CellRef<JettonLockBox_WithdrawExtra>>(self.extra, b,
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
 >     remoteChainSelector: uint64
 >     amount: coins
 > }
 */
export interface JettonLockBox_Deposited {
    readonly $: 'JettonLockBox_Deposited'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
}

export const JettonLockBox_Deposited = {
    PREFIX: 0x6d077f2e,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }): JettonLockBox_Deposited {
        return {
            $: 'JettonLockBox_Deposited',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposited {
        loadAndCheckPrefix32(s, 0x6d077f2e, 'JettonLockBox_Deposited');
        return {
            $: 'JettonLockBox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockBox_Deposited, b: c.Builder): void {
        b.storeUint(0x6d077f2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockBox_Deposited): c.Cell {
        return makeCellFrom<JettonLockBox_Deposited>(self, JettonLockBox_Deposited.store);
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
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }): JettonLockBox_Init {
        return {
            $: 'JettonLockBox_Init',
            ...args
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
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address
    }): JettonLockBox_Initialized {
        return {
            $: 'JettonLockBox_Initialized',
            ...args
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
 >     amount: coins
 >     recipientWallet: address
 > }
 */
export interface JettonLockBox_WithdrawFailed {
    readonly $: 'JettonLockBox_WithdrawFailed'
    queryId: uint64
    token: c.Address
    amount: coins
    recipientWallet: c.Address
}

export const JettonLockBox_WithdrawFailed = {
    PREFIX: 0x60bae556,

    create(args: {
        queryId: uint64
        token: c.Address
        amount: coins
        recipientWallet: c.Address
    }): JettonLockBox_WithdrawFailed {
        return {
            $: 'JettonLockBox_WithdrawFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_WithdrawFailed {
        loadAndCheckPrefix32(s, 0x60bae556, 'JettonLockBox_WithdrawFailed');
        return {
            $: 'JettonLockBox_WithdrawFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
            recipientWallet: s.loadAddress(),
        }
    },
    store(self: JettonLockBox_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0x60bae556, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECQwEACbgAART/APSkE/S88sgLAQIBYgIDAgLLGBkCASAEBQIBIAYHAgEgEBECAUgICQIBSA4PAgEgCgsAW7BX40IWxpbmsuY2hhaW4udG9uLmNjaXAuSmV0dG9uTG9ja0JveIItTAuMS4wiAAN6wLdqJoaZ+Y/SQY/SgY+gK2rDa2tqwBuAD4BcACASAMDQAWq5HtRNDTPzH6SDAAHKh27UTQ0z8x+kgx+lAwABuyH7tRNDTPzH6SDDHBYAA3sFH7UTQ0z8x+kgx+lAx9AVtWG1tbVgDcAHwDYAIBIBITAgEgFhcAN7aC3aiaGmfmP0kGP0oGPoCgTa2rTa2rTgBeAPACAUgUFQA3rpt2omhpn5j9JBj9KBj6ArasNra2rAG4APgHwAA3rY72omhpn5j9JBj9KBj6ArasNra2rAG4APgIwAA3tK2dqJoaZ+Y/SQY/SgY+gKBNratNratOAF4B0AA3tEq9qJoaZ+Y/SQY/SgY+gKBNratNratOAF4CEAIBIBobAgHOQUICASAcHQIBIDAxAgEgHh8CASAoKQT1Ttou37+JGS8AXg7UTQ0z/6SPpQ9ATRJNcsI5sWhOSPUdcsJoMuGDSOxNcsJ/03dcyOODBtbW1tcCX4kviXLBA4EDcQNhA1EDTwCWxRjhExNALIyz/6UvpU9ADJ7VTbMeAwhA8FxwAV8vQD4w0D4w1VAuMNA8jLPxL6UoICEiIwBfQgwAGeMPgo+kQwgXUwAfg2qwDgwAOd+Cj6RDCBdTAB+DaqAOD4KPpEMIF1MAH4NoAf4zNAHTP/pI+kj6UDD4koIA88MGbhby9IIA88KLAiTHBbPy9IIA88KLAiPHBbPy9FMhbW1tbXBUUOFTAYMH9A5voZsx1NHQ0//TP/QE0Y4ZMHAgbXDIy/9wzws/UhD0AMlARYMH9BdBM+JwyMv/Ess/9ADJAVYQUAODB/QXPytxJAH6NQTTP/pI0z/6APpI9AX4koIA88QobrPy9CptbW1tcIIQoncdBCfwBoIA88AkwgDy9IIA88GLAiTHBbPy9MjPkF8JAB4nzws/+lLJyM+DzM9QggDzwihus/L0IW6zjhEh0PpQ0W6zlSHQ+lDRkvgo4pL4KOJtyM+QPin6liknACg1BNM/+gD6UPiSEHgQZxBWVTDwBAAO+lT0AMntVAL88ALIz5L1+i86Ess/cM8L/xLL/3DPC//JyM+FCFLg+lJY+gJxzwtqzMlx+wCCEKJ3HQRR7lMBgwf0Dm+hmzHU0dDT/9M/9ATRjhkwcCBtcMjL/3DPCz9SEPQAyUBFgwf0F0Ez4nDIy/8Syz/0AMkBVhBQA4MH9Bc/K3HwAsiJJSYACL1+i84A4M8WEss/ghCidx0Ezwv/Esv/cM8L/8nIz4UIUuD6Ulj6AnHPC2rMyXH7ACdus1QQjOMEJxBuGHAsVE4wUrDwCF8GgBCCCvrwgAH7AsjPk6fTjEYWyz8U+lIS+lL6UsnIz4UIFPpScc8LbhPMyYBA+wAAuM8LPyb6AlJQ+lIS+lT0AM+EIM7JyM+FiFKA+lLPhBBz+gJxzwtlzMmAUPsAyM+TQZcMGhbLPxT6UhLLPwH6AvpS9ADJyM+PGAAEghAtDIGDzwv3cc8LYczJcPsAAgEgKisCASAuLwL1DOCAPPEJm6z8vQkbW1tbXCCEKJ3HQQn8AaCAPPAAsIAEvL0ggDzwiVus/L0ggDzwlE1xwUT8vT0BCFumDEgxwCSMG3gktHQ4iBukVvg1ywk9PYbDPK/0z/6SNM/+gDRyM+SensNhiTPCz9SMPpSIs8LPyH6AsnIic8WgLC0AxTtRNAB0x8xAdM/MfpIMAHXLCB8U/UsjkfTPzH6APpI+lAx9AH6ADHTAAHCAJJfBOHXTNDTHzHTP/pIMMjPkYLrlVoSyz8U+lJY+gL6UsnIz4UIEvpScc8LbszJgED7AODyP4AAFxgABAGyCEJ6ew2HPC/dxzwthzMlw+wDIz5G0Hfy6FMs/EvpSyz8B+gLJyM+FCBL6UnHPC27MyYBA+wAALRVUVN28AeRW+DI+lLL/89QggC5KPLxgAD8bFICgwf0Dm+hkltw4dTR0IEBQNch9AWBAQv0Cm+hMYAIBIDIzAgEgOjsCASA0NQIBIDg5AfcJcMAlSdus8MAkXDil1R5QlNK2kDeUaJTAYMH9A5voZsx1NHQ0//TP/QE0Y4ZMHAgbXDIy/9wzws/UhD0AMlARYMH9BdBM+JTQIEBC/QKb6ExlhA3Xwc2cODIz4NSUoEBC/RBAaQCyMv/Ess/9ADJUjKDB/QXcfACVHJCgNgHnI7w7aLt+zFUd2VUd2V/UYfwCgHXLCSuaqB8jlPXLCS02G3MjiHTP9P/+kgwVHqYVHqYJ/ALVGuwVGuwVGuwKvAGQQTwDDCOJtcsIcopYjSVXwNw2zHh0z/T//pIMFMDxwWWggC5KfLw4UEE8Aww4uMNf9iA3ANInxwWRNI4syM+TPPKg3ijPCz8mzwv/UiD6UlIQ+lLJyM+FCBb6UiP6AnHPC2oVzMlx+wDicFRNE+MEyM+TPPKg3hfLPxTL/xP6UvpSycjPhQgT+lJQA/oCcc8LaszJB5KAQJFx4hf7AH8AQtM/0//6SDBUephUepgn8AtUa7BUa7BUa7Aq8AZBBPAIMAAvDMzNQTDAJUhbrPDAJFw4pRAM9ox4GwxgACcbFEBgwf0Dm+hkjBw4dTR0NcL/4AIBIDw9AgEgP0AB9QlwwCVJm6zwwCRcOKXVHlCU0naQN5RolMBgwf0Dm+hmzHU0dDT/9M/9ATRjhkwcCBtcMjL/3DPCz9SEPQAyUBFgwf0F0Ez4lNAgQEL9ApvoTGWEDdfBzZw4VJAgQEL9FkwAaUCyMv/Ess/9ADJUjKDB/QXcfACVHJCJ4D4ALxsUQGDB/QOb6GZ1NHQ0/8x1ws/kjBw4oADQxwWRNI4syM+SZD+HHijPCz8mzwv/UiD6UlIQ+lLJyM+FCBb6UiP6AnHPC2oVzMlx+wDicFRNE+MEyM+SZD+HHhfLPxTL/xP6UvpSycjPhQgT+lJQA/oCcc8LaszJB5KAQJFx4hf7AH8AlxsUgKDB/QOb6GOPNTR0NP/MdM/9AVSIr6SW23gcCGBAQv0gm+lMppTJLmTIcMAkXDinTEigQEL9HRvpTICpALobCIykjBt35JbbeKAATxsUQGDB/QOb6GOGNTR0NP/MdM/9AUBkjBt4YEBC/SCb6UwMZIwbeKAATRsUgKDB/QOb6GOF9TR0IEBQNch9AWBAQv0dG+lbBKSMG3hkltt4oAAxGxRAYMH9A5voZrU0dCBAUDXIfQFkjBt4oA==');

    static Errors = {
        'AccessControl_Error.UnauthorizedAccount': 47400,
        'AccessControl_Error.BadConfirmation': 47401,
        'JettonLockBox_Error.TokenAmountCannotBeZero': 62400,
        'JettonLockBox_Error.RecipientCannotBeZeroAddress': 62401,
        'JettonLockBox_Error.UnsupportedToken': 62402,
        'JettonLockBox_Error.ContractAlreadyInitialized': 62403,
        'JettonLockBox_Error.ContractNotInitialized': 62404,
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
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }) {
        return JettonLockBox_Init.toCell(JettonLockBox_Init.create(body));
    }

    static createCellOfJettonLockBoxWithdraw(body: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockBox_WithdrawExtra> | null
    }) {
        return JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId: uint64
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

    async sendJettonLockBoxInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockBox_WithdrawExtra> | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockBox_Withdraw.toCell(JettonLockBox_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
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

    async getRoleMembers(provider: ContractProvider, role: uint256): Promise<c.Dictionary<c.Address, boolean>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRoleMembers', [
            { type: 'int', value: role },
        ]));
        return r.readDictionary<c.Address, boolean>(c.Dictionary.Keys.Address(), c.Dictionary.Values.Bool());
    }
}
