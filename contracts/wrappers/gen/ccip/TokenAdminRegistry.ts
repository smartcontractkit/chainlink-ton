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
 > struct (0x3ec09499) TokenAdminRegistry_SetEntryDeployment {
 >     entryDeployment: TokenAdminRegistry_EntryDeployment
 > }
 */
export interface TokenAdminRegistry_SetEntryDeployment {
    readonly $: 'TokenAdminRegistry_SetEntryDeployment'
    entryDeployment: TokenAdminRegistry_EntryDeployment
}

export const TokenAdminRegistry_SetEntryDeployment = {
    PREFIX: 0x3ec09499,

    create(args: {
        entryDeployment: TokenAdminRegistry_EntryDeployment
    }): TokenAdminRegistry_SetEntryDeployment {
        return {
            $: 'TokenAdminRegistry_SetEntryDeployment',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_SetEntryDeployment {
        loadAndCheckPrefix32(s, 0x3ec09499, 'TokenAdminRegistry_SetEntryDeployment');
        return {
            $: 'TokenAdminRegistry_SetEntryDeployment',
            entryDeployment: TokenAdminRegistry_EntryDeployment.fromSlice(s),
        }
    },
    store(self: TokenAdminRegistry_SetEntryDeployment, b: c.Builder): void {
        b.storeUint(0x3ec09499, 32);
        TokenAdminRegistry_EntryDeployment.store(self.entryDeployment, b);
    },
    toCell(self: TokenAdminRegistry_SetEntryDeployment): c.Cell {
        return makeCellFrom<TokenAdminRegistry_SetEntryDeployment>(self, TokenAdminRegistry_SetEntryDeployment.store);
    }
}

/**
 > struct (0xe34153dd) TokenAdminRegistry_SetTokenInfo {
 >     tokenAddress: address
 >     tokenInfo: TokenRegistry_TokenInfo
 >     isNewEntry: bool
 > }
 */
export interface TokenAdminRegistry_SetTokenInfo {
    readonly $: 'TokenAdminRegistry_SetTokenInfo'
    tokenAddress: c.Address
    tokenInfo: TokenRegistry_TokenInfo
    isNewEntry: boolean
}

export const TokenAdminRegistry_SetTokenInfo = {
    PREFIX: 0xe34153dd,

    create(args: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }): TokenAdminRegistry_SetTokenInfo {
        return {
            $: 'TokenAdminRegistry_SetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_SetTokenInfo {
        loadAndCheckPrefix32(s, 0xe34153dd, 'TokenAdminRegistry_SetTokenInfo');
        return {
            $: 'TokenAdminRegistry_SetTokenInfo',
            tokenAddress: s.loadAddress(),
            tokenInfo: TokenRegistry_TokenInfo.fromSlice(s),
            isNewEntry: s.loadBoolean(),
        }
    },
    store(self: TokenAdminRegistry_SetTokenInfo, b: c.Builder): void {
        b.storeUint(0xe34153dd, 32);
        b.storeAddress(self.tokenAddress);
        TokenRegistry_TokenInfo.store(self.tokenInfo, b);
        b.storeBit(self.isNewEntry);
    },
    toCell(self: TokenAdminRegistry_SetTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistry_SetTokenInfo>(self, TokenAdminRegistry_SetTokenInfo.store);
    }
}

/**
 > struct TokenAdminRegistry_Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     entryDeployment: TokenAdminRegistry_EntryDeployment
 > }
 */
export interface TokenAdminRegistry_Storage {
    readonly $: 'TokenAdminRegistry_Storage'
    id: uint32
    ownable: Ownable2Step
    entryDeployment: TokenAdminRegistry_EntryDeployment
}

export const TokenAdminRegistry_Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        entryDeployment: TokenAdminRegistry_EntryDeployment
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
            entryDeployment: TokenAdminRegistry_EntryDeployment.fromSlice(s),
        }
    },
    store(self: TokenAdminRegistry_Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        TokenAdminRegistry_EntryDeployment.store(self.entryDeployment, b);
    },
    toCell(self: TokenAdminRegistry_Storage): c.Cell {
        return makeCellFrom<TokenAdminRegistry_Storage>(self, TokenAdminRegistry_Storage.store);
    }
}

