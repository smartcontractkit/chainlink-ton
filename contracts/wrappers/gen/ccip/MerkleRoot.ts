// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a MerkleRoot contract in Tolk.
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'MerkleRoot.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > MerkleRoot.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
type uint128 = bigint
type uint256 = bigint

/**
 > type SnakedCell<T> = cell
 */
export type SnakedCell<T> = c.Cell

/**
 > struct (0xc73d5a8a) OffRamp_ExecuteValidated {
 >     message: Cell<Any2TVMRampMessage>
 >     root: MerkleRootId
 >     metadataHash: uint256
 >     gasOverride: coins?
 >     executionState: ExecutionState
 > }
 */
export interface OffRamp_ExecuteValidated {
    readonly $: 'OffRamp_ExecuteValidated'
    message: CellRef<Any2TVMRampMessage>
    root: MerkleRootId
    metadataHash: uint256
    gasOverride: coins | null
    executionState: ExecutionState
}

export const OffRamp_ExecuteValidated = {
    PREFIX: 0xc73d5a8a,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
        root: MerkleRootId
        metadataHash: uint256
        gasOverride: coins | null
        executionState: ExecutionState
    }): OffRamp_ExecuteValidated {
        return {
            $: 'OffRamp_ExecuteValidated',
            ...args
        }
    },
    fromSlice(s: c.Slice): OffRamp_ExecuteValidated {
        loadAndCheckPrefix32(s, 0xc73d5a8a, 'OffRamp_ExecuteValidated');
        return {
            $: 'OffRamp_ExecuteValidated',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            root: MerkleRootId.fromSlice(s),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
            executionState: ExecutionState.fromSlice(s),
        }
    },
    store(self: OffRamp_ExecuteValidated, b: c.Builder): void {
        b.storeUint(0xc73d5a8a, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        MerkleRootId.store(self.root, b);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
        ExecutionState.store(self.executionState, b);
    },
    toCell(self: OffRamp_ExecuteValidated): c.Cell {
        return makeCellFrom<OffRamp_ExecuteValidated>(self, OffRamp_ExecuteValidated.store);
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
 > type MerkleRootId = uint256
 */
export type MerkleRootId = uint256

export const MerkleRootId = {
    fromSlice(s: c.Slice): MerkleRootId {
        return s.loadUintBig(256);
    },
    store(self: MerkleRootId, b: c.Builder): void {
        b.storeUint(self, 256);
    },
    toCell(self: MerkleRootId): c.Cell {
        return makeCellFrom<MerkleRootId>(self, MerkleRootId.store);
    }
}

/**
 > enum ExecutionState { 4 variants }
 */
export type ExecutionState = bigint

export const ExecutionState = {
    Untouched: 0n,
    InProgress: 1n,
    Success: 2n,
    Failure: 3n,

    fromSlice(s: c.Slice): ExecutionState {
        return s.loadUintBig(8);
    },
    store(self: ExecutionState, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: ExecutionState): c.Cell {
        return makeCellFrom<ExecutionState>(self, ExecutionState.store);
    }
}

/**
 > struct (0x038ede91) MerkleRoot_Validate {
 >     message: Cell<Any2TVMRampMessage>
 >     permissionlessExecutionThresholdSeconds: uint32
 >     metadataHash: uint256
 >     gasOverride: coins?
 > }
 */
export interface MerkleRoot_Validate {
    readonly $: 'MerkleRoot_Validate'
    message: CellRef<Any2TVMRampMessage>
    permissionlessExecutionThresholdSeconds: uint32
    metadataHash: uint256
    gasOverride: coins | null
}

export const MerkleRoot_Validate = {
    PREFIX: 0x038ede91,

    create(args: {
        message: CellRef<Any2TVMRampMessage>
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: coins | null
    }): MerkleRoot_Validate {
        return {
            $: 'MerkleRoot_Validate',
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_Validate {
        loadAndCheckPrefix32(s, 0x038ede91, 'MerkleRoot_Validate');
        return {
            $: 'MerkleRoot_Validate',
            message: loadCellRef<Any2TVMRampMessage>(s, Any2TVMRampMessage.fromSlice),
            permissionlessExecutionThresholdSeconds: s.loadUintBig(32),
            metadataHash: s.loadUintBig(256),
            gasOverride: s.loadBoolean() ? s.loadCoins() : null,
        }
    },
    store(self: MerkleRoot_Validate, b: c.Builder): void {
        b.storeUint(0x038ede91, 32);
        storeCellRef<Any2TVMRampMessage>(self.message, b, Any2TVMRampMessage.store);
        b.storeUint(self.permissionlessExecutionThresholdSeconds, 32);
        b.storeUint(self.metadataHash, 256);
        storeTolkNullable<coins>(self.gasOverride, b,
            (v,b) => b.storeCoins(v)
        );
    },
    toCell(self: MerkleRoot_Validate): c.Cell {
        return makeCellFrom<MerkleRoot_Validate>(self, MerkleRoot_Validate.store);
    }
}

/**
 > struct (0x019f4cd2) MerkleRoot_MarkState {
 >     seqNum: uint64
 >     state: ExecutionState
 > }
 */
export interface MerkleRoot_MarkState {
    readonly $: 'MerkleRoot_MarkState'
    seqNum: uint64
    state: ExecutionState
}

export const MerkleRoot_MarkState = {
    PREFIX: 0x019f4cd2,

    create(args: {
        seqNum: uint64
        state: ExecutionState
    }): MerkleRoot_MarkState {
        return {
            $: 'MerkleRoot_MarkState',
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_MarkState {
        loadAndCheckPrefix32(s, 0x019f4cd2, 'MerkleRoot_MarkState');
        return {
            $: 'MerkleRoot_MarkState',
            seqNum: s.loadUintBig(64),
            state: ExecutionState.fromSlice(s),
        }
    },
    store(self: MerkleRoot_MarkState, b: c.Builder): void {
        b.storeUint(0x019f4cd2, 32);
        b.storeUint(self.seqNum, 64);
        ExecutionState.store(self.state, b);
    },
    toCell(self: MerkleRoot_MarkState): c.Cell {
        return makeCellFrom<MerkleRoot_MarkState>(self, MerkleRoot_MarkState.store);
    }
}

/**
 > struct MerkleRoot_Storage {
 >     root: uint256
 >     owner: address
 >     timestamp: uint64
 >     minMsgNr: uint64
 >     maxMsgNr: uint64
 >     messageStates: uint128
 >     deliveredMessageCount: uint16
 > }
 */
export interface MerkleRoot_Storage {
    readonly $: 'MerkleRoot_Storage'
    root: uint256
    owner: c.Address
    timestamp: uint64
    minMsgNr: uint64
    maxMsgNr: uint64
    messageStates: uint128
    deliveredMessageCount: uint16 /* = 0 */
}

export const MerkleRoot_Storage = {
    create(args: {
        root: uint256
        owner: c.Address
        timestamp: uint64
        minMsgNr: uint64
        maxMsgNr: uint64
        messageStates: uint128
        deliveredMessageCount?: uint16 /* = 0 */
    }): MerkleRoot_Storage {
        return {
            $: 'MerkleRoot_Storage',
            deliveredMessageCount: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): MerkleRoot_Storage {
        return {
            $: 'MerkleRoot_Storage',
            root: s.loadUintBig(256),
            owner: s.loadAddress(),
            timestamp: s.loadUintBig(64),
            minMsgNr: s.loadUintBig(64),
            maxMsgNr: s.loadUintBig(64),
            messageStates: s.loadUintBig(128),
            deliveredMessageCount: s.loadUintBig(16),
        }
    },
    store(self: MerkleRoot_Storage, b: c.Builder): void {
        b.storeUint(self.root, 256);
        b.storeAddress(self.owner);
        b.storeUint(self.timestamp, 64);
        b.storeUint(self.minMsgNr, 64);
        b.storeUint(self.maxMsgNr, 64);
        b.storeUint(self.messageStates, 128);
        b.storeUint(self.deliveredMessageCount, 16);
    },
    toCell(self: MerkleRoot_Storage): c.Cell {
        return makeCellFrom<MerkleRoot_Storage>(self, MerkleRoot_Storage.store);
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
//    class MerkleRoot
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

export class MerkleRoot implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECDwEAAm4AART/APSkE/S88sgLAQIBYgIDAkDQ+JHyQCDXLCAcdvSM4wLXLCAM+maU4wIwhA8BxwDy9AQFAgFICwwD/jHtRNDT//pI0z/TP9M/03/XCw+BSKn4kifHBfL0B9TTH9P/0wABk/oAMJIwbeID0CDT/zHTPzHTPzHXCz+BSK1TGL6VUxe7wwCRcOLy9FMHoYFIrSHBQPL0cyGqAKwnsAGqAK2BSKshwAORf5UhwADDAOLy9CVus+MPgUitUxgGBwgB/jHtRNDT//pI0z/TP9M/03/XCw+BSKn4kifHBfL0B9M/1wsHIMID8kWBSK1TJb6VUyS7wwCRcOLy9FMUoYFIrSHBQPL0cyGqAKwksAGqAK2BSKwBwwLy9IFIrCHAApF/lSHAA8MA4vL0gUitUyW+lVMku8MAkXDi8vRRFKGBSK0JACz4IyqhUAW8gUiqAZF/lSTAA8MA4vL0AA40gUioJPLyANy+lVMXu8MAkXDi8vQnoYFIrSHBQPL0cyGqAKyzFrAFqgCuFbEEyM7JyM+THPVqKswpzwv/y/8ibpRsEs+Blc+DWPoC4ssHycjPhYhSYPpScc8LbszJgED7AAXIy/8U+lISyz/LP8s/y3/LD8ntVAGcIcFA8vRzIaoArLMTsAKqAFIQrBKxAcACkwakBt5TEqGkJ7qOk4jIz4WIUmD6UnHPC27MyYMG+wDeBcjL/xT6UhLLP8s/yz/Lf8sPye1UCgAAAgEgDQ4AC7hoWBALqABVtivxoPNjS3NZcxtDC0txc6N7cXMbG0uBcmsrk1tjKpN7e6QRamJcbFxjEAAZtcUQKRUUBBCB935QkA==');

    static Errors = {
        'MerkleRoot_Error.AlreadyExecuted': 18600,
        'MerkleRoot_Error.NotOwner': 18601,
        'MerkleRoot_Error.ManualExecutionNotYetEnabled': 18602,
        'MerkleRoot_Error.SkippedAlreadyExecutedMessage': 18603,
        'MerkleRoot_Error.InvalidState': 18604,
        'MerkleRoot_Error.SeqNumOutOfBounds': 18605,
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
            throw new Error(`Custom pack/unpack for 'MerkleRoot.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new MerkleRoot(address);
    }

    static fromStorage(emptyStorage: {
        root: uint256
        owner: c.Address
        timestamp: uint64
        minMsgNr: uint64
        maxMsgNr: uint64
        messageStates: uint128
        deliveredMessageCount?: uint16 /* = 0 */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? MerkleRoot.CodeCell,
            data: MerkleRoot_Storage.toCell(MerkleRoot_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new MerkleRoot(address, initialState);
    }

    static createCellOfMerkleRootValidate(body: {
        message: CellRef<Any2TVMRampMessage>
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: coins | null
    }) {
        return MerkleRoot_Validate.toCell(MerkleRoot_Validate.create(body));
    }

    static createCellOfMerkleRootMarkState(body: {
        seqNum: uint64
        state: ExecutionState
    }) {
        return MerkleRoot_MarkState.toCell(MerkleRoot_MarkState.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendMerkleRootValidate(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        message: CellRef<Any2TVMRampMessage>
        permissionlessExecutionThresholdSeconds: uint32
        metadataHash: uint256
        gasOverride: coins | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MerkleRoot_Validate.toCell(MerkleRoot_Validate.create(body)),
            ...extraOptions
        });
    }

    async sendMerkleRootMarkState(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        seqNum: uint64
        state: ExecutionState
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: MerkleRoot_MarkState.toCell(MerkleRoot_MarkState.create(body)),
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
