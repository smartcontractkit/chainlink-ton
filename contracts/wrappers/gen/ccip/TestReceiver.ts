// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TestReceiver contract in Tolk.
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'TestReceiver.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > TestReceiver.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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
 > struct UnsafeBodyNoRef<T> {
 >     forceInline: T
 > }
 */
export interface UnsafeBodyNoRef<T> {
    readonly $: 'UnsafeBodyNoRef'
    forceInline: T
}

export const UnsafeBodyNoRef = {
    create<T>(args: {
        forceInline: T
    }): UnsafeBodyNoRef<T> {
        return {
            $: 'UnsafeBodyNoRef',
            ...args
        }
    },
}

/**
 > struct CCIPMessageReceived {
 >     message: Any2TVMMessage
 > }
 */
export interface CCIPMessageReceived {
    readonly $: 'CCIPMessageReceived'
    message: Any2TVMMessage
}

export const CCIPMessageReceived = {
    create(args: {
        message: Any2TVMMessage
    }): CCIPMessageReceived {
        return {
            $: 'CCIPMessageReceived',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPMessageReceived {
        return {
            $: 'CCIPMessageReceived',
            message: Any2TVMMessage.fromSlice(s),
        }
    },
    store(self: CCIPMessageReceived, b: c.Builder): void {
        Any2TVMMessage.store(self.message, b);
    },
    toCell(self: CCIPMessageReceived): c.Cell {
        return makeCellFrom<CCIPMessageReceived>(self, CCIPMessageReceived.store);
    }
}

/**
 > struct Storage {
 >     id: uint32
 >     ownable: Ownable2Step
 >     authorizedCaller: address
 >     behavior: TestReceiver_Behavior
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    id: uint32
    ownable: Ownable2Step
    authorizedCaller: c.Address
    behavior: TestReceiver_Behavior
}

export const Storage = {
    create(args: {
        id: uint32
        ownable: Ownable2Step
        authorizedCaller: c.Address
        behavior: TestReceiver_Behavior
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            id: s.loadUintBig(32),
            ownable: Ownable2Step.fromSlice(s),
            authorizedCaller: s.loadAddress(),
            behavior: TestReceiver_Behavior.fromSlice(s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeUint(self.id, 32);
        Ownable2Step.store(self.ownable, b);
        b.storeAddress(self.authorizedCaller);
        TestReceiver_Behavior.store(self.behavior, b);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > enum TestReceiver_Behavior { 3 variants }
 */
export type TestReceiver_Behavior = bigint

export const TestReceiver_Behavior = {
    Accept: 0n,
    RejectAll: 1n,
    ConsumeAllGas: 2n,

    fromSlice(s: c.Slice): TestReceiver_Behavior {
        return s.loadUintBig(8);
    },
    store(self: TestReceiver_Behavior, b: c.Builder): void {
        b.storeUint(self, 8);
    },
    toCell(self: TestReceiver_Behavior): c.Cell {
        return makeCellFrom<TestReceiver_Behavior>(self, TestReceiver_Behavior.store);
    }
}

/**
 > struct (0xcf87a147) TestReceiver_UpdateBehavior {
 >     behavior: TestReceiver_Behavior
 > }
 */
export interface TestReceiver_UpdateBehavior {
    readonly $: 'TestReceiver_UpdateBehavior'
    behavior: TestReceiver_Behavior
}

export const TestReceiver_UpdateBehavior = {
    PREFIX: 0xcf87a147,

    create(args: {
        behavior: TestReceiver_Behavior
    }): TestReceiver_UpdateBehavior {
        return {
            $: 'TestReceiver_UpdateBehavior',
            ...args
        }
    },
    fromSlice(s: c.Slice): TestReceiver_UpdateBehavior {
        loadAndCheckPrefix32(s, 0xcf87a147, 'TestReceiver_UpdateBehavior');
        return {
            $: 'TestReceiver_UpdateBehavior',
            behavior: TestReceiver_Behavior.fromSlice(s),
        }
    },
    store(self: TestReceiver_UpdateBehavior, b: c.Builder): void {
        b.storeUint(0xcf87a147, 32);
        TestReceiver_Behavior.store(self.behavior, b);
    },
    toCell(self: TestReceiver_UpdateBehavior): c.Cell {
        return makeCellFrom<TestReceiver_UpdateBehavior>(self, TestReceiver_UpdateBehavior.store);
    }
}

/**
 > struct (0x9f5e489f) TestReceiver_UpdateAuthorizedCaller {
 >     authorizedCaller: address
 > }
 */
export interface TestReceiver_UpdateAuthorizedCaller {
    readonly $: 'TestReceiver_UpdateAuthorizedCaller'
    authorizedCaller: c.Address
}

export const TestReceiver_UpdateAuthorizedCaller = {
    PREFIX: 0x9f5e489f,

    create(args: {
        authorizedCaller: c.Address
    }): TestReceiver_UpdateAuthorizedCaller {
        return {
            $: 'TestReceiver_UpdateAuthorizedCaller',
            ...args
        }
    },
    fromSlice(s: c.Slice): TestReceiver_UpdateAuthorizedCaller {
        loadAndCheckPrefix32(s, 0x9f5e489f, 'TestReceiver_UpdateAuthorizedCaller');
        return {
            $: 'TestReceiver_UpdateAuthorizedCaller',
            authorizedCaller: s.loadAddress(),
        }
    },
    store(self: TestReceiver_UpdateAuthorizedCaller, b: c.Builder): void {
        b.storeUint(0x9f5e489f, 32);
        b.storeAddress(self.authorizedCaller);
    },
    toCell(self: TestReceiver_UpdateAuthorizedCaller): c.Cell {
        return makeCellFrom<TestReceiver_UpdateAuthorizedCaller>(self, TestReceiver_UpdateAuthorizedCaller.store);
    }
}

/**
 > struct (0xb3126df1) Receiver_CCIPReceive {
 >     execId: uint192
 >     message: Cell<Any2TVMMessage>
 > }
 */
export interface Receiver_CCIPReceive {
    readonly $: 'Receiver_CCIPReceive'
    execId: uint192
    message: Any2TVMMessage
}

export const Receiver_CCIPReceive = {
    PREFIX: 0xb3126df1,

    create(args: {
        execId: uint192
        message: Any2TVMMessage
    }): Receiver_CCIPReceive {
        return {
            $: 'Receiver_CCIPReceive',
            ...args
        }
    },
    fromSlice(s: c.Slice): Receiver_CCIPReceive {
        loadAndCheckPrefix32(s, 0xb3126df1, 'Receiver_CCIPReceive');
        return {
            $: 'Receiver_CCIPReceive',
            execId: s.loadUintBig(192),
            message: loadCellRef<Any2TVMMessage>(s, Any2TVMMessage.fromSlice),
        }
    },
    store(self: Receiver_CCIPReceive, b: c.Builder): void {
        b.storeUint(0xb3126df1, 32);
        b.storeUint(self.execId, 192);
        storeCellRef<Any2TVMMessage>(self.message, b, Any2TVMMessage.store);
    },
    toCell(self: Receiver_CCIPReceive): c.Cell {
        return makeCellFrom<Receiver_CCIPReceive>(self, Receiver_CCIPReceive.store);
    }
}

/**
 > struct Any2TVMMessage {
 >     messageId: uint256
 >     sourceChainSelector: uint64
 >     sender: CrossChainAddress
 >     data: cell
 >     tokenAmounts: cell?
 > }
 */
export interface Any2TVMMessage {
    readonly $: 'Any2TVMMessage'
    messageId: uint256
    sourceChainSelector: uint64
    sender: CrossChainAddress
    data: c.Cell
    tokenAmounts: c.Cell | null
}

export const Any2TVMMessage = {
    create(args: {
        messageId: uint256
        sourceChainSelector: uint64
        sender: CrossChainAddress
        data: c.Cell
        tokenAmounts: c.Cell | null
    }): Any2TVMMessage {
        return {
            $: 'Any2TVMMessage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Any2TVMMessage {
        return {
            $: 'Any2TVMMessage',
            messageId: s.loadUintBig(256),
            sourceChainSelector: s.loadUintBig(64),
            sender: CrossChainAddress.fromSlice(s),
            data: s.loadRef(),
            tokenAmounts: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: Any2TVMMessage, b: c.Builder): void {
        b.storeUint(self.messageId, 256);
        b.storeUint(self.sourceChainSelector, 64);
        CrossChainAddress.store(self.sender, b);
        b.storeRef(self.data);
        storeTolkNullable<c.Cell>(self.tokenAmounts, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: Any2TVMMessage): c.Cell {
        return makeCellFrom<Any2TVMMessage>(self, Any2TVMMessage.store);
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
 > struct (0x0aa811ed) Upgradeable_Upgrade {
 >     queryId: uint64
 >     code: cell
 > }
 */
export interface Upgradeable_Upgrade {
    readonly $: 'Upgradeable_Upgrade'
    queryId: uint64
    code: c.Cell
}

export const Upgradeable_Upgrade = {
    PREFIX: 0x0aa811ed,

    create(args: {
        queryId?: uint64
        code: c.Cell
    }): Upgradeable_Upgrade {
        return {
            $: 'Upgradeable_Upgrade',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): Upgradeable_Upgrade {
        loadAndCheckPrefix32(s, 0x0aa811ed, 'Upgradeable_Upgrade');
        return {
            $: 'Upgradeable_Upgrade',
            queryId: s.loadUintBig(64),
            code: s.loadRef(),
        }
    },
    store(self: Upgradeable_Upgrade, b: c.Builder): void {
        b.storeUint(0x0aa811ed, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.code);
    },
    toCell(self: Upgradeable_Upgrade): c.Cell {
        return makeCellFrom<Upgradeable_Upgrade>(self, Upgradeable_Upgrade.store);
    }
}

/**
 > struct Upgradeable_UpgradedEvent {
 >     code: cell
 >     hash: uint256
 >     version: UnsafeBodyNoRef<slice>
 > }
 */
export interface Upgradeable_UpgradedEvent {
    readonly $: 'Upgradeable_UpgradedEvent'
    code: c.Cell
    hash: uint256
    version: UnsafeBodyNoRef<c.Slice>
}

export const Upgradeable_UpgradedEvent = {
    create(args: {
        code: c.Cell
        hash: uint256
        version: UnsafeBodyNoRef<c.Slice>
    }): Upgradeable_UpgradedEvent {
        return {
            $: 'Upgradeable_UpgradedEvent',
            ...args
        }
    },
    fromSlice(s: c.Slice): Upgradeable_UpgradedEvent {
        throw new Error(`Can't unpack 'Upgradeable_UpgradedEvent' from cell, because 'UnsafeBodyNoRef.forceInline' is 'slice' (it can be used for writing only)`);
    },
    store(self: Upgradeable_UpgradedEvent, b: c.Builder): void {
        b.storeRef(self.code);
        b.storeUint(self.hash, 256);
        b.storeSlice(self.version.forceInline);
    },
    toCell(self: Upgradeable_UpgradedEvent): c.Cell {
        return makeCellFrom<Upgradeable_UpgradedEvent>(self, Upgradeable_UpgradedEvent.store);
    }
}

/**
 > struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
 >     execId: ReceiveExecutorId
 > }
 */
export interface Router_CCIPReceiveConfirm {
    readonly $: 'Router_CCIPReceiveConfirm'
    execId: ReceiveExecutorId
}

export const Router_CCIPReceiveConfirm = {
    PREFIX: 0x1e55bbf6,

    create(args: {
        execId: ReceiveExecutorId
    }): Router_CCIPReceiveConfirm {
        return {
            $: 'Router_CCIPReceiveConfirm',
            ...args
        }
    },
    fromSlice(s: c.Slice): Router_CCIPReceiveConfirm {
        loadAndCheckPrefix32(s, 0x1e55bbf6, 'Router_CCIPReceiveConfirm');
        return {
            $: 'Router_CCIPReceiveConfirm',
            execId: ReceiveExecutorId.fromSlice(s),
        }
    },
    store(self: Router_CCIPReceiveConfirm, b: c.Builder): void {
        b.storeUint(0x1e55bbf6, 32);
        ReceiveExecutorId.store(self.execId, b);
    },
    toCell(self: Router_CCIPReceiveConfirm): c.Cell {
        return makeCellFrom<Router_CCIPReceiveConfirm>(self, Router_CCIPReceiveConfirm.store);
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

// ————————————————————————————————————————————
//    class TestReceiver
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

export class TestReceiver implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECFgEAAowAART/APSkE/S88sgLAQIBYgIDAgLGBAUCASAMDQO70/Ej5IBBrlhLMSbfGcYFrlhJ9eSJ+RxWY/SQYfEl2omhrD/0kfSh9JBjBAGFEKKnjgor5egFkZ30pfSoJfSlnZPaqcGuWEz4ehR5xgWuWECqgR7ZxgRhCB4DjgHl6QYHCAIDo9IKCwH+Me1E0IEVGfiXggnJw4C+8vTTHzH6SDH6UDH6SNcLByDCAvJFgRUY+JJQA8cFEvL0AdO/10wijhRbIMABlYFKnPLw4MACk3DrpODyBeBsEtDT/9M/0wchwUHyhQGqAtcY1PQE0QTIy/8Tyz8h10kgqTgC8kWrAiDBQfKFzwsHzgkAcDHXCwcgwgLyRfiS7UTQ1h/6SPpQ+kjXCwcgwgIx8kWCAMKIUVPHBRXy9ALIzvpS+lT6UssHye1UALox7UTQ0x8x+kgw+JKCAMKIAscF8vTTPzHXTJPxA+gAk/ED6QAg2gEj+wQj0O0e7VPtREAT2iHtVCH5AAHaAQLIzMv/zsnIz48YAASCEKM7SY7PC/dxzwthzMlw+wAAcMz0AMnIz48YAASCEMWkCrPPC/dxzwthzMlw+wBwdPsC+JLIz4WI+lKCEB5Vu/bPC47Lv8mDBvsAAB8gU28AYtTEuNi4wjHBfL0gAA8i1MS42LjGIAIBIA4PACO/tRdqJoaY+Y/SQY/SgY/SQYQCASAQEQALuGhYEAv4AgEgEhMAGbXFEClTlAQQgfd+UJACASAUFQBbsFfjQhbGluay5jaGFpbi50b24uY2NpcC50ZXN0LlJlY2VpdmVygi1MS42LjGIAARrhD2omhrhY/AADOvRXaiaGmPmP0kGP0oGP0kGOuFg5BhAXkiwA==');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Receiver_Error.Unauthorized': 5400,
        'Receiver_Error.LowValue': 5401,
        'TestReceiver_Error.Rejected': 19100,
        'Upgradeable_Error.VersionMismatch': 19900,
        'Ownable2Step_Error.OnlyCallableByOwner': 49800,
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
            throw new Error(`Custom pack/unpack for 'TestReceiver.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new TestReceiver(address);
    }

    static fromStorage(emptyStorage: {
        id: uint32
        ownable: Ownable2Step
        authorizedCaller: c.Address
        behavior: TestReceiver_Behavior
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TestReceiver.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TestReceiver(address, initialState);
    }

    static createCellOfReceiverCCIPReceive(body: {
        execId: uint192
        message: Any2TVMMessage
    }) {
        return Receiver_CCIPReceive.toCell(Receiver_CCIPReceive.create(body));
    }

    static createCellOfTestReceiverUpdateBehavior(body: {
        behavior: TestReceiver_Behavior
    }) {
        return TestReceiver_UpdateBehavior.toCell(TestReceiver_UpdateBehavior.create(body));
    }

    static createCellOfTestReceiverUpdateAuthorizedCaller(body: {
        authorizedCaller: c.Address
    }) {
        return TestReceiver_UpdateAuthorizedCaller.toCell(TestReceiver_UpdateAuthorizedCaller.create(body));
    }

    static createCellOfUpgradeableUpgrade(body: {
        queryId?: uint64
        code: c.Cell
    }) {
        return Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body));
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

    async sendReceiverCCIPReceive(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        execId: uint192
        message: Any2TVMMessage
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Receiver_CCIPReceive.toCell(Receiver_CCIPReceive.create(body)),
            ...extraOptions
        });
    }

    async sendTestReceiverUpdateBehavior(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        behavior: TestReceiver_Behavior
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TestReceiver_UpdateBehavior.toCell(TestReceiver_UpdateBehavior.create(body)),
            ...extraOptions
        });
    }

    async sendTestReceiverUpdateAuthorizedCaller(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        authorizedCaller: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TestReceiver_UpdateAuthorizedCaller.toCell(TestReceiver_UpdateAuthorizedCaller.create(body)),
            ...extraOptions
        });
    }

    async sendUpgradeableUpgrade(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        code: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Upgradeable_Upgrade.toCell(Upgradeable_Upgrade.create(body)),
            ...extraOptions
        });
    }

    async getId(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getId', []));
        return r.readBigInt();
    }

    async getAuthorizedCaller(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAuthorizedCaller', []));
        return r.readSlice().loadAddress();
    }

    async getBehavior(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBehavior', []));
        return r.readBigInt();
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