/**
 > struct TokenAdminRegistry_EntryDeployment {
 >     deployableCode: cell
 >     entryCode: cell
 > }
 */
export interface TokenAdminRegistry_EntryDeployment {
    readonly $: 'TokenAdminRegistry_EntryDeployment'
    deployableCode: c.Cell
    entryCode: c.Cell
}

export const TokenAdminRegistry_EntryDeployment = {
    create(args: {
        deployableCode: c.Cell
        entryCode: c.Cell
    }): TokenAdminRegistry_EntryDeployment {
        return {
            $: 'TokenAdminRegistry_EntryDeployment',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistry_EntryDeployment {
        return {
            $: 'TokenAdminRegistry_EntryDeployment',
            deployableCode: s.loadRef(),
            entryCode: s.loadRef(),
        }
    },
    store(self: TokenAdminRegistry_EntryDeployment, b: c.Builder): void {
        b.storeRef(self.deployableCode);
        b.storeRef(self.entryCode);
    },
    toCell(self: TokenAdminRegistry_EntryDeployment): c.Cell {
        return makeCellFrom<TokenAdminRegistry_EntryDeployment>(self, TokenAdminRegistry_EntryDeployment.store);
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
 > struct (0xba466447) Deployable_Initialize {
 >     stateInit: ContractState
 > }
 */
export interface Deployable_Initialize {
    readonly $: 'Deployable_Initialize'
    stateInit: ContractState
}

export const Deployable_Initialize = {
    PREFIX: 0xba466447,

    create(args: {
        stateInit: ContractState
    }): Deployable_Initialize {
        return {
            $: 'Deployable_Initialize',
            ...args
        }
    },
    fromSlice(s: c.Slice): Deployable_Initialize {
        loadAndCheckPrefix32(s, 0xba466447, 'Deployable_Initialize');
        return {
            $: 'Deployable_Initialize',
            stateInit: ContractState.fromSlice(s),
        }
    },
    store(self: Deployable_Initialize, b: c.Builder): void {
        b.storeUint(0xba466447, 32);
        ContractState.store(self.stateInit, b);
    },
    toCell(self: Deployable_Initialize): c.Cell {
        return makeCellFrom<Deployable_Initialize>(self, Deployable_Initialize.store);
    }
}

/**
 > struct (0xd24387a4) TokenRegistry_SetTokenInfo {
 >     info: TokenRegistry_TokenInfo
 > }
 */
export interface TokenRegistry_SetTokenInfo {
    readonly $: 'TokenRegistry_SetTokenInfo'
    info: TokenRegistry_TokenInfo
}

export const TokenRegistry_SetTokenInfo = {
    PREFIX: 0xd24387a4,

    create(args: {
        info: TokenRegistry_TokenInfo
    }): TokenRegistry_SetTokenInfo {
        return {
            $: 'TokenRegistry_SetTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_SetTokenInfo {
        loadAndCheckPrefix32(s, 0xd24387a4, 'TokenRegistry_SetTokenInfo');
        return {
            $: 'TokenRegistry_SetTokenInfo',
            info: TokenRegistry_TokenInfo.fromSlice(s),
        }
    },
    store(self: TokenRegistry_SetTokenInfo, b: c.Builder): void {
        b.storeUint(0xd24387a4, 32);
        TokenRegistry_TokenInfo.store(self.info, b);
    },
    toCell(self: TokenRegistry_SetTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_SetTokenInfo>(self, TokenRegistry_SetTokenInfo.store);
    }
}

/**
 > struct TokenRegistry_TokenInfo {
 >     tokenPool: address
 >     minterAddress: address
 >     enabled: bool
 > }
 */
export interface TokenRegistry_TokenInfo {
    readonly $: 'TokenRegistry_TokenInfo'
    tokenPool: c.Address
    minterAddress: c.Address
    enabled: boolean
}

export const TokenRegistry_TokenInfo = {
    create(args: {
        tokenPool: c.Address
        minterAddress: c.Address
        enabled: boolean
    }): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_TokenInfo {
        return {
            $: 'TokenRegistry_TokenInfo',
            tokenPool: s.loadAddress(),
            minterAddress: s.loadAddress(),
            enabled: s.loadBoolean(),
        }
    },
    store(self: TokenRegistry_TokenInfo, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.minterAddress);
        b.storeBit(self.enabled);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECCQEAAhEAART/APSkE/S88sgLAQIBYgIDAgLPBAUAZaAivxoTNjS3NZcxtDC0txc6N7cXMbG0uBcqN7WytyCyNrS3KTKztLm6OTzBFqYlxsXGEQHZPiR8kAg1ywh9gSkzI4qMe1E0NYf+kj6UDD4koIAwohRE8cF8vQD1NdMA8jOEvpSE/pUEszMye1U4NcsJxoKnuzjAjDtRNDWH/pI+lD4kkMwJfABnjQCyM4S+lIS+lTOye1U4F8EhA8BxwDy9IAYBqTtou371ywnkNvtDI5E1ywnzxTyVJRbcNsx4YIAwoojbrPy9CGCAMKKBMcFE/L0IG0D1ws/iwIByMs/FfpSEvpSycjPhyAUznHPC2ETzMlw+wDjDX+AIAe4x7UTQ0x8x+kj6UDHU10z4koIAwogExwUT8vQC+kj6SPpI0gDXCgD4KMj6Us+QAAAADlJQ+lLJAZI0NOMNggjk4cDIz5NJDh6SE/pS+lITygDJyM+JCAFTJMjPhNDMzPkWzwv/UAP6AoEAjc8LcBPMEszMyXD7AAcAmIII5OHABcj6UlJA+lJSMPpSIs8KAMnIz5LpGZEeF8wWzMnIz4kIAVNnyM+E0MzM+RbPC/9QBfoCgQCNzwtwJs8UJc8UFMzJcPsAECMAZmwS0z/6SDCCAMKIUTTHBRPy9IIAwolTI8cFs/L0IYsCyM+HIM5wzwthEss/EvpSyXD7AA==');

    static Errors = {
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
        'Ownable2Step_Error.CannotTransferToSelf': 49801,
        'Ownable2Step_Error.MustBeProposedOwner': 49802,
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
        entryDeployment: TokenAdminRegistry_EntryDeployment
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistry.CodeCell,
            data: TokenAdminRegistry_Storage.toCell(TokenAdminRegistry_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistry(address, initialState);
    }

    static createCellOfTokenAdminRegistrySetEntryDeployment(body: {
        entryDeployment: TokenAdminRegistry_EntryDeployment
    }) {
        return TokenAdminRegistry_SetEntryDeployment.toCell(TokenAdminRegistry_SetEntryDeployment.create(body));
    }

    static createCellOfTokenAdminRegistrySetTokenInfo(body: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }) {
        return TokenAdminRegistry_SetTokenInfo.toCell(TokenAdminRegistry_SetTokenInfo.create(body));
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

    async sendTokenAdminRegistrySetEntryDeployment(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        entryDeployment: TokenAdminRegistry_EntryDeployment
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_SetEntryDeployment.toCell(TokenAdminRegistry_SetEntryDeployment.create(body)),
            ...extraOptions
        });
    }

    async sendTokenAdminRegistrySetTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        tokenAddress: c.Address
        tokenInfo: TokenRegistry_TokenInfo
        isNewEntry: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistry_SetTokenInfo.toCell(TokenAdminRegistry_SetTokenInfo.create(body)),
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
