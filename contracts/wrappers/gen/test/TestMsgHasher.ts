// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TestMsgHasher contract in Tolk.
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'TestMsgHasher.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > TestMsgHasher.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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

type uint32 = bigint
type uint64 = bigint
type uint96 = bigint
type uint256 = bigint

/**
 > struct Storage {
 > }
 */
export interface Storage {
    readonly $: 'Storage'
}

export const Storage = {
    create(): Storage {
        return {
            $: 'Storage',
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
        }
    },
    store(self: Storage, b: c.Builder): void {
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
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
 >     destGasAmount: coins
 >     extraData: cell?
 >     amount: uint256
 > }
 */
export interface Any2TVMTokenTransfer {
    readonly $: 'Any2TVMTokenTransfer'
    sourcePoolAddress: CrossChainAddress
    token: c.Address
    destGasAmount: coins
    extraData: c.Cell | null
    amount: uint256
}

export const Any2TVMTokenTransfer = {
    create(args: {
        sourcePoolAddress: CrossChainAddress
        token: c.Address
        destGasAmount: coins
        extraData: c.Cell | null
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
            destGasAmount: s.loadCoins(),
            extraData: s.loadBoolean() ? s.loadRef() : null,
            amount: s.loadUintBig(256),
        }
    },
    store(self: Any2TVMTokenTransfer, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.sourcePoolAddress, b, CrossChainAddress.store);
        b.storeAddress(self.token);
        b.storeCoins(self.destGasAmount);
        storeTolkNullable<c.Cell>(self.extraData, b,
            (v,b) => b.storeRef(v)
        );
        b.storeUint(self.amount, 256);
    },
    toCell(self: Any2TVMTokenTransfer): c.Cell {
        return makeCellFrom<Any2TVMTokenTransfer>(self, Any2TVMTokenTransfer.store);
    }
}

/**
 > struct TVM2AnyRampMessage {
 >     header: RampMessageHeader
 >     sender: address
 >     body: Cell<TVM2AnyRampMessageBody>
 >     feeValueJuels: uint96
 > }
 */
export interface TVM2AnyRampMessage {
    readonly $: 'TVM2AnyRampMessage'
    header: RampMessageHeader
    sender: c.Address
    body: TVM2AnyRampMessageBody
    feeValueJuels: uint96
}

export const TVM2AnyRampMessage = {
    create(args: {
        header: RampMessageHeader
        sender: c.Address
        body: TVM2AnyRampMessageBody
        feeValueJuels: uint96
    }): TVM2AnyRampMessage {
        return {
            $: 'TVM2AnyRampMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): TVM2AnyRampMessage {
        return {
            $: 'TVM2AnyRampMessage',
            header: RampMessageHeader.fromSlice(s),
            sender: s.loadAddress(),
            body: loadCellRef<TVM2AnyRampMessageBody>(s, TVM2AnyRampMessageBody.fromSlice),
            feeValueJuels: s.loadUintBig(96),
        }
    },
    store(self: TVM2AnyRampMessage, b: c.Builder): void {
        RampMessageHeader.store(self.header, b);
        b.storeAddress(self.sender);
        storeCellRef<TVM2AnyRampMessageBody>(self.body, b, TVM2AnyRampMessageBody.store);
        b.storeUint(self.feeValueJuels, 96);
    },
    toCell(self: TVM2AnyRampMessage): c.Cell {
        return makeCellFrom<TVM2AnyRampMessage>(self, TVM2AnyRampMessage.store);
    }
}

/**
 > struct TVM2AnyRampMessageBody {
 >     receiver: Cell<CrossChainAddress>
 >     data: cell
 >     extraArgs: Cell<ExtraArgs>
 >     tokenTransfer: SnakedCell<TVM2AnyTokenTransfer>
 >     feeToken: address
 >     feeTokenAmount: coins
 > }
 */
export interface TVM2AnyRampMessageBody {
    readonly $: 'TVM2AnyRampMessageBody'
    receiver: CrossChainAddress
    data: c.Cell
    extraArgs: ExtraArgs
    tokenTransfer: SnakedCell<TVM2AnyTokenTransfer>
    feeToken: c.Address
    feeTokenAmount: coins
}

export const TVM2AnyRampMessageBody = {
    create(args: {
        receiver: CrossChainAddress
        data: c.Cell
        extraArgs: ExtraArgs
        tokenTransfer: SnakedCell<TVM2AnyTokenTransfer>
        feeToken: c.Address
        feeTokenAmount: coins
    }): TVM2AnyRampMessageBody {
        return {
            $: 'TVM2AnyRampMessageBody',
            ...args
        }
    },
    fromSlice(s: c.Slice): TVM2AnyRampMessageBody {
        return {
            $: 'TVM2AnyRampMessageBody',
            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            data: s.loadRef(),
            extraArgs: loadCellRef<ExtraArgs>(s, ExtraArgs.fromSlice),
            tokenTransfer: loadSnakedCellOf(s, TVM2AnyTokenTransfer.fromSlice),
            feeToken: s.loadAddress(),
            feeTokenAmount: s.loadCoins(),
        }
    },
    store(self: TVM2AnyRampMessageBody, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.receiver, b, CrossChainAddress.store);
        b.storeRef(self.data);
        storeCellRef<ExtraArgs>(self.extraArgs, b, ExtraArgs.store);
        storeSnakedCellOf(self.tokenTransfer, b, TVM2AnyTokenTransfer.store);
        b.storeAddress(self.feeToken);
        b.storeCoins(self.feeTokenAmount);
    },
    toCell(self: TVM2AnyRampMessageBody): c.Cell {
        return makeCellFrom<TVM2AnyRampMessageBody>(self, TVM2AnyRampMessageBody.store);
    }
}

