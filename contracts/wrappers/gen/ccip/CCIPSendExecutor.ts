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
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

/**
 > struct (0x31768d95) Router_CCIPSend {
 >     queryID: uint64
 >     destChainSelector: uint64
 >     receiver: CrossChainAddress
 >     data: cell
 >     tokenAmounts: SnakedCell<TokenAmount>
 >     feeToken: address?
 >     extraArgs: cell
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
    extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
}

export const Router_CCIPSend = {
    PREFIX: 0x31768d95,

    create(args: {
        queryID: uint64
        destChainSelector: uint64
        receiver: CrossChainAddress
        data: c.Cell
        tokenAmounts: SnakedCell<TokenAmount>
        feeToken: c.Address | null
        extraArgs: CellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>
    }): Router_CCIPSend {
        return {
            $: 'Router_CCIPSend',
            ...args
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
            tokenAmounts: s.loadRef(),
            feeToken: s.loadMaybeAddress(),
            extraArgs: loadCellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>(s,
                (s) => lookupPrefix(s, 0x181dcf10, 32) ? GenericExtraArgsV2.fromSlice(s) :
                    lookupPrefix(s, 0x1f3b3aba, 32) ? SVMExtraArgsV1.fromSlice(s) :
                    lookupPrefix(s, 0x21ea4ca9, 32) ? SuiExtraArgsV1.fromSlice(s) :
                    throwNonePrefixMatch('Router_CCIPSend.extraArgs')
            ),
        }
    },
    store(self: Router_CCIPSend, b: c.Builder): void {
        b.storeUint(0x31768d95, 32);
        b.storeUint(self.queryID, 64);
        b.storeUint(self.destChainSelector, 64);
        CrossChainAddress.store(self.receiver, b);
        b.storeRef(self.data);
        b.storeRef(self.tokenAmounts);
        b.storeAddress(self.feeToken);
        storeCellRef<GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1>(self.extraArgs, b,
            (v,b) => { switch (v.$) {
                case 'GenericExtraArgsV2':
                    GenericExtraArgsV2.store(v, b);
                    break;
                case 'SVMExtraArgsV1':
                    SVMExtraArgsV1.store(v, b);
                    break;
                case 'SuiExtraArgsV1':
                    SuiExtraArgsV1.store(v, b);
                    break;
            } }
        );
    },
    toCell(self: Router_CCIPSend): c.Cell {
        return makeCellFrom<Router_CCIPSend>(self, Router_CCIPSend.store);
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
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
    tokenRegistry: c.Address | null
}

export const OnRamp_Send = {
    PREFIX: 0xdcf993c2,

    create(args: {
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
        tokenRegistry: c.Address | null
    }): OnRamp_Send {
        return {
            $: 'OnRamp_Send',
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
 >     tokenAmount: TokenAmount
 >     tokenPool: address
 >     destChainSelector: uint64
 >     executorID: CCIPSendExecutor_ID
 > }
 */
export interface OnRamp_ExecutorRequestsLockOrBurn {
    readonly $: 'OnRamp_ExecutorRequestsLockOrBurn'
    tokenAmount: TokenAmount
    tokenPool: c.Address
    destChainSelector: uint64
    executorID: CCIPSendExecutor_ID
}

export const OnRamp_ExecutorRequestsLockOrBurn = {
    PREFIX: 0x9be1fb61,

    create(args: {
        tokenAmount: TokenAmount
        tokenPool: c.Address
        destChainSelector: uint64
        executorID: CCIPSendExecutor_ID
    }): OnRamp_ExecutorRequestsLockOrBurn {
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRamp_ExecutorRequestsLockOrBurn {
        loadAndCheckPrefix32(s, 0x9be1fb61, 'OnRamp_ExecutorRequestsLockOrBurn');
        return {
            $: 'OnRamp_ExecutorRequestsLockOrBurn',
            tokenAmount: TokenAmount.fromSlice(s),
            tokenPool: s.loadAddress(),
            destChainSelector: s.loadUintBig(64),
            executorID: CCIPSendExecutor_ID.fromSlice(s),
        }
    },
    store(self: OnRamp_ExecutorRequestsLockOrBurn, b: c.Builder): void {
        b.storeUint(0x9be1fb61, 32);
        TokenAmount.store(self.tokenAmount, b);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.destChainSelector, 64);
        CCIPSendExecutor_ID.store(self.executorID, b);
    },
    toCell(self: OnRamp_ExecutorRequestsLockOrBurn): c.Cell {
        return makeCellFrom<OnRamp_ExecutorRequestsLockOrBurn>(self, OnRamp_ExecutorRequestsLockOrBurn.store);
    }
}

