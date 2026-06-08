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
 > }
 */
export interface CCIPSendExecutor_Addresses {
    readonly $: 'CCIPSendExecutor_Addresses'
    onramp: c.Address
    feeQuoter: c.Address
}

export const CCIPSendExecutor_Addresses = {
    create(args: {
        onramp: c.Address
        feeQuoter: c.Address
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
        }
    },
    store(self: CCIPSendExecutor_Addresses, b: c.Builder): void {
        b.storeAddress(self.onramp);
        b.storeAddress(self.feeQuoter);
    },
    toCell(self: CCIPSendExecutor_Addresses): c.Cell {
        return makeCellFrom<CCIPSendExecutor_Addresses>(self, CCIPSendExecutor_Addresses.store);
    }
}

/**
 > type CCIPSendExecutor_State = Cell<CCIPSendExecutor_State_Initialized> | Cell<CCIPSendExecutor_State_OnGoingFeeValidation> | Cell<CCIPSendExecutor_State_Finalized>
 */
export type CCIPSendExecutor_State =
    | { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: CellRef<CCIPSendExecutor_State_Initialized> }
    | { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: CellRef<CCIPSendExecutor_State_OnGoingFeeValidation> }
    | { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: CellRef<CCIPSendExecutor_State_Finalized> }

export const CCIPSendExecutor_State = {
    fromSlice(s: c.Slice): CCIPSendExecutor_State {
        return lookupPrefixAndEat(s, 0b00, 2) ? { $: 'Cell<CCIPSendExecutor_State_Initialized>', value: loadCellRef<CCIPSendExecutor_State_Initialized>(s, CCIPSendExecutor_State_Initialized.fromSlice) } :
            lookupPrefixAndEat(s, 0b01, 2) ? { $: 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>', value: loadCellRef<CCIPSendExecutor_State_OnGoingFeeValidation>(s, CCIPSendExecutor_State_OnGoingFeeValidation.fromSlice) } :
            lookupPrefixAndEat(s, 0b10, 2) ? { $: 'Cell<CCIPSendExecutor_State_Finalized>', value: loadCellRef<CCIPSendExecutor_State_Finalized>(s, CCIPSendExecutor_State_Finalized.fromSlice) } :
            throwNonePrefixMatch('CCIPSendExecutor_State');
    },
    store(self: CCIPSendExecutor_State, b: c.Builder): void {
        switch (self.$) {
            case 'Cell<CCIPSendExecutor_State_Initialized>':
                b.storeUint(0b00, 2);
                storeCellRef<CCIPSendExecutor_State_Initialized>(self.value, b, CCIPSendExecutor_State_Initialized.store);
                break;
            case 'Cell<CCIPSendExecutor_State_OnGoingFeeValidation>':
                b.storeUint(0b01, 2);
                storeCellRef<CCIPSendExecutor_State_OnGoingFeeValidation>(self.value, b, CCIPSendExecutor_State_OnGoingFeeValidation.store);
                break;
            case 'Cell<CCIPSendExecutor_State_Finalized>':
                b.storeUint(0b10, 2);
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
 > struct (0xdcf993c2) OnRamp_Send {
 >     msg: Cell<Router_CCIPSend>
 >     metadata: Metadata
 > }
 */
export interface OnRamp_Send {
    readonly $: 'OnRamp_Send'
    msg: CellRef<Router_CCIPSend>
    metadata: Metadata
}

export const OnRamp_Send = {
    PREFIX: 0xdcf993c2,

    create(args: {
        msg: CellRef<Router_CCIPSend>
        metadata: Metadata
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
        }
    },
    store(self: OnRamp_Send, b: c.Builder): void {
        b.storeUint(0xdcf993c2, 32);
        storeCellRef<Router_CCIPSend>(self.msg, b, Router_CCIPSend.store);
        Metadata.store(self.metadata, b);
    },
    toCell(self: OnRamp_Send): c.Cell {
        return makeCellFrom<OnRamp_Send>(self, OnRamp_Send.store);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECFwEAA+cAART/APSkE/S88sgLAQIBYgIDAgLPBAUCAUgTFARdPiRjo/THzHXLCOkt/q0MeMC8j/gINcsJXnjFZzjAtcsIP0wG6TjAtcsJeeFWHyAGBwgJA/cW4IJMS0AggnZBcCCEAVdSoCCEATjOICCC8FNwLYJoKCgIqAlvOMC+ACIVHh2U4cEyMvfz5Nz5k8KE8z6UgH6AszPhoDMye1UI9D6SPpIMdHIz5M+mszaKc8L31AD+gLLXybPFFJQ+lIk+gLJyM+FiBL6UnHPC27MyYMGgEBIRA/ztRNDT39csJufMnhTyv9T6SPoA1NcsAZQwgQCHjhXXLAOUMIEAiJvXLAUxkvI/4YEAieLigUWIgQCIWLry9IhUdUNTVATIy9/Pk3PmTwoTzPpSAfoCzM+GgMzJ7VTQ+kj6SDHRyM+TEBo4hhXL34FFjM8L/xPM+lIB+gLJyIkSCgsC/jHXLCbnzJ4U8r/U+kj6ANdM0PpI0e1E0PpI1wvfAcj6UhL6UsmBRYn4kvgoxwXy9IFFi/iXghAFXUqAghAE4ziAggvBTcC2CaC+8vQg0PpIMfpI0YIQBBzbQIsIyM+R0lv9WijPFM7JyM+FiBP6UgH6AnHPC2rMyXH7AIhUclQSDADOMe1E0NPf1ywm58yeFPK/1PpI+gDU1ywBlddMgQCHjhfXLAOV10yBAIic1ywFkvI/4ddMgQCJ4uKBRYiBAIhYuvL0gUWJItD6SDH6SNH4kscF8vQG+gDTX9QQiRB4EGcQVhBF8AFfBgEU4wIwhA8BxwDy9A0AAWIAHs8WEvpScc8LbszJgwb7AAA+JjY2NjYFyMvfz5Nz5k8KFMwS+lIB+gLMz4WAzMntVAP+Me1E0NPf1ywm58yeFPK/1PpI+gDU1ywBlDCBAIeOFdcsA5QwgQCIm9csBTGS8j/hgQCJ4uKBRYiBAIhYuvL0gUWJIdD6SDH6SNH4kscF8vQF1wv/iFR1Q1NZBMjL38+Tc+ZPChPM+lIB+gLMz4aAzMntVCXQNgX6SPpIMdHIiRIODwAIxAaOIQBWzxYlzwvfNVBUy/8izxQyUgL6UjEi+gJsEsnIz4WIEvpScc8LbszJgwb7AAGqW4hUdlRTZQTIy9/Pk3PmTwoTzPpSAfoCzM+GgMzJ7VQh0PpI+kgx0cjPkxAaOIYnzwvfgUWKzwv/Js8UUlD6UiT6AsnIz4WIEvpScc8LbszJgwb7ABIABPsAAAACASAVFgALuGhYEAsoAGG2K/GhI2NLc1lzG0MLS3Fzo3txcxsbS4FyGhpKgpsrcyIrwysbq6N7lBFqYlxsXGMQABm1xRAosRQEEIH3flCQ');

    static Errors = {
        'CCIPSendExecutor_Error.StateNotExpected': 17800,
        'CCIPSendExecutor_Error.Unauthorized': 17801,
        'CCIPSendExecutor_Error.InsufficientFee': 17803,
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
