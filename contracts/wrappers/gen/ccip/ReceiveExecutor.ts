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
    sender: CellRef<CrossChainAddress>
    data: c.Cell
    receiver: c.Address
    gasLimit: coins
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer> | null
}

export const Any2TVMRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: CellRef<CrossChainAddress>
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
            tokenAmounts: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: Any2TVMRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        storeCellRef<CrossChainAddress>(self.sender, b, CrossChainAddress.store);
        b.storeRef(self.data);
        b.storeAddress(self.receiver);
        b.storeCoins(self.gasLimit);
        storeTolkNullable<SnakedCell<Any2TVMTokenTransfer>>(self.tokenAmounts, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: Any2TVMRampMessage): c.Cell {
        return makeCellFrom<Any2TVMRampMessage>(self, Any2TVMRampMessage.store);
    }
}

/**
 > struct Any2TVMTokenTransfer {
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     destPoolAddress: address
 >     destGasAmount: uint32
 >     extraData: cell
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CellRef<CrossChainAddress>
    destPoolAddress: c.Address
    destGasAmount: uint32
    extraData: c.Cell
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CellRef<CrossChainAddress>
        destPoolAddress: c.Address
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
            destPoolAddress: s.loadAddress(),
            destGasAmount: s.loadUintBig(32),
            extraData: s.loadRef(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.destPoolAddress);
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
 > }
 */
export interface ReceiveExecutor_Storage {
    readonly $: 'ReceiveExecutor_Storage'
    owner: c.Address
    message: CellRef<Any2TVMRampMessage>
    root: c.Address
    execId: uint192
    state: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
    lastExecutionTimestamp: uint64 /* = 0 */
}

export const ReceiveExecutor_Storage = {
    create(args: {
        owner: c.Address
        message: CellRef<Any2TVMRampMessage>
        root: c.Address
        execId: uint192
        state?: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
        lastExecutionTimestamp?: uint64 /* = 0 */
    }): ReceiveExecutor_Storage {
        return {
            $: 'ReceiveExecutor_Storage',
            state: 0n,
            lastExecutionTimestamp: 0n,
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
        }
    },
    store(self: ReceiveExecutor_Storage, b: c.Builder): void {
        b.storeAddress(self.owner);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeAddress(self.root);
        b.storeUint(self.execId, 192);
        ReceiveExecutor_MessageState.store(self.state, b);
        b.storeUint(self.lastExecutionTimestamp, 64);
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
 > enum ReceiveExecutor_MessageState { 4 variants }
 */
export type ReceiveExecutor_MessageState = bigint

export const ReceiveExecutor_MessageState = {
    Untouched: 0n,
    Execute: 1n,
    ExecuteFailed: 2n,
    Success: 3n,

    fromSlice(s: c.Slice): ReceiveExecutor_MessageState {
        return s.loadUintBig(2);
    },
    store(self: ReceiveExecutor_MessageState, b: c.Builder): void {
        b.storeUint(self, 2);
    },
    toCell(self: ReceiveExecutor_MessageState): c.Cell {
        return makeCellFrom<ReceiveExecutor_MessageState>(self, ReceiveExecutor_MessageState.store);
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
    message: CellRef<Any2TVMRampMessage>
    execId: uint192
    gasOverride: coins | null
}

export const OffRamp_DispatchValidated = {
    PREFIX: 0x58cfcb02,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
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
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

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
    static CodeCell = c.Cell.fromBase64('te6ccgECDgEAAi8AART/APSkE/S88sgLAQIBYgIDAvjQ+JHyQCDXLCMmaX6Ujmkx7UTQ+kjU+kjTv9MBMdM/MdGCAJLj+JIlxwXy9ATTAAGT+gAwkjBt4vgjyM+FiFJQ+lKCEFjPywLPC44kzxQmzwu/Im6UbBLPgZXPg1j6AuLJgED7AAPI+lISzPpSEsu/z4WAyz/J7VTgidcnBAUCAUgKCwAIAOXdlwIm4wLXLCAu9w3c4wIwhA8BxwDy9AYHAf4x7UTQ+kjU+kjTv9MB0z/RggCS4/iSJ8cF8vQG+kgwggCS4QLAARLy9CPQ0//TP9M/0z/TP9Qx1DH6SPoAMfQEMdEGggCS4gfHBRby9MjPkWeVhcIUy/8Syz/LP8s/yz8hzwu/UiD6UsnIz4WIUlD6UnHPC27MyYMG+wADyPpSCAH+Me1E0PpI1PpI07/TAdM/0YIAkuP4kifHBfL0BvpI1wsHIMICMfJFggCS4QLAARLy9CPQ0//TP9M/0z/TP9Qx1DH6SPoAMfQEMdEGggCS4gfHBRby9MjPkF369A4Uy/8Syz/LP8s/yz8hzwu/UiD6UsnIz4WIUlD6UnHPC27MyQkAHBLM+lLLv8+HgMs/ye1UACyAQPsAA8j6UhLM+lLLv8+GgMs/ye1UAgEgDA0AC7hoWBAXiABftivxoRtjS3NZcxtDC0txc6N7cXMbG0uBcpMrGytLsyorwysbq6N7lBFqYlxsXGUQABu1xRBAElwUBBCB935QkA==');

    static Errors = {
        'Error.UpdatingStateOfNonExecutedMessage': 37601,
        'Error.NotificationFromInvalidReceiver': 37602,
        'Error.Unauthorized': 37603,
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
        message: CellRef<Any2TVMRampMessage>
        root: c.Address
        execId: uint192
        state?: ReceiveExecutor_MessageState /* = 0 as ReceiveExecutor_MessageState */
        lastExecutionTimestamp?: uint64 /* = 0 */
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
