// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenAdminRegistry contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

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
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint32 = bigint
type uint64 = bigint

/**
 > struct ContractState {
 >     code: cell
 >     data: cell
 > }
 */
export interface ContractState {
    readonly $: 'ContractState'
    code: c.Cell
    data: c.Cell
}

export const ContractState = {
    create(args: {
        code: c.Cell
        data: c.Cell
    }): ContractState {
        return {
            $: 'ContractState',
            ...args
        }
    },
    fromSlice(s: c.Slice): ContractState {
        return {
            $: 'ContractState',
            code: s.loadRef(),
            data: s.loadRef(),
        }
    },
    store(self: ContractState, b: c.Builder): void {
        b.storeRef(self.code);
        b.storeRef(self.data);
    },
    toCell(self: ContractState): c.Cell {
        return makeCellFrom<ContractState>(self, ContractState.store);
    }
}

/**
 > struct (0xbe8621a2) TokenAdminRegistry_RegisterToken {
 >     queryId: uint64
 >     tokenAddress: address
 >     tokenInfo: Cell<TokenRegistry_TokenInfo>
 >     administrator: address
 > }
 */
export interface TokenAdminRegistry_RegisterToken {
    readonly $: 'TokenAdminRegistry_RegisterToken'
    queryId: uint64
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    administrator: c.Address
}