/**
 > struct TVM2AnyTokenTransfer {
 >     sourcePoolAddress: address
 >     amount: uint256
 >     destTokenAddress: Cell<CrossChainAddress>
 >     extraData: cell
 >     destExecData: cell
 > }
 */
export interface TVM2AnyTokenTransfer {
    readonly $: 'TVM2AnyTokenTransfer'
    sourcePoolAddress: c.Address
    amount: uint256
    destTokenAddress: CrossChainAddress
    extraData: c.Cell
    destExecData: c.Cell
}

export const TVM2AnyTokenTransfer = {
    create(args: {
        sourcePoolAddress: c.Address
        amount: uint256
        destTokenAddress: CrossChainAddress
        extraData: c.Cell
        destExecData: c.Cell
    }): TVM2AnyTokenTransfer {
        return {
            $: 'TVM2AnyTokenTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): TVM2AnyTokenTransfer {
        return {
            $: 'TVM2AnyTokenTransfer',
            sourcePoolAddress: s.loadAddress(),
            amount: s.loadUintBig(256),
            destTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            extraData: s.loadRef(),
            destExecData: s.loadRef(),
        }
    },
    store(self: TVM2AnyTokenTransfer, b: c.Builder): void {
        b.storeAddress(self.sourcePoolAddress);
        b.storeUint(self.amount, 256);
        storeCellRef<CrossChainAddress>(self.destTokenAddress, b, CrossChainAddress.store);
        b.storeRef(self.extraData);
        b.storeRef(self.destExecData);
    },
    toCell(self: TVM2AnyTokenTransfer): c.Cell {
        return makeCellFrom<TVM2AnyTokenTransfer>(self, TVM2AnyTokenTransfer.store);
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


// ————————————————————————————————————————————
//    class TestMsgHasher
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

export class TestMsgHasher implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECCgEAAVcAART/APSkE/S88sgLAQIBYgIDABjQ+JHyQIQPAccA8vQCASAEBQDPv58wDoaf/pn5jpn5jpn+mf6mp9JH0AegJoxoQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAEZGX/if0pC2WfqAL9AQnln+TkEuul+STBg915RIrnCuX/ieYJ5mZ6AHyLQCASAGBwIBSAgJAGG5bryI0INAZHTxx0URWYcBjzZ2aJQM1S08gD22SEq0SvqktqKO+gzxYTyz/LP8z5FoAGOwwPIjQgNrmuA7oAWlLcAn3tWi59feKrE4r0HoKT+knzixGfrXSDPFhPLP8s/+lL5FoACpsUuAdDT/zHTPzHTPzHTP9M/+kjU018x0Y0IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgyCHXS/JJgwe68onOFcv/+lISyz/LP8z5FoA==');

    static Errors = {
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
            throw new Error(`Custom pack/unpack for 'TestMsgHasher.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new TestMsgHasher(address);
    }

    static fromStorage(emptyStorage: {
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TestMsgHasher.CodeCell,
            data: Storage.toCell(Storage.create()),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TestMsgHasher(address, initialState);
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

    async getAny2TVMRampMessageID(provider: ContractProvider, msg: Any2TVMRampMessage, metadataHash: bigint): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAny2TVMRampMessageID', [
            { type: 'cell', cell: Any2TVMRampMessage.toCell(msg) },
            { type: 'int', value: metadataHash },
        ]));
        return r.readBigInt();
    }

    async getTVM2AnyRampMessageID(provider: ContractProvider, msg: TVM2AnyRampMessage, metadataHash: bigint): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getTVM2AnyRampMessageID', [
            { type: 'cell', cell: TVM2AnyRampMessage.toCell(msg) },
            { type: 'int', value: metadataHash },
        ]));
        return r.readBigInt();
    }

    async getAny2TVMV1MetadataHash(provider: ContractProvider, sourceChainSelector: uint64, destChainSelector: uint64, onRamp: CrossChainAddress): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAny2TVMV1MetadataHash', [
            { type: 'int', value: sourceChainSelector },
            { type: 'int', value: destChainSelector },
            { type: 'cell', cell: CrossChainAddress.toCell(onRamp) },
        ]));
        return r.readBigInt();
    }

    async getTVM2AnyV1MetadataHash(provider: ContractProvider, sourceChainSelector: uint64, destChainSelector: uint64, onRamp: c.Address): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getTVM2AnyV1MetadataHash', [
            { type: 'int', value: sourceChainSelector },
            { type: 'int', value: destChainSelector },
            { type: 'slice', cell: makeCellFrom<c.Address>(onRamp,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBigInt();
    }
}
