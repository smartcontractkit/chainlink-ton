// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a CCIPSendExecutor contract in Tolk.
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

function lookupPrefixAndEat(s: c.Slice, expected: number, prefixLen: number): boolean {
    if (lookupPrefix(s, expected, prefixLen)) {
        s.skip(prefixLen);
        return true;
    }
    return false;
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
}

// ————————————————————————————————————————————
//   custom packToBuilder and unpackFromSlice
//

type CustomPackToBuilderFn<T> = (self: T, b: c.Builder) => void
type CustomUnpackFromSliceFn<T> = (s: c.Slice) => T

let customSerializersRegistry: Map<string, [CustomPackToBuilderFn<any> | null, CustomUnpackFromSliceFn<any> | null]> = new Map;

function ensureCustomSerializerRegistered(typeName: string) {
    if (!customSerializersRegistry.has(typeName)) {
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'CCIPSendExecutor.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > CCIPSendExecutor.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
    }
}

function invokeCustomPackToBuilder<T>(typeName: string, self: T, b: c.Builder) {
    ensureCustomSerializerRegistered(typeName);
    customSerializersRegistry.get(typeName)![0]!(self, b);
}

function invokeCustomUnpackFromSlice<T>(typeName: string, s: c.Slice): T {
    ensureCustomSerializerRegistered(typeName);
    return customSerializersRegistry.get(typeName)![1]!(s);
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint96 = bigint
type uint224 = bigint
type uint256 = bigint

/**
 > enum Utils_Error { 2 variants }
 */
export type Utils_Error = bigint

export const Utils_Error = {
    InvalidData: 13500n,
    BitmapOutOfBounds: 13501n,

    fromSlice(s: c.Slice): Utils_Error {
        return s.loadUintBig(14);
    },
    store(self: Utils_Error, b: c.Builder): void {
        b.storeUint(self, 14);
    },
    toCell(self: Utils_Error): c.Cell {
        return makeCellFrom<Utils_Error>(self, Utils_Error.store);
    }
}

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = T[]

function storeSnakedCellOf<T>(v: SnakedCell<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v.length === 0) {
        b.storeRef(c.Cell.EMPTY);
        return;
    }
    const cells: c.Builder[] = [];
    let builder = c.beginCell();
    for (const value of v) {
        let itemB = c.beginCell();
        storeFn_T(value, itemB);
        if (builder.availableBits < itemB.bits || builder.availableRefs <= 1) {
            cells.push(builder);
            builder = c.beginCell();
        }
        builder.storeBuilder(itemB);
    }
    cells.push(builder);
    let current = cells[cells.length - 1].endCell();
    for (let i = cells.length - 2; i >= 0; i--) {
        cells[i].storeRef(current);
        current = cells[i].endCell();
    }
    b.storeRef(current);
}

function loadSnakedCellOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): SnakedCell<T> {
    let outArr = [] as T[];
    let head = s.loadRef().beginParse();
    while (head.remainingBits > 0 || head.remainingRefs > 0) {
        if (head.remainingBits > 0) {
            outArr.push(loadFn_T(head));
        }
        if (head.remainingRefs > 0) {
            head = head.loadRef().beginParse();
        } else {
            break;
        }
    }
    return outArr;
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
 > struct (0xfa7da444) TokenPool_LockOrBurn {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     replyTo: address?
 > }
 */
export interface TokenPool_LockOrBurn {
    readonly $: 'TokenPool_LockOrBurn'
    queryId: uint64
    request: TokenPool_LockOrBurnInV1
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address | null
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId?: uint64
        request: TokenPool_LockOrBurnInV1
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }): TokenPool_LockOrBurn {
        return {
            $: 'TokenPool_LockOrBurn',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurn {
        loadAndCheckPrefix32(s, 0xfa7da444, 'TokenPool_LockOrBurn');
        return {
            $: 'TokenPool_LockOrBurn',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            tokenArgs: s.loadBoolean() ? s.loadRef() : null,
            replyTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_LockOrBurn, b: c.Builder): void {
        b.storeUint(0xfa7da444, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeTolkNullable<c.Cell>(self.tokenArgs, b,
            (v,b) => b.storeRef(v)
        );
        b.storeAddress(self.replyTo);
    },
    toCell(self: TokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurn>(self, TokenPool_LockOrBurn.store);
    }
}

/**
 > struct TokenPool_LockOrBurnForwardPayload {
 >     originalSender: address
 >     requestMsg: Cell<TokenPool_LockOrBurn>
 >     prepared: Cell<TokenPool_LockOrBurnPrepared>
 > }
 */
export interface TokenPool_LockOrBurnForwardPayload {
    readonly $: 'TokenPool_LockOrBurnForwardPayload'
    originalSender: c.Address
    requestMsg: TokenPool_LockOrBurn
    prepared: TokenPool_LockOrBurnPrepared
}

export const TokenPool_LockOrBurnForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: TokenPool_LockOrBurn
        prepared: TokenPool_LockOrBurnPrepared
    }): TokenPool_LockOrBurnForwardPayload {
        return {
            $: 'TokenPool_LockOrBurnForwardPayload',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnForwardPayload {
        return {
            $: 'TokenPool_LockOrBurnForwardPayload',
            originalSender: s.loadAddress(),
            requestMsg: loadCellRef<TokenPool_LockOrBurn>(s, TokenPool_LockOrBurn.fromSlice),
            prepared: loadCellRef<TokenPool_LockOrBurnPrepared>(s, TokenPool_LockOrBurnPrepared.fromSlice),
        }
    },
    store(self: TokenPool_LockOrBurnForwardPayload, b: c.Builder): void {
        b.storeAddress(self.originalSender);
        storeCellRef<TokenPool_LockOrBurn>(self.requestMsg, b, TokenPool_LockOrBurn.store);
        storeCellRef<TokenPool_LockOrBurnPrepared>(self.prepared, b, TokenPool_LockOrBurnPrepared.store);
    },
    toCell(self: TokenPool_LockOrBurnForwardPayload): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnForwardPayload>(self, TokenPool_LockOrBurnForwardPayload.store);
    }
}

/**
 > struct (0xe7a35041) TokenPool_LockOrBurnWithdraw {
 >     queryId: uint64
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 > }
 */
export interface TokenPool_LockOrBurnWithdraw {
    readonly $: 'TokenPool_LockOrBurnWithdraw'
    queryId: uint64
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const TokenPool_LockOrBurnWithdraw = {
    PREFIX: 0xe7a35041,

    create(args: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_LockOrBurnWithdraw {
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnWithdraw {
        loadAndCheckPrefix32(s, 0xe7a35041, 'TokenPool_LockOrBurnWithdraw');
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            queryId: s.loadUintBig(64),
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnWithdraw, b: c.Builder): void {
        b.storeUint(0xe7a35041, 32);
        b.storeUint(self.queryId, 64);
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
    },
    toCell(self: TokenPool_LockOrBurnWithdraw): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnWithdraw>(self, TokenPool_LockOrBurnWithdraw.store);
    }
}

/**
 > struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: coins
 > }
 */
export interface TokenPool_LockOrBurnFinished {
    readonly $: 'TokenPool_LockOrBurnFinished'
    queryId: uint64
    out: TokenPool_LockOrBurnOutV1
    destTokenAmount: coins
}

export const TokenPool_LockOrBurnFinished = {
    PREFIX: 0xf432a4e3,

    create(args: {
        queryId?: uint64
        out: TokenPool_LockOrBurnOutV1
        destTokenAmount: coins
    }): TokenPool_LockOrBurnFinished {
        return {
            $: 'TokenPool_LockOrBurnFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFinished {
        loadAndCheckPrefix32(s, 0xf432a4e3, 'TokenPool_LockOrBurnFinished');
        return {
            $: 'TokenPool_LockOrBurnFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadCoins(),
        }
    },
    store(self: TokenPool_LockOrBurnFinished, b: c.Builder): void {
        b.storeUint(0xf432a4e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeCoins(self.destTokenAmount);
    },
    toCell(self: TokenPool_LockOrBurnFinished): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFinished>(self, TokenPool_LockOrBurnFinished.store);
    }
}

/**
 > struct TokenPool_LockOrBurnPrepared {
 >     feeAmount: coins
 >     destTokenAmount: coins
 >     out: TokenPool_LockOrBurnOutV1
 > }
 */
export interface TokenPool_LockOrBurnPrepared {
    readonly $: 'TokenPool_LockOrBurnPrepared'
    feeAmount: coins
    destTokenAmount: coins
    out: TokenPool_LockOrBurnOutV1
}

export const TokenPool_LockOrBurnPrepared = {
    create(args: {
        feeAmount: coins
        destTokenAmount: coins
        out: TokenPool_LockOrBurnOutV1
    }): TokenPool_LockOrBurnPrepared {
        return {
            $: 'TokenPool_LockOrBurnPrepared',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnPrepared {
        return {
            $: 'TokenPool_LockOrBurnPrepared',
            feeAmount: s.loadCoins(),
            destTokenAmount: s.loadCoins(),
            out: TokenPool_LockOrBurnOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnPrepared, b: c.Builder): void {
        b.storeCoins(self.feeAmount);
        b.storeCoins(self.destTokenAmount);
        TokenPool_LockOrBurnOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_LockOrBurnPrepared): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnPrepared>(self, TokenPool_LockOrBurnPrepared.store);
    }
}

/**
 > struct TokenPool_Transfer<S, R, C> {
 >     id: uint256
 >     details: Cell<TokenPool_TransferDetails<S, R, C>>
 > }
 */
export interface TokenPool_Transfer<S, R, C> {
    readonly $: 'TokenPool_Transfer'
    id: uint256
    details: TokenPool_TransferDetails<S, R, C>
}

export const TokenPool_Transfer = {
    create<S, R, C>(args: {
        id: uint256
        details: TokenPool_TransferDetails<S, R, C>
    }): TokenPool_Transfer<S, R, C> {
        return {
            $: 'TokenPool_Transfer',
            ...args
        }
    },
}

/**
 > struct TokenPool_TransferDetails<S, R, C> {
 >     receiver: R
 >     remoteChainSelector: uint64
 >     originalSender: S
 >     amount: C
 >     localToken: address
 > }
 */
export interface TokenPool_TransferDetails<S, R, C> {
    readonly $: 'TokenPool_TransferDetails'
    receiver: R
    remoteChainSelector: uint64
    originalSender: S
    amount: C
    localToken: c.Address
}

export const TokenPool_TransferDetails = {
    create<S, R, C>(args: {
        receiver: R
        remoteChainSelector: uint64
        originalSender: S
        amount: C
        localToken: c.Address
    }): TokenPool_TransferDetails<S, R, C> {
        return {
            $: 'TokenPool_TransferDetails',
            ...args
        }
    },
}

/**
 > type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<address, Cell<CrossChainAddress>, coins>
 */
export type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<c.Address, CrossChainAddress, coins>

export const TokenPool_LockOrBurnTransfer = {
    fromSlice(s: c.Slice): TokenPool_LockOrBurnTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<c.Address, CrossChainAddress, coins>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: s.loadAddress(),
                            amount: s.loadCoins(),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_LockOrBurnTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<c.Address, CrossChainAddress, coins>>(self.details, b,
            (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
            b.storeUint(v.remoteChainSelector, 64);
            b.storeAddress(v.originalSender);
            b.storeCoins(v.amount);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_LockOrBurnTransfer): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnTransfer>(self, TokenPool_LockOrBurnTransfer.store);
    }
}

/**
 > struct TokenPool_LockOrBurnInV1 {
 >     transfer: TokenPool_LockOrBurnTransfer
 > }
 */
export interface TokenPool_LockOrBurnInV1 {
    readonly $: 'TokenPool_LockOrBurnInV1'
    transfer: TokenPool_LockOrBurnTransfer
}

export const TokenPool_LockOrBurnInV1 = {
    create(args: {
        transfer: TokenPool_LockOrBurnTransfer
    }): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            transfer: TokenPool_LockOrBurnTransfer.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnInV1, b: c.Builder): void {
        TokenPool_LockOrBurnTransfer.store(self.transfer, b);
    },
    toCell(self: TokenPool_LockOrBurnInV1): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnInV1>(self, TokenPool_LockOrBurnInV1.store);
    }
}

/**
 > struct TokenPool_LockOrBurnOutV1 {
 >     destTokenAddress: Cell<CrossChainAddress>
 >     destPoolData: cell
 > }
 */
export interface TokenPool_LockOrBurnOutV1 {
    readonly $: 'TokenPool_LockOrBurnOutV1'
    destTokenAddress: CrossChainAddress
    destPoolData: c.Cell
}

export const TokenPool_LockOrBurnOutV1 = {
    create(args: {
        destTokenAddress: CrossChainAddress
        destPoolData: c.Cell
    }): TokenPool_LockOrBurnOutV1 {
        return {
            $: 'TokenPool_LockOrBurnOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnOutV1 {
        return {
            $: 'TokenPool_LockOrBurnOutV1',
            destTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            destPoolData: s.loadRef(),
        }
    },
    store(self: TokenPool_LockOrBurnOutV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.destTokenAddress, b, CrossChainAddress.store);
        b.storeRef(self.destPoolData);
    },
    toCell(self: TokenPool_LockOrBurnOutV1): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnOutV1>(self, TokenPool_LockOrBurnOutV1.store);
    }
}

/**
 > struct (0xdd5d5127) TokenRegistry_GetTokenInfo {
 > }
 */
export interface TokenRegistry_GetTokenInfo {
    readonly $: 'TokenRegistry_GetTokenInfo'
}

export const TokenRegistry_GetTokenInfo = {
    PREFIX: 0xdd5d5127,

    create(): TokenRegistry_GetTokenInfo {
        return {
            $: 'TokenRegistry_GetTokenInfo',
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_GetTokenInfo {
        loadAndCheckPrefix32(s, 0xdd5d5127, 'TokenRegistry_GetTokenInfo');
        return {
            $: 'TokenRegistry_GetTokenInfo',
        }
    },
    store(self: TokenRegistry_GetTokenInfo, b: c.Builder): void {
        b.storeUint(0xdd5d5127, 32);
    },
    toCell(self: TokenRegistry_GetTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_GetTokenInfo>(self, TokenRegistry_GetTokenInfo.store);
    }
}

/**
 > struct (0xddccddb5) TokenRegistry_ReturnTokenInfo {
 >     minterAddress: address
 >     tokenPool: address?
 > }
 */
export interface TokenRegistry_ReturnTokenInfo {
    readonly $: 'TokenRegistry_ReturnTokenInfo'
    minterAddress: c.Address
    tokenPool: c.Address | null
}

export const TokenRegistry_ReturnTokenInfo = {
    PREFIX: 0xddccddb5,

    create(args: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }): TokenRegistry_ReturnTokenInfo {
        return {
            $: 'TokenRegistry_ReturnTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenRegistry_ReturnTokenInfo {
        loadAndCheckPrefix32(s, 0xddccddb5, 'TokenRegistry_ReturnTokenInfo');
        return {
            $: 'TokenRegistry_ReturnTokenInfo',
            minterAddress: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenRegistry_ReturnTokenInfo, b: c.Builder): void {
        b.storeUint(0xddccddb5, 32);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenRegistry_ReturnTokenInfo): c.Cell {
        return makeCellFrom<TokenRegistry_ReturnTokenInfo>(self, TokenRegistry_ReturnTokenInfo.store);
    }
}

/**
 > struct (0x7496ff56) FeeQuoter_GetValidatedFee<T> {
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_GetValidatedFee<T> {
    readonly $: 'FeeQuoter_GetValidatedFee'
    msg: Router_CCIPSend
    context: T
}

export const FeeQuoter_GetValidatedFee = {
    PREFIX: 0x7496ff56,

    create<T>(args: {
        msg: Router_CCIPSend
        context: T
    }): FeeQuoter_GetValidatedFee<T> {
        return {
            $: 'FeeQuoter_GetValidatedFee',
            ...args
        }
    },
}

/**
 > struct (0x1fa60374) FeeQuoter_MessageValidated<T> {
 >     fee: Fee
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_MessageValidated<T> {
    readonly $: 'FeeQuoter_MessageValidated'
    fee: Fee
    msg: Router_CCIPSend
    context: T
}

export const FeeQuoter_MessageValidated = {
    PREFIX: 0x1fa60374,

    create<T>(args: {
        fee: Fee
        msg: Router_CCIPSend
        context: T
    }): FeeQuoter_MessageValidated<T> {
        return {
            $: 'FeeQuoter_MessageValidated',
            ...args
        }
    },
}

/**
 > struct (0xbcf0ab0f) FeeQuoter_MessageValidationFailed<T> {
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_MessageValidationFailed<T> {
    readonly $: 'FeeQuoter_MessageValidationFailed'
    error: uint256
    msg: Router_CCIPSend
    context: T
}

export const FeeQuoter_MessageValidationFailed = {
    PREFIX: 0xbcf0ab0f,

    create<T>(args: {
        error: uint256
        msg: Router_CCIPSend
        context: T
    }): FeeQuoter_MessageValidationFailed<T> {
        return {
            $: 'FeeQuoter_MessageValidationFailed',
            ...args
        }
    },
}

/**
 > struct Fee {
 >     feeTokenAmount: coins
 >     feeValueJuels: uint96
 > }
 */
export interface Fee {
    readonly $: 'Fee'
    feeTokenAmount: coins
    feeValueJuels: uint96
}

export const Fee = {
    create(args: {
        feeTokenAmount: coins
        feeValueJuels: uint96
    }): Fee {
        return {
            $: 'Fee',
            ...args
        }
    },
    fromSlice(s: c.Slice): Fee {
        return {
            $: 'Fee',
            feeTokenAmount: s.loadCoins(),
            feeValueJuels: s.loadUintBig(96),
        }
    },
    store(self: Fee, b: c.Builder): void {
        b.storeCoins(self.feeTokenAmount);
        b.storeUint(self.feeValueJuels, 96);
    },
    toCell(self: Fee): c.Cell {
        return makeCellFrom<Fee>(self, Fee.store);
    }
}

/**
 > struct (0xdcf993c2) OnRamp_Send {
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 >     tokenRegistry: address?
 > }
 */
export interface OnRamp_Send {
    readonly $: 'OnRamp_Send'
    msg: Router_CCIPSend
    metadata: Metadata
    tokenRegistry: c.Address | null /* = null */
}

export const OnRamp_Send = {
    PREFIX: 0xdcf993c2,

    create(args: {
        msg: Router_CCIPSend
        metadata: Metadata
        tokenRegistry?: c.Address | null /* = null */
    }): OnRamp_Send {
        return {
            $: 'OnRamp_Send',
            tokenRegistry: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_Send {
        loadAndCheckPrefix32(s, 0xdcf993c2, 'OnRamp_Send');
        return {
            $: 'OnRamp_Send',
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
            tokenRegistry: s.loadMaybeAddress(),
        }
    },
    store(self: OnRamp_Send, b: c.Builder): void {
        b.storeUint(0xdcf993c2, 32);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
        b.storeAddress(self.tokenRegistry);
    },
    toCell(self: OnRamp_Send): c.Cell {
        return makeCellFrom<OnRamp_Send>(self, OnRamp_Send.store);
    }
}

/**
 > struct (0x9be1fb61) OnRamp_ExecutorRequestsLockOrBurn {
 >     queryID: uint64
 >     tokenAmount: Cell<TokenAmount>
 >     tokenPool: address
 >     destChainSelector: uint64
 >     executorID: CCIPSendExecutor_ID
 >     receiver: Cell<CrossChainAddress>
 >     originalSender: address
 > }
 */
export interface OnRamp_ExecutorRequestsLockOrBurn {
    readonly $: 'OnRamp_ExecutorRequestsLockOrBurn'
    queryID: uint64
    tokenAmount: TokenAmount
    tokenPool: c.Address
    destChainSelector: uint64
    executorID: CCIPSendExecutor_ID
    receiver: CrossChainAddress
    originalSender: c.Address
}

export const OnRamp_ExecutorRequestsLockOrBurn = {
    PREFIX: 0x9be1fb61,

    create(args: {
        queryID?: uint64
        tokenAmount: TokenAmount
        tokenPool: c.Address
        destChainSelector: uint64
        executorID: CCIPSendExecutor_ID
        receiver: CrossChainAddress
        originalSender: c.Address
    }): OnRamp_ExecutorRequestsLockOrBurn {
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorRequestsLockOrBurn {
        loadAndCheckPrefix32(s, 0x9be1fb61, 'OnRamp_ExecutorRequestsLockOrBurn');
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            queryID: s.loadUintBig(64),
            tokenAmount: loadCellRef<TokenAmount>(s, TokenAmount.fromSlice),
            tokenPool: s.loadAddress(),
            destChainSelector: s.loadUintBig(64),
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            originalSender: s.loadAddress(),
        }
    },
    store(self: OnRamp_ExecutorRequestsLockOrBurn, b: c.Builder): void {
        b.storeUint(0x9be1fb61, 32);
        b.storeUint(self.queryID, 64);
        storeCellRef<TokenAmount>(self.tokenAmount, b, TokenAmount.store);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.destChainSelector, 64);
        CCIPSendExecutor_ID.store(self.executorID, b);
        storeCellRef<CrossChainAddress>(self.receiver, b, CrossChainAddress.store);
        b.storeAddress(self.originalSender);
    },
    toCell(self: OnRamp_ExecutorRequestsLockOrBurn): c.Cell {
        return makeCellFrom<OnRamp_ExecutorRequestsLockOrBurn>(self, OnRamp_ExecutorRequestsLockOrBurn.store);
    }
}

/**
 > struct (0x05e47a89) OnRamp_ExecutorRequestsWithdraw {
 >     queryID: uint64
 >     executorID: CCIPSendExecutor_ID
 >     destChainSelector: uint64
 >     withdrawRequest: Cell<Router_WithdrawRequest>
 > }
 */
export interface OnRamp_ExecutorRequestsWithdraw {
    readonly $: 'OnRamp_ExecutorRequestsWithdraw'
    queryID: uint64
    executorID: CCIPSendExecutor_ID
    destChainSelector: uint64
    withdrawRequest: Router_WithdrawRequest
}

export const OnRamp_ExecutorRequestsWithdraw = {
    PREFIX: 0x05e47a89,

    create(args: {
        queryID?: uint64
        executorID: CCIPSendExecutor_ID
        destChainSelector: uint64
        withdrawRequest: Router_WithdrawRequest
    }): OnRamp_ExecutorRequestsWithdraw {
        return {
            $: 'OnRamp_ExecutorRequestsWithdraw',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorRequestsWithdraw {
        loadAndCheckPrefix32(s, 0x05e47a89, 'OnRamp_ExecutorRequestsWithdraw');
        return {
            $: 'OnRamp_ExecutorRequestsWithdraw',
            queryID: s.loadUintBig(64),
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            destChainSelector: s.loadUintBig(64),
            withdrawRequest: loadCellRef<Router_WithdrawRequest>(s, Router_WithdrawRequest.fromSlice),
        }
    },
    store(self: OnRamp_ExecutorRequestsWithdraw, b: c.Builder): void {
        b.storeUint(0x05e47a89, 32);
        b.storeUint(self.queryID, 64);
        CCIPSendExecutor_ID.store(self.executorID, b);
        b.storeUint(self.destChainSelector, 64);
        storeCellRef<Router_WithdrawRequest>(self.withdrawRequest, b, Router_WithdrawRequest.store);
    },
    toCell(self: OnRamp_ExecutorRequestsWithdraw): c.Cell {
        return makeCellFrom<OnRamp_ExecutorRequestsWithdraw>(self, OnRamp_ExecutorRequestsWithdraw.store);
    }
}

/**
 > struct (0xcfa6b336) OnRamp_ExecutorFinishedSuccessfully {
 >     executorID: CCIPSendExecutor_ID
 >     fee: Fee
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 >     tokenTransfer: Cell<OnRamp_ExecutorTokenTransfer>
 > }
 */
export interface OnRamp_ExecutorFinishedSuccessfully {
    readonly $: 'OnRamp_ExecutorFinishedSuccessfully'
    executorID: CCIPSendExecutor_ID
    fee: Fee
    msg: Router_CCIPSend
    metadata: Metadata
    tokenTransfer: OnRamp_ExecutorTokenTransfer
}

export const OnRamp_ExecutorFinishedSuccessfully = {
    PREFIX: 0xcfa6b336,

    create(args: {
        executorID: CCIPSendExecutor_ID
        fee: Fee
        msg: Router_CCIPSend
        metadata: Metadata
        tokenTransfer: OnRamp_ExecutorTokenTransfer
    }): OnRamp_ExecutorFinishedSuccessfully {
        return {
            $: 'OnRamp_ExecutorFinishedSuccessfully',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorFinishedSuccessfully {
        loadAndCheckPrefix32(s, 0xcfa6b336, 'OnRamp_ExecutorFinishedSuccessfully');
        return {
            $: 'OnRamp_ExecutorFinishedSuccessfully',
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            fee: Fee.fromSlice(s),
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
            tokenTransfer: loadCellRef<OnRamp_ExecutorTokenTransfer>(s, OnRamp_ExecutorTokenTransfer.fromSlice),
        }
    },
    store(self: OnRamp_ExecutorFinishedSuccessfully, b: c.Builder): void {
        b.storeUint(0xcfa6b336, 32);
        CCIPSendExecutor_ID.store(self.executorID, b);
        Fee.store(self.fee, b);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
        storeCellRef<OnRamp_ExecutorTokenTransfer>(self.tokenTransfer, b, OnRamp_ExecutorTokenTransfer.store);
    },
    toCell(self: OnRamp_ExecutorFinishedSuccessfully): c.Cell {
        return makeCellFrom<OnRamp_ExecutorFinishedSuccessfully>(self, OnRamp_ExecutorFinishedSuccessfully.store);
    }
}

/**
 > struct (0xc4068e21) OnRamp_ExecutorFinishedWithError {
 >     executorID: CCIPSendExecutor_ID
 >     error: uint256
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 > }
 */
export interface OnRamp_ExecutorFinishedWithError {
    readonly $: 'OnRamp_ExecutorFinishedWithError'
    executorID: CCIPSendExecutor_ID
    error: uint256
    msg: Router_CCIPSend
    metadata: Metadata
}

export const OnRamp_ExecutorFinishedWithError = {
    PREFIX: 0xc4068e21,

    create(args: {
        executorID: CCIPSendExecutor_ID
        error: uint256
        msg: Router_CCIPSend
        metadata: Metadata
    }): OnRamp_ExecutorFinishedWithError {
        return {
            $: 'OnRamp_ExecutorFinishedWithError',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorFinishedWithError {
        loadAndCheckPrefix32(s, 0xc4068e21, 'OnRamp_ExecutorFinishedWithError');
        return {
            $: 'OnRamp_ExecutorFinishedWithError',
            executorID: CCIPSendExecutor_ID.fromSlice(s),
            error: s.loadUintBig(256),
            msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
            metadata: Metadata.fromSlice(s),
        }
    },
    store(self: OnRamp_ExecutorFinishedWithError, b: c.Builder): void {
        b.storeUint(0xc4068e21, 32);
        CCIPSendExecutor_ID.store(self.executorID, b);
        b.storeUint(self.error, 256);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
    },
    toCell(self: OnRamp_ExecutorFinishedWithError): c.Cell {
        return makeCellFrom<OnRamp_ExecutorFinishedWithError>(self, OnRamp_ExecutorFinishedWithError.store);
    }
}

/**
 > struct Metadata {
 >     sender: address
 >     value: coins
 > }
 */
export interface Metadata {
    readonly $: 'Metadata'
    sender: c.Address
    value: coins
}

export const Metadata = {
    create(args: {
        sender: c.Address
        value: coins
    }): Metadata {
        return {
            $: 'Metadata',
            ...args
        }
    },
    fromSlice(s: c.Slice): Metadata {
        return {
            $: 'Metadata',
            sender: s.loadAddress(),
            value: s.loadCoins(),
        }
    },
    store(self: Metadata, b: c.Builder): void {
        b.storeAddress(self.sender);
        b.storeCoins(self.value);
    },
    toCell(self: Metadata): c.Cell {
        return makeCellFrom<Metadata>(self, Metadata.store);
    }
}

/**
 > struct OnRamp_ExecutorTokenTransfer {
 >     sourcePoolAddress: address
 >     amount: uint256
 >     destTokenAddress: Cell<CrossChainAddress>
 >     extraData: cell
 >     destExecData: cell
 > }
 */
export interface OnRamp_ExecutorTokenTransfer {
    readonly $: 'OnRamp_ExecutorTokenTransfer'
    sourcePoolAddress: c.Address
    amount: uint256
    destTokenAddress: CrossChainAddress
    extraData: c.Cell
    destExecData: c.Cell
}

export const OnRamp_ExecutorTokenTransfer = {
    create(args: {
        sourcePoolAddress: c.Address
        amount: uint256
        destTokenAddress: CrossChainAddress
        extraData: c.Cell
        destExecData: c.Cell
    }): OnRamp_ExecutorTokenTransfer {
        return {
            $: 'OnRamp_ExecutorTokenTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorTokenTransfer {
        return {
            $: 'OnRamp_ExecutorTokenTransfer',
            sourcePoolAddress: s.loadAddress(),
            amount: s.loadUintBig(256),
            destTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            extraData: s.loadRef(),
            destExecData: s.loadRef(),
        }
    },
    store(self: OnRamp_ExecutorTokenTransfer, b: c.Builder): void {
        b.storeAddress(self.sourcePoolAddress);
        b.storeUint(self.amount, 256);
        storeCellRef<CrossChainAddress>(self.destTokenAddress, b, CrossChainAddress.store);
        b.storeRef(self.extraData);
        b.storeRef(self.destExecData);
    },
    toCell(self: OnRamp_ExecutorTokenTransfer): c.Cell {
        return makeCellFrom<OnRamp_ExecutorTokenTransfer>(self, OnRamp_ExecutorTokenTransfer.store);
    }
}

/**
 > struct (0x31768d95) Router_CCIPSend {
 >     queryID: uint64
 >     destChainSelector: uint64
 >     receiver: CrossChainAddress
 >     data: cell
 >     tokenAmounts: SnakedCell<TokenAmount>
 >     feeToken: address?
 >     extraArgs: Cell<ExtraArgs>
 > }
 */
export interface Router_CCIPSend {
    readonly $: 'Router_CCIPSend'
    queryID: uint64
    destChainSelector: uint64
    receiver: CrossChainAddress
    data: c.Cell
    tokenAmounts: SnakedCell<TokenAmount>
    feeToken: c.Address | null
    extraArgs: ExtraArgs
}

export const Router_CCIPSend = {
    PREFIX: 0x31768d95,

    create(args: {
        queryID?: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: ExtraArgs
    }): Router_CCIPSend {
        return {
            $: 'Router_CCIPSend',
            ...args,
            queryID: args.queryID ?? 0n
        }
    },
    fromSlice(s: c.Slice): Router_CCIPSend {
        loadAndCheckPrefix32(s, 0x31768d95, 'Router_CCIPSend');
        return {
            $: 'Router_CCIPSend',
            queryID: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            receiver: CrossChainAddress.fromSlice(s),
            data: s.loadRef(),
            tokenAmounts: loadSnakedCellOf(s, TokenAmount.fromSlice),
            feeToken: s.loadMaybeAddress(),
            extraArgs: loadCellRef<ExtraArgs>(s, ExtraArgs.fromSlice),
        }
    },
    store(self: Router_CCIPSend, b: c.Builder): void {
        b.storeUint(0x31768d95, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.destChainSelector, 64);
        CrossChainAddress.store(self.receiver, b);
        b.storeRef(self.data);
        storeSnakedCellOf(self.tokenAmounts, b, TokenAmount.store);
        b.storeAddress(self.feeToken);
        storeCellRef<ExtraArgs>(self.extraArgs, b, ExtraArgs.store);
    },
    toCell(self: Router_CCIPSend): c.Cell {
        return makeCellFrom<Router_CCIPSend>(self, Router_CCIPSend.store);
    }
}

/**
 > struct Router_WithdrawRequest {
 >     routerWalletAddress: address
 >     amount: coins
 >     tokenPool: address
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface Router_WithdrawRequest {
    readonly $: 'Router_WithdrawRequest'
    routerWalletAddress: c.Address
    amount: coins
    tokenPool: c.Address
    forwardPayload: TokenPool_LockOrBurnForwardPayload
}

export const Router_WithdrawRequest = {
    create(args: {
        routerWalletAddress: c.Address
        amount: coins
        tokenPool: c.Address
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): Router_WithdrawRequest {
        return {
            $: 'Router_WithdrawRequest',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_WithdrawRequest {
        return {
            $: 'Router_WithdrawRequest',
            routerWalletAddress: s.loadAddress(),
            amount: s.loadCoins(),
            tokenPool: s.loadAddress(),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: Router_WithdrawRequest, b: c.Builder): void {
        b.storeAddress(self.routerWalletAddress);
        b.storeCoins(self.amount);
        b.storeAddress(self.tokenPool);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: Router_WithdrawRequest): c.Cell {
        return makeCellFrom<Router_WithdrawRequest>(self, Router_WithdrawRequest.store);
    }
}

/**
 > type CrossChainAddress = slice
 */
export type CrossChainAddress = c.Slice

export const CrossChainAddress = {
    fromSlice(s: c.Slice): CrossChainAddress {
        return invokeCustomUnpackFromSlice<CrossChainAddress>('CrossChainAddress', s);
    },
    store(self: CrossChainAddress, b: c.Builder): void {
        invokeCustomPackToBuilder<CrossChainAddress>('CrossChainAddress', self, b);
    },
    toCell(self: CrossChainAddress): c.Cell {
        return makeCellFrom<CrossChainAddress>(self, CrossChainAddress.store);
    }
}

/**
 > type ExtraArgs = GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1
 */
export type ExtraArgs =
    | GenericExtraArgsV2
    | SVMExtraArgsV1
    | SuiExtraArgsV1

export const ExtraArgs = {
    fromSlice(s: c.Slice): ExtraArgs {
        return lookupPrefix(s, 0x181dcf10, 32) ? GenericExtraArgsV2.fromSlice(s) :
            lookupPrefix(s, 0x1f3b3aba, 32) ? SVMExtraArgsV1.fromSlice(s) :
            lookupPrefix(s, 0x21ea4ca9, 32) ? SuiExtraArgsV1.fromSlice(s) :
            throwNonePrefixMatch('ExtraArgs');
    },
    store(self: ExtraArgs, b: c.Builder): void {
        switch (self.$) {
            case 'GenericExtraArgsV2':
                GenericExtraArgsV2.store(self, b);
                break;
            case 'SVMExtraArgsV1':
                SVMExtraArgsV1.store(self, b);
                break;
            case 'SuiExtraArgsV1':
                SuiExtraArgsV1.store(self, b);
                break;
        }
    },
    toCell(self: ExtraArgs): c.Cell {
        return makeCellFrom<ExtraArgs>(self, ExtraArgs.store);
    }
}

/**
 > struct (0x181dcf10) GenericExtraArgsV2 {
 >     gasLimit: uint256?
 >     allowOutOfOrderExecution: bool
 > }
 */
export interface GenericExtraArgsV2 {
    readonly $: 'GenericExtraArgsV2'
    gasLimit: uint256 | null
    allowOutOfOrderExecution: boolean
}

export const GenericExtraArgsV2 = {
    PREFIX: 0x181dcf10,

    create(args: {
        gasLimit: uint256 | null
        allowOutOfOrderExecution: boolean
    }): GenericExtraArgsV2 {
        return {
            $: 'GenericExtraArgsV2',
            ...args
        }
    },
    fromSlice(s: c.Slice): GenericExtraArgsV2 {
        loadAndCheckPrefix32(s, 0x181dcf10, 'GenericExtraArgsV2');
        return {
            $: 'GenericExtraArgsV2',
            gasLimit: s.loadBoolean() ? s.loadUintBig(256) : null,
            allowOutOfOrderExecution: s.loadBoolean(),
        }
    },
    store(self: GenericExtraArgsV2, b: c.Builder): void {
        b.storeUint(0x181dcf10, 32);
        storeTolkNullable<uint256>(self.gasLimit, b,
            (v,b) => b.storeUint(v, 256)
        );
        b.storeBit(self.allowOutOfOrderExecution);
    },
    toCell(self: GenericExtraArgsV2): c.Cell {
        return makeCellFrom<GenericExtraArgsV2>(self, GenericExtraArgsV2.store);
    }
}

/**
 > struct (0x1f3b3aba) SVMExtraArgsV1 {
 >     computeUnits: uint32
 >     accountIsWritableBitmap: uint64
 >     allowOutOfOrderExecution: bool
 >     tokenReceiver: uint256
 >     accounts: SnakedCell<uint256>
 > }
 */
export interface SVMExtraArgsV1 {
    readonly $: 'SVMExtraArgsV1'
    computeUnits: uint32
    accountIsWritableBitmap: uint64
    allowOutOfOrderExecution: boolean
    tokenReceiver: uint256
    accounts: SnakedCell<uint256>
}

export const SVMExtraArgsV1 = {
    PREFIX: 0x1f3b3aba,

    create(args: {
        computeUnits: uint32
        accountIsWritableBitmap: uint64
        allowOutOfOrderExecution: boolean
        tokenReceiver: uint256
        accounts: SnakedCell<uint256>
    }): SVMExtraArgsV1 {
        return {
            $: 'SVMExtraArgsV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): SVMExtraArgsV1 {
        loadAndCheckPrefix32(s, 0x1f3b3aba, 'SVMExtraArgsV1');
        return {
            $: 'SVMExtraArgsV1',
            computeUnits: s.loadUintBig(32),
            accountIsWritableBitmap: s.loadUintBig(64),
            allowOutOfOrderExecution: s.loadBoolean(),
            tokenReceiver: s.loadUintBig(256),
            accounts: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
        }
    },
    store(self: SVMExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x1f3b3aba, 32);
        b.storeUint(self.computeUnits, 32);
        b.storeUint(self.accountIsWritableBitmap, 64);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        storeSnakedCellOf(self.accounts, b, (v, b) => b.storeUint(v, 256));
    },
    toCell(self: SVMExtraArgsV1): c.Cell {
        return makeCellFrom<SVMExtraArgsV1>(self, SVMExtraArgsV1.store);
    }
}

/**
 > struct (0x21ea4ca9) SuiExtraArgsV1 {
 >     gasLimit: uint256
 >     allowOutOfOrderExecution: bool
 >     tokenReceiver: uint256
 >     receiverObjectIds: SnakedCell<uint256>
 > }
 */
export interface SuiExtraArgsV1 {
    readonly $: 'SuiExtraArgsV1'
    gasLimit: uint256
    allowOutOfOrderExecution: boolean
    tokenReceiver: uint256
    receiverObjectIds: SnakedCell<uint256>
}

export const SuiExtraArgsV1 = {
    PREFIX: 0x21ea4ca9,

    create(args: {
        gasLimit: uint256
        allowOutOfOrderExecution: boolean
        tokenReceiver: uint256
        receiverObjectIds: SnakedCell<uint256>
    }): SuiExtraArgsV1 {
        return {
            $: 'SuiExtraArgsV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): SuiExtraArgsV1 {
        loadAndCheckPrefix32(s, 0x21ea4ca9, 'SuiExtraArgsV1');
        return {
            $: 'SuiExtraArgsV1',
            gasLimit: s.loadUintBig(256),
            allowOutOfOrderExecution: s.loadBoolean(),
            tokenReceiver: s.loadUintBig(256),
            receiverObjectIds: loadSnakedCellOf(s, (s) => s.loadUintBig(256)),
        }
    },
    store(self: SuiExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x21ea4ca9, 32);
        b.storeUint(self.gasLimit, 256);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        storeSnakedCellOf(self.receiverObjectIds, b, (v, b) => b.storeUint(v, 256));
    },
    toCell(self: SuiExtraArgsV1): c.Cell {
        return makeCellFrom<SuiExtraArgsV1>(self, SuiExtraArgsV1.store);
    }
}

/**
 > struct TokenAmount {
 >     amount: coins
 >     token: address
 > }
 */
export interface TokenAmount {
    readonly $: 'TokenAmount'
    amount: coins
    token: c.Address
}

export const TokenAmount = {
    create(args: {
        amount: coins
        token: c.Address
    }): TokenAmount {
        return {
            $: 'TokenAmount',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAmount {
        return {
            $: 'TokenAmount',
            amount: s.loadCoins(),
            token: s.loadAddress(),
        }
    },
    store(self: TokenAmount, b: c.Builder): void {
        b.storeCoins(self.amount);
        b.storeAddress(self.token);
    },
    toCell(self: TokenAmount): c.Cell {
        return makeCellFrom<TokenAmount>(self, TokenAmount.store);
    }
}

/**
 > type CCIPSendExecutor_ID = uint224
 */
export type CCIPSendExecutor_ID = uint224

export const CCIPSendExecutor_ID = {
    fromSlice(s: c.Slice): CCIPSendExecutor_ID {
        return s.loadUintBig(224);
    },
    store(self: CCIPSendExecutor_ID, b: c.Builder): void {
        b.storeUint(self, 224);
    },
    toCell(self: CCIPSendExecutor_ID): c.Cell {
        return makeCellFrom<CCIPSendExecutor_ID>(self, CCIPSendExecutor_ID.store);
    }
}

/**
 > struct CCIPSendExecutor_InitialData {
 >     onramp: address
 >     id: CCIPSendExecutor_ID
 > }
 */
export interface CCIPSendExecutor_InitialData {
    readonly $: 'CCIPSendExecutor_InitialData'
    onramp: c.Address
    id: CCIPSendExecutor_ID
}

export const CCIPSendExecutor_InitialData = {
    create(args: {
        onramp: c.Address
        id: CCIPSendExecutor_ID
    }): CCIPSendExecutor_InitialData {
        return {
            $: 'CCIPSendExecutor_InitialData',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_InitialData {
        return {
            $: 'CCIPSendExecutor_InitialData',
            onramp: s.loadAddress(),
            id: CCIPSendExecutor_ID.fromSlice(s),
        }
    },
    store(self: CCIPSendExecutor_InitialData, b: c.Builder): void {
        b.storeAddress(self.onramp);
        CCIPSendExecutor_ID.store(self.id, b);
    },
    toCell(self: CCIPSendExecutor_InitialData): c.Cell {
        return makeCellFrom<CCIPSendExecutor_InitialData>(self, CCIPSendExecutor_InitialData.store);
    }
}

/**
 > struct CCIPSendExecutor_Data {
 >     id: CCIPSendExecutor_ID
 >     onrampSend: OnRamp_Send
 >     addresses: Cell<CCIPSendExecutor_Addresses>
 >     state: CCIPSendExecutor_State
 > }
 */
export interface CCIPSendExecutor_Data {
    readonly $: 'CCIPSendExecutor_Data'
    id: CCIPSendExecutor_ID
    onrampSend: OnRamp_Send
    addresses: CCIPSendExecutor_Addresses
    state: CCIPSendExecutor_State
}

export const CCIPSendExecutor_Data = {
    create(args: {
        id: CCIPSendExecutor_ID
        onrampSend: OnRamp_Send
        addresses: CCIPSendExecutor_Addresses
        state: CCIPSendExecutor_State
    }): CCIPSendExecutor_Data {
        return {
            $: 'CCIPSendExecutor_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_Data {
        return {
            $: 'CCIPSendExecutor_Data',
            id: CCIPSendExecutor_ID.fromSlice(s),
            onrampSend: OnRamp_Send.fromSlice(s),
            addresses: loadCellRef<CCIPSendExecutor_Addresses>(s, CCIPSendExecutor_Addresses.fromSlice),
            state: CCIPSendExecutor_State.fromSlice(s),
        }
    },
    store(self: CCIPSendExecutor_Data, b: c.Builder): void {
        CCIPSendExecutor_ID.store(self.id, b);
        OnRamp_Send.store(self.onrampSend, b);
        storeCellRef<CCIPSendExecutor_Addresses>(self.addresses, b, CCIPSendExecutor_Addresses.store);
        CCIPSendExecutor_State.store(self.state, b);
    },
    toCell(self: CCIPSendExecutor_Data): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Data>(self, CCIPSendExecutor_Data.store);
    }
}

/**
 > struct CCIPSendExecutor_Addresses {
 >     onramp: address
 >     router: address
 >     feeQuoter: address
 >     tokenRegistry: Cell<address>?
 > }
 */
export interface CCIPSendExecutor_Addresses {
    readonly $: 'CCIPSendExecutor_Addresses'
    onramp: c.Address
    router: c.Address
    feeQuoter: c.Address
    tokenRegistry: c.Address | null
}

export const CCIPSendExecutor_Addresses = {
    create(args: {
        onramp: c.Address
        router: c.Address
        feeQuoter: c.Address
        tokenRegistry: c.Address | null
    }): CCIPSendExecutor_Addresses {
        return {
            $: 'CCIPSendExecutor_Addresses',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_Addresses {
        return {
            $: 'CCIPSendExecutor_Addresses',
            onramp: s.loadAddress(),
            router: s.loadAddress(),
            feeQuoter: s.loadAddress(),
            tokenRegistry: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: CCIPSendExecutor_Addresses, b: c.Builder): void {
        b.storeAddress(self.onramp);
        b.storeAddress(self.router);
        b.storeAddress(self.feeQuoter);
        storeTolkNullable<c.Address>(self.tokenRegistry, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: CCIPSendExecutor_Addresses): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Addresses>(self, CCIPSendExecutor_Addresses.store);
    }
}

/**
 > type CCIPSendExecutor_State = Cell<CCIPSendExecutor_State_Initialized> | Cell<CCIPSendExecutor_State_OnGoingFeeValidation> | Cell<CCIPSendExecutor_State_TokenRegistryAccess> | Cell<CCIPSendExecutor_State_WalletAddressValidation> | Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn> | Cell<CCIPSendExecutor_State_TokenPool_Withdraw> | Cell<CCIPSendExecutor_State_Finalized>
 */
export type CCIPSendExecutor_State =
    | { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: CCIPSendExecutor_State_Initialized }
    | { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: CCIPSendExecutor_State_OnGoingFeeValidation }
    | { $: 'Cell<CCIPSendExecutor_State_TokenRegistryAccess>', value: CCIPSendExecutor_State_TokenRegistryAccess }
    | { $: 'Cell<CCIPSendExecutor_State_WalletAddressValidation>', value: CCIPSendExecutor_State_WalletAddressValidation }
    | { $: 'Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>', value: CCIPSendExecutor_State_TokenPool_LockOrBurn }
    | { $: 'Cell<CCIPSendExecutor_State_TokenPool_Withdraw>', value: CCIPSendExecutor_State_TokenPool_Withdraw }
    | { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: CCIPSendExecutor_State_Finalized }

export const CCIPSendExecutor_State = {
    fromSlice(s: c.Slice): CCIPSendExecutor_State {
        return lookupPrefixAndEat(s, 0b000, 3) ? { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: loadCellRef<CCIPSendExecutor_State_Initialized>(s, CCIPSendExecutor_State_Initialized.fromSlice) } :
            lookupPrefixAndEat(s, 0b001, 3) ? { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: loadCellRef<CCIPSendExecutor_State_OnGoingFeeValidation>(s, CCIPSendExecutor_State_OnGoingFeeValidation.fromSlice) } :
            lookupPrefixAndEat(s, 0b010, 3) ? { $: 'Cell<CCIPSendExecutor_State_TokenRegistryAccess>', value: loadCellRef<CCIPSendExecutor_State_TokenRegistryAccess>(s, CCIPSendExecutor_State_TokenRegistryAccess.fromSlice) } :
            lookupPrefixAndEat(s, 0b011, 3) ? { $: 'Cell<CCIPSendExecutor_State_WalletAddressValidation>', value: loadCellRef<CCIPSendExecutor_State_WalletAddressValidation>(s, CCIPSendExecutor_State_WalletAddressValidation.fromSlice) } :
            lookupPrefixAndEat(s, 0b100, 3) ? { $: 'Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>', value: loadCellRef<CCIPSendExecutor_State_TokenPool_LockOrBurn>(s, CCIPSendExecutor_State_TokenPool_LockOrBurn.fromSlice) } :
            lookupPrefixAndEat(s, 0b101, 3) ? { $: 'Cell<CCIPSendExecutor_State_TokenPool_Withdraw>', value: loadCellRef<CCIPSendExecutor_State_TokenPool_Withdraw>(s, CCIPSendExecutor_State_TokenPool_Withdraw.fromSlice) } :
            lookupPrefixAndEat(s, 0b110, 3) ? { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: loadCellRef<CCIPSendExecutor_State_Finalized>(s, CCIPSendExecutor_State_Finalized.fromSlice) } :
            throwNonePrefixMatch('CCIPSendExecutor_State');
    },
    store(self: CCIPSendExecutor_State, b: c.Builder): void {
        switch (self.$) {
            case 'Cell<CCIPSendExecutor_State_Initialized>':
                b.storeUint(0b000, 3);
                storeCellRef<CCIPSendExecutor_State_Initialized>(self.value, b, CCIPSendExecutor_State_Initialized.store);
                break;
            case 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>':
                b.storeUint(0b001, 3);
                storeCellRef<CCIPSendExecutor_State_OnGoingFeeValidation>(self.value, b, CCIPSendExecutor_State_OnGoingFeeValidation.store);
                break;
            case 'Cell<CCIPSendExecutor_State_TokenRegistryAccess>':
                b.storeUint(0b010, 3);
                storeCellRef<CCIPSendExecutor_State_TokenRegistryAccess>(self.value, b, CCIPSendExecutor_State_TokenRegistryAccess.store);
                break;
            case 'Cell<CCIPSendExecutor_State_WalletAddressValidation>':
                b.storeUint(0b011, 3);
                storeCellRef<CCIPSendExecutor_State_WalletAddressValidation>(self.value, b, CCIPSendExecutor_State_WalletAddressValidation.store);
                break;
            case 'Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>':
                b.storeUint(0b100, 3);
                storeCellRef<CCIPSendExecutor_State_TokenPool_LockOrBurn>(self.value, b, CCIPSendExecutor_State_TokenPool_LockOrBurn.store);
                break;
            case 'Cell<CCIPSendExecutor_State_TokenPool_Withdraw>':
                b.storeUint(0b101, 3);
                storeCellRef<CCIPSendExecutor_State_TokenPool_Withdraw>(self.value, b, CCIPSendExecutor_State_TokenPool_Withdraw.store);
                break;
            case 'Cell<CCIPSendExecutor_State_Finalized>':
                b.storeUint(0b110, 3);
                storeCellRef<CCIPSendExecutor_State_Finalized>(self.value, b, CCIPSendExecutor_State_Finalized.store);
                break;
        }
    },
    toCell(self: CCIPSendExecutor_State): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State>(self, CCIPSendExecutor_State.store);
    }
}

/**
 > struct CCIPSendExecutor_State_Initialized {
 > }
 */
export interface CCIPSendExecutor_State_Initialized {
    readonly $: 'CCIPSendExecutor_State_Initialized'
}

export const CCIPSendExecutor_State_Initialized = {
    create(): CCIPSendExecutor_State_Initialized {
        return {
            $: 'CCIPSendExecutor_State_Initialized',
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_Initialized {
        return {
            $: 'CCIPSendExecutor_State_Initialized',
        }
    },
    store(self: CCIPSendExecutor_State_Initialized, b: c.Builder): void {
    },
    toCell(self: CCIPSendExecutor_State_Initialized): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_Initialized>(self, CCIPSendExecutor_State_Initialized.store);
    }
}

/**
 > struct CCIPSendExecutor_State_OnGoingFeeValidation {
 > }
 */
export interface CCIPSendExecutor_State_OnGoingFeeValidation {
    readonly $: 'CCIPSendExecutor_State_OnGoingFeeValidation'
}

export const CCIPSendExecutor_State_OnGoingFeeValidation = {
    create(): CCIPSendExecutor_State_OnGoingFeeValidation {
        return {
            $: 'CCIPSendExecutor_State_OnGoingFeeValidation',
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_OnGoingFeeValidation {
        return {
            $: 'CCIPSendExecutor_State_OnGoingFeeValidation',
        }
    },
    store(self: CCIPSendExecutor_State_OnGoingFeeValidation, b: c.Builder): void {
    },
    toCell(self: CCIPSendExecutor_State_OnGoingFeeValidation): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_OnGoingFeeValidation>(self, CCIPSendExecutor_State_OnGoingFeeValidation.store);
    }
}

/**
 > struct CCIPSendExecutor_State_TokenRegistryAccess {
 >     fee: Fee
 > }
 */
export interface CCIPSendExecutor_State_TokenRegistryAccess {
    readonly $: 'CCIPSendExecutor_State_TokenRegistryAccess'
    fee: Fee
}

export const CCIPSendExecutor_State_TokenRegistryAccess = {
    create(args: {
        fee: Fee
    }): CCIPSendExecutor_State_TokenRegistryAccess {
        return {
            $: 'CCIPSendExecutor_State_TokenRegistryAccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_TokenRegistryAccess {
        return {
            $: 'CCIPSendExecutor_State_TokenRegistryAccess',
            fee: Fee.fromSlice(s),
        }
    },
    store(self: CCIPSendExecutor_State_TokenRegistryAccess, b: c.Builder): void {
        Fee.store(self.fee, b);
    },
    toCell(self: CCIPSendExecutor_State_TokenRegistryAccess): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_TokenRegistryAccess>(self, CCIPSendExecutor_State_TokenRegistryAccess.store);
    }
}

/**
 > struct CCIPSendExecutor_State_WalletAddressValidation {
 >     fee: Fee
 >     minterAddress: address
 >     tokenPool: address
 > }
 */
export interface CCIPSendExecutor_State_WalletAddressValidation {
    readonly $: 'CCIPSendExecutor_State_WalletAddressValidation'
    fee: Fee
    minterAddress: c.Address
    tokenPool: c.Address
}

export const CCIPSendExecutor_State_WalletAddressValidation = {
    create(args: {
        fee: Fee
        minterAddress: c.Address
        tokenPool: c.Address
    }): CCIPSendExecutor_State_WalletAddressValidation {
        return {
            $: 'CCIPSendExecutor_State_WalletAddressValidation',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_WalletAddressValidation {
        return {
            $: 'CCIPSendExecutor_State_WalletAddressValidation',
            fee: Fee.fromSlice(s),
            minterAddress: s.loadAddress(),
            tokenPool: s.loadAddress(),
        }
    },
    store(self: CCIPSendExecutor_State_WalletAddressValidation, b: c.Builder): void {
        Fee.store(self.fee, b);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: CCIPSendExecutor_State_WalletAddressValidation): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_WalletAddressValidation>(self, CCIPSendExecutor_State_WalletAddressValidation.store);
    }
}

/**
 > struct CCIPSendExecutor_State_TokenPool_LockOrBurn {
 >     fee: Fee
 >     minterAddress: address
 >     tokenPool: address
 >     routerWalletAddress: address
 > }
 */
export interface CCIPSendExecutor_State_TokenPool_LockOrBurn {
    readonly $: 'CCIPSendExecutor_State_TokenPool_LockOrBurn'
    fee: Fee
    minterAddress: c.Address
    tokenPool: c.Address
    routerWalletAddress: c.Address
}

export const CCIPSendExecutor_State_TokenPool_LockOrBurn = {
    create(args: {
        fee: Fee
        minterAddress: c.Address
        tokenPool: c.Address
        routerWalletAddress: c.Address
    }): CCIPSendExecutor_State_TokenPool_LockOrBurn {
        return {
            $: 'CCIPSendExecutor_State_TokenPool_LockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_TokenPool_LockOrBurn {
        return {
            $: 'CCIPSendExecutor_State_TokenPool_LockOrBurn',
            fee: Fee.fromSlice(s),
            minterAddress: s.loadAddress(),
            tokenPool: s.loadAddress(),
            routerWalletAddress: s.loadAddress(),
        }
    },
    store(self: CCIPSendExecutor_State_TokenPool_LockOrBurn, b: c.Builder): void {
        Fee.store(self.fee, b);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.routerWalletAddress);
    },
    toCell(self: CCIPSendExecutor_State_TokenPool_LockOrBurn): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_TokenPool_LockOrBurn>(self, CCIPSendExecutor_State_TokenPool_LockOrBurn.store);
    }
}

/**
 > struct CCIPSendExecutor_State_TokenPool_Withdraw {
 >     fee: Fee
 >     minterAddress: address
 >     tokenPool: address
 >     routerWalletAddress: address
 > }
 */
export interface CCIPSendExecutor_State_TokenPool_Withdraw {
    readonly $: 'CCIPSendExecutor_State_TokenPool_Withdraw'
    fee: Fee
    minterAddress: c.Address
    tokenPool: c.Address
    routerWalletAddress: c.Address
}

export const CCIPSendExecutor_State_TokenPool_Withdraw = {
    create(args: {
        fee: Fee
        minterAddress: c.Address
        tokenPool: c.Address
        routerWalletAddress: c.Address
    }): CCIPSendExecutor_State_TokenPool_Withdraw {
        return {
            $: 'CCIPSendExecutor_State_TokenPool_Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_TokenPool_Withdraw {
        return {
            $: 'CCIPSendExecutor_State_TokenPool_Withdraw',
            fee: Fee.fromSlice(s),
            minterAddress: s.loadAddress(),
            tokenPool: s.loadAddress(),
            routerWalletAddress: s.loadAddress(),
        }
    },
    store(self: CCIPSendExecutor_State_TokenPool_Withdraw, b: c.Builder): void {
        Fee.store(self.fee, b);
        b.storeAddress(self.minterAddress);
        b.storeAddress(self.tokenPool);
        b.storeAddress(self.routerWalletAddress);
    },
    toCell(self: CCIPSendExecutor_State_TokenPool_Withdraw): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_TokenPool_Withdraw>(self, CCIPSendExecutor_State_TokenPool_Withdraw.store);
    }
}

/**
 > struct CCIPSendExecutor_State_Finalized {
 > }
 */
export interface CCIPSendExecutor_State_Finalized {
    readonly $: 'CCIPSendExecutor_State_Finalized'
}

export const CCIPSendExecutor_State_Finalized = {
    create(): CCIPSendExecutor_State_Finalized {
        return {
            $: 'CCIPSendExecutor_State_Finalized',
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_Finalized {
        return {
            $: 'CCIPSendExecutor_State_Finalized',
        }
    },
    store(self: CCIPSendExecutor_State_Finalized, b: c.Builder): void {
    },
    toCell(self: CCIPSendExecutor_State_Finalized): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_Finalized>(self, CCIPSendExecutor_State_Finalized.store);
    }
}

/**
 > struct CCIPSendExecutor_Config {
 >     router: address
 >     feeQuoter: address
 > }
 */
export interface CCIPSendExecutor_Config {
    readonly $: 'CCIPSendExecutor_Config'
    router: c.Address
    feeQuoter: c.Address
}

export const CCIPSendExecutor_Config = {
    create(args: {
        router: c.Address
        feeQuoter: c.Address
    }): CCIPSendExecutor_Config {
        return {
            $: 'CCIPSendExecutor_Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_Config {
        return {
            $: 'CCIPSendExecutor_Config',
            router: s.loadAddress(),
            feeQuoter: s.loadAddress(),
        }
    },
    store(self: CCIPSendExecutor_Config, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.feeQuoter);
    },
    toCell(self: CCIPSendExecutor_Config): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Config>(self, CCIPSendExecutor_Config.store);
    }
}

/**
 > type FeeQuoter_MessageValidated_Any = FeeQuoter_MessageValidated<RemainingBitsAndRefs>
 */
export type FeeQuoter_MessageValidated_Any = FeeQuoter_MessageValidated<RemainingBitsAndRefs>

export const FeeQuoter_MessageValidated_Any = {
    fromSlice(s: c.Slice): FeeQuoter_MessageValidated_Any {
        return (() => {
            loadAndCheckPrefix32(s, 0x1fa60374, 'FeeQuoter_MessageValidated');
            return {
                $: 'FeeQuoter_MessageValidated',
                fee: Fee.fromSlice(s),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: loadTolkRemaining(s),
            }
        })();
    },
    store(self: FeeQuoter_MessageValidated_Any, b: c.Builder): void {
        b.storeUint(0x1fa60374, 32);
        Fee.store(self.fee, b);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        storeTolkRemaining(self.context, b);
    },
    toCell(self: FeeQuoter_MessageValidated_Any): c.Cell {
        return makeCellFrom<FeeQuoter_MessageValidated_Any>(self, FeeQuoter_MessageValidated_Any.store);
    }
}

/**
 > type FeeQuoter_MessageValidationFailed_Any = FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>
 */
export type FeeQuoter_MessageValidationFailed_Any = FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>

export const FeeQuoter_MessageValidationFailed_Any = {
    fromSlice(s: c.Slice): FeeQuoter_MessageValidationFailed_Any {
        return (() => {
            loadAndCheckPrefix32(s, 0xbcf0ab0f, 'FeeQuoter_MessageValidationFailed');
            return {
                $: 'FeeQuoter_MessageValidationFailed',
                error: s.loadUintBig(256),
                msg: loadCellRef<Router_CCIPSend>(s, Router_CCIPSend.fromSlice),
                context: loadTolkRemaining(s),
            }
        })();
    },
    store(self: FeeQuoter_MessageValidationFailed_Any, b: c.Builder): void {
        b.storeUint(0xbcf0ab0f, 32);
        b.storeUint(self.error, 256);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        storeTolkRemaining(self.context, b);
    },
    toCell(self: FeeQuoter_MessageValidationFailed_Any): c.Cell {
        return makeCellFrom<FeeQuoter_MessageValidationFailed_Any>(self, FeeQuoter_MessageValidationFailed_Any.store);
    }
}

/**
 > struct (0xaf3c62b3) CCIPSendExecutor_Execute {
 >     onrampSend: OnRamp_Send
 >     config: Cell<CCIPSendExecutor_Config>
 > }
 */
export interface CCIPSendExecutor_Execute {
    readonly $: 'CCIPSendExecutor_Execute'
    onrampSend: OnRamp_Send
    config: CCIPSendExecutor_Config
}

export const CCIPSendExecutor_Execute = {
    PREFIX: 0xaf3c62b3,

    create(args: {
        onrampSend: OnRamp_Send
        config: CCIPSendExecutor_Config
    }): CCIPSendExecutor_Execute {
        return {
            $: 'CCIPSendExecutor_Execute',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_Execute {
        loadAndCheckPrefix32(s, 0xaf3c62b3, 'CCIPSendExecutor_Execute');
        return {
            $: 'CCIPSendExecutor_Execute',
            onrampSend: OnRamp_Send.fromSlice(s),
            config: loadCellRef<CCIPSendExecutor_Config>(s, CCIPSendExecutor_Config.fromSlice),
        }
    },
    store(self: CCIPSendExecutor_Execute, b: c.Builder): void {
        b.storeUint(0xaf3c62b3, 32);
        OnRamp_Send.store(self.onrampSend, b);
        storeCellRef<CCIPSendExecutor_Config>(self.config, b, CCIPSendExecutor_Config.store);
    },
    toCell(self: CCIPSendExecutor_Execute): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Execute>(self, CCIPSendExecutor_Execute.store);
    }
}

/**
 > enum CCIPSendExecutor_Error { 6 variants }
 */
export type CCIPSendExecutor_Error = bigint

export const CCIPSendExecutor_Error = {
    StateNotExpected: 17800n,
    Unauthorized: 17801n,
    InsufficientFunds: 17802n,
    InsufficientFee: 17803n,
    FeeQuoterBounce: 17804n,
    TokenNotEnabled: 17805n,

    fromSlice(s: c.Slice): CCIPSendExecutor_Error {
        return s.loadUintBig(15);
    },
    store(self: CCIPSendExecutor_Error, b: c.Builder): void {
        b.storeUint(self, 15);
    },
    toCell(self: CCIPSendExecutor_Error): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Error>(self, CCIPSendExecutor_Error.store);
    }
}

// ————————————————————————————————————————————
//    class CCIPSendExecutor
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

export class CCIPSendExecutor implements c.Contract {
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'Utils_Error.InvalidData': 13500,
        'Utils_Error.BitmapOutOfBounds': 13501,
        'CCIPSendExecutor_Error.StateNotExpected': 17800,
        'CCIPSendExecutor_Error.Unauthorized': 17801,
        'CCIPSendExecutor_Error.InsufficientFunds': 17802,
        'CCIPSendExecutor_Error.InsufficientFee': 17803,
        'CCIPSendExecutor_Error.FeeQuoterBounce': 17804,
        'CCIPSendExecutor_Error.TokenNotEnabled': 17805,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static registerCustomPackUnpack<T>(
        typeName: string,
        packToBuilderFn: CustomPackToBuilderFn<T> | null,
        unpackFromSliceFn: CustomUnpackFromSliceFn<T> | null,
    ) {
        if (customSerializersRegistry.has(typeName)) {
            throw new Error(`Custom pack/unpack for 'CCIPSendExecutor.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new CCIPSendExecutor(address);
    }

    static fromStorage(emptyStorage: {
        onramp: c.Address
        id: CCIPSendExecutor_ID
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? CCIPSendExecutor.CodeCell,
            data: CCIPSendExecutor_InitialData.toCell(CCIPSendExecutor_InitialData.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new CCIPSendExecutor(address, initialState);
    }

    static createCellOfCCIPSendExecutorExecute(body: {
        onrampSend: OnRamp_Send
        config: CCIPSendExecutor_Config
    }) {
        return CCIPSendExecutor_Execute.toCell(CCIPSendExecutor_Execute.create(body));
    }

    static createCellOfFeeQuoterMessageValidatedAny(body: FeeQuoter_MessageValidated_Any) {
        return FeeQuoter_MessageValidated_Any.toCell(body);
    }

    static createCellOfFeeQuoterMessageValidationFailedAny(body: FeeQuoter_MessageValidationFailed_Any) {
        return FeeQuoter_MessageValidationFailed_Any.toCell(body);
    }

    static createCellOfTokenRegistryReturnTokenInfo(body: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }) {
        return TokenRegistry_ReturnTokenInfo.toCell(TokenRegistry_ReturnTokenInfo.create(body));
    }

    static createCellOfResponseWalletAddress(body: {
        queryId?: uint64
        jettonWalletAddress: c.Address | null
        ownerAddress: c.Address | null
    }) {
        return ResponseWalletAddress.toCell(ResponseWalletAddress.create(body));
    }

    static createCellOfTokenPoolLockOrBurnWithdraw(body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }) {
        return TokenPool_LockOrBurnWithdraw.toCell(TokenPool_LockOrBurnWithdraw.create(body));
    }

    static createCellOfTokenPoolLockOrBurnFinished(body: {
        queryId?: uint64
        out: TokenPool_LockOrBurnOutV1
        destTokenAmount: coins
    }) {
        return TokenPool_LockOrBurnFinished.toCell(TokenPool_LockOrBurnFinished.create(body));
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

    async sendCCIPSendExecutorExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        onrampSend: OnRamp_Send
        config: CCIPSendExecutor_Config
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CCIPSendExecutor_Execute.toCell(CCIPSendExecutor_Execute.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidatedAny(provider: ContractProvider, via: Sender, msgValue: coins, body: FeeQuoter_MessageValidated_Any, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_MessageValidated_Any.toCell(body),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidationFailedAny(provider: ContractProvider, via: Sender, msgValue: coins, body: FeeQuoter_MessageValidationFailed_Any, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: FeeQuoter_MessageValidationFailed_Any.toCell(body),
            ...extraOptions
        });
    }

    async sendTokenRegistryReturnTokenInfo(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenRegistry_ReturnTokenInfo.toCell(TokenRegistry_ReturnTokenInfo.create(body)),
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

    async sendTokenPoolLockOrBurnWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurnWithdraw.toCell(TokenPool_LockOrBurnWithdraw.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolLockOrBurnFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        out: TokenPool_LockOrBurnOutV1
        destTokenAmount: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurnFinished.toCell(TokenPool_LockOrBurnFinished.create(body)),
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
}