export const TokenAdminRegistry_RegisterToken = {
    PREFIX: 0xbe8621a2,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }): TokenAdminRegistry_RegisterToken {
        return {
            $: 'TokenAdminRegistry_RegisterToken',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_RegisterToken {
        loadAndCheckPrefix32(s, 0xbe8621a2, 'TokenAdminRegistry_RegisterToken');
        return {
            $: 'TokenAdminRegistry_RegisterToken',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            tokenInfo: loadCellRef<TokenRegistry_TokenInfo>(s, TokenRegistry_TokenInfo.fromSlice),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_RegisterToken, b: c.Builder): void {
        b.storeUint(0xbe8621a2, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        storeCellRef<TokenRegistry_TokenInfo>(self.tokenInfo, b, TokenRegistry_TokenInfo.store);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistry_RegisterToken): c.Cell {
        return makeCellFrom<TokenAdminRegistry_RegisterToken>(self, TokenAdminRegistry_RegisterToken.store);
    }
}

/**
 > struct (0xfddaa034) TokenAdminRegistry_OverridePendingAdministrator {
 >     queryId: uint64
 >     tokenAddress: address
 >     administrator: address
 > }
 */
export interface TokenAdminRegistry_OverridePendingAdministrator {
    readonly $: 'TokenAdminRegistry_OverridePendingAdministrator'
    queryId: uint64
    tokenAddress: c.Address
    administrator: c.Address
}

export const TokenAdminRegistry_OverridePendingAdministrator = {
    PREFIX: 0xfddaa034,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }): TokenAdminRegistry_OverridePendingAdministrator {
        return {
            $: 'TokenAdminRegistry_OverridePendingAdministrator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_OverridePendingAdministrator {
        loadAndCheckPrefix32(s, 0xfddaa034, 'TokenAdminRegistry_OverridePendingAdministrator');
        return {
            $: 'TokenAdminRegistry_OverridePendingAdministrator',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_OverridePendingAdministrator, b: c.Builder): void {
        b.storeUint(0xfddaa034, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistry_OverridePendingAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistry_OverridePendingAdministrator>(self, TokenAdminRegistry_OverridePendingAdministrator.store);
    }
}

/**
 > struct (0xdc67ebd0) TokenAdminRegistry_TransferAdminRole {
 >     queryId: uint64
 >     tokenAddress: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistry_TransferAdminRole {
    readonly $: 'TokenAdminRegistry_TransferAdminRole'
    queryId: uint64
    tokenAddress: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistry_TransferAdminRole = {
    PREFIX: 0xdc67ebd0,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistry_TransferAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0xdc67ebd0, 'TokenAdminRegistry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistry_TransferAdminRole',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0xdc67ebd0, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistry_TransferAdminRole>(self, TokenAdminRegistry_TransferAdminRole.store);
    }
}

/**
 > struct (0xbe28e166) TokenAdminRegistry_AcceptAdminRole {
 >     queryId: uint64
 >     tokenAddress: address
 > }
 */
export interface TokenAdminRegistry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistry_AcceptAdminRole'
    queryId: uint64
    tokenAddress: c.Address
}

export const TokenAdminRegistry_AcceptAdminRole = {
    PREFIX: 0xbe28e166,

    create(args: {
        queryId?: uint64
        tokenAddress: c.Address
    }): TokenAdminRegistry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistry_AcceptAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0xbe28e166, 'TokenAdminRegistry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistry_AcceptAdminRole',
            queryId: s.loadUintBig(64),
            tokenAddress: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0xbe28e166, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.tokenAddress);
    },
    toCell(self: TokenAdminRegistry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AcceptAdminRole>(self, TokenAdminRegistry_AcceptAdminRole.store);
    }
}

/**
 > struct (0x140b1e91) TokenAdminRegistry_AdministratorTransferRequested {
 >     queryId: uint64
 >     token: address
 >     currentAdministrator: address?
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistry_AdministratorTransferRequested {
    readonly $: 'TokenAdminRegistry_AdministratorTransferRequested'
    queryId: uint64
    token: c.Address
    currentAdministrator: c.Address | null
    newAdministrator: c.Address | null
}

export const TokenAdminRegistry_AdministratorTransferRequested = {
    PREFIX: 0x140b1e91,

    create(args: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }): TokenAdminRegistry_AdministratorTransferRequested {
        return {
            $: 'TokenAdminRegistry_AdministratorTransferRequested',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AdministratorTransferRequested {
        loadAndCheckPrefix32(s, 0x140b1e91, 'TokenAdminRegistry_AdministratorTransferRequested');
        return {
            $: 'TokenAdminRegistry_AdministratorTransferRequested',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            currentAdministrator: s.loadMaybeAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_AdministratorTransferRequested, b: c.Builder): void {
        b.storeUint(0x140b1e91, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.currentAdministrator);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_AdministratorTransferRequested): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AdministratorTransferRequested>(self, TokenAdminRegistry_AdministratorTransferRequested.store);
    }
}

/**
 > struct (0xe2c74db4) TokenAdminRegistry_AdministratorTransferred {
 >     queryId: uint64
 >     token: address
 >     newAdministrator: address
 > }
 */
export interface TokenAdminRegistry_AdministratorTransferred {
    readonly $: 'TokenAdminRegistry_AdministratorTransferred'
    queryId: uint64
    token: c.Address
    newAdministrator: c.Address
}

export const TokenAdminRegistry_AdministratorTransferred = {
    PREFIX: 0xe2c74db4,

    create(args: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }): TokenAdminRegistry_AdministratorTransferred {
        return {
            $: 'TokenAdminRegistry_AdministratorTransferred',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_AdministratorTransferred {
        loadAndCheckPrefix32(s, 0xe2c74db4, 'TokenAdminRegistry_AdministratorTransferred');
        return {
            $: 'TokenAdminRegistry_AdministratorTransferred',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            newAdministrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistry_AdministratorTransferred, b: c.Builder): void {
        b.storeUint(0xe2c74db4, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistry_AdministratorTransferred): c.Cell {
        return makeCellFrom<TokenAdminRegistry_AdministratorTransferred>(self, TokenAdminRegistry_AdministratorTransferred.store);
    }
}

/**
 > struct (0xcef01a87) TokenAdminRegistry_PoolSet {
 >     queryId: uint64
 >     token: address
 >     previousPool: address?
 >     newPool: address?
 > }
 */
export interface TokenAdminRegistry_PoolSet {
    readonly $: 'TokenAdminRegistry_PoolSet'
    queryId: uint64
    token: c.Address
    previousPool: c.Address | null
    newPool: c.Address | null
}

export const TokenAdminRegistry_PoolSet = {
    PREFIX: 0xcef01a87,

    create(args: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
    }): TokenAdminRegistry_PoolSet {
        return {
            $: 'TokenAdminRegistry_PoolSet',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_PoolSet {
        loadAndCheckPrefix32(s, 0xcef01a87, 'TokenAdminRegistry_PoolSet');
        return {
            $: 'TokenAdminRegistry_PoolSet',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            previousPool: s.loadMaybeAddress(),
            newPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistry_PoolSet, b: c.Builder): void {
        b.storeUint(0xcef01a87, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.previousPool);
        b.storeAddress(self.newPool);
    },
    toCell(self: TokenAdminRegistry_PoolSet): c.Cell {
        return makeCellFrom<TokenAdminRegistry_PoolSet>(self, TokenAdminRegistry_PoolSet.store);
    }
}

/**
 > struct TokenAdminRegistry_Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 > }
 */
export interface TokenAdminRegistry_Storage {
    readonly $: 'TokenAdminRegistry_Storage'
    id: uint32
    ownable: Ownable2Step
}

export const TokenAdminRegistry_Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
    }): TokenAdminRegistry_Storage {
        return {
            $: 'TokenAdminRegistry_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_Storage {
        return {
            $: 'TokenAdminRegistry_Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
        }
    },
    store(self: TokenAdminRegistry_Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
    },
    toCell(self: TokenAdminRegistry_Storage): c.Cell {
        return makeCellFrom<TokenAdminRegistry_Storage>(self, TokenAdminRegistry_Storage.store);
    }
}

/**
 > enum TokenAdminRegistry_Error { 1 variants }
 */
export type TokenAdminRegistry_Error = bigint

export const TokenAdminRegistry_Error = {
    UnauthorizedEntry: 50800n,

    fromSlice(s: c.Slice): TokenAdminRegistry_Error {
        return s.loadUintBig(16);
    },
    store(self: TokenAdminRegistry_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: TokenAdminRegistry_Error): c.Cell {
        return makeCellFrom<TokenAdminRegistry_Error>(self, TokenAdminRegistry_Error.store);
    }
}

/**
 > enum Ownable2Step_Error { 3 variants }
 */
export type Ownable2Step_Error = bigint

export const Ownable2Step_Error = {
    OnlyCallableByOwner: 49800n,
    CannotTransferToSelf: 49801n,
    MustBeProposedOwner: 49802n,

    fromSlice(s: c.Slice): Ownable2Step_Error {
        return s.loadUintBig(16);
    },
    store(self: Ownable2Step_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: Ownable2Step_Error): c.Cell {
        return makeCellFrom<Ownable2Step_Error>(self, Ownable2Step_Error.store);
    }
}

/**
 > struct Ownable2Step {
 >     owner: address
 >     pendingOwner: address?
 > }
 */
export interface Ownable2Step {
    readonly $: 'Ownable2Step'
    owner: c.Address
    pendingOwner: c.Address | null /* = null */
}

export const Ownable2Step = {
    create(args: {
        owner: c.Address
        pendingOwner?: c.Address | null /* = null */
    }): Ownable2Step {
        return {
            $: 'Ownable2Step',
            pendingOwner: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): Ownable2Step {
        return {
            $: 'Ownable2Step',
            owner: s.loadAddress(),
            pendingOwner: s.loadMaybeAddress(),
        }
    },
    store(self: Ownable2Step, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.pendingOwner);
    },
    toCell(self: Ownable2Step): c.Cell {
        return makeCellFrom<Ownable2Step>(self, Ownable2Step.store);
    }
}

/**
 > struct (0xf21b7da1) Ownable2Step_TransferOwnership {
 >     queryId: uint64
 >     newOwner: address
 > }
 */
export interface Ownable2Step_TransferOwnership {
    readonly $: 'Ownable2Step_TransferOwnership'
    queryId: uint64
    newOwner: c.Address
}

export const Ownable2Step_TransferOwnership = {
    PREFIX: 0xf21b7da1,

    create(args: {
        queryId?: uint64
        newOwner: c.Address
    }): Ownable2Step_TransferOwnership {
        return {
            $: 'Ownable2Step_TransferOwnership',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_TransferOwnership {
        loadAndCheckPrefix32(s, 0xf21b7da1, 'Ownable2Step_TransferOwnership');
        return {
            $: 'Ownable2Step_TransferOwnership',
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_TransferOwnership, b: c.Builder): void {
        b.storeUint(0xf21b7da1, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_TransferOwnership): c.Cell {
        return makeCellFrom<Ownable2Step_TransferOwnership>(self, Ownable2Step_TransferOwnership.store);
    }
}

/**
 > struct (0xf9e29e4a) Ownable2Step_AcceptOwnership {
 >     queryId: uint64
 > }
 */
export interface Ownable2Step_AcceptOwnership {
    readonly $: 'Ownable2Step_AcceptOwnership'
    queryId: uint64
}

export const Ownable2Step_AcceptOwnership = {
    PREFIX: 0xf9e29e4a,

    create(args: {
        queryId?: uint64
    }): Ownable2Step_AcceptOwnership {
        return {
            $: 'Ownable2Step_AcceptOwnership',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_AcceptOwnership {
        loadAndCheckPrefix32(s, 0xf9e29e4a, 'Ownable2Step_AcceptOwnership');
        return {
            $: 'Ownable2Step_AcceptOwnership',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: Ownable2Step_AcceptOwnership, b: c.Builder): void {
        b.storeUint(0xf9e29e4a, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: Ownable2Step_AcceptOwnership): c.Cell {
        return makeCellFrom<Ownable2Step_AcceptOwnership>(self, Ownable2Step_AcceptOwnership.store);
    }
}

/**
 > struct Ownable2Step_OwnershipTransferRequested {
 >     queryId: uint64
 >     newOwner: address
 > }
 */
export interface Ownable2Step_OwnershipTransferRequested {
    readonly $: 'Ownable2Step_OwnershipTransferRequested'
    queryId: uint64
    newOwner: c.Address
}

export const Ownable2Step_OwnershipTransferRequested = {
    create(args: {
        queryId?: uint64
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_OwnershipTransferRequested, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_OwnershipTransferRequested): c.Cell {
        return makeCellFrom<Ownable2Step_OwnershipTransferRequested>(self, Ownable2Step_OwnershipTransferRequested.store);
    }
}

/**
 > struct Ownable2Step_OwnershipTransferred {
 >     queryId: uint64
 >     oldOwner: address
 >     newOwner: address
 > }
 */
export interface Ownable2Step_OwnershipTransferred {
    readonly $: 'Ownable2Step_OwnershipTransferred'
    queryId: uint64
    oldOwner: c.Address
    newOwner: c.Address
}

export const Ownable2Step_OwnershipTransferred = {
    create(args: {
        queryId?: uint64
        oldOwner: c.Address
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            queryId: s.loadUintBig(64),
            oldOwner: s.loadAddress(),
            newOwner: s.loadAddress(),
        }
    },
    store(self: Ownable2Step_OwnershipTransferred, b: c.Builder): void {
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.oldOwner);
        b.storeAddress(self.newOwner);
    },
    toCell(self: Ownable2Step_OwnershipTransferred): c.Cell {
        return makeCellFrom<Ownable2Step_OwnershipTransferred>(self, Ownable2Step_OwnershipTransferred.store);
    }
}

/**
 > struct (0xb0ec5157) Deployable_InitializeAndSend {
 >     stateInit: ContractState
 >     selfMessage: Deployable_Message
 > }
 */
export interface Deployable_InitializeAndSend {
    readonly $: 'Deployable_InitializeAndSend'
    stateInit: ContractState
    selfMessage: Deployable_Message
}

export const Deployable_InitializeAndSend = {
    PREFIX: 0xb0ec5157,

    create(args: {
        stateInit: ContractState
        selfMessage: Deployable_Message
    }): Deployable_InitializeAndSend {
        return {
            $: 'Deployable_InitializeAndSend',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_InitializeAndSend {
        loadAndCheckPrefix32(s, 0xb0ec5157, 'Deployable_InitializeAndSend');
        return {
            $: 'Deployable_InitializeAndSend',
            stateInit: ContractState.fromSlice(s),
            selfMessage: Deployable_Message.fromSlice(s),
        }
    },
    store(self: Deployable_InitializeAndSend, b: c.Builder): void {
        b.storeUint(0xb0ec5157, 32);
        ContractState.store(self.stateInit, b);
        Deployable_Message.store(self.selfMessage, b);
    },
    toCell(self: Deployable_InitializeAndSend): c.Cell {
        return makeCellFrom<Deployable_InitializeAndSend>(self, Deployable_InitializeAndSend.store);
    }
}

/**
 > struct Deployable_Message {
 >     value: coins
 >     body: cell
 > }
 */
export interface Deployable_Message {
    readonly $: 'Deployable_Message'
    value: coins
    body: c.Cell
}

export const Deployable_Message = {
    create(args: {
        value: coins
        body: c.Cell
    }): Deployable_Message {
        return {
            $: 'Deployable_Message',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_Message {
        return {
            $: 'Deployable_Message',
            value: s.loadCoins(),
            body: s.loadRef(),
        }
    },
    store(self: Deployable_Message, b: c.Builder): void {
        b.storeCoins(self.value);
        b.storeRef(self.body);
    },
    toCell(self: Deployable_Message): c.Cell {
        return makeCellFrom<Deployable_Message>(self, Deployable_Message.store);
    }
}

/**
 > struct (0x6dcbe573) TokenAdminRegistryEntry_ProposeAdministrator {
 >     queryId: uint64
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    queryId: uint64
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x6dcbe573,

    create(args: {
        queryId?: uint64
        administrator: c.Address
    }): TokenAdminRegistryEntry_ProposeAdministrator {
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ProposeAdministrator {
        loadAndCheckPrefix32(s, 0x6dcbe573, 'TokenAdminRegistryEntry_ProposeAdministrator');
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            queryId: s.loadUintBig(64),
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x6dcbe573, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
 >     queryId: uint64
 >     actor: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    queryId: uint64
    actor: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x8b1503cf,

    create(args: {
        queryId?: uint64
        actor: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistryEntry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0x8b1503cf, 'TokenAdminRegistryEntry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            queryId: s.loadUintBig(64),
            actor: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x8b1503cf, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.actor);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistryEntry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TransferAdminRole>(self, TokenAdminRegistryEntry_TransferAdminRole.store);
    }
}

/**
 > struct (0x39c6e872) TokenAdminRegistryEntry_AcceptAdminRole {
 >     queryId: uint64
 >     actor: address
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
    queryId: uint64
    actor: c.Address
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0x39c6e872,

    create(args: {
        queryId?: uint64
        actor: c.Address
    }): TokenAdminRegistryEntry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0x39c6e872, 'TokenAdminRegistryEntry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            queryId: s.loadUintBig(64),
            actor: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0x39c6e872, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.actor);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address?
 >     minterAddress: address
 >     version: uint32
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address | null
    minterAddress: c.Address
    version: uint32 /* = 1 */
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address | null
        minterAddress: c.Address
        version?: uint32 /* = 1 */
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            version: 1n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadMaybeAddress(),
            minterAddress: s.loadAddress(),
            version: s.loadUintBig(32),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeUint(self.version, 32);
    },
    toCell(self: TokenRegistry_TokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_TokenInfo>(self, TokenRegistry_TokenInfo.store);
    }
}

// ————————————————————————————————————————————
//    class TokenAdminRegistry
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

export class TokenAdminRegistry implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
        'TokenAdminRegistry_Error.UnauthorizedEntry': 50800,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TokenAdminRegistry(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistry.CodeCell,
            data: TokenAdminRegistry_Storage.toCell(TokenAdminRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistry(address, initialState);
    }

    static createCellOfTokenAdminRegistryRegisterToken(body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }) {
        return TokenAdminRegistry_RegisterToken.toCell(TokenAdminRegistry_RegisterToken.create(body));
    }

    static createCellOfTokenAdminRegistryOverridePendingAdministrator(body: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }) {
        return TokenAdminRegistry_OverridePendingAdministrator.toCell(TokenAdminRegistry_OverridePendingAdministrator.create(body));
    }

    static createCellOfTokenAdminRegistryTransferAdminRole(body: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistry_TransferAdminRole.toCell(TokenAdminRegistry_TransferAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryAcceptAdminRole(body: {
        queryId?: uint64
        tokenAddress: c.Address
    }) {
        return TokenAdminRegistry_AcceptAdminRole.toCell(TokenAdminRegistry_AcceptAdminRole.create(body));
    }

    static createCellOfTokenAdminRegistryAdministratorTransferRequested(body: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }) {
        return TokenAdminRegistry_AdministratorTransferRequested.toCell(TokenAdminRegistry_AdministratorTransferRequested.create(body));
    }

    static createCellOfTokenAdminRegistryAdministratorTransferred(body: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }) {
        return TokenAdminRegistry_AdministratorTransferred.toCell(TokenAdminRegistry_AdministratorTransferred.create(body));
    }

    static createCellOfTokenAdminRegistryPoolSet(body: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
    }) {
        return TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body));
    }

    static createCellOfOwnable2StepTransferOwnership(body: {
        queryId?: uint64
        newOwner: c.Address
    }) {
        return Ownable2Step_TransferOwnership.toCell(Ownable2Step_TransferOwnership.create(body));
    }

    static createCellOfOwnable2StepAcceptOwnership(body: {
        queryId?: uint64
    }) {
        return Ownable2Step_AcceptOwnership.toCell(Ownable2Step_AcceptOwnership.create(body));
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

    async sendTokenAdminRegistryRegisterToken(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_RegisterToken.toCell(TokenAdminRegistry_RegisterToken.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryOverridePendingAdministrator(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        administrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_OverridePendingAdministrator.toCell(TokenAdminRegistry_OverridePendingAdministrator.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryTransferAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_TransferAdminRole.toCell(TokenAdminRegistry_TransferAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryAcceptAdminRole(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        tokenAddress: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AcceptAdminRole.toCell(TokenAdminRegistry_AcceptAdminRole.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryAdministratorTransferRequested(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        currentAdministrator: c.Address | null
        newAdministrator: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AdministratorTransferRequested.toCell(TokenAdminRegistry_AdministratorTransferRequested.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryAdministratorTransferred(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        newAdministrator: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_AdministratorTransferred.toCell(TokenAdminRegistry_AdministratorTransferred.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistryPoolSet(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        token: c.Address
        previousPool: c.Address | null
        newPool: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_PoolSet.toCell(TokenAdminRegistry_PoolSet.create(body)),
            ...extraOptions
        });
    }

    async sendOwnable2StepTransferOwnership(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        newOwner: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Ownable2Step_TransferOwnership.toCell(Ownable2Step_TransferOwnership.create(body)),
            ...extraOptions
        });
    }

    async sendOwnable2StepAcceptOwnership(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Ownable2Step_AcceptOwnership.toCell(Ownable2Step_AcceptOwnership.create(body)),
            ...extraOptions
        });
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getPendingOwner(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('pendingOwner', []));
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
}
