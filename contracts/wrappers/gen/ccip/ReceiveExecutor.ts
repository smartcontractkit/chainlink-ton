// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a ReceiveExecutor contract in Tolk.
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
//   custom packToBuilder and unpackFromSlice
//

type CustomPackToBuilderFn<T> = (self: T, b: c.Builder) => void
type CustomUnpackFromSliceFn<T> = (s: c.Slice) => T

let customSerializersRegistry: Map<string, [CustomPackToBuilderFn<any> | null, CustomUnpackFromSliceFn<any> | null]> = new Map;

function ensureCustomSerializerRegistered(typeName: string) {
    if (!customSerializersRegistry.has(typeName)) {
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'ReceiveExecutor.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > ReceiveExecutor.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint192 = bigint
type uint256 = bigint

/**
 > struct Any2TVMRampMessage {
 >     header: RampMessageHeader
 >     sender: Cell<CrossChainAddress>
 >     data: cell
 >     receiver: address
 >     gasLimit: coins
 >     tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?
 > }
 */
export interface Any2TVMRampMessage {
    readonly $: 'Any2TVMRampMessage'
    header: RampMessageHeader
    sender: CrossChainAddress
    data: c.Cell
    receiver: c.Address
    gasLimit: coins
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
}

export const Any2TVMRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: CrossChainAddress
        data: c.Cell
        receiver: c.Address
        gasLimit: coins
        tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
    }): Any2TVMRampMessage {
        return {
            $: 'Any2TVMRampMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMRampMessage {
        return {
            $: 'Any2TVMRampMessage',
            header: RampMessageHeader.fromSlice(s),
            sender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            data: s.loadRef(),
            receiver: s.loadAddress(),
            gasLimit: s.loadCoins(),
            tokenAmounts: s.loadBoolean() ? loadSnakedCellOf(s, Any2TVMTokenTransfer.fromSlice) : null,
        }
    },
    store(self: Any2TVMRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        storeCellRef<CrossChainAddress>(self.sender, b, CrossChainAddress.store);
        b.storeRef(self.data);
        b.storeAddress(self.receiver);
        b.storeCoins(self.gasLimit);
        storeTolkNullable<SnakedCell<Any2TVMTokenTransfer>>(self.tokenAmounts, b, (v,b) => storeSnakedCellOf(v, b, Any2TVMTokenTransfer.store));
    },
    toCell(self: Any2TVMRampMessage): c.Cell {
        return makeCellFrom<Any2TVMRampMessage>(self, Any2TVMRampMessage.store);
    }
}

/**
 > struct Any2TVMTokenTransfer {
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     token: address
 >     destGasAmount: uint32
 >     extraData: cell
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CrossChainAddress
    token: c.Address
    destGasAmount: uint32
    extraData: c.Cell
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CrossChainAddress
        token: c.Address
        destGasAmount: uint32
        extraData: c.Cell
        amount: uint256
    }): Any2TVMTokenTransfer {
        return {
            $: 'Any2TVMTokenTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMTokenTransfer {
        return {
            $: 'Any2TVMTokenTransfer',
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            token: s.loadAddress(),
            destGasAmount: s.loadUintBig(32),
            extraData: s.loadRef(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.token);
        b.storeUint(self.destGasAmount, 32);
        b.storeRef(self.extraData);
        b.storeUint(self.amount, 256);
    },
    toCell(self: Any2TVMTokenTransfer): c.Cell {
        return makeCellFrom<Any2TVMTokenTransfer>(self, Any2TVMTokenTransfer.store);
    }
}

/**
 > type ReceiveExecutorId = uint192
 */
export type ReceiveExecutorId = uint192

export const ReceiveExecutorId = {
    fromSlice(s: c.Slice): ReceiveExecutorId {
        return s.loadUintBig(192);
    },
    store(self: ReceiveExecutorId, b: c.Builder): void {
        b.storeUint(self, 192);
    },
    toCell(self: ReceiveExecutorId): c.Cell {
        return makeCellFrom<ReceiveExecutorId>(self, ReceiveExecutorId.store);
    }
}