/**
 > struct (0xcfa6b336) OnRamp_ExecutorFinishedSuccessfully {
 >     executorID: CCIPSendExecutor_ID
 >     fee: Fee
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 > }
 */
export interface OnRamp_ExecutorFinishedSuccessfully {
    readonly $: 'OnRamp_ExecutorFinishedSuccessfully'
    executorID: CCIPSendExecutor_ID
    fee: Fee
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
}

export const OnRamp_ExecutorFinishedSuccessfully = {
    PREFIX: 0xcfa6b336,

    create(args: {
        executorID: CCIPSendExecutor_ID
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
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
        }
    },
    store(self: OnRamp_ExecutorFinishedSuccessfully, b: c.Builder): void {
        b.storeUint(0xcfa6b336, 32);
        CCIPSendExecutor_ID.store(self.executorID, b);
        Fee.store(self.fee, b);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
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
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
}

export const OnRamp_ExecutorFinishedWithError = {
    PREFIX: 0xc4068e21,

    create(args: {
        executorID: CCIPSendExecutor_ID
        error: uint256
        msg: CellRef<Router_CCIPSend>
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
 > struct (0x7496ff56) FeeQuoter_GetValidatedFee<T> {
 >     msg: Cell<Router_CCIPSend>
 >     context: T
 > }
 */
export interface FeeQuoter_GetValidatedFee<T> {
    readonly $: 'FeeQuoter_GetValidatedFee'
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_GetValidatedFee = {
    PREFIX: 0x7496ff56,

    create<T>(args: {
        msg: CellRef<Router_CCIPSend>
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
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_MessageValidated = {
    PREFIX: 0x1fa60374,

    create<T>(args: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
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
    msg: CellRef<Router_CCIPSend>
    context: T
}

export const FeeQuoter_MessageValidationFailed = {
    PREFIX: 0xbcf0ab0f,

    create<T>(args: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
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
 > struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: coins
 > }
 */
export interface TokenPool_LockOrBurnFinished {
    readonly $: 'TokenPool_LockOrBurnFinished'
    queryId: uint64
    out: CellRef<TokenPool_LockOrBurnOutV1>
    destTokenAmount: coins
}

export const TokenPool_LockOrBurnFinished = {
    PREFIX: 0xf432a4e3,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
        destTokenAmount: coins
    }): TokenPool_LockOrBurnFinished {
        return {
            $: 'TokenPool_LockOrBurnFinished',
            ...args
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
    addresses: CellRef<CCIPSendExecutor_Addresses>
    state: CCIPSendExecutor_State
}

export const CCIPSendExecutor_Data = {
    create(args: {
        id: CCIPSendExecutor_ID
        onrampSend: OnRamp_Send
        addresses: CellRef<CCIPSendExecutor_Addresses>
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
 >     feeQuoter: address
 >     tokenRegistry: address?
 > }
 */
export interface CCIPSendExecutor_Addresses {
    readonly $: 'CCIPSendExecutor_Addresses'
    onramp: c.Address
    feeQuoter: c.Address
    tokenRegistry: c.Address | null
}

export const CCIPSendExecutor_Addresses = {
    create(args: {
        onramp: c.Address
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
            feeQuoter: s.loadAddress(),
            tokenRegistry: s.loadMaybeAddress(),
        }
    },
    store(self: CCIPSendExecutor_Addresses, b: c.Builder): void {
        b.storeAddress(self.onramp);
        b.storeAddress(self.feeQuoter);
        b.storeAddress(self.tokenRegistry);
    },
    toCell(self: CCIPSendExecutor_Addresses): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Addresses>(self, CCIPSendExecutor_Addresses.store);
    }
}

/**
 > type CCIPSendExecutor_State = Cell<CCIPSendExecutor_State_Initialized> | Cell<CCIPSendExecutor_State_OnGoingFeeValidation> | Cell<CCIPSendExecutor_State_TokenRegistryAccess> | Cell<CCIPSendExecutor_State_TokenTransfer> | Cell<CCIPSendExecutor_State_Finalized>
 */
export type CCIPSendExecutor_State =
    | { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: CellRef<CCIPSendExecutor_State_Initialized> }
    | { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: CellRef<CCIPSendExecutor_State_OnGoingFeeValidation> }
    | { $: 'Cell<CCIPSendExecutor_State_TokenRegistryAccess>', value: CellRef<CCIPSendExecutor_State_TokenRegistryAccess> }
    | { $: 'Cell<CCIPSendExecutor_State_TokenTransfer>', value: CellRef<CCIPSendExecutor_State_TokenTransfer> }
    | { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: CellRef<CCIPSendExecutor_State_Finalized> }

export const CCIPSendExecutor_State = {
    fromSlice(s: c.Slice): CCIPSendExecutor_State {
        return lookupPrefixAndEat(s, 0b000, 3) ? { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: loadCellRef<CCIPSendExecutor_State_Initialized>(s, CCIPSendExecutor_State_Initialized.fromSlice) } :
            lookupPrefixAndEat(s, 0b001, 3) ? { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: loadCellRef<CCIPSendExecutor_State_OnGoingFeeValidation>(s, CCIPSendExecutor_State_OnGoingFeeValidation.fromSlice) } :
            lookupPrefixAndEat(s, 0b010, 3) ? { $: 'Cell<CCIPSendExecutor_State_TokenRegistryAccess>', value: loadCellRef<CCIPSendExecutor_State_TokenRegistryAccess>(s, CCIPSendExecutor_State_TokenRegistryAccess.fromSlice) } :
            lookupPrefixAndEat(s, 0b011, 3) ? { $: 'Cell<CCIPSendExecutor_State_TokenTransfer>', value: loadCellRef<CCIPSendExecutor_State_TokenTransfer>(s, CCIPSendExecutor_State_TokenTransfer.fromSlice) } :
            lookupPrefixAndEat(s, 0b100, 3) ? { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: loadCellRef<CCIPSendExecutor_State_Finalized>(s, CCIPSendExecutor_State_Finalized.fromSlice) } :
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
            case 'Cell<CCIPSendExecutor_State_TokenTransfer>':
                b.storeUint(0b011, 3);
                storeCellRef<CCIPSendExecutor_State_TokenTransfer>(self.value, b, CCIPSendExecutor_State_TokenTransfer.store);
                break;
            case 'Cell<CCIPSendExecutor_State_Finalized>':
                b.storeUint(0b100, 3);
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
 > struct CCIPSendExecutor_State_TokenTransfer {
 >     tokenPool: address
 >     fee: Fee
 > }
 */
export interface CCIPSendExecutor_State_TokenTransfer {
    readonly $: 'CCIPSendExecutor_State_TokenTransfer'
    tokenPool: c.Address
    fee: Fee
}

export const CCIPSendExecutor_State_TokenTransfer = {
    create(args: {
        tokenPool: c.Address
        fee: Fee
    }): CCIPSendExecutor_State_TokenTransfer {
        return {
            $: 'CCIPSendExecutor_State_TokenTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPSendExecutor_State_TokenTransfer {
        return {
            $: 'CCIPSendExecutor_State_TokenTransfer',
            tokenPool: s.loadAddress(),
            fee: Fee.fromSlice(s),
        }
    },
    store(self: CCIPSendExecutor_State_TokenTransfer, b: c.Builder): void {
        b.storeAddress(self.tokenPool);
        Fee.store(self.fee, b);
    },
    toCell(self: CCIPSendExecutor_State_TokenTransfer): c.Cell {
        return makeCellFrom<CCIPSendExecutor_State_TokenTransfer>(self, CCIPSendExecutor_State_TokenTransfer.store);
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
 >     feeQuoter: address
 > }
 */
export interface CCIPSendExecutor_Config {
    readonly $: 'CCIPSendExecutor_Config'
    feeQuoter: c.Address
}

export const CCIPSendExecutor_Config = {
    create(args: {
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
            feeQuoter: s.loadAddress(),
        }
    },
    store(self: CCIPSendExecutor_Config, b: c.Builder): void {
        b.storeAddress(self.feeQuoter);
    },
    toCell(self: CCIPSendExecutor_Config): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Config>(self, CCIPSendExecutor_Config.store);
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
    config: CellRef<CCIPSendExecutor_Config>
}

export const CCIPSendExecutor_Execute = {
    PREFIX: 0xaf3c62b3,

    create(args: {
        onrampSend: OnRamp_Send
        config: CellRef<CCIPSendExecutor_Config>
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
            accounts: s.loadRef(),
        }
    },
    store(self: SVMExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x1f3b3aba, 32);
        b.storeUint(self.computeUnits, 32);
        b.storeUint(self.accountIsWritableBitmap, 64);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        b.storeRef(self.accounts);
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
            receiverObjectIds: s.loadRef(),
        }
    },
    store(self: SuiExtraArgsV1, b: c.Builder): void {
        b.storeUint(0x21ea4ca9, 32);
        b.storeUint(self.gasLimit, 256);
        b.storeBit(self.allowOutOfOrderExecution);
        b.storeUint(self.tokenReceiver, 256);
        b.storeRef(self.receiverObjectIds);
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
 > struct TokenPool_LockOrBurnOutV1 {
 >     destTokenAddress: Cell<CrossChainAddress>
 >     destPoolData: cell
 > }
 */
export interface TokenPool_LockOrBurnOutV1 {
    readonly $: 'TokenPool_LockOrBurnOutV1'
    destTokenAddress: CellRef<CrossChainAddress>
    destPoolData: c.Cell
}

export const TokenPool_LockOrBurnOutV1 = {
    create(args: {
        destTokenAddress: CellRef<CrossChainAddress>
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
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'CCIPSendExecutor_Error.StateNotExpected': 17800,
        'CCIPSendExecutor_Error.Unauthorized': 17801,
        'CCIPSendExecutor_Error.InsufficientFee': 17803,
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
        config: CellRef<CCIPSendExecutor_Config>
    }) {
        return CCIPSendExecutor_Execute.toCell(CCIPSendExecutor_Execute.create(body));
    }

    static createCellOfFeeQuoterMessageValidatedRemainingBitsAndRefs_(body: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }) {
        return makeCellFrom<FeeQuoter_MessageValidated<RemainingBitsAndRefs>>(FeeQuoter_MessageValidated.create<RemainingBitsAndRefs>(body),
            (v,b) => { b.storeUint(0x1fa60374, 32);
            Fee.store(v.fee, b);
            storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
            storeTolkRemaining(v.context, b); }
        );
    }

    static createCellOfFeeQuoterMessageValidationFailedRemainingBitsAndRefs_(body: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }) {
        return makeCellFrom<FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>>(FeeQuoter_MessageValidationFailed.create<RemainingBitsAndRefs>(body),
            (v,b) => { b.storeUint(0xbcf0ab0f, 32);
            b.storeUint(v.error, 256);
            storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
            storeTolkRemaining(v.context, b); }
        );
    }

    static createCellOfTokenRegistryReturnTokenInfo(body: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }) {
        return TokenRegistry_ReturnTokenInfo.toCell(TokenRegistry_ReturnTokenInfo.create(body));
    }

    static createCellOfTokenPoolLockOrBurnFinished(body: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
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

    async sendCCIPSendExecutorExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        onrampSend: OnRamp_Send
        config: CellRef<CCIPSendExecutor_Config>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CCIPSendExecutor_Execute.toCell(CCIPSendExecutor_Execute.create(body)),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidatedRemainingBitsAndRefs_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        fee: Fee
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<FeeQuoter_MessageValidated<RemainingBitsAndRefs>>(FeeQuoter_MessageValidated.create<RemainingBitsAndRefs>(body),
                (v,b) => { b.storeUint(0x1fa60374, 32);
                Fee.store(v.fee, b);
                storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
                storeTolkRemaining(v.context, b); }
            ),
            ...extraOptions
        });
    }

    async sendFeeQuoterMessageValidationFailedRemainingBitsAndRefs_(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        error: uint256
        msg: CellRef<Router_CCIPSend>
        context: RemainingBitsAndRefs
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: makeCellFrom<FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>>(FeeQuoter_MessageValidationFailed.create<RemainingBitsAndRefs>(body),
                (v,b) => { b.storeUint(0xbcf0ab0f, 32);
                b.storeUint(v.error, 256);
                storeCellRef<Router_CCIPSend>(v.msg, b, Router_CCIPSend.store);
                storeTolkRemaining(v.context, b); }
            ),
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

    async sendTokenPoolLockOrBurnFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
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
