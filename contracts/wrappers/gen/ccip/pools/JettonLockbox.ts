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
        queryId: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args
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
 > struct (0xcf3ca837) AccessControl_RoleGranted {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleGranted {
    readonly $: 'AccessControl_RoleGranted'
    queryId: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleGranted = {
    PREFIX: 0xcf3ca837,

    create(args: {
        queryId: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleGranted {
        return {
            $: 'AccessControl_RoleGranted',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleGranted {
        loadAndCheckPrefix32(s, 0xcf3ca837, 'AccessControl_RoleGranted');
        return {
            $: 'AccessControl_RoleGranted',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleGranted, b: c.Builder): void {
        b.storeUint(0xcf3ca837, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
        b.storeAddress(self.sender);
    },
    toCell(self: AccessControl_RoleGranted): c.Cell {
        return makeCellFrom<AccessControl_RoleGranted>(self, AccessControl_RoleGranted.store);
    }
}

/**
 > struct (0x990fe1c7) AccessControl_RoleRevoked {
 >     queryId: uint64
 >     role: uint256
 >     account: address
 >     sender: address
 > }
 */
export interface AccessControl_RoleRevoked {
    readonly $: 'AccessControl_RoleRevoked'
    queryId: uint64
    role: uint256
    account: c.Address
    sender: c.Address
}

export const AccessControl_RoleRevoked = {
    PREFIX: 0x990fe1c7,

    create(args: {
        queryId: uint64
        role: uint256
        account: c.Address
        sender: c.Address
    }): AccessControl_RoleRevoked {
        return {
            $: 'AccessControl_RoleRevoked',
            ...args
        }
    },
    fromSlice(s: c.Slice): AccessControl_RoleRevoked {
        loadAndCheckPrefix32(s, 0x990fe1c7, 'AccessControl_RoleRevoked');
        return {
            $: 'AccessControl_RoleRevoked',
            queryId: s.loadUintBig(64),
            role: s.loadUintBig(256),
            account: s.loadAddress(),
            sender: s.loadAddress(),
        }
    },
    store(self: AccessControl_RoleRevoked, b: c.Builder): void {
        b.storeUint(0x990fe1c7, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.role, 256);
        b.storeAddress(self.account);
        b.storeAddress(self.sender);
    },
    toCell(self: AccessControl_RoleRevoked): c.Cell {
        return makeCellFrom<AccessControl_RoleRevoked>(self, AccessControl_RoleRevoked.store);
    }
}

/**
 > struct (0x17c24001) JettonLockbox_Deposit {
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
    PREFIX: 0x17c24001,

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
        loadAndCheckPrefix32(s, 0x17c24001, 'JettonLockbox_Deposit');
        return {
            $: 'JettonLockbox_Deposit',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockbox_Deposit, b: c.Builder): void {
        b.storeUint(0x17c24001, 32);
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
 > struct (0x17c24002) JettonLockbox_Withdraw {
 >     queryId: uint64
 >     token: address
 >     remoteChainSelector: uint64
 >     amount: coins
 >     recipientWallet: address
 > }
 */
export interface JettonLockbox_Withdraw {
    readonly $: 'JettonLockbox_Withdraw'
    queryId: uint64
    token: c.Address
    remoteChainSelector: uint64
    amount: coins
    recipientWallet: c.Address
}

export const JettonLockbox_Withdraw = {
    PREFIX: 0x17c24002,

    create(args: {
        queryId: uint64
        token: c.Address
        remoteChainSelector: uint64
        amount: coins
        recipientWallet: c.Address
    }): JettonLockbox_Withdraw {
        return {
            $: 'JettonLockbox_Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonLockbox_Withdraw {
        loadAndCheckPrefix32(s, 0x17c24002, 'JettonLockbox_Withdraw');
        return {
            $: 'JettonLockbox_Withdraw',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
            recipientWallet: s.loadAddress(),
        }
    },
    store(self: JettonLockbox_Withdraw, b: c.Builder): void {
        b.storeUint(0x17c24002, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
        b.storeAddress(self.recipientWallet);
    },
    toCell(self: JettonLockbox_Withdraw): c.Cell {
        return makeCellFrom<JettonLockbox_Withdraw>(self, JettonLockbox_Withdraw.store);
    }
}

/**
 > struct (0x17c24003) JettonLockbox_Deposited {
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
    PREFIX: 0x17c24003,

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
        loadAndCheckPrefix32(s, 0x17c24003, 'JettonLockbox_Deposited');
        return {
            $: 'JettonLockbox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            remoteChainSelector: s.loadUintBig(64),
            amount: s.loadCoins(),
        }
    },
    store(self: JettonLockbox_Deposited, b: c.Builder): void {
        b.storeUint(0x17c24003, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeCoins(self.amount);
    },
    toCell(self: JettonLockbox_Deposited): c.Cell {
        return makeCellFrom<JettonLockbox_Deposited>(self, JettonLockbox_Deposited.store);
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

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async getToken(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('token', []));
        return r.readSlice().loadAddress();
    }

    async getWallet(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('wallet', []));
        return r.readSlice().loadAddress();
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
