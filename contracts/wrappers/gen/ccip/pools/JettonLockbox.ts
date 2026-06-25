// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a JettonLockbox contract in Tolk.
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
 > struct (0x18024cb6) JettonLockbox_Deposit {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 > }
 */
export interface JettonLockbox_Deposit {
    readonly $: 'JettonLockbox_Deposit'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
}

export const JettonLockbox_Deposit = {
    PREFIX: 0x18024cb6,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }): JettonLockbox_Deposit {
        return {
            $: 'JettonLockbox_Deposit',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Deposit {
        loadAndCheckPrefix32(s, 0x18024cb6, 'JettonLockbox_Deposit');
        return {
            $: 'JettonLockbox_Deposit',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockbox_Deposit, b: c.Builder): void {
        b.storeUint(0x18024cb6, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockbox_Deposit): c.Cell {
        return makeCellFrom<JettonLockbox_Deposit>(self, JettonLockbox_Deposit.store);
    }
}

/**
 > struct JettonLockbox_WithdrawExtra {
 >     sendExcessesTo: address?
 > }
 */
export interface JettonLockbox_WithdrawExtra {
    readonly $: 'JettonLockbox_WithdrawExtra'
    sendExcessesTo: c.Address | null
}

export const JettonLockbox_WithdrawExtra = {
    create(args: {
        sendExcessesTo: c.Address | null
    }): JettonLockbox_WithdrawExtra {
        return {
            $: 'JettonLockbox_WithdrawExtra',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_WithdrawExtra {
        return {
            $: 'JettonLockbox_WithdrawExtra',
            sendExcessesTo: s.loadMaybeAddress(),
        }
    },
    store(self: JettonLockbox_WithdrawExtra, b: c.Builder): void {
        b.storeAddress(self.sendExcessesTo);
    },
    toCell(self: JettonLockbox_WithdrawExtra): c.Cell {
        return makeCellFrom<JettonLockbox_WithdrawExtra>(self, JettonLockbox_WithdrawExtra.store);
    }
}

/**
 > struct (0xc85418fe) JettonLockbox_Withdraw {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     recipientWallet: address
 >     extra: Cell<JettonLockbox_WithdrawExtra>?
 > }
 */
export interface JettonLockbox_Withdraw {
    readonly $: 'JettonLockbox_Withdraw'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    recipientWallet: c.Address
    extra: CellRef<JettonLockbox_WithdrawExtra> | null
}

export const JettonLockbox_Withdraw = {
    PREFIX: 0xc85418fe,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockbox_WithdrawExtra> | null
    }): JettonLockbox_Withdraw {
        return {
            $: 'JettonLockbox_Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Withdraw {
        loadAndCheckPrefix32(s, 0xc85418fe, 'JettonLockbox_Withdraw');
        return {
            $: 'JettonLockbox_Withdraw',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            recipientWallet: s.loadAddress(),
            extra: s.loadBoolean() ? loadCellRef<JettonLockbox_WithdrawExtra>(s, JettonLockbox_WithdrawExtra.fromSlice) : null,
        }
    },
    store(self: JettonLockbox_Withdraw, b: c.Builder): void {
        b.storeUint(0xc85418fe, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
        storeTolkNullable<CellRef<JettonLockbox_WithdrawExtra>>(self.extra, b,
            (v,b) => storeCellRef<JettonLockbox_WithdrawExtra>(v, b, JettonLockbox_WithdrawExtra.store)
        );
    },
    toCell(self: JettonLockbox_Withdraw): c.Cell {
        return makeCellFrom<JettonLockbox_Withdraw>(self, JettonLockbox_Withdraw.store);
    }
}

/**
 > struct (0xde7934db) JettonLockbox_Deposited {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 > }
 */
export interface JettonLockbox_Deposited {
    readonly $: 'JettonLockbox_Deposited'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
}

export const JettonLockbox_Deposited = {
    PREFIX: 0xde7934db,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
    }): JettonLockbox_Deposited {
        return {
            $: 'JettonLockbox_Deposited',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Deposited {
        loadAndCheckPrefix32(s, 0xde7934db, 'JettonLockbox_Deposited');
        return {
            $: 'JettonLockbox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockbox_Deposited, b: c.Builder): void {
        b.storeUint(0xde7934db, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockbox_Deposited): c.Cell {
        return makeCellFrom<JettonLockbox_Deposited>(self, JettonLockbox_Deposited.store);
    }
}

/**
 > struct (0x06d08cef) JettonLockbox_Init {
 >     queryId: uint64
 >     minterAddress: address
 >     walletAddress: address
 >     admin: address?
 > }
 */
export interface JettonLockbox_Init {
    readonly $: 'JettonLockbox_Init'
    queryId: uint64
    minterAddress: c.Address
    walletAddress: c.Address
    admin: c.Address | null
}

export const JettonLockbox_Init = {
    PREFIX: 0x06d08cef,

    create(args: {
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }): JettonLockbox_Init {
        return {
            $: 'JettonLockbox_Init',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Init {
        loadAndCheckPrefix32(s, 0x06d08cef, 'JettonLockbox_Init');
        return {
            $: 'JettonLockbox_Init',
            queryId: s.loadUintBig(64),
            minterAddress: s.loadAddress(),
            walletAddress: s.loadAddress(),
            admin: s.loadMaybeAddress(),
        }
    },
    store(self: JettonLockbox_Init, b: c.Builder): void {
        b.storeUint(0x06d08cef, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.walletAddress);
        b.storeAddress(self.admin);
    },
    toCell(self: JettonLockbox_Init): c.Cell {
        return makeCellFrom<JettonLockbox_Init>(self, JettonLockbox_Init.store);
    }
}

/**
 > struct (0x6131dd8f) JettonLockbox_Initialized {
 >     queryId: uint64
 >     minterAddress: address
 >     walletAddress: address
 >     admin: address
 > }
 */
export interface JettonLockbox_Initialized {
    readonly $: 'JettonLockbox_Initialized'
    queryId: uint64
    minterAddress: c.Address
    walletAddress: c.Address
    admin: c.Address
}

export const JettonLockbox_Initialized = {
    PREFIX: 0x6131dd8f,

    create(args: {
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address
    }): JettonLockbox_Initialized {
        return {
            $: 'JettonLockbox_Initialized',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Initialized {
        loadAndCheckPrefix32(s, 0x6131dd8f, 'JettonLockbox_Initialized');
        return {
            $: 'JettonLockbox_Initialized',
            queryId: s.loadUintBig(64),
            minterAddress: s.loadAddress(),
            walletAddress: s.loadAddress(),
            admin: s.loadAddress(),
        }
    },
    store(self: JettonLockbox_Initialized, b: c.Builder): void {
        b.storeUint(0x6131dd8f, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.walletAddress);
        b.storeAddress(self.admin);
    },
    toCell(self: JettonLockbox_Initialized): c.Cell {
        return makeCellFrom<JettonLockbox_Initialized>(self, JettonLockbox_Initialized.store);
    }
}

/**
 > struct (0x3dfc5d66) JettonLockbox_WithdrawFailed {
 >     queryId: uint64
 >     token: address
 >     amount: coins
 >     recipientWallet: address
 > }
 */
export interface JettonLockbox_WithdrawFailed {
    readonly $: 'JettonLockbox_WithdrawFailed'
    queryId: uint64
    token: c.Address
    amount: coins
    recipientWallet: c.Address
}

export const JettonLockbox_WithdrawFailed = {
    PREFIX: 0x3dfc5d66,

    create(args: {
        queryId: uint64
        token: c.Address
        amount: coins
        recipientWallet: c.Address
    }): JettonLockbox_WithdrawFailed {
        return {
            $: 'JettonLockbox_WithdrawFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_WithdrawFailed {
        loadAndCheckPrefix32(s, 0x3dfc5d66, 'JettonLockbox_WithdrawFailed');
        return {
            $: 'JettonLockbox_WithdrawFailed',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadCoins(),
            recipientWallet: s.loadAddress(),
        }
    },
    store(self: JettonLockbox_WithdrawFailed, b: c.Builder): void {
        b.storeUint(0x3dfc5d66, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
    },
    toCell(self: JettonLockbox_WithdrawFailed): c.Cell {
        return makeCellFrom<JettonLockbox_WithdrawFailed>(self, JettonLockbox_WithdrawFailed.store);
    }
}

// ————————————————————————————————————————————
//    class JettonLockbox
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

export class JettonLockbox implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'JettonLockbox_Error.TokenAmountCannotBeZero': 27200,
        'JettonLockbox_Error.RecipientCannotBeZeroAddress': 27201,
        'JettonLockbox_Error.UnsupportedToken': 27202,
        'JettonLockbox_Error.ContractAlreadyInitialized': 27203,
        'JettonLockbox_Error.ContractNotInitialized': 27204,
        'AccessControl_Error.UnauthorizedAccount': 47400,
        'AccessControl_Error.BadConfirmation': 47401,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new JettonLockbox(address);
    }

    static fromStorage(emptyStorage: {
        id: uint64
        minterAddress: c.Address
        walletAddress: c.Address | null
        rbac: AccessControl_Data
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? JettonLockbox.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new JettonLockbox(address, initialState);
    }

    static createCellOfJettonLockboxInit(body: {
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }) {
        return JettonLockbox_Init.toCell(JettonLockbox_Init.create(body));
    }

    static createCellOfJettonLockboxWithdraw(body: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockbox_WithdrawExtra> | null
    }) {
        return JettonLockbox_Withdraw.toCell(JettonLockbox_Withdraw.create(body));
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

    async sendJettonLockboxInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        minterAddress: c.Address
        walletAddress: c.Address
        admin: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockbox_Init.toCell(JettonLockbox_Init.create(body)),
            ...extraOptions
        });
    }

    async sendJettonLockboxWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
        extra: CellRef<JettonLockbox_WithdrawExtra> | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: JettonLockbox_Withdraw.toCell(JettonLockbox_Withdraw.create(body)),
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
