// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a CCIPReceiver contract in Tolk.
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'CCIPReceiver.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > CCIPReceiver.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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

type uint64 = bigint
type uint192 = bigint
type uint256 = bigint

/**
 > struct MockCCIPReceiver_Storage {
 > }
 */
export interface MockCCIPReceiver_Storage {
    readonly $: 'MockCCIPReceiver_Storage'
}

export const MockCCIPReceiver_Storage = {
    create(): MockCCIPReceiver_Storage {
        return {
            $: 'MockCCIPReceiver_Storage',
        }
    },
    fromSlice(s: c.Slice): MockCCIPReceiver_Storage {
        return {
            $: 'MockCCIPReceiver_Storage',
        }
    },
    store(self: MockCCIPReceiver_Storage, b: c.Builder): void {
    },
    toCell(self: MockCCIPReceiver_Storage): c.Cell {
        return makeCellFrom<MockCCIPReceiver_Storage>(self, MockCCIPReceiver_Storage.store);
    }
}

/**
 > type CCIPReceiver_InMessage = CCIPReceive
 */
export type CCIPReceiver_InMessage = CCIPReceive

export const CCIPReceiver_InMessage = {
    fromSlice(s: c.Slice): CCIPReceiver_InMessage {
        return CCIPReceive.fromSlice(s);
    },
    store(self: CCIPReceiver_InMessage, b: c.Builder): void {
        CCIPReceive.store(self, b);
    },
    toCell(self: CCIPReceiver_InMessage): c.Cell {
        return makeCellFrom<CCIPReceiver_InMessage>(self, CCIPReceiver_InMessage.store);
    }
}

/**
 > struct (0x4b15e3e8) CCIPReceive {
 >     execId: uint192
 >     message: Cell<Any2TVMMessage>
 > }
 */
export interface CCIPReceive {
    readonly $: 'CCIPReceive'
    execId: uint192
    message: Any2TVMMessage
}

export const CCIPReceive = {
    PREFIX: 0x4b15e3e8,

    create(args: {
        execId: uint192
        message: Any2TVMMessage
    }): CCIPReceive {
        return {
            $: 'CCIPReceive',
            ...args
        }
    },
    fromSlice(s: c.Slice): CCIPReceive {
        loadAndCheckPrefix32(s, 0x4b15e3e8, 'CCIPReceive');
        return {
            $: 'CCIPReceive',
            execId: s.loadUintBig(192),
            message: loadCellRef<Any2TVMMessage>(s, Any2TVMMessage.fromSlice),
        }
    },
    store(self: CCIPReceive, b: c.Builder): void {
        b.storeUint(0x4b15e3e8, 32);
        b.storeUint(self.execId, 192);
        storeCellRef<Any2TVMMessage>(self.message, b, Any2TVMMessage.store);
    },
    toCell(self: CCIPReceive): c.Cell {
        return makeCellFrom<CCIPReceive>(self, CCIPReceive.store);
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

// ————————————————————————————————————————————
//    class CCIPReceiver
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

export class CCIPReceiver implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgEBAgEAGQABFP8A9KQT9LzyyAsBABTTMPiR8kCED/Lw');

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
            throw new Error(`Custom pack/unpack for 'CCIPReceiver.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new CCIPReceiver(address);
    }

    static fromStorage(emptyStorage: {
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? CCIPReceiver.CodeCell,
            data: MockCCIPReceiver_Storage.toCell(MockCCIPReceiver_Storage.create()),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new CCIPReceiver(address, initialState);
    }

    static createCellOfCCIPReceiverInMessage(body: CCIPReceiver_InMessage) {
        return CCIPReceiver_InMessage.toCell(body);
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

    async sendCCIPReceiverInMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: CCIPReceiver_InMessage, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: CCIPReceiver_InMessage.toCell(body),
            ...extraOptions
        });
    }
}