/**
 > struct ReceiveExecutor_Storage {
 >     owner: address
 >     message: Cell<Any2TVMRampMessage>
 >     root: address
 >     execId: uint192
 >     state: ReceiveExecutor_MessageState
 >     lastExecutionTimestamp: uint64
 >     tokenAdminRegistry: Cell<address>?
 >     tokenPool: Cell<address>?
 > }
 */
export interface ReceiveExecutor_Storage {
    readonly $: 'ReceiveExecutor_Storage'
    owner: c.Address
    message: Any2TVMRampMessage
    root: c.Address
    execId: uint192
    state: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
    lastExecutionTimestamp: uint64 /* = 0 */
    tokenAdminRegistry: c.Address | null /* = null */
    tokenPool: c.Address | null /* = null */
}

export const ReceiveExecutor_Storage = {
    create(args: {
        owner: c.Address
        message: Any2TVMRampMessage
        root: c.Address
        execId: uint192
        state?: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
        lastExecutionTimestamp?: uint64 /* = 0 */
        tokenAdminRegistry?: c.Address | null /* = null */
        tokenPool?: c.Address | null /* = null */
    }): ReceiveExecutor_Storage {
        return {
            $: 'ReceiveExecutor_Storage',
            state: 0n,
            lastExecutionTimestamp: 0n,
            tokenAdminRegistry: null,
            tokenPool: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_Storage {
        return {
            $: 'ReceiveExecutor_Storage',
            owner: s.loadAddress(),
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            root: s.loadAddress(),
            execId: s.loadUintBig(192),
            state: ReceiveExecutor_MessageState.fromSlice(s),
            lastExecutionTimestamp: s.loadUintBig(64),
            tokenAdminRegistry: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
            tokenPool: s.loadBoolean() ? loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ) : null,
        }
    },
    store(self: ReceiveExecutor_Storage, b: c.Builder): void {
        b.storeAddress(self.owner);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeAddress(self.root);
        b.storeUint(self.execId, 192);
        ReceiveExecutor_MessageState.store(self.state, b);
        b.storeUint(self.lastExecutionTimestamp, 64);
        storeTolkNullable<c.Address>(self.tokenAdminRegistry, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
        storeTolkNullable<c.Address>(self.tokenPool, b,
            (v,b) => { storeCellRef<c.Address>(v, b,
                (v,b) => b.storeAddress(v)
            ); }
        );
    },
    toCell(self: ReceiveExecutor_Storage): c.Cell {
        return makeCellFrom<ReceiveExecutor_Storage>(self, ReceiveExecutor_Storage.store);
    }
}

/**
 > struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
 >     gasOverride: coins?
 >     root: address
 >     sequenceNumber: uint64
 >     sourceChainSelector: uint64
 >     messageId: uint256
 > }
 */
export interface ReceiveExecutor_InitExecute {
    readonly $: 'ReceiveExecutor_InitExecute'
    gasOverride: coins | null /* = null */
    root: c.Address
    sequenceNumber: uint64
    sourceChainSelector: uint64
    messageId: uint256
}

export const ReceiveExecutor_InitExecute = {
    PREFIX: 0x64cd2fd2,

    create(args: {
        gasOverride?: coins | null /* = null */
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
    }): ReceiveExecutor_InitExecute {
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_InitExecute {
        loadAndCheckPrefix32(s, 0x64cd2fd2, 'ReceiveExecutor_InitExecute');
        return {
            $: 'ReceiveExecutor_InitExecute',
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
            root: s.loadAddress(),
            sequenceNumber: s.loadUintBig(64),
            sourceChainSelector: s.loadUintBig(64),
            messageId: s.loadUintBig(256),
        }
    },
    store(self: ReceiveExecutor_InitExecute, b: c.Builder): void {
        b.storeUint(0x64cd2fd2, 32);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
        b.storeAddress(self.root);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.messageId, 256);
    },
    toCell(self: ReceiveExecutor_InitExecute): c.Cell {
        return makeCellFrom<ReceiveExecutor_InitExecute>(self, ReceiveExecutor_InitExecute.store);
    }
}

/**
 > struct (0x00e5dd97) ReceiveExecutor_Confirm {
 >     receiver: address
 > }
 */
export interface ReceiveExecutor_Confirm {
    readonly $: 'ReceiveExecutor_Confirm'
    receiver: c.Address
}

export const ReceiveExecutor_Confirm = {
    PREFIX: 0x00e5dd97,

    create(args: {
        receiver: c.Address
    }): ReceiveExecutor_Confirm {
        return {
            $: 'ReceiveExecutor_Confirm',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_Confirm {
        loadAndCheckPrefix32(s, 0x00e5dd97, 'ReceiveExecutor_Confirm');
        return {
            $: 'ReceiveExecutor_Confirm',
            receiver: s.loadAddress(),
        }
    },
    store(self: ReceiveExecutor_Confirm, b: c.Builder): void {
        b.storeUint(0x00e5dd97, 32);
        b.storeAddress(self.receiver);
    },
    toCell(self: ReceiveExecutor_Confirm): c.Cell {
        return makeCellFrom<ReceiveExecutor_Confirm>(self, ReceiveExecutor_Confirm.store);
    }
}

/**
 > struct (0x05dee1bb) ReceiveExecutor_Bounced {
 >     receiver: address
 >     reason: ReceiveExecutor_BouncedReason
 > }
 */
export interface ReceiveExecutor_Bounced {
    readonly $: 'ReceiveExecutor_Bounced'
    receiver: c.Address
    reason: ReceiveExecutor_BouncedReason
}

export const ReceiveExecutor_Bounced = {
    PREFIX: 0x05dee1bb,

    create(args: {
        receiver: c.Address
        reason: ReceiveExecutor_BouncedReason
    }): ReceiveExecutor_Bounced {
        return {
            $: 'ReceiveExecutor_Bounced',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReceiveExecutor_Bounced {
        loadAndCheckPrefix32(s, 0x05dee1bb, 'ReceiveExecutor_Bounced');
        return {
            $: 'ReceiveExecutor_Bounced',
            receiver: s.loadAddress(),
            reason: ReceiveExecutor_BouncedReason.fromSlice(s),
        }
    },
    store(self: ReceiveExecutor_Bounced, b: c.Builder): void {
        b.storeUint(0x05dee1bb, 32);
        b.storeAddress(self.receiver);
        ReceiveExecutor_BouncedReason.store(self.reason, b);
    },
    toCell(self: ReceiveExecutor_Bounced): c.Cell {
        return makeCellFrom<ReceiveExecutor_Bounced>(self, ReceiveExecutor_Bounced.store);
    }
}

/**
 > enum ReceiveExecutor_BouncedReason { 3 variants }
 */
export type ReceiveExecutor_BouncedReason = bigint

export const ReceiveExecutor_BouncedReason = {
    NotEnoughGas: 0n,
    BouncedFromReceiver: 1n,
    BouncedFromRouter: 2n,

    fromSlice(s: c.Slice): ReceiveExecutor_BouncedReason {
        return s.loadUintBig(8);
    },
    store(self: ReceiveExecutor_BouncedReason, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: ReceiveExecutor_BouncedReason): c.Cell {
        return makeCellFrom<ReceiveExecutor_BouncedReason>(self, ReceiveExecutor_BouncedReason.store);
    }
}

/**
 > enum ReceiveExecutor_MessageState { 7 variants }
 */
export type ReceiveExecutor_MessageState = bigint

export const ReceiveExecutor_MessageState = {
    Untouched: 0n,
    TokenAdminRegistryQuery: 1n,
    TokenTransfer: 2n,
    Execute: 3n,
    ExecuteFailed: 4n,
    TokenTransferFailed: 5n,
    Success: 6n,

    fromSlice(s: c.Slice): ReceiveExecutor_MessageState {
        return s.loadUintBig(3);
    },
    store(self: ReceiveExecutor_MessageState, b: c.Builder): void {
        b.storeUint(self, 3);
    },
    toCell(self: ReceiveExecutor_MessageState): c.Cell {
        return makeCellFrom<ReceiveExecutor_MessageState>(self, ReceiveExecutor_MessageState.store);
    }
}

/**
 > enum ReceiveExecutor_Error { 8 variants }
 */
export type ReceiveExecutor_Error = bigint

export const ReceiveExecutor_Error = {
    UpdatingStateOfNonExecutedMessage: 37600n,
    NotificationFromInvalidReceiver: 37601n,
    Unauthorized: 37602n,
    UnsupportedNumberOfTokens: 37603n,
    NoTokenAmountsInMessage: 37604n,
    TokenAdminRegistryUnexpectedResponse: 37605n,
    TokenPoolUnexpectedResponse: 37606n,
    PTTNotSupported: 37607n,

    fromSlice(s: c.Slice): ReceiveExecutor_Error {
        return s.loadUintBig(16);
    },
    store(self: ReceiveExecutor_Error, b: c.Builder): void {
        b.storeUint(self, 16);
    },
    toCell(self: ReceiveExecutor_Error): c.Cell {
        return makeCellFrom<ReceiveExecutor_Error>(self, ReceiveExecutor_Error.store);
    }
}

/**
 > struct (0x58cfcb02) OffRamp_DispatchValidated {
 >     message: Cell<Any2TVMRampMessage>
 >     execId: uint192
 >     gasOverride: coins?
 > }
 */
export interface OffRamp_DispatchValidated {
    readonly $: 'OffRamp_DispatchValidated'
    message: Any2TVMRampMessage
    execId: uint192
    gasOverride: coins | null
}

export const OffRamp_DispatchValidated = {
    PREFIX: 0x58cfcb02,

    create(args: {
        message: Any2TVMRampMessage
        execId: uint192
        gasOverride: coins | null
    }): OffRamp_DispatchValidated {
        return {
            $: 'OffRamp_DispatchValidated',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_DispatchValidated {
        loadAndCheckPrefix32(s, 0x58cfcb02, 'OffRamp_DispatchValidated');
        return {
            $: 'OffRamp_DispatchValidated',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            execId: s.loadUintBig(192),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: OffRamp_DispatchValidated, b: c.Builder): void {
        b.storeUint(0x58cfcb02, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.execId, 192);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
    },
    toCell(self: OffRamp_DispatchValidated): c.Cell {
        return makeCellFrom<OffRamp_DispatchValidated>(self, OffRamp_DispatchValidated.store);
    }
}

/**
 > struct (0x59e56170) OffRamp_NotifySuccess {
 >     header: RampMessageHeader
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifySuccess {
    readonly $: 'OffRamp_NotifySuccess'
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifySuccess = {
    PREFIX: 0x59e56170,

    create(args: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifySuccess {
        return {
            $: 'OffRamp_NotifySuccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifySuccess {
        loadAndCheckPrefix32(s, 0x59e56170, 'OffRamp_NotifySuccess');
        return {
            $: 'OffRamp_NotifySuccess',
            header: RampMessageHeader.fromSlice(s),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifySuccess, b: c.Builder): void {
        b.storeUint(0x59e56170, 32);
        RampMessageHeader.store(self.header, b);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.root);
    },
    toCell(self: OffRamp_NotifySuccess): c.Cell {
        return makeCellFrom<OffRamp_NotifySuccess>(self, OffRamp_NotifySuccess.store);
    }
}

/**
 > struct (0x177ebd03) OffRamp_NotifyFailure {
 >     header: RampMessageHeader
 >     execId: ReceiveExecutorId
 >     root: address
 > }
 */
export interface OffRamp_NotifyFailure {
    readonly $: 'OffRamp_NotifyFailure'
    header: RampMessageHeader
    execId: ReceiveExecutorId
    root: c.Address
}

export const OffRamp_NotifyFailure = {
    PREFIX: 0x177ebd03,

    create(args: {
        header: RampMessageHeader
        execId: ReceiveExecutorId
        root: c.Address
    }): OffRamp_NotifyFailure {
        return {
            $: 'OffRamp_NotifyFailure',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_NotifyFailure {
        loadAndCheckPrefix32(s, 0x177ebd03, 'OffRamp_NotifyFailure');
        return {
            $: 'OffRamp_NotifyFailure',
            header: RampMessageHeader.fromSlice(s),
            execId: ReceiveExecutorId.fromSlice(s),
            root: s.loadAddress(),
        }
    },
    store(self: OffRamp_NotifyFailure, b: c.Builder): void {
        b.storeUint(0x177ebd03, 32);
        RampMessageHeader.store(self.header, b);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.root);
    },
    toCell(self: OffRamp_NotifyFailure): c.Cell {
        return makeCellFrom<OffRamp_NotifyFailure>(self, OffRamp_NotifyFailure.store);
    }
}

/**
 > struct (0x7deaf076) OffRamp_ReleaseOrMint {
 >     queryId: uint64
 >     execId: ReceiveExecutorId
 >     tokenPool: address
 >     requestedFinalityConfig: uint32
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 > }
 */
export interface OffRamp_ReleaseOrMint {
    readonly $: 'OffRamp_ReleaseOrMint'
    queryId: uint64
    execId: ReceiveExecutorId
    tokenPool: c.Address
    requestedFinalityConfig: uint32
    request: TokenPool_ReleaseOrMintInV1
}

export const OffRamp_ReleaseOrMint = {
    PREFIX: 0x7deaf076,

    create(args: {
        queryId?: uint64
        execId: ReceiveExecutorId
        tokenPool: c.Address
        requestedFinalityConfig: uint32
        request: TokenPool_ReleaseOrMintInV1
    }): OffRamp_ReleaseOrMint {
        return {
            $: 'OffRamp_ReleaseOrMint',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OffRamp_ReleaseOrMint {
        loadAndCheckPrefix32(s, 0x7deaf076, 'OffRamp_ReleaseOrMint');
        return {
            $: 'OffRamp_ReleaseOrMint',
            queryId: s.loadUintBig(64),
            execId: ReceiveExecutorId.fromSlice(s),
            tokenPool: s.loadAddress(),
            requestedFinalityConfig: s.loadUintBig(32),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
        }
    },
    store(self: OffRamp_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x7deaf076, 32);
        b.storeUint(self.queryId, 64);
        ReceiveExecutorId.store(self.execId, b);
        b.storeAddress(self.tokenPool);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
    },
    toCell(self: OffRamp_ReleaseOrMint): c.Cell {
        return makeCellFrom<OffRamp_ReleaseOrMint>(self, OffRamp_ReleaseOrMint.store);
    }
}

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
 > struct (0xe0e882f5) TokenPool_ReleaseOrMintFinished {
 >     queryId: uint64
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface TokenPool_ReleaseOrMintFinished {
    readonly $: 'TokenPool_ReleaseOrMintFinished'
    queryId: uint64
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintFinished = {
    PREFIX: 0xe0e882f5,

    create(args: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintFinished {
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFinished {
        loadAndCheckPrefix32(s, 0xe0e882f5, 'TokenPool_ReleaseOrMintFinished');
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintFinished, b: c.Builder): void {
        b.storeUint(0xe0e882f5, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintFinished): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFinished>(self, TokenPool_ReleaseOrMintFinished.store);
    }
}

/**
 > struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_ReleaseOrMintFailure {
    readonly $: 'TokenPool_ReleaseOrMintFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_ReleaseOrMintFailure = {
    PREFIX: 0xef0cb36e,

    create(args: {
        queryId?: uint64
        errorCode: uint16
    }): TokenPool_ReleaseOrMintFailure {
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintFailure {
        loadAndCheckPrefix32(s, 0xef0cb36e, 'TokenPool_ReleaseOrMintFailure');
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_ReleaseOrMintFailure, b: c.Builder): void {
        b.storeUint(0xef0cb36e, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_ReleaseOrMintFailure): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintFailure>(self, TokenPool_ReleaseOrMintFailure.store);
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
 > type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<Cell<CrossChainAddress>, address, uint256>
 */
export type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<CrossChainAddress, c.Address, uint256>

export const TokenPool_ReleaseOrMintTransfer = {
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<CrossChainAddress, c.Address, uint256>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: s.loadAddress(),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            amount: s.loadUintBig(256),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_ReleaseOrMintTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<CrossChainAddress, c.Address, uint256>>(self.details, b,
            (v,b) => { b.storeAddress(v.receiver);
            b.storeUint(v.remoteChainSelector, 64);
            storeCellRef<CrossChainAddress>(v.originalSender, b, CrossChainAddress.store);
            b.storeUint(v.amount, 256);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_ReleaseOrMintTransfer): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintTransfer>(self, TokenPool_ReleaseOrMintTransfer.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintInV1 {
 >     transfer: TokenPool_ReleaseOrMintTransfer
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     sourcePoolData: cell?
 >     offchainTokenData: cell?
 > }
 */
export interface TokenPool_ReleaseOrMintInV1 {
    readonly $: 'TokenPool_ReleaseOrMintInV1'
    transfer: TokenPool_ReleaseOrMintTransfer
    sourcePoolAddress: CrossChainAddress
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        transfer: TokenPool_ReleaseOrMintTransfer
        sourcePoolAddress: CrossChainAddress
        sourcePoolData: c.Cell | null
        offchainTokenData: c.Cell | null
    }): TokenPool_ReleaseOrMintInV1 {
        return {
            $: 'TokenPool_ReleaseOrMintInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintInV1 {
        return {
            $: 'TokenPool_ReleaseOrMintInV1',
            transfer: TokenPool_ReleaseOrMintTransfer.fromSlice(s),
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            sourcePoolData: s.loadBoolean() ? s.loadRef() : null,
            offchainTokenData: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_ReleaseOrMintInV1, b: c.Builder): void {
        TokenPool_ReleaseOrMintTransfer.store(self.transfer, b);
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        storeTolkNullable<c.Cell>(self.sourcePoolData, b,
            (v,b) => b.storeRef(v)
        );
        storeTolkNullable<c.Cell>(self.offchainTokenData, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_ReleaseOrMintInV1): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintInV1>(self, TokenPool_ReleaseOrMintInV1.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintOutV1 {
 >     destinationAmount: coins
 > }
 */
export interface TokenPool_ReleaseOrMintOutV1 {
    readonly $: 'TokenPool_ReleaseOrMintOutV1'
    destinationAmount: coins
}

export const TokenPool_ReleaseOrMintOutV1 = {
    create(args: {
        destinationAmount: coins
    }): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            destinationAmount: s.loadCoins(),
        }
    },
    store(self: TokenPool_ReleaseOrMintOutV1, b: c.Builder): void {
        b.storeCoins(self.destinationAmount);
    },
    toCell(self: TokenPool_ReleaseOrMintOutV1): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintOutV1>(self, TokenPool_ReleaseOrMintOutV1.store);
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
 > struct RampMessageHeader {
 >     messageId: uint256
 >     sourceChainSelector: uint64
 >     destChainSelector: uint64
 >     sequenceNumber: uint64
 >     nonce: uint64
 > }
 */
export interface RampMessageHeader {
    readonly $: 'RampMessageHeader'
    messageId: uint256
    sourceChainSelector: uint64
    destChainSelector: uint64
    sequenceNumber: uint64
    nonce: uint64
}

export const RampMessageHeader = {
    create(args: {
        messageId: uint256
        sourceChainSelector: uint64
        destChainSelector: uint64
        sequenceNumber: uint64
        nonce: uint64
    }): RampMessageHeader {
        return {
            $: 'RampMessageHeader',
            ...args
        }
    },
    fromSlice(s: c.Slice): RampMessageHeader {
        return {
            $: 'RampMessageHeader',
            messageId: s.loadUintBig(256),
            sourceChainSelector: s.loadUintBig(64),
            destChainSelector: s.loadUintBig(64),
            sequenceNumber: s.loadUintBig(64),
            nonce: s.loadUintBig(64),
        }
    },
    store(self: RampMessageHeader, b: c.Builder): void {
        b.storeUint(self.messageId, 256);
        b.storeUint(self.sourceChainSelector, 64);
        b.storeUint(self.destChainSelector, 64);
        b.storeUint(self.sequenceNumber, 64);
        b.storeUint(self.nonce, 64);
    },
    toCell(self: RampMessageHeader): c.Cell {
        return makeCellFrom<RampMessageHeader>(self, RampMessageHeader.store);
    }
}

// ————————————————————————————————————————————
//    class ReceiveExecutor
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

export class ReceiveExecutor implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECGAEABOUAART/APSkE/S88sgLAQIBYgIDAgLOBAUCAUgUFQIBIAYHALVFuCAJLmJMACNVAE8vQl0NP/0z/TP9M/0z/UMddM0McAjjF2yM+RZ5WFwhbL/xTLPxLLP8s/yz8lzwu/UmD6UsnIz4WIUpD6UnHPC27MyYMG+wAD4IIAkufy8IA/U+JHyQCDXLCMmaX6Ujl8x7UTQ+kjU+kjTv9MCIcIG8kXTP/QE9ATRggCS4viSKccF8vQI0wABkvoAkm0B4vpI0z/TP9cL/xC8EKsQmhCJEHgQZxBW8AEHyPpSFswU+lISy7/LAss/9AD0AMntVODXLCAHLuy84wKJ1yeAICQoAzRfBDQhbo4tMyXQ1DHXTIIAkucB0McA8vQg0PpI0XHIz4WIEvpSghDdXVEnzwuOyYBA+wAD4TL4I3PIz4WIUpD6UoIQWM/LAs8LjijPFCbPC78lbpQ1BM+Bls+DUAX6AuLJgED7AAKAB/jHtRND6SNT6SNO/0wIhwgbyRdM/9AT0BNGCAJLi+JIpxwXy9Aj6SDCCAJLgJMADNVAE8vQl0NP/0z/TP9M/0z/6SDAIggCS4QnHBRjy9MjPkWeVhcIUy/8Syz/LP8s/E8s/I88Lv1JA+lLJyM+FiFJw+lJxzwtuzMmDBvsABcgLAAjdzN21BP7jAtcsJwdEF6yOXTHtRND6SNT6SNO/0wIhwgbyRdM/9AT0BNGCAJLiIW6zm/iSItD6SNHHBcMAkXDi8vQI0z/XTBCJEHgQZxBWEEUQNBAj8AIHyPpSFswU+lISy7/LAss/9AD0AMntVODXLCd4ZZt04wLXLCAu9w3c4wIwhA8BDA0ODwAs+lIUzBL6Usu/z4dAEss/9AD0AMntVAL+Me1E0PpI1PpI07/TAiHCBvJF0z/0BPQEMdGCAJLiIW6z8vQg0PpI0YIAkuL4kljHBfL0B/pIMfpQMIIAkuUjwAE0UAPy9CTQ0/8x0z/TPzHTPzHTPzHU1DH6SPoAMfQFggCS5CFus/L00CDHALOWggCS4/Lw4SDXSwGRMOMO1BARAJBb7UTQ+kjU+kjTv9MCIcIG8kXTP/QE9ATRggCS4iFus5v4kiLQ+kjRxwXDAJFw4vL0B8j6UhbMFPpSEsu/ywLLP/QA9ADJ7VQB/jHtRND6SNT6SNO/0wIhwgbyRdM/9AT0BNGCAJLi+JIpxwXy9Aj6SNcLByDCAjHyRYIAkuAEwAMU8vQl0NP/0z/TP9M/0z/6SDAIggCS4QnHBRjy9MjPkF369A4Uy/8Syz/LP8s/E8s/I88Lv1JA+lLJyM+FiFJw+lJxzwtuzMkTAAjHAPL0ABaBNLwBwAHy9NdM0AH8+kjTHzHUMdP/xwCWggCS4/Lw4SfI+lLJBMj6UhbLPxTMFMv/EvpSyW1tcMjL/xPMFMwT9AAS9ADJyIvH3q8HYAAAAAAAAAAIzxYlzwu/FPpSz5AAAAACE8zJyM+FiFJw+lJxzwtuzMmAQPsABcj6UhTMEvpSy7/PhUASyz8SEgAO9AD0AMntVAA4gED7AAXI+lIUzBL6Usu/z4ZAEss/9AD0AMntVAIBIBYXAAu4aFgQF4gAX7Yr8aEbY0tzWXMbQwtLcXOje3FzGxtLgXKTKxsrS7MqK8MrG6uje5QRamJcblxhEAAbtcUQQBJcFAQQgfd+UJA=');

    static Errors = {
        'Utils_Error.InvalidData': 13500,
        'Utils_Error.BitmapOutOfBounds': 13501,
        'ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage': 37600,
        'ReceiveExecutor_Error.NotificationFromInvalidReceiver': 37601,
        'ReceiveExecutor_Error.Unauthorized': 37602,
        'ReceiveExecutor_Error.UnsupportedNumberOfTokens': 37603,
        'ReceiveExecutor_Error.NoTokenAmountsInMessage': 37604,
        'ReceiveExecutor_Error.TokenAdminRegistryUnexpectedResponse': 37605,
        'ReceiveExecutor_Error.TokenPoolUnexpectedResponse': 37606,
        'ReceiveExecutor_Error.PTTNotSupported': 37607,
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
            throw new Error(`Custom pack/unpack for 'ReceiveExecutor.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new ReceiveExecutor(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        message: Any2TVMRampMessage
        root: c.Address
        execId: uint192
        state?: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
        lastExecutionTimestamp?: uint64 /* = 0 */
        tokenAdminRegistry?: c.Address | null /* = null */
        tokenPool?: c.Address | null /* = null */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? ReceiveExecutor.CodeCell,
            data: ReceiveExecutor_Storage.toCell(ReceiveExecutor_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new ReceiveExecutor(address, initialState);
    }

    static createCellOfReceiveExecutorInitExecute(body: {
        gasOverride?: coins | null /* = null */
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
    }) {
        return ReceiveExecutor_InitExecute.toCell(ReceiveExecutor_InitExecute.create(body));
    }

    static createCellOfReceiveExecutorBounced(body: {
        receiver: c.Address
        reason: ReceiveExecutor_BouncedReason
    }) {
        return ReceiveExecutor_Bounced.toCell(ReceiveExecutor_Bounced.create(body));
    }

    static createCellOfTokenRegistryReturnTokenInfo(body: {
        minterAddress: c.Address
        tokenPool: c.Address | null
    }) {
        return TokenRegistry_ReturnTokenInfo.toCell(TokenRegistry_ReturnTokenInfo.create(body));
    }

    static createCellOfTokenPoolReleaseOrMintFinished(body: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }) {
        return TokenPool_ReleaseOrMintFinished.toCell(TokenPool_ReleaseOrMintFinished.create(body));
    }

    static createCellOfTokenPoolReleaseOrMintFailure(body: {
        queryId?: uint64
        errorCode: uint16
    }) {
        return TokenPool_ReleaseOrMintFailure.toCell(TokenPool_ReleaseOrMintFailure.create(body));
    }

    static createCellOfReceiveExecutorConfirm(body: {
        receiver: c.Address
    }) {
        return ReceiveExecutor_Confirm.toCell(ReceiveExecutor_Confirm.create(body));
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

    async sendReceiveExecutorInitExecute(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        gasOverride?: coins | null /* = null */
        root: c.Address
        sequenceNumber: uint64
        sourceChainSelector: uint64
        messageId: uint256
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReceiveExecutor_InitExecute.toCell(ReceiveExecutor_InitExecute.create(body)),
            ...extraOptions
        });
    }

    async sendReceiveExecutorBounced(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        receiver: c.Address
        reason: ReceiveExecutor_BouncedReason
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReceiveExecutor_Bounced.toCell(ReceiveExecutor_Bounced.create(body)),
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

    async sendTokenPoolReleaseOrMintFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        out: TokenPool_ReleaseOrMintOutV1
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMintFinished.toCell(TokenPool_ReleaseOrMintFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMintFailure(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        errorCode: uint16
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMintFailure.toCell(TokenPool_ReleaseOrMintFailure.create(body)),
            ...extraOptions
        });
    }

    async sendReceiveExecutorConfirm(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        receiver: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReceiveExecutor_Confirm.toCell(ReceiveExecutor_Confirm.create(body)),
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
