// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a BurnMintTokenPool contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

// TypeScript wrappers flatten a TVM linked list `[1 [2 [3 null]]]` to `[1 2 3]`
type lisp_list<T> = T[]

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

function storeLispListOf<T>(v: lisp_list<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let tail = c.Cell.EMPTY;
    for (let i = 0; i < v.length; ++i) {
        let itemB = beginCell();
        storeFn_T(v[i], itemB);
        tail = itemB.storeRef(tail).endCell();
    }
    b.storeRef(tail);
}

function loadLispListOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): lisp_list<T> {
    let outArr = [] as lisp_list<T>;
    let head = s.loadRef().beginParse();
    while (head.remainingRefs) {
        let tailSnaked = head.loadRef();
        let headValue = loadFn_T(head);
        head.endParse();    // ensure no data is present besides T
        outArr.unshift(headValue);
        head = tailSnaked.beginParse();
    }
    return outArr;
}

function createDictionaryValue<V>(loadFn_V: LoadCallback<V>, storeFn_V: StoreCallback<V>): c.DictionaryValue<V> {
    return {
        serialize(self: V, b: c.Builder) {
            storeFn_V(self, b);
        },
        parse(s: c.Slice): V {
            const value = loadFn_V(s);
            s.endParse();
            return value;
        }
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

    readLispListOf<T>(readFn_T: (nestedReader: StackReader) => T): T[] {
        // read `[1 [2 [3 null]]]` to `[1 2 3]`
        let pairReader: StackReader = this;
        let outArr = [] as T[];
        while (true) {
            if (pairReader.tuple[0].type === 'null') {
                pairReader.tuple.shift();
                break;
            }
            let headAndTail = pairReader.popExpecting<c.Tuple>('tuple').items;
            if (headAndTail.length !== 2) {
                throw new Error(`malformed lisp_list, expected 2 stack width, got ${headAndTail.length}`);
            }
            pairReader = new StackReader(headAndTail);
            outArr.push(readFn_T(pairReader));
        }
        return outArr;
    }

    readTuple<T>(expectedN: number, readFn_T: (nestedReader: StackReader) => T): T {
        const subItems = this.popExpecting<c.Tuple>('tuple').items;
        if (subItems.length !== expectedN) {
            throw new Error(`expected ${expectedN} items in a tuple, got ${subItems.length}`);
        }
        return readFn_T(new StackReader(subItems));
    }

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
    }

    readWideNullable<T>(stackW: number, readFn_T: (r: StackReader) => T): T | null {
        const slotTypeId = this.tuple[stackW - 1];
        if (slotTypeId?.type !== 'int') {
            throw new Error(`not 'int' on a stack`);
        }
        if (slotTypeId.value === 0n) {
            this.tuple = this.tuple.slice(stackW);
            return null;
        }
        const valueT = readFn_T(this);
        this.tuple.shift();
        return valueT;
    }

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
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
        throw new Error(`Custom packToBuilder/unpackFromSlice was not registered for type 'BurnMintTokenPool.${typeName}'.\n(in Tolk code, they have custom logic \`fun ${typeName}__packToBuilder\`)\nSteps to fix:\n1) in your code, create and implement\n > function ${typeName}__packToBuilder(self: ${typeName}, b: Builder): void { ... }\n > function ${typeName}__unpackFromSlice(s: Slice): ${typeName} { ... }\n2) register them in advance by calling\n > BurnMintTokenPool.registerCustomPackUnpack('${typeName}', ${typeName}__packToBuilder, ${typeName}__unpackFromSlice);`);
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

type uint8 = bigint
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
 > struct Ownable2Step {
 >     owner: address
 >     pendingOwner: address?
 > }
 */
export interface Ownable2Step {
    readonly $: 'Ownable2Step'
    owner: c.Address
    pendingOwner: c.Address | null
}

export const Ownable2Step = {
    create(args: {
        owner: c.Address
        pendingOwner: c.Address | null
    }): Ownable2Step {
        return {
            $: 'Ownable2Step',
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
        queryId: uint64
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferRequested {
        return {
            $: 'Ownable2Step_OwnershipTransferRequested',
            ...args
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
        queryId: uint64
        oldOwner: c.Address
        newOwner: c.Address
    }): Ownable2Step_OwnershipTransferred {
        return {
            $: 'Ownable2Step_OwnershipTransferred',
            ...args
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
 > type ForwardPayloadRemainder = RemainingBitsAndRefs
 */
export type ForwardPayloadRemainder = RemainingBitsAndRefs

export const ForwardPayloadRemainder = {
    fromSlice(s: c.Slice): ForwardPayloadRemainder {
        return loadTolkRemaining(s);
    },
    store(self: ForwardPayloadRemainder, b: c.Builder): void {
        storeTolkRemaining(self, b);
    },
    toCell(self: ForwardPayloadRemainder): c.Cell {
        return makeCellFrom<ForwardPayloadRemainder>(self, ForwardPayloadRemainder.store);
    }
}

/**
 > struct (0x0f8a7ea5) AskToTransfer {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferRecipient: address
 >     sendExcessesTo: address?
 >     customPayload: cell?
 >     forwardTonAmount: coins
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface AskToTransfer {
    readonly $: 'AskToTransfer'
    queryId: uint64
    jettonAmount: coins
    transferRecipient: c.Address
    sendExcessesTo: c.Address | null
    customPayload: c.Cell | null
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

export const AskToTransfer = {
    PREFIX: 0x0f8a7ea5,

    create(args: {
        queryId: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args
        }
    },
    fromSlice(s: c.Slice): AskToTransfer {
        loadAndCheckPrefix32(s, 0x0f8a7ea5, 'AskToTransfer');
        return {
            $: 'AskToTransfer',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferRecipient: s.loadAddress(),
            sendExcessesTo: s.loadMaybeAddress(),
            customPayload: s.loadBoolean() ? s.loadRef() : null,
            forwardTonAmount: s.loadCoins(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: AskToTransfer, b: c.Builder): void {
        b.storeUint(0x0f8a7ea5, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferRecipient);
        b.storeAddress(self.sendExcessesTo);
        storeTolkNullable<c.Cell>(self.customPayload, b,
            (v,b) => b.storeRef(v)
        );
        b.storeCoins(self.forwardTonAmount);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: AskToTransfer): c.Cell {
        return makeCellFrom<AskToTransfer>(self, AskToTransfer.store);
    }
}

/**
 > struct (0x7362d09c) TransferNotificationForRecipient {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferInitiator: address?
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface TransferNotificationForRecipient {
    readonly $: 'TransferNotificationForRecipient'
    queryId: uint64
    jettonAmount: coins
    transferInitiator: c.Address | null
    forwardPayload: ForwardPayloadRemainder
}

export const TransferNotificationForRecipient = {
    PREFIX: 0x7362d09c,

    create(args: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args
        }
    },
    fromSlice(s: c.Slice): TransferNotificationForRecipient {
        loadAndCheckPrefix32(s, 0x7362d09c, 'TransferNotificationForRecipient');
        return {
            $: 'TransferNotificationForRecipient',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferInitiator: s.loadMaybeAddress(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: TransferNotificationForRecipient, b: c.Builder): void {
        b.storeUint(0x7362d09c, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferInitiator);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: TransferNotificationForRecipient): c.Cell {
        return makeCellFrom<TransferNotificationForRecipient>(self, TransferNotificationForRecipient.store);
    }
}

/**
 > struct (0x178d4519) InternalTransferStep {
 >     queryId: uint64
 >     jettonAmount: coins
 >     transferInitiator: address?
 >     sendExcessesTo: address?
 >     forwardTonAmount: coins
 >     forwardPayload: ForwardPayloadRemainder
 > }
 */
export interface InternalTransferStep {
    readonly $: 'InternalTransferStep'
    queryId: uint64
    jettonAmount: coins
    transferInitiator: c.Address | null
    sendExcessesTo: c.Address | null
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

export const InternalTransferStep = {
    PREFIX: 0x178d4519,

    create(args: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        sendExcessesTo: c.Address | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): InternalTransferStep {
        return {
            $: 'InternalTransferStep',
            ...args
        }
    },
    fromSlice(s: c.Slice): InternalTransferStep {
        loadAndCheckPrefix32(s, 0x178d4519, 'InternalTransferStep');
        return {
            $: 'InternalTransferStep',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            transferInitiator: s.loadMaybeAddress(),
            sendExcessesTo: s.loadMaybeAddress(),
            forwardTonAmount: s.loadCoins(),
            forwardPayload: ForwardPayloadRemainder.fromSlice(s),
        }
    },
    store(self: InternalTransferStep, b: c.Builder): void {
        b.storeUint(0x178d4519, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.transferInitiator);
        b.storeAddress(self.sendExcessesTo);
        b.storeCoins(self.forwardTonAmount);
        ForwardPayloadRemainder.store(self.forwardPayload, b);
    },
    toCell(self: InternalTransferStep): c.Cell {
        return makeCellFrom<InternalTransferStep>(self, InternalTransferStep.store);
    }
}

/**
 > struct (0xd53276db) ReturnExcessesBack {
 >     queryId: uint64
 > }
 */
export interface ReturnExcessesBack {
    readonly $: 'ReturnExcessesBack'
    queryId: uint64
}

export const ReturnExcessesBack = {
    PREFIX: 0xd53276db,

    create(args: {
        queryId: uint64
    }): ReturnExcessesBack {
        return {
            $: 'ReturnExcessesBack',
            ...args
        }
    },
    fromSlice(s: c.Slice): ReturnExcessesBack {
        loadAndCheckPrefix32(s, 0xd53276db, 'ReturnExcessesBack');
        return {
            $: 'ReturnExcessesBack',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: ReturnExcessesBack, b: c.Builder): void {
        b.storeUint(0xd53276db, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: ReturnExcessesBack): c.Cell {
        return makeCellFrom<ReturnExcessesBack>(self, ReturnExcessesBack.store);
    }
}

/**
 > struct (0x595f07bc) AskToBurn {
 >     queryId: uint64
 >     jettonAmount: coins
 >     sendExcessesTo: address?
 >     customPayload: cell?
 > }
 */
export interface AskToBurn {
    readonly $: 'AskToBurn'
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: c.Address | null
    customPayload: c.Cell | null
}

export const AskToBurn = {
    PREFIX: 0x595f07bc,

    create(args: {
        queryId: uint64
        jettonAmount: coins
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
    }): AskToBurn {
        return {
            $: 'AskToBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): AskToBurn {
        loadAndCheckPrefix32(s, 0x595f07bc, 'AskToBurn');
        return {
            $: 'AskToBurn',
            queryId: s.loadUintBig(64),
            jettonAmount: s.loadCoins(),
            sendExcessesTo: s.loadMaybeAddress(),
            customPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: AskToBurn, b: c.Builder): void {
        b.storeUint(0x595f07bc, 32);
        b.storeUint(self.queryId, 64);
        b.storeCoins(self.jettonAmount);
        b.storeAddress(self.sendExcessesTo);
        storeTolkNullable<c.Cell>(self.customPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: AskToBurn): c.Cell {
        return makeCellFrom<AskToBurn>(self, AskToBurn.store);
    }
}

/**
 > struct (0x00000015) MintNewJettons {
 >     queryId: uint64
 >     mintRecipient: address
 >     tonAmount: coins
 >     internalTransferMsg: Cell<InternalTransferStep>
 > }
 */
export interface MintNewJettons {
    readonly $: 'MintNewJettons'
    queryId: uint64
    mintRecipient: c.Address
    tonAmount: coins
    internalTransferMsg: CellRef<InternalTransferStep>
}

export const MintNewJettons = {
    PREFIX: 0x00000015,

    create(args: {
        queryId: uint64
        mintRecipient: c.Address
        tonAmount: coins
        internalTransferMsg: CellRef<InternalTransferStep>
    }): MintNewJettons {
        return {
            $: 'MintNewJettons',
            ...args
        }
    },
    fromSlice(s: c.Slice): MintNewJettons {
        loadAndCheckPrefix32(s, 0x00000015, 'MintNewJettons');
        return {
            $: 'MintNewJettons',
            queryId: s.loadUintBig(64),
            mintRecipient: s.loadAddress(),
            tonAmount: s.loadCoins(),
            internalTransferMsg: loadCellRef<InternalTransferStep>(s, InternalTransferStep.fromSlice),
        }
    },
    store(self: MintNewJettons, b: c.Builder): void {
        b.storeUint(0x00000015, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.mintRecipient);
        b.storeCoins(self.tonAmount);
        storeCellRef<InternalTransferStep>(self.internalTransferMsg, b, InternalTransferStep.store);
    },
    toCell(self: MintNewJettons): c.Cell {
        return makeCellFrom<MintNewJettons>(self, MintNewJettons.store);
    }
}

/**
 > struct (0xfb88e119) ClaimMinterAdmin {
 >     queryId: uint64
 > }
 */
export interface ClaimMinterAdmin {
    readonly $: 'ClaimMinterAdmin'
    queryId: uint64
}

export const ClaimMinterAdmin = {
    PREFIX: 0xfb88e119,

    create(args: {
        queryId: uint64
    }): ClaimMinterAdmin {
        return {
            $: 'ClaimMinterAdmin',
            ...args
        }
    },
    fromSlice(s: c.Slice): ClaimMinterAdmin {
        loadAndCheckPrefix32(s, 0xfb88e119, 'ClaimMinterAdmin');
        return {
            $: 'ClaimMinterAdmin',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: ClaimMinterAdmin, b: c.Builder): void {
        b.storeUint(0xfb88e119, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: ClaimMinterAdmin): c.Cell {
        return makeCellFrom<ClaimMinterAdmin>(self, ClaimMinterAdmin.store);
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
 > struct CursedSubjects {
 >     data: map<uint128, ()>
 > }
 */
export interface CursedSubjects {
    readonly $: 'CursedSubjects'
    data: c.Dictionary<uint128, []>
}

export const CursedSubjects = {
    create(args: {
        data: c.Dictionary<uint128, []>
    }): CursedSubjects {
        return {
            $: 'CursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): CursedSubjects {
        return {
            $: 'CursedSubjects',
            data: c.Dictionary.load<uint128, []>(c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
                (s) => [],
                (v,b) => { {} }
            ), s),
        }
    },
    store(self: CursedSubjects, b: c.Builder): void {
        b.storeDict<uint128, []>(self.data, c.Dictionary.Keys.BigUint(128), createDictionaryValue<[]>(
            (s) => [],
            (v,b) => { {} }
        ));
    },
    toCell(self: CursedSubjects): c.Cell {
        return makeCellFrom<CursedSubjects>(self, CursedSubjects.store);
    }
}

/**
 > struct TokenPool_AdminConfig {
 >     ownable: Cell<Ownable2Step>
 >     rmnProxy: address
 >     dynamicConfig: Cell<TokenPool_DynamicConfig>
 >     jettonClient: JettonClient
 >     allowedFinalityConfig: uint32
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: CellRef<Ownable2Step>
    rmnProxy: c.Address
    dynamicConfig: CellRef<TokenPool_DynamicConfig>
    jettonClient: JettonClient
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
    advancedPoolHooks: c.Address | null
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: CellRef<Ownable2Step>
        rmnProxy: c.Address
        dynamicConfig: CellRef<TokenPool_DynamicConfig>
        jettonClient: JettonClient
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
        advancedPoolHooks: c.Address | null
    }): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            allowedFinalityConfig: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdminConfig {
        return {
            $: 'TokenPool_AdminConfig',
            ownable: loadCellRef<Ownable2Step>(s, Ownable2Step.fromSlice),
            rmnProxy: s.loadAddress(),
            dynamicConfig: loadCellRef<TokenPool_DynamicConfig>(s, TokenPool_DynamicConfig.fromSlice),
            jettonClient: JettonClient.fromSlice(s),
            allowedFinalityConfig: s.loadUintBig(32),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        b.storeAddress(self.rmnProxy);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
        JettonClient.store(self.jettonClient, b);
        b.storeUint(self.allowedFinalityConfig, 32);
        b.storeAddress(self.advancedPoolHooks);
    },
    toCell(self: TokenPool_AdminConfig): c.Cell {
        return makeCellFrom<TokenPool_AdminConfig>(self, TokenPool_AdminConfig.store);
    }
}

/**
 > struct TokenPool_Data {
 >     adminConfig: Cell<TokenPool_AdminConfig>
 >     mirroredPolicy: Cell<TokenPool_MirroredPolicy>
 >     tokenDecimals: uint8
 >     remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>
 >     tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: CellRef<TokenPool_AdminConfig>
    mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
    tokenDecimals: uint8
    remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
    tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: CellRef<TokenPool_AdminConfig>
        mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
        tokenDecimals: uint8
        remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
        tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
    }): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_Data {
        return {
            $: 'TokenPool_Data',
            adminConfig: loadCellRef<TokenPool_AdminConfig>(s, TokenPool_AdminConfig.fromSlice),
            mirroredPolicy: loadCellRef<TokenPool_MirroredPolicy>(s, TokenPool_MirroredPolicy.fromSlice),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s),
            tokenTransferFeeConfigs: c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_MirroredPolicy>(self.mirroredPolicy, b, TokenPool_MirroredPolicy.store);
        b.storeUint(self.tokenDecimals, 8);
        b.storeDict<uint64, TokenPool_RemoteChainConfig>(self.remoteChainConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store));
        b.storeDict<uint64, TokenPool_TokenTransferFeeConfig>(self.tokenTransferFeeConfigs, c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store));
    },
    toCell(self: TokenPool_Data): c.Cell {
        return makeCellFrom<TokenPool_Data>(self, TokenPool_Data.store);
    }
}

/**
 > struct TokenPool_DynamicConfig {
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_DynamicConfig {
    readonly $: 'TokenPool_DynamicConfig'
    router: c.Address
    rateLimitAdmin: c.Address | null
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfig = {
    create(args: {
        router: c.Address
        rateLimitAdmin: c.Address | null
        feeAdmin: c.Address | null
    }): TokenPool_DynamicConfig {
        return {
            $: 'TokenPool_DynamicConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_DynamicConfig {
        return {
            $: 'TokenPool_DynamicConfig',
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_DynamicConfig, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_DynamicConfig): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfig>(self, TokenPool_DynamicConfig.store);
    }
}

/**
 > struct TokenPool_MirroredPolicy {
 >     onRamps: map<uint64, address>
 >     offRamps: map<uint64, address>
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_MirroredPolicy {
    readonly $: 'TokenPool_MirroredPolicy'
    onRamps: c.Dictionary<uint64, c.Address>
    offRamps: c.Dictionary<uint64, c.Address>
    cursedSubjects: CursedSubjects
}

export const TokenPool_MirroredPolicy = {
    create(args: {
        onRamps: c.Dictionary<uint64, c.Address>
        offRamps: c.Dictionary<uint64, c.Address>
        cursedSubjects: CursedSubjects
    }): TokenPool_MirroredPolicy {
        return {
            $: 'TokenPool_MirroredPolicy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_MirroredPolicy {
        return {
            $: 'TokenPool_MirroredPolicy',
            onRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            offRamps: c.Dictionary.load<uint64, c.Address>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
                (s) => s.loadAddress(),
                (v,b) => b.storeAddress(v)
            ), s),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_MirroredPolicy, b: c.Builder): void {
        b.storeDict<uint64, c.Address>(self.onRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        b.storeDict<uint64, c.Address>(self.offRamps, c.Dictionary.Keys.BigUint(64), createDictionaryValue<c.Address>(
            (s) => s.loadAddress(),
            (v,b) => b.storeAddress(v)
        ));
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_MirroredPolicy): c.Cell {
        return makeCellFrom<TokenPool_MirroredPolicy>(self, TokenPool_MirroredPolicy.store);
    }
}

/**
 > struct TokenPool_RampUpdate {
 >     remoteChainSelector: uint64
 >     onRamp: address?
 >     offRamp: address?
 > }
 */
export interface TokenPool_RampUpdate {
    readonly $: 'TokenPool_RampUpdate'
    remoteChainSelector: uint64
    onRamp: c.Address | null /* = null */
    offRamp: c.Address | null /* = null */
}

export const TokenPool_RampUpdate = {
    create(args: {
        remoteChainSelector: uint64
        onRamp?: c.Address | null /* = null */
        offRamp?: c.Address | null /* = null */
    }): TokenPool_RampUpdate {
        return {
            $: 'TokenPool_RampUpdate',
            onRamp: null,
            offRamp: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampUpdate {
        return {
            $: 'TokenPool_RampUpdate',
            remoteChainSelector: s.loadUintBig(64),
            onRamp: s.loadMaybeAddress(),
            offRamp: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_RampUpdate, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.onRamp);
        b.storeAddress(self.offRamp);
    },
    toCell(self: TokenPool_RampUpdate): c.Cell {
        return makeCellFrom<TokenPool_RampUpdate>(self, TokenPool_RampUpdate.store);
    }
}

/**
 > struct TokenPool_RateLimiterPair {
 >     outbound: Cell<RateLimiter_TokenBucket>
 >     inbound: Cell<RateLimiter_TokenBucket>
 > }
 */
export interface TokenPool_RateLimiterPair {
    readonly $: 'TokenPool_RateLimiterPair'
    outbound: CellRef<RateLimiter_TokenBucket>
    inbound: CellRef<RateLimiter_TokenBucket>
}

export const TokenPool_RateLimiterPair = {
    create(args: {
        outbound: CellRef<RateLimiter_TokenBucket>
        inbound: CellRef<RateLimiter_TokenBucket>
    }): TokenPool_RateLimiterPair {
        return {
            $: 'TokenPool_RateLimiterPair',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimiterPair {
        return {
            $: 'TokenPool_RateLimiterPair',
            outbound: loadCellRef<RateLimiter_TokenBucket>(s, RateLimiter_TokenBucket.fromSlice),
            inbound: loadCellRef<RateLimiter_TokenBucket>(s, RateLimiter_TokenBucket.fromSlice),
        }
    },
    store(self: TokenPool_RateLimiterPair, b: c.Builder): void {
        storeCellRef<RateLimiter_TokenBucket>(self.outbound, b, RateLimiter_TokenBucket.store);
        storeCellRef<RateLimiter_TokenBucket>(self.inbound, b, RateLimiter_TokenBucket.store);
    },
    toCell(self: TokenPool_RateLimiterPair): c.Cell {
        return makeCellFrom<TokenPool_RateLimiterPair>(self, TokenPool_RateLimiterPair.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigPair {
 >     outbound: Cell<RateLimiter_Config>
 >     inbound: Cell<RateLimiter_Config>
 > }
 */
export interface TokenPool_RateLimitConfigPair {
    readonly $: 'TokenPool_RateLimitConfigPair'
    outbound: CellRef<RateLimiter_Config>
    inbound: CellRef<RateLimiter_Config>
}

export const TokenPool_RateLimitConfigPair = {
    create(args: {
        outbound: CellRef<RateLimiter_Config>
        inbound: CellRef<RateLimiter_Config>
    }): TokenPool_RateLimitConfigPair {
        return {
            $: 'TokenPool_RateLimitConfigPair',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigPair {
        return {
            $: 'TokenPool_RateLimitConfigPair',
            outbound: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
            inbound: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
        }
    },
    store(self: TokenPool_RateLimitConfigPair, b: c.Builder): void {
        storeCellRef<RateLimiter_Config>(self.outbound, b, RateLimiter_Config.store);
        storeCellRef<RateLimiter_Config>(self.inbound, b, RateLimiter_Config.store);
    },
    toCell(self: TokenPool_RateLimitConfigPair): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigPair>(self, TokenPool_RateLimitConfigPair.store);
    }
}

/**
 > struct TokenPool_ChainUpdate {
 >     remoteChainSelector: uint64
 >     remotePoolAddresses: SnakedCell<CrossChainAddress>
 >     remoteTokenAddress: Cell<CrossChainAddress>
 >     rateLimitConfigs: Cell<TokenPool_RateLimitConfigPair>
 > }
 */
export interface TokenPool_ChainUpdate {
    readonly $: 'TokenPool_ChainUpdate'
    remoteChainSelector: uint64
    remotePoolAddresses: SnakedCell<CrossChainAddress>
    remoteTokenAddress: CellRef<CrossChainAddress>
    rateLimitConfigs: CellRef<TokenPool_RateLimitConfigPair>
}

export const TokenPool_ChainUpdate = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddresses: SnakedCell<CrossChainAddress>
        remoteTokenAddress: CellRef<CrossChainAddress>
        rateLimitConfigs: CellRef<TokenPool_RateLimitConfigPair>
    }): TokenPool_ChainUpdate {
        return {
            $: 'TokenPool_ChainUpdate',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainUpdate {
        return {
            $: 'TokenPool_ChainUpdate',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddresses: s.loadRef(),
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            rateLimitConfigs: loadCellRef<TokenPool_RateLimitConfigPair>(s, TokenPool_RateLimitConfigPair.fromSlice),
        }
    },
    store(self: TokenPool_ChainUpdate, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeRef(self.remotePoolAddresses);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        storeCellRef<TokenPool_RateLimitConfigPair>(self.rateLimitConfigs, b, TokenPool_RateLimitConfigPair.store);
    },
    toCell(self: TokenPool_ChainUpdate): c.Cell {
        return makeCellFrom<TokenPool_ChainUpdate>(self, TokenPool_ChainUpdate.store);
    }
}

/**
 > struct TokenPool_RemoteChainConfig {
 >     remoteTokenAddress: Cell<CrossChainAddress>
 >     remotePools: map<uint256, Cell<CrossChainAddress>>
 >     rateLimiters: Cell<TokenPool_RateLimiterPair>
 >     fastFinalityRateLimiters: Cell<TokenPool_RateLimiterPair>
 > }
 */
export interface TokenPool_RemoteChainConfig {
    readonly $: 'TokenPool_RemoteChainConfig'
    remoteTokenAddress: CellRef<CrossChainAddress>
    remotePools: c.Dictionary<uint256, CellRef<CrossChainAddress>>
    rateLimiters: CellRef<TokenPool_RateLimiterPair>
    fastFinalityRateLimiters: CellRef<TokenPool_RateLimiterPair>
}

export const TokenPool_RemoteChainConfig = {
    create(args: {
        remoteTokenAddress: CellRef<CrossChainAddress>
        remotePools: c.Dictionary<uint256, CellRef<CrossChainAddress>>
        rateLimiters: CellRef<TokenPool_RateLimiterPair>
        fastFinalityRateLimiters: CellRef<TokenPool_RateLimiterPair>
    }): TokenPool_RemoteChainConfig {
        return {
            $: 'TokenPool_RemoteChainConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemoteChainConfig {
        return {
            $: 'TokenPool_RemoteChainConfig',
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remotePools: c.Dictionary.load<uint256, CellRef<CrossChainAddress>>(c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<CrossChainAddress>>(
                (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
            ), s),
            rateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
            fastFinalityRateLimiters: loadCellRef<TokenPool_RateLimiterPair>(s, TokenPool_RateLimiterPair.fromSlice),
        }
    },
    store(self: TokenPool_RemoteChainConfig, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
        b.storeDict<uint256, CellRef<CrossChainAddress>>(self.remotePools, c.Dictionary.Keys.BigUint(256), createDictionaryValue<CellRef<CrossChainAddress>>(
            (s) => loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            (v,b) => storeCellRef<CrossChainAddress>(v, b, CrossChainAddress.store)
        ));
        storeCellRef<TokenPool_RateLimiterPair>(self.rateLimiters, b, TokenPool_RateLimiterPair.store);
        storeCellRef<TokenPool_RateLimiterPair>(self.fastFinalityRateLimiters, b, TokenPool_RateLimiterPair.store);
    },
    toCell(self: TokenPool_RemoteChainConfig): c.Cell {
        return makeCellFrom<TokenPool_RemoteChainConfig>(self, TokenPool_RemoteChainConfig.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigArgs {
 >     remoteChainSelector: uint64
 >     fastFinality: bool
 >     outboundRateLimiterConfig: Cell<RateLimiter_Config>
 >     inboundRateLimiterConfig: Cell<RateLimiter_Config>
 > }
 */
export interface TokenPool_RateLimitConfigArgs {
    readonly $: 'TokenPool_RateLimitConfigArgs'
    remoteChainSelector: uint64
    fastFinality: boolean
    outboundRateLimiterConfig: CellRef<RateLimiter_Config>
    inboundRateLimiterConfig: CellRef<RateLimiter_Config>
}

export const TokenPool_RateLimitConfigArgs = {
    create(args: {
        remoteChainSelector: uint64
        fastFinality: boolean
        outboundRateLimiterConfig: CellRef<RateLimiter_Config>
        inboundRateLimiterConfig: CellRef<RateLimiter_Config>
    }): TokenPool_RateLimitConfigArgs {
        return {
            $: 'TokenPool_RateLimitConfigArgs',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigArgs {
        return {
            $: 'TokenPool_RateLimitConfigArgs',
            remoteChainSelector: s.loadUintBig(64),
            fastFinality: s.loadBoolean(),
            outboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
            inboundRateLimiterConfig: loadCellRef<RateLimiter_Config>(s, RateLimiter_Config.fromSlice),
        }
    },
    store(self: TokenPool_RateLimitConfigArgs, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeBit(self.fastFinality);
        storeCellRef<RateLimiter_Config>(self.outboundRateLimiterConfig, b, RateLimiter_Config.store);
        storeCellRef<RateLimiter_Config>(self.inboundRateLimiterConfig, b, RateLimiter_Config.store);
    },
    toCell(self: TokenPool_RateLimitConfigArgs): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigArgs>(self, TokenPool_RateLimitConfigArgs.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigArgs {
 >     destChainSelector: uint64
 >     tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
 > }
 */
export interface TokenPool_TokenTransferFeeConfigArgs {
    readonly $: 'TokenPool_TokenTransferFeeConfigArgs'
    destChainSelector: uint64
    tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
}

export const TokenPool_TokenTransferFeeConfigArgs = {
    create(args: {
        destChainSelector: uint64
        tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig
    }): TokenPool_TokenTransferFeeConfigArgs {
        return {
            $: 'TokenPool_TokenTransferFeeConfigArgs',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigArgs {
        return {
            $: 'TokenPool_TokenTransferFeeConfigArgs',
            destChainSelector: s.loadUintBig(64),
            tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.fromSlice(s),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigArgs, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        TokenPool_TokenTransferFeeConfig.store(self.tokenTransferFeeConfig, b);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigArgs): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigArgs>(self, TokenPool_TokenTransferFeeConfigArgs.store);
    }
}

/**
 > struct TokenPool_LockOrBurnPrepared {
 >     feeAmount: uint256
 >     destTokenAmount: uint256
 >     out: TokenPool_LockOrBurnOutV1
 > }
 */
export interface TokenPool_LockOrBurnPrepared {
    readonly $: 'TokenPool_LockOrBurnPrepared'
    feeAmount: uint256
    destTokenAmount: uint256
    out: TokenPool_LockOrBurnOutV1
}

export const TokenPool_LockOrBurnPrepared = {
    create(args: {
        feeAmount: uint256
        destTokenAmount: uint256
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
            feeAmount: s.loadUintBig(256),
            destTokenAmount: s.loadUintBig(256),
            out: TokenPool_LockOrBurnOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_LockOrBurnPrepared, b: c.Builder): void {
        b.storeUint(self.feeAmount, 256);
        b.storeUint(self.destTokenAmount, 256);
        TokenPool_LockOrBurnOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_LockOrBurnPrepared): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnPrepared>(self, TokenPool_LockOrBurnPrepared.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintPrepared {
 >     requestedFinalityConfig: uint32
 >     localAmount: uint256
 >     out: TokenPool_ReleaseOrMintOutV1
 > }
 */
export interface TokenPool_ReleaseOrMintPrepared {
    readonly $: 'TokenPool_ReleaseOrMintPrepared'
    requestedFinalityConfig: uint32
    localAmount: uint256
    out: TokenPool_ReleaseOrMintOutV1
}

export const TokenPool_ReleaseOrMintPrepared = {
    create(args: {
        requestedFinalityConfig: uint32
        localAmount: uint256
        out: TokenPool_ReleaseOrMintOutV1
    }): TokenPool_ReleaseOrMintPrepared {
        return {
            $: 'TokenPool_ReleaseOrMintPrepared',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintPrepared {
        return {
            $: 'TokenPool_ReleaseOrMintPrepared',
            requestedFinalityConfig: s.loadUintBig(32),
            localAmount: s.loadUintBig(256),
            out: TokenPool_ReleaseOrMintOutV1.fromSlice(s),
        }
    },
    store(self: TokenPool_ReleaseOrMintPrepared, b: c.Builder): void {
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeUint(self.localAmount, 256);
        TokenPool_ReleaseOrMintOutV1.store(self.out, b);
    },
    toCell(self: TokenPool_ReleaseOrMintPrepared): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintPrepared>(self, TokenPool_ReleaseOrMintPrepared.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfig {
 >     destGasOverhead: uint32
 >     destBytesOverhead: uint32
 >     finalityFeeUSDCents: uint256
 >     fastFinalityFeeUSDCents: uint256
 >     finalityTransferFeeBps: uint16
 >     fastFinalityTransferFeeBps: uint16
 >     isEnabled: bool
 > }
 */
export interface TokenPool_TokenTransferFeeConfig {
    readonly $: 'TokenPool_TokenTransferFeeConfig'
    destGasOverhead: uint32
    destBytesOverhead: uint32
    finalityFeeUSDCents: uint256
    fastFinalityFeeUSDCents: uint256
    finalityTransferFeeBps: uint16
    fastFinalityTransferFeeBps: uint16
    isEnabled: boolean
}

export const TokenPool_TokenTransferFeeConfig = {
    create(args: {
        destGasOverhead: uint32
        destBytesOverhead: uint32
        finalityFeeUSDCents: uint256
        fastFinalityFeeUSDCents: uint256
        finalityTransferFeeBps: uint16
        fastFinalityTransferFeeBps: uint16
        isEnabled: boolean
    }): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            destGasOverhead: s.loadUintBig(32),
            destBytesOverhead: s.loadUintBig(32),
            finalityFeeUSDCents: s.loadUintBig(256),
            fastFinalityFeeUSDCents: s.loadUintBig(256),
            finalityTransferFeeBps: s.loadUintBig(16),
            fastFinalityTransferFeeBps: s.loadUintBig(16),
            isEnabled: s.loadBoolean(),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfig, b: c.Builder): void {
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
        b.storeUint(self.finalityFeeUSDCents, 256);
        b.storeUint(self.fastFinalityFeeUSDCents, 256);
        b.storeUint(self.finalityTransferFeeBps, 16);
        b.storeUint(self.fastFinalityTransferFeeBps, 16);
        b.storeBit(self.isEnabled);
    },
    toCell(self: TokenPool_TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfig>(self, TokenPool_TokenTransferFeeConfig.store);
    }
}

/**
 > struct TokenPool_Transfer<S, R> {
 >     id: uint256
 >     details: Cell<TokenPool_TransferDetails<S, R>>
 > }
 */
export interface TokenPool_Transfer<S, R> {
    readonly $: 'TokenPool_Transfer'
    id: uint256
    details: CellRef<TokenPool_TransferDetails<S, R>>
}

export const TokenPool_Transfer = {
    create<S, R>(args: {
        id: uint256
        details: CellRef<TokenPool_TransferDetails<S, R>>
    }): TokenPool_Transfer<S, R> {
        return {
            $: 'TokenPool_Transfer',
            ...args
        }
    },
}

/**
 > struct TokenPool_TransferDetails<S, R> {
 >     receiver: R
 >     remoteChainSelector: uint64
 >     originalSender: S
 >     amount: uint256
 >     localToken: address
 > }
 */
export interface TokenPool_TransferDetails<S, R> {
    readonly $: 'TokenPool_TransferDetails'
    receiver: R
    remoteChainSelector: uint64
    originalSender: S
    amount: uint256
    localToken: c.Address
}

export const TokenPool_TransferDetails = {
    create<S, R>(args: {
        receiver: R
        remoteChainSelector: uint64
        originalSender: S
        amount: uint256
        localToken: c.Address
    }): TokenPool_TransferDetails<S, R> {
        return {
            $: 'TokenPool_TransferDetails',
            ...args
        }
    },
}

/**
 > type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<address, Cell<CrossChainAddress>>
 */
export type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<c.Address, CellRef<CrossChainAddress>>

export const TokenPool_LockOrBurnTransfer = {
    fromSlice(s: c.Slice): TokenPool_LockOrBurnTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(s,
                    (s) => (() => {
                        return {
                            $: 'TokenPool_TransferDetails',
                            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
                            remoteChainSelector: s.loadUintBig(64),
                            originalSender: s.loadAddress(),
                            amount: s.loadUintBig(256),
                            localToken: s.loadAddress(),
                        }
                    })()
                ),
            }
        })();
    },
    store(self: TokenPool_LockOrBurnTransfer, b: c.Builder): void {
        b.storeUint(self.id, 256);
        storeCellRef<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(self.details, b,
            (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
            b.storeUint(v.remoteChainSelector, 64);
            b.storeAddress(v.originalSender);
            b.storeUint(v.amount, 256);
            b.storeAddress(v.localToken); }
        );
    },
    toCell(self: TokenPool_LockOrBurnTransfer): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnTransfer>(self, TokenPool_LockOrBurnTransfer.store);
    }
}

/**
 > type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<Cell<CrossChainAddress>, address>
 */
export type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<CellRef<CrossChainAddress>, c.Address>

export const TokenPool_ReleaseOrMintTransfer = {
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintTransfer {
        return (() => {
            return {
                $: 'TokenPool_Transfer',
                id: s.loadUintBig(256),
                details: loadCellRef<TokenPool_TransferDetails<CellRef<CrossChainAddress>, c.Address>>(s,
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
        storeCellRef<TokenPool_TransferDetails<CellRef<CrossChainAddress>, c.Address>>(self.details, b,
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
    sourcePoolAddress: CellRef<CrossChainAddress>
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        transfer: TokenPool_ReleaseOrMintTransfer
        sourcePoolAddress: CellRef<CrossChainAddress>
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
 >     destinationAmount: uint256
 > }
 */
export interface TokenPool_ReleaseOrMintOutV1 {
    readonly $: 'TokenPool_ReleaseOrMintOutV1'
    destinationAmount: uint256
}

export const TokenPool_ReleaseOrMintOutV1 = {
    create(args: {
        destinationAmount: uint256
    }): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintOutV1 {
        return {
            $: 'TokenPool_ReleaseOrMintOutV1',
            destinationAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_ReleaseOrMintOutV1, b: c.Builder): void {
        b.storeUint(self.destinationAmount, 256);
    },
    toCell(self: TokenPool_ReleaseOrMintOutV1): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintOutV1>(self, TokenPool_ReleaseOrMintOutV1.store);
    }
}

/**
 > struct (0x56f73d37) TokenPool_ApplyChainUpdates {
 >     queryId: uint64
 >     remoteChainSelectorsToRemove: SnakedCell<uint64>
 >     chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
 > }
 */
export interface TokenPool_ApplyChainUpdates {
    readonly $: 'TokenPool_ApplyChainUpdates'
    queryId: uint64
    remoteChainSelectorsToRemove: SnakedCell<uint64>
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
}

export const TokenPool_ApplyChainUpdates = {
    PREFIX: 0x56f73d37,

    create(args: {
        queryId: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }): TokenPool_ApplyChainUpdates {
        return {
            $: 'TokenPool_ApplyChainUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyChainUpdates {
        loadAndCheckPrefix32(s, 0x56f73d37, 'TokenPool_ApplyChainUpdates');
        return {
            $: 'TokenPool_ApplyChainUpdates',
            queryId: s.loadUintBig(64),
            remoteChainSelectorsToRemove: s.loadRef(),
            chainsToAdd: s.loadRef(),
        }
    },
    store(self: TokenPool_ApplyChainUpdates, b: c.Builder): void {
        b.storeUint(0x56f73d37, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.remoteChainSelectorsToRemove);
        b.storeRef(self.chainsToAdd);
    },
    toCell(self: TokenPool_ApplyChainUpdates): c.Cell {
        return makeCellFrom<TokenPool_ApplyChainUpdates>(self, TokenPool_ApplyChainUpdates.store);
    }
}

/**
 > struct (0x17c242dc) TokenPool_AddRemotePool {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_AddRemotePool {
    readonly $: 'TokenPool_AddRemotePool'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_AddRemotePool = {
    PREFIX: 0x17c242dc,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_AddRemotePool {
        return {
            $: 'TokenPool_AddRemotePool',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AddRemotePool {
        loadAndCheckPrefix32(s, 0x17c242dc, 'TokenPool_AddRemotePool');
        return {
            $: 'TokenPool_AddRemotePool',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_AddRemotePool, b: c.Builder): void {
        b.storeUint(0x17c242dc, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_AddRemotePool): c.Cell {
        return makeCellFrom<TokenPool_AddRemotePool>(self, TokenPool_AddRemotePool.store);
    }
}

/**
 > struct (0x426b8cc4) TokenPool_RemoveRemotePool {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemoveRemotePool {
    readonly $: 'TokenPool_RemoveRemotePool'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemoveRemotePool = {
    PREFIX: 0x426b8cc4,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemoveRemotePool {
        return {
            $: 'TokenPool_RemoveRemotePool',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemoveRemotePool {
        loadAndCheckPrefix32(s, 0x426b8cc4, 'TokenPool_RemoveRemotePool');
        return {
            $: 'TokenPool_RemoveRemotePool',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemoveRemotePool, b: c.Builder): void {
        b.storeUint(0x426b8cc4, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemoveRemotePool): c.Cell {
        return makeCellFrom<TokenPool_RemoveRemotePool>(self, TokenPool_RemoveRemotePool.store);
    }
}

/**
 > struct (0xd7712810) TokenPool_SetDynamicConfig {
 >     queryId: uint64
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_SetDynamicConfig {
    readonly $: 'TokenPool_SetDynamicConfig'
    queryId: uint64
    router: c.Address
    rateLimitAdmin: c.Address | null /* = null */
    feeAdmin: c.Address | null /* = null */
}

export const TokenPool_SetDynamicConfig = {
    PREFIX: 0xd7712810,

    create(args: {
        queryId: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }): TokenPool_SetDynamicConfig {
        return {
            $: 'TokenPool_SetDynamicConfig',
            rateLimitAdmin: null,
            feeAdmin: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetDynamicConfig {
        loadAndCheckPrefix32(s, 0xd7712810, 'TokenPool_SetDynamicConfig');
        return {
            $: 'TokenPool_SetDynamicConfig',
            queryId: s.loadUintBig(64),
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_SetDynamicConfig, b: c.Builder): void {
        b.storeUint(0xd7712810, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_SetDynamicConfig): c.Cell {
        return makeCellFrom<TokenPool_SetDynamicConfig>(self, TokenPool_SetDynamicConfig.store);
    }
}

/**
 > struct (0x3c50a39b) TokenPool_SetAllowedFinalityConfig {
 >     queryId: uint64
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_SetAllowedFinalityConfig {
    readonly $: 'TokenPool_SetAllowedFinalityConfig'
    queryId: uint64
    allowedFinalityConfig: uint32
}

export const TokenPool_SetAllowedFinalityConfig = {
    PREFIX: 0x3c50a39b,

    create(args: {
        queryId: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_SetAllowedFinalityConfig {
        return {
            $: 'TokenPool_SetAllowedFinalityConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetAllowedFinalityConfig {
        loadAndCheckPrefix32(s, 0x3c50a39b, 'TokenPool_SetAllowedFinalityConfig');
        return {
            $: 'TokenPool_SetAllowedFinalityConfig',
            queryId: s.loadUintBig(64),
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_SetAllowedFinalityConfig, b: c.Builder): void {
        b.storeUint(0x3c50a39b, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_SetAllowedFinalityConfig): c.Cell {
        return makeCellFrom<TokenPool_SetAllowedFinalityConfig>(self, TokenPool_SetAllowedFinalityConfig.store);
    }
}

/**
 > struct (0x3f5c9f57) TokenPool_SetAdvancedPoolHooks {
 >     queryId: uint64
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_SetAdvancedPoolHooks {
    readonly $: 'TokenPool_SetAdvancedPoolHooks'
    queryId: uint64
    advancedPoolHooks: c.Address | null
}

export const TokenPool_SetAdvancedPoolHooks = {
    PREFIX: 0x3f5c9f57,

    create(args: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_SetAdvancedPoolHooks {
        return {
            $: 'TokenPool_SetAdvancedPoolHooks',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetAdvancedPoolHooks {
        loadAndCheckPrefix32(s, 0x3f5c9f57, 'TokenPool_SetAdvancedPoolHooks');
        return {
            $: 'TokenPool_SetAdvancedPoolHooks',
            queryId: s.loadUintBig(64),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_SetAdvancedPoolHooks, b: c.Builder): void {
        b.storeUint(0x3f5c9f57, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.advancedPoolHooks);
    },
    toCell(self: TokenPool_SetAdvancedPoolHooks): c.Cell {
        return makeCellFrom<TokenPool_SetAdvancedPoolHooks>(self, TokenPool_SetAdvancedPoolHooks.store);
    }
}

/**
 > struct (0x4fe2d26c) TokenPool_SetRateLimitConfig {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_RateLimitConfigArgs>
 > }
 */
export interface TokenPool_SetRateLimitConfig {
    readonly $: 'TokenPool_SetRateLimitConfig'
    queryId: uint64
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>
}

export const TokenPool_SetRateLimitConfig = {
    PREFIX: 0x4fe2d26c,

    create(args: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }): TokenPool_SetRateLimitConfig {
        return {
            $: 'TokenPool_SetRateLimitConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRateLimitConfig {
        loadAndCheckPrefix32(s, 0x4fe2d26c, 'TokenPool_SetRateLimitConfig');
        return {
            $: 'TokenPool_SetRateLimitConfig',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
        }
    },
    store(self: TokenPool_SetRateLimitConfig, b: c.Builder): void {
        b.storeUint(0x4fe2d26c, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
    },
    toCell(self: TokenPool_SetRateLimitConfig): c.Cell {
        return makeCellFrom<TokenPool_SetRateLimitConfig>(self, TokenPool_SetRateLimitConfig.store);
    }
}

/**
 > struct (0x30a1d1f7) TokenPool_ApplyTokenTransferFeeConfigUpdates {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
 >     disableChainSelectors: SnakedCell<uint64>
 > }
 */
export interface TokenPool_ApplyTokenTransferFeeConfigUpdates {
    readonly $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates'
    queryId: uint64
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
    disableChainSelectors: SnakedCell<uint64>
}

export const TokenPool_ApplyTokenTransferFeeConfigUpdates = {
    PREFIX: 0x30a1d1f7,

    create(args: {
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ApplyTokenTransferFeeConfigUpdates {
        loadAndCheckPrefix32(s, 0x30a1d1f7, 'TokenPool_ApplyTokenTransferFeeConfigUpdates');
        return {
            $: 'TokenPool_ApplyTokenTransferFeeConfigUpdates',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
            disableChainSelectors: s.loadRef(),
        }
    },
    store(self: TokenPool_ApplyTokenTransferFeeConfigUpdates, b: c.Builder): void {
        b.storeUint(0x30a1d1f7, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
        b.storeRef(self.disableChainSelectors);
    },
    toCell(self: TokenPool_ApplyTokenTransferFeeConfigUpdates): c.Cell {
        return makeCellFrom<TokenPool_ApplyTokenTransferFeeConfigUpdates>(self, TokenPool_ApplyTokenTransferFeeConfigUpdates.store);
    }
}

/**
 > struct (0xe30764be) TokenPool_UpdateRampAccess {
 >     queryId: uint64
 >     updates: SnakedCell<TokenPool_RampUpdate>
 > }
 */
export interface TokenPool_UpdateRampAccess {
    readonly $: 'TokenPool_UpdateRampAccess'
    queryId: uint64
    updates: SnakedCell<TokenPool_RampUpdate>
}

export const TokenPool_UpdateRampAccess = {
    PREFIX: 0xe30764be,

    create(args: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }): TokenPool_UpdateRampAccess {
        return {
            $: 'TokenPool_UpdateRampAccess',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_UpdateRampAccess {
        loadAndCheckPrefix32(s, 0xe30764be, 'TokenPool_UpdateRampAccess');
        return {
            $: 'TokenPool_UpdateRampAccess',
            queryId: s.loadUintBig(64),
            updates: s.loadRef(),
        }
    },
    store(self: TokenPool_UpdateRampAccess, b: c.Builder): void {
        b.storeUint(0xe30764be, 32);
        b.storeUint(self.queryId, 64);
        b.storeRef(self.updates);
    },
    toCell(self: TokenPool_UpdateRampAccess): c.Cell {
        return makeCellFrom<TokenPool_UpdateRampAccess>(self, TokenPool_UpdateRampAccess.store);
    }
}

/**
 > struct (0x9929b642) TokenPool_SetRMNProxy {
 >     queryId: uint64
 >     rmnProxy: address
 > }
 */
export interface TokenPool_SetRMNProxy {
    readonly $: 'TokenPool_SetRMNProxy'
    queryId: uint64
    rmnProxy: c.Address
}

export const TokenPool_SetRMNProxy = {
    PREFIX: 0x9929b642,

    create(args: {
        queryId: uint64
        rmnProxy: c.Address
    }): TokenPool_SetRMNProxy {
        return {
            $: 'TokenPool_SetRMNProxy',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetRMNProxy {
        loadAndCheckPrefix32(s, 0x9929b642, 'TokenPool_SetRMNProxy');
        return {
            $: 'TokenPool_SetRMNProxy',
            queryId: s.loadUintBig(64),
            rmnProxy: s.loadAddress(),
        }
    },
    store(self: TokenPool_SetRMNProxy, b: c.Builder): void {
        b.storeUint(0x9929b642, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.rmnProxy);
    },
    toCell(self: TokenPool_SetRMNProxy): c.Cell {
        return makeCellFrom<TokenPool_SetRMNProxy>(self, TokenPool_SetRMNProxy.store);
    }
}

/**
 > struct (0x9da4da09) TokenPool_SetCursedSubjects {
 >     queryId: uint64
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_SetCursedSubjects {
    readonly $: 'TokenPool_SetCursedSubjects'
    queryId: uint64
    cursedSubjects: CursedSubjects
}

export const TokenPool_SetCursedSubjects = {
    PREFIX: 0x9da4da09,

    create(args: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_SetCursedSubjects {
        return {
            $: 'TokenPool_SetCursedSubjects',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_SetCursedSubjects {
        loadAndCheckPrefix32(s, 0x9da4da09, 'TokenPool_SetCursedSubjects');
        return {
            $: 'TokenPool_SetCursedSubjects',
            queryId: s.loadUintBig(64),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_SetCursedSubjects, b: c.Builder): void {
        b.storeUint(0x9da4da09, 32);
        b.storeUint(self.queryId, 64);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_SetCursedSubjects): c.Cell {
        return makeCellFrom<TokenPool_SetCursedSubjects>(self, TokenPool_SetCursedSubjects.store);
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
    request: CellRef<TokenPool_LockOrBurnInV1>
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    replyTo: c.Address | null
}

export const TokenPool_LockOrBurn = {
    PREFIX: 0xfa7da444,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }): TokenPool_LockOrBurn {
        return {
            $: 'TokenPool_LockOrBurn',
            ...args
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
    requestMsg: CellRef<TokenPool_LockOrBurn>
    prepared: CellRef<TokenPool_LockOrBurnPrepared>
}

export const TokenPool_LockOrBurnForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: CellRef<TokenPool_LockOrBurn>
        prepared: CellRef<TokenPool_LockOrBurnPrepared>
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
 > struct (0x351f77e3) TokenPool_ReleaseOrMint {
 >     queryId: uint64
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     requestedFinalityConfig: uint32
 >     replyTo: address?
 > }
 */
export interface TokenPool_ReleaseOrMint {
    readonly $: 'TokenPool_ReleaseOrMint'
    queryId: uint64
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    requestedFinalityConfig: uint32
    replyTo: c.Address | null /* = null */
}

export const TokenPool_ReleaseOrMint = {
    PREFIX: 0x351f77e3,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }): TokenPool_ReleaseOrMint {
        return {
            $: 'TokenPool_ReleaseOrMint',
            replyTo: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMint {
        loadAndCheckPrefix32(s, 0x351f77e3, 'TokenPool_ReleaseOrMint');
        return {
            $: 'TokenPool_ReleaseOrMint',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            replyTo: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_ReleaseOrMint, b: c.Builder): void {
        b.storeUint(0x351f77e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
    },
    toCell(self: TokenPool_ReleaseOrMint): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMint>(self, TokenPool_ReleaseOrMint.store);
    }
}

/**
 > struct (0x08f2ffb7) TokenPool_PreflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface TokenPool_PreflightCheckFinished {
    readonly $: 'TokenPool_PreflightCheckFinished'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
}

export const TokenPool_PreflightCheckFinished = {
    PREFIX: 0x08f2ffb7,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }): TokenPool_PreflightCheckFinished {
        return {
            $: 'TokenPool_PreflightCheckFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFinished {
        loadAndCheckPrefix32(s, 0x08f2ffb7, 'TokenPool_PreflightCheckFinished');
        return {
            $: 'TokenPool_PreflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PreflightCheckFinished, b: c.Builder): void {
        b.storeUint(0x08f2ffb7, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: TokenPool_PreflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFinished>(self, TokenPool_PreflightCheckFinished.store);
    }
}

/**
 > struct (0xa6dfa623) TokenPool_PreflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>
 > }
 */
export interface TokenPool_PreflightCheckFailed {
    readonly $: 'TokenPool_PreflightCheckFailed'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
}

export const TokenPool_PreflightCheckFailed = {
    PREFIX: 0xa6dfa623,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }): TokenPool_PreflightCheckFailed {
        return {
            $: 'TokenPool_PreflightCheckFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheckFailed {
        loadAndCheckPrefix32(s, 0xa6dfa623, 'TokenPool_PreflightCheckFailed');
        return {
            $: 'TokenPool_PreflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_LockOrBurnForwardPayload>(s, TokenPool_LockOrBurnForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PreflightCheckFailed, b: c.Builder): void {
        b.storeUint(0xa6dfa623, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnForwardPayload>(self.forwardPayload, b, TokenPool_LockOrBurnForwardPayload.store);
    },
    toCell(self: TokenPool_PreflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheckFailed>(self, TokenPool_PreflightCheckFailed.store);
    }
}

/**
 > struct TokenPool_ReleaseOrMintForwardPayload {
 >     originalSender: address
 >     requestMsg: Cell<TokenPool_ReleaseOrMint>
 >     prepared: Cell<TokenPool_ReleaseOrMintPrepared>
 > }
 */
export interface TokenPool_ReleaseOrMintForwardPayload {
    readonly $: 'TokenPool_ReleaseOrMintForwardPayload'
    originalSender: c.Address
    requestMsg: CellRef<TokenPool_ReleaseOrMint>
    prepared: CellRef<TokenPool_ReleaseOrMintPrepared>
}

export const TokenPool_ReleaseOrMintForwardPayload = {
    create(args: {
        originalSender: c.Address
        requestMsg: CellRef<TokenPool_ReleaseOrMint>
        prepared: CellRef<TokenPool_ReleaseOrMintPrepared>
    }): TokenPool_ReleaseOrMintForwardPayload {
        return {
            $: 'TokenPool_ReleaseOrMintForwardPayload',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintForwardPayload {
        return {
            $: 'TokenPool_ReleaseOrMintForwardPayload',
            originalSender: s.loadAddress(),
            requestMsg: loadCellRef<TokenPool_ReleaseOrMint>(s, TokenPool_ReleaseOrMint.fromSlice),
            prepared: loadCellRef<TokenPool_ReleaseOrMintPrepared>(s, TokenPool_ReleaseOrMintPrepared.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintForwardPayload, b: c.Builder): void {
        b.storeAddress(self.originalSender);
        storeCellRef<TokenPool_ReleaseOrMint>(self.requestMsg, b, TokenPool_ReleaseOrMint.store);
        storeCellRef<TokenPool_ReleaseOrMintPrepared>(self.prepared, b, TokenPool_ReleaseOrMintPrepared.store);
    },
    toCell(self: TokenPool_ReleaseOrMintForwardPayload): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintForwardPayload>(self, TokenPool_ReleaseOrMintForwardPayload.store);
    }
}

/**
 > struct (0x9e2a6b66) TokenPool_PostflightCheckFinished {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface TokenPool_PostflightCheckFinished {
    readonly $: 'TokenPool_PostflightCheckFinished'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
}

export const TokenPool_PostflightCheckFinished = {
    PREFIX: 0x9e2a6b66,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }): TokenPool_PostflightCheckFinished {
        return {
            $: 'TokenPool_PostflightCheckFinished',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFinished {
        loadAndCheckPrefix32(s, 0x9e2a6b66, 'TokenPool_PostflightCheckFinished');
        return {
            $: 'TokenPool_PostflightCheckFinished',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PostflightCheckFinished, b: c.Builder): void {
        b.storeUint(0x9e2a6b66, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: TokenPool_PostflightCheckFinished): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFinished>(self, TokenPool_PostflightCheckFinished.store);
    }
}

/**
 > struct (0x21e71d87) TokenPool_PostflightCheckFailed {
 >     queryId: uint64
 >     forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>
 > }
 */
export interface TokenPool_PostflightCheckFailed {
    readonly $: 'TokenPool_PostflightCheckFailed'
    queryId: uint64
    forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
}

export const TokenPool_PostflightCheckFailed = {
    PREFIX: 0x21e71d87,

    create(args: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }): TokenPool_PostflightCheckFailed {
        return {
            $: 'TokenPool_PostflightCheckFailed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheckFailed {
        loadAndCheckPrefix32(s, 0x21e71d87, 'TokenPool_PostflightCheckFailed');
        return {
            $: 'TokenPool_PostflightCheckFailed',
            queryId: s.loadUintBig(64),
            forwardPayload: loadCellRef<TokenPool_ReleaseOrMintForwardPayload>(s, TokenPool_ReleaseOrMintForwardPayload.fromSlice),
        }
    },
    store(self: TokenPool_PostflightCheckFailed, b: c.Builder): void {
        b.storeUint(0x21e71d87, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintForwardPayload>(self.forwardPayload, b, TokenPool_ReleaseOrMintForwardPayload.store);
    },
    toCell(self: TokenPool_PostflightCheckFailed): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheckFailed>(self, TokenPool_PostflightCheckFailed.store);
    }
}

/**
 > struct (0x4129d109) TokenPool_PreflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     requestedFinalityConfig: uint32
 >     tokenArgs: cell?
 >     amountPostFee: uint256
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PreflightCheck {
    readonly $: 'TokenPool_PreflightCheck'
    queryId: uint64
    request: CellRef<TokenPool_LockOrBurnInV1>
    requestedFinalityConfig: uint32
    tokenArgs: c.Cell | null
    amountPostFee: uint256
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PreflightCheck = {
    PREFIX: 0x4129d109,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        amountPostFee: uint256
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PreflightCheck {
        return {
            $: 'TokenPool_PreflightCheck',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PreflightCheck {
        loadAndCheckPrefix32(s, 0x4129d109, 'TokenPool_PreflightCheck');
        return {
            $: 'TokenPool_PreflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            requestedFinalityConfig: s.loadUintBig(32),
            tokenArgs: s.loadBoolean() ? s.loadRef() : null,
            amountPostFee: s.loadUintBig(256),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PreflightCheck, b: c.Builder): void {
        b.storeUint(0x4129d109, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        b.storeUint(self.requestedFinalityConfig, 32);
        storeTolkNullable<c.Cell>(self.tokenArgs, b,
            (v,b) => b.storeRef(v)
        );
        b.storeUint(self.amountPostFee, 256);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PreflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PreflightCheck>(self, TokenPool_PreflightCheck.store);
    }
}

/**
 > struct (0x703c2b58) TokenPool_PostflightCheck {
 >     queryId: uint64
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     localAmount: uint256
 >     requestedFinalityConfig: uint32
 >     replyTo: address
 >     replyPayload: cell?
 > }
 */
export interface TokenPool_PostflightCheck {
    readonly $: 'TokenPool_PostflightCheck'
    queryId: uint64
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    localAmount: uint256
    requestedFinalityConfig: uint32
    replyTo: c.Address
    replyPayload: c.Cell | null
}

export const TokenPool_PostflightCheck = {
    PREFIX: 0x703c2b58,

    create(args: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        localAmount: uint256
        requestedFinalityConfig: uint32
        replyTo: c.Address
        replyPayload: c.Cell | null
    }): TokenPool_PostflightCheck {
        return {
            $: 'TokenPool_PostflightCheck',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_PostflightCheck {
        loadAndCheckPrefix32(s, 0x703c2b58, 'TokenPool_PostflightCheck');
        return {
            $: 'TokenPool_PostflightCheck',
            queryId: s.loadUintBig(64),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            localAmount: s.loadUintBig(256),
            requestedFinalityConfig: s.loadUintBig(32),
            replyTo: s.loadAddress(),
            replyPayload: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_PostflightCheck, b: c.Builder): void {
        b.storeUint(0x703c2b58, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        b.storeUint(self.localAmount, 256);
        b.storeUint(self.requestedFinalityConfig, 32);
        b.storeAddress(self.replyTo);
        storeTolkNullable<c.Cell>(self.replyPayload, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: TokenPool_PostflightCheck): c.Cell {
        return makeCellFrom<TokenPool_PostflightCheck>(self, TokenPool_PostflightCheck.store);
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
        queryId: uint64
        forwardPayload: TokenPool_LockOrBurnForwardPayload
    }): TokenPool_LockOrBurnWithdraw {
        return {
            $: 'TokenPool_LockOrBurnWithdraw',
            ...args
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
 >     destTokenAmount: uint256
 > }
 */
export interface TokenPool_LockOrBurnFinished {
    readonly $: 'TokenPool_LockOrBurnFinished'
    queryId: uint64
    out: CellRef<TokenPool_LockOrBurnOutV1>
    destTokenAmount: uint256
}

export const TokenPool_LockOrBurnFinished = {
    PREFIX: 0xf432a4e3,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
        destTokenAmount: uint256
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
            destTokenAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockOrBurnFinished, b: c.Builder): void {
        b.storeUint(0xf432a4e3, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeUint(self.destTokenAmount, 256);
    },
    toCell(self: TokenPool_LockOrBurnFinished): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFinished>(self, TokenPool_LockOrBurnFinished.store);
    }
}

/**
 > struct (0x3476ea72) TokenPool_LockOrBurnFailure {
 >     queryId: uint64
 >     errorCode: uint16
 > }
 */
export interface TokenPool_LockOrBurnFailure {
    readonly $: 'TokenPool_LockOrBurnFailure'
    queryId: uint64
    errorCode: uint16
}

export const TokenPool_LockOrBurnFailure = {
    PREFIX: 0x3476ea72,

    create(args: {
        queryId: uint64
        errorCode: uint16
    }): TokenPool_LockOrBurnFailure {
        return {
            $: 'TokenPool_LockOrBurnFailure',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnFailure {
        loadAndCheckPrefix32(s, 0x3476ea72, 'TokenPool_LockOrBurnFailure');
        return {
            $: 'TokenPool_LockOrBurnFailure',
            queryId: s.loadUintBig(64),
            errorCode: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_LockOrBurnFailure, b: c.Builder): void {
        b.storeUint(0x3476ea72, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.errorCode, 16);
    },
    toCell(self: TokenPool_LockOrBurnFailure): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnFailure>(self, TokenPool_LockOrBurnFailure.store);
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
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
}

export const TokenPool_ReleaseOrMintFinished = {
    PREFIX: 0xe0e882f5,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
    }): TokenPool_ReleaseOrMintFinished {
        return {
            $: 'TokenPool_ReleaseOrMintFinished',
            ...args
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
        queryId: uint64
        errorCode: uint16
    }): TokenPool_ReleaseOrMintFailure {
        return {
            $: 'TokenPool_ReleaseOrMintFailure',
            ...args
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
 > struct (0x12cc4985) TokenPool_RemotePoolAddedNotification {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolAddedNotification {
    readonly $: 'TokenPool_RemotePoolAddedNotification'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolAddedNotification = {
    PREFIX: 0x12cc4985,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolAddedNotification {
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolAddedNotification {
        loadAndCheckPrefix32(s, 0x12cc4985, 'TokenPool_RemotePoolAddedNotification');
        return {
            $: 'TokenPool_RemotePoolAddedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolAddedNotification, b: c.Builder): void {
        b.storeUint(0x12cc4985, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolAddedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolAddedNotification>(self, TokenPool_RemotePoolAddedNotification.store);
    }
}

/**
 > struct (0xe17bf3cc) TokenPool_RemotePoolRemovedNotification {
 >     queryId: uint64
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolRemovedNotification {
    readonly $: 'TokenPool_RemotePoolRemovedNotification'
    queryId: uint64
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolRemovedNotification = {
    PREFIX: 0xe17bf3cc,

    create(args: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolRemovedNotification {
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolRemovedNotification {
        loadAndCheckPrefix32(s, 0xe17bf3cc, 'TokenPool_RemotePoolRemovedNotification');
        return {
            $: 'TokenPool_RemotePoolRemovedNotification',
            queryId: s.loadUintBig(64),
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolRemovedNotification, b: c.Builder): void {
        b.storeUint(0xe17bf3cc, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolRemovedNotification): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolRemovedNotification>(self, TokenPool_RemotePoolRemovedNotification.store);
    }
}

/**
 > struct (0x426a713b) TokenPool_FinalityConfigSet {
 >     queryId: uint64
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_FinalityConfigSet {
    readonly $: 'TokenPool_FinalityConfigSet'
    queryId: uint64
    allowedFinalityConfig: uint32
}

export const TokenPool_FinalityConfigSet = {
    PREFIX: 0x426a713b,

    create(args: {
        queryId: uint64
        allowedFinalityConfig: uint32
    }): TokenPool_FinalityConfigSet {
        return {
            $: 'TokenPool_FinalityConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FinalityConfigSet {
        loadAndCheckPrefix32(s, 0x426a713b, 'TokenPool_FinalityConfigSet');
        return {
            $: 'TokenPool_FinalityConfigSet',
            queryId: s.loadUintBig(64),
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_FinalityConfigSet, b: c.Builder): void {
        b.storeUint(0x426a713b, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_FinalityConfigSet): c.Cell {
        return makeCellFrom<TokenPool_FinalityConfigSet>(self, TokenPool_FinalityConfigSet.store);
    }
}

/**
 > struct (0xb735e30c) TokenPool_DynamicConfigSet {
 >     queryId: uint64
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_DynamicConfigSet {
    readonly $: 'TokenPool_DynamicConfigSet'
    queryId: uint64
    router: c.Address
    rateLimitAdmin: c.Address | null
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfigSet = {
    PREFIX: 0xb735e30c,

    create(args: {
        queryId: uint64
        router: c.Address
        rateLimitAdmin: c.Address | null
        feeAdmin: c.Address | null
    }): TokenPool_DynamicConfigSet {
        return {
            $: 'TokenPool_DynamicConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_DynamicConfigSet {
        loadAndCheckPrefix32(s, 0xb735e30c, 'TokenPool_DynamicConfigSet');
        return {
            $: 'TokenPool_DynamicConfigSet',
            queryId: s.loadUintBig(64),
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_DynamicConfigSet, b: c.Builder): void {
        b.storeUint(0xb735e30c, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_DynamicConfigSet): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfigSet>(self, TokenPool_DynamicConfigSet.store);
    }
}

/**
 > struct (0xdd7b0c71) TokenPool_RateLimitConfiguredNotification {
 >     queryId: uint64
 > }
 */
export interface TokenPool_RateLimitConfiguredNotification {
    readonly $: 'TokenPool_RateLimitConfiguredNotification'
    queryId: uint64
}

export const TokenPool_RateLimitConfiguredNotification = {
    PREFIX: 0xdd7b0c71,

    create(args: {
        queryId: uint64
    }): TokenPool_RateLimitConfiguredNotification {
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfiguredNotification {
        loadAndCheckPrefix32(s, 0xdd7b0c71, 'TokenPool_RateLimitConfiguredNotification');
        return {
            $: 'TokenPool_RateLimitConfiguredNotification',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_RateLimitConfiguredNotification, b: c.Builder): void {
        b.storeUint(0xdd7b0c71, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_RateLimitConfiguredNotification): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfiguredNotification>(self, TokenPool_RateLimitConfiguredNotification.store);
    }
}

/**
 > struct (0xe5d08b2e) TokenPool_RMNProxySet {
 >     queryId: uint64
 >     rmnProxy: address
 > }
 */
export interface TokenPool_RMNProxySet {
    readonly $: 'TokenPool_RMNProxySet'
    queryId: uint64
    rmnProxy: c.Address
}

export const TokenPool_RMNProxySet = {
    PREFIX: 0xe5d08b2e,

    create(args: {
        queryId: uint64
        rmnProxy: c.Address
    }): TokenPool_RMNProxySet {
        return {
            $: 'TokenPool_RMNProxySet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RMNProxySet {
        loadAndCheckPrefix32(s, 0xe5d08b2e, 'TokenPool_RMNProxySet');
        return {
            $: 'TokenPool_RMNProxySet',
            queryId: s.loadUintBig(64),
            rmnProxy: s.loadAddress(),
        }
    },
    store(self: TokenPool_RMNProxySet, b: c.Builder): void {
        b.storeUint(0xe5d08b2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.rmnProxy);
    },
    toCell(self: TokenPool_RMNProxySet): c.Cell {
        return makeCellFrom<TokenPool_RMNProxySet>(self, TokenPool_RMNProxySet.store);
    }
}

/**
 > struct (0x15800161) TokenPool_CursedSubjectsSet {
 >     queryId: uint64
 >     cursedSubjects: CursedSubjects
 > }
 */
export interface TokenPool_CursedSubjectsSet {
    readonly $: 'TokenPool_CursedSubjectsSet'
    queryId: uint64
    cursedSubjects: CursedSubjects
}

export const TokenPool_CursedSubjectsSet = {
    PREFIX: 0x15800161,

    create(args: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }): TokenPool_CursedSubjectsSet {
        return {
            $: 'TokenPool_CursedSubjectsSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_CursedSubjectsSet {
        loadAndCheckPrefix32(s, 0x15800161, 'TokenPool_CursedSubjectsSet');
        return {
            $: 'TokenPool_CursedSubjectsSet',
            queryId: s.loadUintBig(64),
            cursedSubjects: CursedSubjects.fromSlice(s),
        }
    },
    store(self: TokenPool_CursedSubjectsSet, b: c.Builder): void {
        b.storeUint(0x15800161, 32);
        b.storeUint(self.queryId, 64);
        CursedSubjects.store(self.cursedSubjects, b);
    },
    toCell(self: TokenPool_CursedSubjectsSet): c.Cell {
        return makeCellFrom<TokenPool_CursedSubjectsSet>(self, TokenPool_CursedSubjectsSet.store);
    }
}

/**
 > struct (0xad7833d7) TokenPool_ChainUpdatesApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_ChainUpdatesApplied {
    readonly $: 'TokenPool_ChainUpdatesApplied'
    queryId: uint64
}

export const TokenPool_ChainUpdatesApplied = {
    PREFIX: 0xad7833d7,

    create(args: {
        queryId: uint64
    }): TokenPool_ChainUpdatesApplied {
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainUpdatesApplied {
        loadAndCheckPrefix32(s, 0xad7833d7, 'TokenPool_ChainUpdatesApplied');
        return {
            $: 'TokenPool_ChainUpdatesApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_ChainUpdatesApplied, b: c.Builder): void {
        b.storeUint(0xad7833d7, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_ChainUpdatesApplied): c.Cell {
        return makeCellFrom<TokenPool_ChainUpdatesApplied>(self, TokenPool_ChainUpdatesApplied.store);
    }
}

/**
 > struct (0xd7f5c563) TokenPool_RampAccessUpdatesApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_RampAccessUpdatesApplied {
    readonly $: 'TokenPool_RampAccessUpdatesApplied'
    queryId: uint64
}

export const TokenPool_RampAccessUpdatesApplied = {
    PREFIX: 0xd7f5c563,

    create(args: {
        queryId: uint64
    }): TokenPool_RampAccessUpdatesApplied {
        return {
            $: 'TokenPool_RampAccessUpdatesApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampAccessUpdatesApplied {
        loadAndCheckPrefix32(s, 0xd7f5c563, 'TokenPool_RampAccessUpdatesApplied');
        return {
            $: 'TokenPool_RampAccessUpdatesApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_RampAccessUpdatesApplied, b: c.Builder): void {
        b.storeUint(0xd7f5c563, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_RampAccessUpdatesApplied): c.Cell {
        return makeCellFrom<TokenPool_RampAccessUpdatesApplied>(self, TokenPool_RampAccessUpdatesApplied.store);
    }
}

/**
 > struct (0x28cbcc64) TokenPool_FeeConfigApplied {
 >     queryId: uint64
 > }
 */
export interface TokenPool_FeeConfigApplied {
    readonly $: 'TokenPool_FeeConfigApplied'
    queryId: uint64
}

export const TokenPool_FeeConfigApplied = {
    PREFIX: 0x28cbcc64,

    create(args: {
        queryId: uint64
    }): TokenPool_FeeConfigApplied {
        return {
            $: 'TokenPool_FeeConfigApplied',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FeeConfigApplied {
        loadAndCheckPrefix32(s, 0x28cbcc64, 'TokenPool_FeeConfigApplied');
        return {
            $: 'TokenPool_FeeConfigApplied',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_FeeConfigApplied, b: c.Builder): void {
        b.storeUint(0x28cbcc64, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: TokenPool_FeeConfigApplied): c.Cell {
        return makeCellFrom<TokenPool_FeeConfigApplied>(self, TokenPool_FeeConfigApplied.store);
    }
}

/**
 > struct (0x3c869d80) TokenPool_AdvancedPoolHooksSet {
 >     queryId: uint64
 >     advancedPoolHooks: address?
 > }
 */
export interface TokenPool_AdvancedPoolHooksSet {
    readonly $: 'TokenPool_AdvancedPoolHooksSet'
    queryId: uint64
    advancedPoolHooks: c.Address | null
}

export const TokenPool_AdvancedPoolHooksSet = {
    PREFIX: 0x3c869d80,

    create(args: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }): TokenPool_AdvancedPoolHooksSet {
        return {
            $: 'TokenPool_AdvancedPoolHooksSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_AdvancedPoolHooksSet {
        loadAndCheckPrefix32(s, 0x3c869d80, 'TokenPool_AdvancedPoolHooksSet');
        return {
            $: 'TokenPool_AdvancedPoolHooksSet',
            queryId: s.loadUintBig(64),
            advancedPoolHooks: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_AdvancedPoolHooksSet, b: c.Builder): void {
        b.storeUint(0x3c869d80, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.advancedPoolHooks);
    },
    toCell(self: TokenPool_AdvancedPoolHooksSet): c.Cell {
        return makeCellFrom<TokenPool_AdvancedPoolHooksSet>(self, TokenPool_AdvancedPoolHooksSet.store);
    }
}

/**
 > struct TokenPool_LockedOrBurned {
 >     remoteChainSelector: uint64
 >     details: Cell<TokenPool_LockedOrBurnedDetails>
 > }
 */
export interface TokenPool_LockedOrBurned {
    readonly $: 'TokenPool_LockedOrBurned'
    remoteChainSelector: uint64
    details: CellRef<TokenPool_LockedOrBurnedDetails>
}

export const TokenPool_LockedOrBurned = {
    create(args: {
        remoteChainSelector: uint64
        details: CellRef<TokenPool_LockedOrBurnedDetails>
    }): TokenPool_LockedOrBurned {
        return {
            $: 'TokenPool_LockedOrBurned',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockedOrBurned {
        return {
            $: 'TokenPool_LockedOrBurned',
            remoteChainSelector: s.loadUintBig(64),
            details: loadCellRef<TokenPool_LockedOrBurnedDetails>(s, TokenPool_LockedOrBurnedDetails.fromSlice),
        }
    },
    store(self: TokenPool_LockedOrBurned, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<TokenPool_LockedOrBurnedDetails>(self.details, b, TokenPool_LockedOrBurnedDetails.store);
    },
    toCell(self: TokenPool_LockedOrBurned): c.Cell {
        return makeCellFrom<TokenPool_LockedOrBurned>(self, TokenPool_LockedOrBurned.store);
    }
}

/**
 > struct TokenPool_LockedOrBurnedDetails {
 >     token: address
 >     sender: address
 >     amount: uint256
 > }
 */
export interface TokenPool_LockedOrBurnedDetails {
    readonly $: 'TokenPool_LockedOrBurnedDetails'
    token: c.Address
    sender: c.Address
    amount: uint256
}

export const TokenPool_LockedOrBurnedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        amount: uint256
    }): TokenPool_LockedOrBurnedDetails {
        return {
            $: 'TokenPool_LockedOrBurnedDetails',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockedOrBurnedDetails {
        return {
            $: 'TokenPool_LockedOrBurnedDetails',
            token: s.loadAddress(),
            sender: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockedOrBurnedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_LockedOrBurnedDetails): c.Cell {
        return makeCellFrom<TokenPool_LockedOrBurnedDetails>(self, TokenPool_LockedOrBurnedDetails.store);
    }
}

/**
 > struct TokenPool_ReleasedOrMinted {
 >     remoteChainSelector: uint64
 >     details: Cell<TokenPool_ReleasedOrMintedDetails>
 > }
 */
export interface TokenPool_ReleasedOrMinted {
    readonly $: 'TokenPool_ReleasedOrMinted'
    remoteChainSelector: uint64
    details: CellRef<TokenPool_ReleasedOrMintedDetails>
}

export const TokenPool_ReleasedOrMinted = {
    create(args: {
        remoteChainSelector: uint64
        details: CellRef<TokenPool_ReleasedOrMintedDetails>
    }): TokenPool_ReleasedOrMinted {
        return {
            $: 'TokenPool_ReleasedOrMinted',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleasedOrMinted {
        return {
            $: 'TokenPool_ReleasedOrMinted',
            remoteChainSelector: s.loadUintBig(64),
            details: loadCellRef<TokenPool_ReleasedOrMintedDetails>(s, TokenPool_ReleasedOrMintedDetails.fromSlice),
        }
    },
    store(self: TokenPool_ReleasedOrMinted, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<TokenPool_ReleasedOrMintedDetails>(self.details, b, TokenPool_ReleasedOrMintedDetails.store);
    },
    toCell(self: TokenPool_ReleasedOrMinted): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMinted>(self, TokenPool_ReleasedOrMinted.store);
    }
}

/**
 > struct TokenPool_ReleasedOrMintedDetails {
 >     token: address
 >     sender: address
 >     amount: uint256
 >     recipient: Cell<address>
 > }
 */
export interface TokenPool_ReleasedOrMintedDetails {
    readonly $: 'TokenPool_ReleasedOrMintedDetails'
    token: c.Address
    sender: c.Address
    amount: uint256
    recipient: CellRef<c.Address>
}

export const TokenPool_ReleasedOrMintedDetails = {
    create(args: {
        token: c.Address
        sender: c.Address
        amount: uint256
        recipient: CellRef<c.Address>
    }): TokenPool_ReleasedOrMintedDetails {
        return {
            $: 'TokenPool_ReleasedOrMintedDetails',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleasedOrMintedDetails {
        return {
            $: 'TokenPool_ReleasedOrMintedDetails',
            token: s.loadAddress(),
            sender: s.loadAddress(),
            amount: s.loadUintBig(256),
            recipient: loadCellRef<c.Address>(s,
                (s) => s.loadAddress()
            ),
        }
    },
    store(self: TokenPool_ReleasedOrMintedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeAddress(self.sender);
        b.storeUint(self.amount, 256);
        storeCellRef<c.Address>(self.recipient, b,
            (v,b) => b.storeAddress(v)
        );
    },
    toCell(self: TokenPool_ReleasedOrMintedDetails): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMintedDetails>(self, TokenPool_ReleasedOrMintedDetails.store);
    }
}

/**
 > struct TokenPool_ChainAdded {
 >     remoteChainSelector: uint64
 >     remoteTokenAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_ChainAdded {
    readonly $: 'TokenPool_ChainAdded'
    remoteChainSelector: uint64
    remoteTokenAddress: CellRef<CrossChainAddress>
}

export const TokenPool_ChainAdded = {
    create(args: {
        remoteChainSelector: uint64
        remoteTokenAddress: CellRef<CrossChainAddress>
    }): TokenPool_ChainAdded {
        return {
            $: 'TokenPool_ChainAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainAdded {
        return {
            $: 'TokenPool_ChainAdded',
            remoteChainSelector: s.loadUintBig(64),
            remoteTokenAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_ChainAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remoteTokenAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_ChainAdded): c.Cell {
        return makeCellFrom<TokenPool_ChainAdded>(self, TokenPool_ChainAdded.store);
    }
}

/**
 > struct TokenPool_ChainRemoved {
 >     remoteChainSelector: uint64
 > }
 */
export interface TokenPool_ChainRemoved {
    readonly $: 'TokenPool_ChainRemoved'
    remoteChainSelector: uint64
}

export const TokenPool_ChainRemoved = {
    create(args: {
        remoteChainSelector: uint64
    }): TokenPool_ChainRemoved {
        return {
            $: 'TokenPool_ChainRemoved',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ChainRemoved {
        return {
            $: 'TokenPool_ChainRemoved',
            remoteChainSelector: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_ChainRemoved, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
    },
    toCell(self: TokenPool_ChainRemoved): c.Cell {
        return makeCellFrom<TokenPool_ChainRemoved>(self, TokenPool_ChainRemoved.store);
    }
}

/**
 > struct TokenPool_RemotePoolAdded {
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolAdded {
    readonly $: 'TokenPool_RemotePoolAdded'
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolAdded = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolAdded {
        return {
            $: 'TokenPool_RemotePoolAdded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolAdded {
        return {
            $: 'TokenPool_RemotePoolAdded',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolAdded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolAdded): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolAdded>(self, TokenPool_RemotePoolAdded.store);
    }
}

/**
 > struct TokenPool_RemotePoolRemoved {
 >     remoteChainSelector: uint64
 >     remotePoolAddress: Cell<CrossChainAddress>
 > }
 */
export interface TokenPool_RemotePoolRemoved {
    readonly $: 'TokenPool_RemotePoolRemoved'
    remoteChainSelector: uint64
    remotePoolAddress: CellRef<CrossChainAddress>
}

export const TokenPool_RemotePoolRemoved = {
    create(args: {
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }): TokenPool_RemotePoolRemoved {
        return {
            $: 'TokenPool_RemotePoolRemoved',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RemotePoolRemoved {
        return {
            $: 'TokenPool_RemotePoolRemoved',
            remoteChainSelector: s.loadUintBig(64),
            remotePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
        }
    },
    store(self: TokenPool_RemotePoolRemoved, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        storeCellRef<CrossChainAddress>(self.remotePoolAddress, b, CrossChainAddress.store);
    },
    toCell(self: TokenPool_RemotePoolRemoved): c.Cell {
        return makeCellFrom<TokenPool_RemotePoolRemoved>(self, TokenPool_RemotePoolRemoved.store);
    }
}

/**
 > struct TokenPool_OutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_OutboundRateLimitConsumed {
    readonly $: 'TokenPool_OutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_OutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_OutboundRateLimitConsumed {
        return {
            $: 'TokenPool_OutboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_OutboundRateLimitConsumed {
        return {
            $: 'TokenPool_OutboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_OutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_OutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitConsumed>(self, TokenPool_OutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_InboundRateLimitConsumed {
    readonly $: 'TokenPool_InboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_InboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_InboundRateLimitConsumed {
        return {
            $: 'TokenPool_InboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_InboundRateLimitConsumed {
        return {
            $: 'TokenPool_InboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_InboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_InboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitConsumed>(self, TokenPool_InboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityOutboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityOutboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityOutboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityOutboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_FastFinalityOutboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityOutboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityOutboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityOutboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityOutboundRateLimitConsumed>(self, TokenPool_FastFinalityOutboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_FastFinalityInboundRateLimitConsumed {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityInboundRateLimitConsumed {
    readonly $: 'TokenPool_FastFinalityInboundRateLimitConsumed'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityInboundRateLimitConsumed = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_FastFinalityInboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitConsumed',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityInboundRateLimitConsumed {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitConsumed',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityInboundRateLimitConsumed, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityInboundRateLimitConsumed): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityInboundRateLimitConsumed>(self, TokenPool_FastFinalityInboundRateLimitConsumed.store);
    }
}

/**
 > struct TokenPool_OutboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_OutboundRateLimitRefunded {
    readonly $: 'TokenPool_OutboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_OutboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_OutboundRateLimitRefunded {
        return {
            $: 'TokenPool_OutboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_OutboundRateLimitRefunded {
        return {
            $: 'TokenPool_OutboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_OutboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_OutboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_OutboundRateLimitRefunded>(self, TokenPool_OutboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_InboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_InboundRateLimitRefunded {
    readonly $: 'TokenPool_InboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_InboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_InboundRateLimitRefunded {
        return {
            $: 'TokenPool_InboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_InboundRateLimitRefunded {
        return {
            $: 'TokenPool_InboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_InboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_InboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_InboundRateLimitRefunded>(self, TokenPool_InboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_FastFinalityOutboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityOutboundRateLimitRefunded {
    readonly $: 'TokenPool_FastFinalityOutboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityOutboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_FastFinalityOutboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityOutboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityOutboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityOutboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityOutboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityOutboundRateLimitRefunded>(self, TokenPool_FastFinalityOutboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_FastFinalityInboundRateLimitRefunded {
 >     remoteChainSelector: uint64
 >     token: address
 >     amount: uint256
 > }
 */
export interface TokenPool_FastFinalityInboundRateLimitRefunded {
    readonly $: 'TokenPool_FastFinalityInboundRateLimitRefunded'
    remoteChainSelector: uint64
    token: c.Address
    amount: uint256
}

export const TokenPool_FastFinalityInboundRateLimitRefunded = {
    create(args: {
        remoteChainSelector: uint64
        token: c.Address
        amount: uint256
    }): TokenPool_FastFinalityInboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitRefunded',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FastFinalityInboundRateLimitRefunded {
        return {
            $: 'TokenPool_FastFinalityInboundRateLimitRefunded',
            remoteChainSelector: s.loadUintBig(64),
            token: s.loadAddress(),
            amount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_FastFinalityInboundRateLimitRefunded, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
    },
    toCell(self: TokenPool_FastFinalityInboundRateLimitRefunded): c.Cell {
        return makeCellFrom<TokenPool_FastFinalityInboundRateLimitRefunded>(self, TokenPool_FastFinalityInboundRateLimitRefunded.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigUpdated {
 >     destChainSelector: uint64
 >     tokenTransferFeeConfig: Cell<TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_TokenTransferFeeConfigUpdated {
    readonly $: 'TokenPool_TokenTransferFeeConfigUpdated'
    destChainSelector: uint64
    tokenTransferFeeConfig: CellRef<TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_TokenTransferFeeConfigUpdated = {
    create(args: {
        destChainSelector: uint64
        tokenTransferFeeConfig: CellRef<TokenPool_TokenTransferFeeConfig>
    }): TokenPool_TokenTransferFeeConfigUpdated {
        return {
            $: 'TokenPool_TokenTransferFeeConfigUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigUpdated {
        return {
            $: 'TokenPool_TokenTransferFeeConfigUpdated',
            destChainSelector: s.loadUintBig(64),
            tokenTransferFeeConfig: loadCellRef<TokenPool_TokenTransferFeeConfig>(s, TokenPool_TokenTransferFeeConfig.fromSlice),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigUpdated, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
        storeCellRef<TokenPool_TokenTransferFeeConfig>(self.tokenTransferFeeConfig, b, TokenPool_TokenTransferFeeConfig.store);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigUpdated): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigUpdated>(self, TokenPool_TokenTransferFeeConfigUpdated.store);
    }
}

/**
 > struct TokenPool_TokenTransferFeeConfigDeleted {
 >     destChainSelector: uint64
 > }
 */
export interface TokenPool_TokenTransferFeeConfigDeleted {
    readonly $: 'TokenPool_TokenTransferFeeConfigDeleted'
    destChainSelector: uint64
}

export const TokenPool_TokenTransferFeeConfigDeleted = {
    create(args: {
        destChainSelector: uint64
    }): TokenPool_TokenTransferFeeConfigDeleted {
        return {
            $: 'TokenPool_TokenTransferFeeConfigDeleted',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfigDeleted {
        return {
            $: 'TokenPool_TokenTransferFeeConfigDeleted',
            destChainSelector: s.loadUintBig(64),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfigDeleted, b: c.Builder): void {
        b.storeUint(self.destChainSelector, 64);
    },
    toCell(self: TokenPool_TokenTransferFeeConfigDeleted): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfigDeleted>(self, TokenPool_TokenTransferFeeConfigDeleted.store);
    }
}

/**
 > struct TokenPool_RateLimitConfigured {
 >     args: TokenPool_RateLimitConfigArgs
 > }
 */
export interface TokenPool_RateLimitConfigured {
    readonly $: 'TokenPool_RateLimitConfigured'
    args: TokenPool_RateLimitConfigArgs
}

export const TokenPool_RateLimitConfigured = {
    create(args: {
        args: TokenPool_RateLimitConfigArgs
    }): TokenPool_RateLimitConfigured {
        return {
            $: 'TokenPool_RateLimitConfigured',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RateLimitConfigured {
        return {
            $: 'TokenPool_RateLimitConfigured',
            args: TokenPool_RateLimitConfigArgs.fromSlice(s),
        }
    },
    store(self: TokenPool_RateLimitConfigured, b: c.Builder): void {
        TokenPool_RateLimitConfigArgs.store(self.args, b);
    },
    toCell(self: TokenPool_RateLimitConfigured): c.Cell {
        return makeCellFrom<TokenPool_RateLimitConfigured>(self, TokenPool_RateLimitConfigured.store);
    }
}

/**
 > struct TokenPool_RampAccessUpdated {
 >     remoteChainSelector: uint64
 >     onRamp: address?
 >     offRamp: address?
 > }
 */
export interface TokenPool_RampAccessUpdated {
    readonly $: 'TokenPool_RampAccessUpdated'
    remoteChainSelector: uint64
    onRamp: c.Address | null /* = null */
    offRamp: c.Address | null /* = null */
}

export const TokenPool_RampAccessUpdated = {
    create(args: {
        remoteChainSelector: uint64
        onRamp?: c.Address | null /* = null */
        offRamp?: c.Address | null /* = null */
    }): TokenPool_RampAccessUpdated {
        return {
            $: 'TokenPool_RampAccessUpdated',
            onRamp: null,
            offRamp: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_RampAccessUpdated {
        return {
            $: 'TokenPool_RampAccessUpdated',
            remoteChainSelector: s.loadUintBig(64),
            onRamp: s.loadMaybeAddress(),
            offRamp: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_RampAccessUpdated, b: c.Builder): void {
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.onRamp);
        b.storeAddress(self.offRamp);
    },
    toCell(self: TokenPool_RampAccessUpdated): c.Cell {
        return makeCellFrom<TokenPool_RampAccessUpdated>(self, TokenPool_RampAccessUpdated.store);
    }
}

/**
 > struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
 >     queryId: uint64
 > }
 */
export interface BurnMintTokenPool_ClaimMinterAdmin {
    readonly $: 'BurnMintTokenPool_ClaimMinterAdmin'
    queryId: uint64
}

export const BurnMintTokenPool_ClaimMinterAdmin = {
    PREFIX: 0x39898e4d,

    create(args: {
        queryId: uint64
    }): BurnMintTokenPool_ClaimMinterAdmin {
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_ClaimMinterAdmin {
        loadAndCheckPrefix32(s, 0x39898e4d, 'BurnMintTokenPool_ClaimMinterAdmin');
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: BurnMintTokenPool_ClaimMinterAdmin, b: c.Builder): void {
        b.storeUint(0x39898e4d, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: BurnMintTokenPool_ClaimMinterAdmin): c.Cell {
        return makeCellFrom<BurnMintTokenPool_ClaimMinterAdmin>(self, BurnMintTokenPool_ClaimMinterAdmin.store);
    }
}

/**
 > struct BurnMintTokenPool_PendingBurn {
 >     forwardPayload: TokenPool_LockOrBurnForwardPayload
 >     expectedSender: address
 > }
 */
export interface BurnMintTokenPool_PendingBurn {
    readonly $: 'BurnMintTokenPool_PendingBurn'
    forwardPayload: TokenPool_LockOrBurnForwardPayload
    expectedSender: c.Address
}

export const BurnMintTokenPool_PendingBurn = {
    create(args: {
        forwardPayload: TokenPool_LockOrBurnForwardPayload
        expectedSender: c.Address
    }): BurnMintTokenPool_PendingBurn {
        return {
            $: 'BurnMintTokenPool_PendingBurn',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_PendingBurn {
        return {
            $: 'BurnMintTokenPool_PendingBurn',
            forwardPayload: TokenPool_LockOrBurnForwardPayload.fromSlice(s),
            expectedSender: s.loadAddress(),
        }
    },
    store(self: BurnMintTokenPool_PendingBurn, b: c.Builder): void {
        TokenPool_LockOrBurnForwardPayload.store(self.forwardPayload, b);
        b.storeAddress(self.expectedSender);
    },
    toCell(self: BurnMintTokenPool_PendingBurn): c.Cell {
        return makeCellFrom<BurnMintTokenPool_PendingBurn>(self, BurnMintTokenPool_PendingBurn.store);
    }
}

/**
 > struct BurnMintTokenPool_PendingMint {
 >     replyTo: address?
 >     request: Cell<TokenPool_ReleaseOrMintInV1>
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 >     expectedSender: address
 > }
 */
export interface BurnMintTokenPool_PendingMint {
    readonly $: 'BurnMintTokenPool_PendingMint'
    replyTo: c.Address | null
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
    expectedSender: c.Address
}

export const BurnMintTokenPool_PendingMint = {
    create(args: {
        replyTo: c.Address | null
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
        expectedSender: c.Address
    }): BurnMintTokenPool_PendingMint {
        return {
            $: 'BurnMintTokenPool_PendingMint',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_PendingMint {
        return {
            $: 'BurnMintTokenPool_PendingMint',
            replyTo: s.loadMaybeAddress(),
            request: loadCellRef<TokenPool_ReleaseOrMintInV1>(s, TokenPool_ReleaseOrMintInV1.fromSlice),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
            expectedSender: s.loadAddress(),
        }
    },
    store(self: BurnMintTokenPool_PendingMint, b: c.Builder): void {
        b.storeAddress(self.replyTo);
        storeCellRef<TokenPool_ReleaseOrMintInV1>(self.request, b, TokenPool_ReleaseOrMintInV1.store);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
        b.storeAddress(self.expectedSender);
    },
    toCell(self: BurnMintTokenPool_PendingMint): c.Cell {
        return makeCellFrom<BurnMintTokenPool_PendingMint>(self, BurnMintTokenPool_PendingMint.store);
    }
}

/**
 > struct Storage {
 >     poolData: Cell<TokenPool_Data>
 >     pendingBurns: map<uint64, Cell<BurnMintTokenPool_PendingBurn>>
 >     pendingMints: map<uint64, Cell<BurnMintTokenPool_PendingMint>>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: CellRef<TokenPool_Data>
    pendingBurns: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingBurn>>
    pendingMints: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingMint>>
}

export const Storage = {
    create(args: {
        poolData: CellRef<TokenPool_Data>
        pendingBurns: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingBurn>>
        pendingMints: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingMint>>
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            poolData: loadCellRef<TokenPool_Data>(s, TokenPool_Data.fromSlice),
            pendingBurns: c.Dictionary.load<uint64, CellRef<BurnMintTokenPool_PendingBurn>>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<BurnMintTokenPool_PendingBurn>>(
                (s) => loadCellRef<BurnMintTokenPool_PendingBurn>(s, BurnMintTokenPool_PendingBurn.fromSlice),
                (v,b) => storeCellRef<BurnMintTokenPool_PendingBurn>(v, b, BurnMintTokenPool_PendingBurn.store)
            ), s),
            pendingMints: c.Dictionary.load<uint64, CellRef<BurnMintTokenPool_PendingMint>>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<BurnMintTokenPool_PendingMint>>(
                (s) => loadCellRef<BurnMintTokenPool_PendingMint>(s, BurnMintTokenPool_PendingMint.fromSlice),
                (v,b) => storeCellRef<BurnMintTokenPool_PendingMint>(v, b, BurnMintTokenPool_PendingMint.store)
            ), s),
        }
    },
    store(self: Storage, b: c.Builder): void {
        storeCellRef<TokenPool_Data>(self.poolData, b, TokenPool_Data.store);
        b.storeDict<uint64, CellRef<BurnMintTokenPool_PendingBurn>>(self.pendingBurns, c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<BurnMintTokenPool_PendingBurn>>(
            (s) => loadCellRef<BurnMintTokenPool_PendingBurn>(s, BurnMintTokenPool_PendingBurn.fromSlice),
            (v,b) => storeCellRef<BurnMintTokenPool_PendingBurn>(v, b, BurnMintTokenPool_PendingBurn.store)
        ));
        b.storeDict<uint64, CellRef<BurnMintTokenPool_PendingMint>>(self.pendingMints, c.Dictionary.Keys.BigUint(64), createDictionaryValue<CellRef<BurnMintTokenPool_PendingMint>>(
            (s) => loadCellRef<BurnMintTokenPool_PendingMint>(s, BurnMintTokenPool_PendingMint.fromSlice),
            (v,b) => storeCellRef<BurnMintTokenPool_PendingMint>(v, b, BurnMintTokenPool_PendingMint.store)
        ));
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct JettonClient {
 >     masterAddress: address
 >     jettonWalletCode: cell
 > }
 */
export interface JettonClient {
    readonly $: 'JettonClient'
    masterAddress: c.Address
    jettonWalletCode: c.Cell
}

export const JettonClient = {
    create(args: {
        masterAddress: c.Address
        jettonWalletCode: c.Cell
    }): JettonClient {
        return {
            $: 'JettonClient',
            ...args
        }
    },
    fromSlice(s: c.Slice): JettonClient {
        return {
            $: 'JettonClient',
            masterAddress: s.loadAddress(),
            jettonWalletCode: s.loadRef(),
        }
    },
    store(self: JettonClient, b: c.Builder): void {
        b.storeAddress(self.masterAddress);
        b.storeRef(self.jettonWalletCode);
    },
    toCell(self: JettonClient): c.Cell {
        return makeCellFrom<JettonClient>(self, JettonClient.store);
    }
}

/**
 > struct RateLimiter_Config {
 >     isEnabled: bool
 >     capacity: uint128
 >     rate: uint128
 > }
 */
export interface RateLimiter_Config {
    readonly $: 'RateLimiter_Config'
    isEnabled: boolean
    capacity: uint128
    rate: uint128
}

export const RateLimiter_Config = {
    create(args: {
        isEnabled: boolean
        capacity: uint128
        rate: uint128
    }): RateLimiter_Config {
        return {
            $: 'RateLimiter_Config',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_Config {
        return {
            $: 'RateLimiter_Config',
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(128),
            rate: s.loadUintBig(128),
        }
    },
    store(self: RateLimiter_Config, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 128);
        b.storeUint(self.rate, 128);
    },
    toCell(self: RateLimiter_Config): c.Cell {
        return makeCellFrom<RateLimiter_Config>(self, RateLimiter_Config.store);
    }
}

/**
 > struct RateLimiter_TokenBucket {
 >     tokens: uint128
 >     lastUpdated: uint64
 >     isEnabled: bool
 >     capacity: uint128
 >     rate: uint128
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint128
    lastUpdated: uint64
    isEnabled: boolean
    capacity: uint128
    rate: uint128
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint128
        lastUpdated: uint64
        isEnabled: boolean
        capacity: uint128
        rate: uint128
    }): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            tokens: s.loadUintBig(128),
            lastUpdated: s.loadUintBig(64),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(128),
            rate: s.loadUintBig(128),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 128);
        b.storeUint(self.lastUpdated, 64);
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 128);
        b.storeUint(self.rate, 128);
    },
    toCell(self: RateLimiter_TokenBucket): c.Cell {
        return makeCellFrom<RateLimiter_TokenBucket>(self, RateLimiter_TokenBucket.store);
    }
}

// ————————————————————————————————————————————
//    class BurnMintTokenPool
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

export class BurnMintTokenPool implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECugEAKkYAART/APSkE/S88sgLAQIBYgIDAgLLBAUCASCOjwIBIAYHAgEgX2ACASAICQIBIBkaAgEgCgsCASAVFgIBIAwNAgEgExQE9z4kZEw4O1E0NT0BPQE0SLQ1NTTB/QE9ATRgQCFbW1tbW1tkvALAG1tbW2S8AoAgQCGVhVWFVYV+JL4lwQREgQDEREDAhEQAhBPED4QLRBMEDsQKhBJEDgQJxBGEDUQJBAjVhvwDVcRXw0D4wJfCCPXLCHMTHJs4wKJ1yeAODxARAak7aLt+9csJ5Db7QyORNcsJ88U8lSUW3DbMeGCAMKKI26z8vQhggDCigTHBRPy9CBtA9cLP4sCAcjLPxX6UhL6UsnIz4cgFM5xzwthE8zJcPsA4w1/gEgBKOjrDAJI1NZY3NxBGEDXiAsjMzMsHEvQA9ADJyMwS9AD0AMntVAD4NAPXCz/4kiPQ1NQx0wcx9AQx9AQx0dDU+kgx1DH6SDHUMdMfMfpQMdHQ+kj6UDHRAYIAwogCxwXy9IIK+vCAI9DU1DHTBzH0BDH0BDHR0NQx+kgx1DH6SDDIz4WI+lIB+gKCEPuI4RnPC4rLP8mAQPsAAcjM9AD0AMntVAAI1TJ22wBGjhc0A9cLP/iSEDRDAPAMAsjM9AD0AMntVOBfBIQPAccA8vQAZmwS0z/6SDCCAMKIUTTHBRPy9IIAwolTI8cFs/L0IYsCyM+HIM5wzwthEss/EvpSyXD7AABXCFukltw4IJpAAAAAAAAAAAAAAAAAAABIoMG9A5voTGSW3/gAYMG9A5voTGAASRxepMiwgCOGSJxsMABnIT/IqkEIb7yhGaoAd4gqAKrAALoMDGAAj1MCOzkX+VIMAAwwDikTDgU1L4IyehEGheNBA3SIBSgPAHNVFluZWBZr3y8OBTNLmOEF8FIJWBZr7y8OEwgWa+8vDgUDShUDSAIBIBcYAF8MCOzkX+VIMAAwwDikTDgU1L4IyehEGheNBA3SIBSgPAHNVBFoFMFvJEwkTXiQAOAANQgjhU2XLyVgWa88vDgUVKooBTwCPgjUETgW4AIBIBscAgEgIyQCASAdHgIBIB8gAA0XLmRMOAxgACkIZFb4YE6SSGUArrDAJNsIXDi8vSAB9wh0CHQAdcsJ9PtIiTyv9cLP4IAoPBTGIBA9A5voTGz8vQo0NTUMdMHMfQEMfQEMdHQ1DH6SDHUMfpIMAXI+lIUzBLME/pSyVQgBoBA9BcB0/8x1wv/ggr68ID4KG3Iz4WIFvpSWPoCz4Fz+gKCEFlfB7zPC4UWyz8B+gKAhAfUMjM1gTpFBsMAFvL0ggCg8lM2gED0Dm+hMbPy9CfQ1NQx0wcx9AQx9AQx0dDUMfpIMdQx+kjXTAPQINP/MddM0PpIMFMCyM+EAhL6UvpSyVAFyM+E0MzM+RbIz4oAQMv/z1AByM7JBsjL/8kHyPpUFswWzBT6UslUICaAiABIU+lT0AMlx+wAAnoBA9BeCEAX14QAgbfgoiwTIz5BeNRRmJ88LP1AI+gIS+lT6VM+EIBXOycjPhYgW+lIB+gLPgXP6AoAVzwuFEss/FPpSAfoCzMlx+wCBAIUCASAlJgIBIFNUAvcUwOAQPQOb6HjAjBTAoBA9A5voYIAoPMB8vTU0dD6UNTU+kjRBYIAoPUGxwUV8vRSJYBA9FswBNDT/zHU1DH0BDH0BDHR0PpI0z/UMdP/MfpI0SXQ0//R+CgEyPpSyQLI+lIU+lITy/8SzMnIz48YAASCEOnADJfPC/dwgJygBPTtou37MSDXLCfT7SIknTHTP9TTH/QE+lAw8A7jDn+AqAf7U0dD6SNTU+kjRBYIAoPQGxwUV8vRQJYBA9FswJdDUMdQx0wcx9AQx9AQx0QTQAtAC1ywn0+0iJPK/0z/U0x8x9AH6UDAB0NP/MdTR0NQx0z/6SDHT/zH6SNEF0/8x0//U10wHyPpSFvpSIc8L/8nIz48YAASCEDfdb27PC/dwKQBUzwthEss/zMlw+wAgbpJfA44XyM+FCPpSghDg6IL1zwuOyz/MyYBB+wDiAGrPC2ETyz8SzMlw+wAhbpJfBY4hA8jMFMzJyM+FiBT6UoIQ9DKk488Ljss/EszL/8mAQPsA4gH+1ywgR5f9vI50bCHTPzHXTND6SNTU0QHQAdAB1ywn0+0iJPK/0z/U0x/0BPpQMAXT/9P/1NdMyM+T6faREijPCz8XzBXLHxP0AFJg+lTJAcjL/xLL/xLMEszJyM+Tno1BBhPLPxT6UhPMEszJyM+FiBL6UnHPC27MyYBA+wDjDisD+tcsJTb9MRyPctcsI5sWhOSZMdM/+gD6UPATj17XLCGo+78cmzHTP9TTH/pQMPAVj0jXLCTxU1s0jjNsIdM/MddM0PpI1NTRAdAB0AHXLCGo+78c8r/TP9TTH/pQMATTH9P/1wv/EFYQRRA08BuPCdcsIQ847DzjD+Li4uMNLC0uAvBsIdM/MddM0PpIMdTU0QHQAdAB1ywhqPu/HPK/0z/U0x/6UDAC0NP/MdTUMfQEMfQEMdHQ+kgx0z/UMdP/MfpIMdEE0x8x1wv/AeMPVhRukzBXE44iyM+FCAERFQH6UoIQ7wyzbs8LjgERFAHLP8+J0ebJgED7AOIvMAMo1ywit7npvI8J1ywgvhIW5OMP4w00NTYC5Gwh0z8x10zQ+kgx1NTRAdAB0AHXLCfT7SIk8r/TP9TTH/QB+lAwAtDT/zHU0dDUMdM/+kgx0/8x+kgx0QTT/zHXC/8B4w9WFG6TMFcTjiLIz4UIAREVAfpSghA0dupyzwuOAREUAcs/z4nR5smAQPsA4k5PAv6BOjgkVhiAQPQOb6ES8vTU9ATU1NEg0NTU0dDTf9M/0gDTf9N/0SKOOF8GAdDU1NHQ03/TP9IA03/Tf9FWItDUMfpIMdQx+kgwUqDwBgTIy38Tyz/KAMt/y3/JAcjMzMkB4w0DyMwS9ADMzFJCERiAQPRDVhnQ1DH6SDHUMfpIMTIB+IE6OCRWGIBA9A5voRLy9NT0BNTU0QHQ1NTR0NN/0z/SANN/03/RViLQ1DH6SDHUMfpIMFKg8AYEyMt/E8s/ygDLf8t/yQHIzMzJA8jMEvQAEszMUkIRGIBA9ENWGdDUMfpIMdQx+kgwBMjLPxT6UgERFgHL/8nIz48YAAQzAFg2ViLQ1DH6SDHUMfpIMBBFEDRBMFQmoPAGBMjLfxPLP8oAy3/Lf8kByMzMyQBOMATIyz8U+lIBERYBy//JyM+PGAAEghA0f/x8zwv3cc8LYczJcPsAACSCEHQJrY/PC/dxzwthzMlw+wAB/DHTP9M/10xWGdDU+kgx1DH6SDHUMdMfMfpQMdHQ+kj6UDHRJIIAwogCxwXy9IE6OCJWGIBA9A5voTHy9IE6OCJWGIBA9A5voRLy9NT0BNTU0YE6NyXQ0wchwUHyhQGqAtcY0ddJwwDy9CT5AIE6P1MUgwf0Dm+hMbPy9FRFFDcD8tcsIhNcZiSPbtcsJruJQISO49csIeKFHNyOWDHTP9cLHxEY0NT6SNT6SNTTHzH6UNEl0PpI+lAx0SiCAMKIAscF8vRWHQbIzBX6UhPM+lLMEssf+lTJyM+FCBP6UoIQQmpxO88Ljss/AREXAcsfyYBA+wDjDuMN4w04OToC/jHTP9TXTFYZ0NT6SDHUMfpIMdQx0x8x+lAx0dD6SPpQMdEkggDCiALHBfL0AdCUIMcAs44/INdLAZEwm4E0vAHAAfL010zQ4tM/UhARGIBA9FuBOjgB8vTIz48YAASCECeQgovPC/dwzwthEss/yXD7ABEW6DDQlCDHALOK6DBJSgCkgwf0F8jPjxgABIIQvw0ats8L93DPC2Emzws/Jc8UyXD7AAPIzBP0ABLMzFIiERiAQPRDyM+FCBT6UoIQEsxJhc8LjhLLP8s/AREUAczJgED7AAP01ywh+uT6vI9v1ywifxaTZI7kMdM/10xWGNDU+kgx1PpIMdQx0x8x+lAx0dD6SPpQ+lDRA9D6SPpQMdGS8BwAVCRw7E8kgTo+A8cFkjB/lNoBwwDi8vTQlCDHALOK6DDIz4UIEvpSghDdewxxzwuOyz/JgED7AOMO4w07PD0A5jHTP/pI+lD6UDARGtDU+kjUMfpI1NMf+lDRJdD6SPpQMdEqggDCiALHBfL0J8j6UlJw+lRWIAH6VMkGyMwV+lIVzBL6UswSyx/6VMnIz5Lc14wyFMs/EvpS+lQBERgB+lTJyM+FCBL6UnHPC27MyYBA+wAB+jHTP9M/10xWGdDU+kgx1DH6SDHUMdMfMfpQMdHQ+kj6UDHRJIIAwogCxwXy9IE6OCJWGIBA9A5voTHy9IE6OCJWGIBA9A5voRLy9NT0BNTU0ST5AFADgwf0W4E6QAHy9APIzBP0ABLMzFIiERiAQPRDyM+PGAAEghC8FMfoSAL8INdLAZEwm4E0vAHAAfL010zQ4tM/0gDU1IE6OCVWG4BA9A5voRLy9NT0BNTU0SeOPwHQ1DHUMdEl0NIA03/Tf9H4IyLIy3/LPxPKAMt/y3/JJdDSANN/03/R+CMiyMt/yz8TygDLf8t/yQHIzMzJAeMNA8jMEvQAzMxSUhEbPj8D8tcsIYUOj7yPbtcsJxg7JfSO49csJMlNshSOWDHTP/pIMBEY0NT6SDHU+kjU0x/6UNEl0PpI+lAx0SiCAMKIAscF8vRWHQbIzBb6UhTMEvpSzMsf+lTJyM+FCBP6UoIQ5dCLLs8Ljss/AREXAfpSyYBA+wDjDuMN4w1AQUIArjHTP/pQMBEY0NT6SNT6SNTTH/pQMdEl0PpI+lAx0SiCAMKIAscF8vRWHQbIzBX6UhPM+lLMyx/6VMnIz4UIE/pSghA8hp2AzwuOyz8BERcB+lTJgED7AAB60NQx1DHRJdDSANN/03/R+CMiyMt/yz8TygDLf8t/ySXQ0gDTf9N/0fgjIsjLf8s/E8oAy3/Lf8kByMzMyQBKgED0Q8jPjxgABIIQ/52/ds8L93DPC2EVyz8TygDMzMlw+wARFQH+1ywk7SbQTI5PMFYX0NT6SNT6SNTTH/pQ0QbQ+kj6UNFBCSjwAY4oN1cdERzI+lIV+lTJyMwS+lLMEvpSAREYAczLHwERFgH6VMkRFX/bMeAQeF8IxwDbMeEx0z/0BVYY0NT6SNQx+kgx1DHTHzH6UDHRAdD6SPpQMdEkgTo+AkMB0DHTP9dMVhjQ1PpIMdQx+kgx1DHTHzH6UDHR0PpI+lAx0SOCAMKIAscF8vQRF9D0BPQE9ATRERnQlCDHALOK6DAByPQA9AABERcB9ADJyM+FCBL6UoIQ1/XFY88LjgERFgHLP8mAQPsARAL+MdM/1NdMVhnQ1PpIMdQx+kgx1DHTHzH6UDHR0PpI+lAx0SSCAMKIAscF8vQB0JQgxwCziugw0JQgxwCzjjog10sBkTCbgTS8AcAB8vTXTNDi0z9SEBEWgED0WzDIz48YAASCENZGx9HPC/dwzwthEss/yXD7ABEU6DDIz4UIEkVGAITHBZIxf5ZSQscFwwDi8vQRF9D0BPQE9AQx0VYYAsj0APQA9ADJyM+FCBP6UoIQFYABYc8Ljss/AREWAfQAyYBA+wAA1CDXSwGRMJuBNLwBwAHy9NdM0OLTP/pQ+lAibpdSNoBA9FswmyLI+lJUIEeAQPRD4iFul1I1gED0WzCbIcj6UlQgRoBA9EPiA8jLPxL6VPpUycjPjxgABIIQnFq7lc8L93HPC2HMyXD7AFgB/iDXSwGRMJuBNLwBwAHy9NdM0OLTP9Mf0x/T/9P/0w/TD9IAgTo4KVYggED0Dm+hMfL0gTo1IvL0gTo0JIEnELny9IE6NCOBJxC58vSBOjUowgDy9CfIyx8nzwsfJs8L/yXPC/8kzwsPI88LDyLPCgBSkhEfgED0QwfIyx8Wyx9HACT6UoIQKMvMZM8Ljss/yYBA+wAAVhTL/xLL/8sPyw/KAMnIz48YAASCEPvmHxXPC/dwzwthE8s/EszJcPsAERUAZM8L93DPC2Eizws/VhfPFMlw+wDIz4UIFPpSghDhe/PMzwuOEss/yz8BERQBzMmAQPsAAf4g10sBkTCbgTS8AcAB8vTXTNDi0z/U1NSBOjcj0NMHIcFB8oUBqgLXGNHXScMA8vSBOjslVhuAQPQOb6Exs/L0AdDU1NFtAtDSANN/03/R+CMiyMt/yz8TygDLf8t/yQHQ0gDTf9N/0fgjIsjLf8s/E8oAy3/Lf8kByMzMyfgjSwAuyM+FCBL6UoIQrXgz188Ljss/yYBA+wABxHDIy3/LP3DPC4Bwzwt/yfgjcMjLf8s/cM8LgHDPC3/JAcjMzMkkBtCUIMcAs4roMAXIzBL0AMwTzFIyERmAQPRDyM+PGAAEghDtN8S8zwv3cM8LYRPLPwERFwHMyXD7ABEVTAH+INdLAZEwm4E0vAHAAfL010zQ4tMHIcFB8oUBqgLXGMgi10kgqTgC8kWrAiDBQfKFzwsHEs7JgTo3IdDTByHBQfKFAaoC1xjR10nDAPL0IPkAgTo/UxaDB/QOb6Exs/L0VEEWgwf0F8jPjxgABIIQvw0ats8L93DPC2Epzws/FU0ACszJcPsAAvyBOjgkVhiAQPQOb6ES8vTU9ATU1NEg0NTU0QHQ03/TP9IA03/Tf9EijjhfBgHQ1NTRAdDTf9M/0gDTf9N/0VYi0NQx+kgx1DH6SDBSoPAGBMjLfxPLP8oAy3/Lf8nIzMzJAeMNA8jMEvQAzMxSQhEYgED0Q1YZ0NQx+kgx1DFQUQH4gTo4JFYYgED0Dm+hEvL01PQE1NTRAdDU1NEB0NN/0z/SANN/03/RViLQ1DH6SDHUMfpIMFKg8AYEyMt/E8s/ygDLf8t/ycjMzMkDyMwS9AASzMxSQhEYgED0Q1YZ0NQx+kgx1DH6SDAEyMs/FPpSAREWAcv/ycjPjxgABFIAVjZWItDUMfpIMdQx+kgwEEUQNEEwVCag8AYEyMt/E8s/ygDLf8t/ycjMzMkAUvpIMATIyz8U+lIBERYBy//JyM+PGAAEghAUH34szwv3cc8LYczJcPsAACSCEDDrq9vPC/dxzwthzMlw+wAB9QmwwCVK26zwwCRcOKOG1cTCBEVCAcRFAcGERMGVQQREirak0/tgQCFDeARFREbERURFBEaERQRExEZERMREhEYERIREREXEREREBEWERAPERsPDhEaDg0RGQ0MERgMCxEXCwoRFgoJERsJCBEaCAcRGQcGERgGBREXBYFUB9wmwwCVKm6zwwCRcOKOKFcTCBEVCAcRFAcGERMGVQQREinamAcRFAcGERMGBRESBYEAhRESVUDgI9DT/9TRINDTP/pIMdP/+kgwgTo9ViHQ1DH6SDHUMfpIMFjHBfL0gTo5IlYegED0Dm+hMfL0Vh9WH1YfVh9WH1YfVh+BXAf4EERYEAxEbAwIRGgIBERkBERhWF1YXVh1WHVYdVh3wDwSOKF8EVxZXFlcWVxZXFlcWDxEVDw4RFA4NERMNDBESDAsREQsKERAKVVngyM+T6faRElYbzws/AREgAcwBER4Byx8BERwB9ABWGgH6VMkRG8jL/wERHAHL/wERHAHMVgDQAREaAczJyM+Tno1BBgERFgHLPwERFgH6UgERFwHMARETAczJyM+FiAERFQH6UnHPC24BERQBzMmAQPsADxEVDw4RFA4NERMNDBESDAsREQsKERAKEJ8QjhB9EGwQWxBKEDlIFkVVBwMB/FYfVh9WH1YfVh9WH1YfVh9WH1YfVh9WH1YfVh9WH1YX8BBWHtD0BPQEMfQEMdFSIIBA9A5voZP6SNGSMG3igTo+IW6z8vSBOj5RG8cF8vQqwwCWVhZus8MAkXDinlYaVhpWGlYaU9VWHNpg3lYfAlYfAlYfAlYfAlYfAlYfAlgD/FYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAlYfAgERGQERGFYc8BFmoSXjD4E6OFExgED0Dm+hFPL0AtT0BDHUMdQx0VYcyMv/ycjPk+n2kRIpzws/KM8UJ88LH1Jg9ABSUPpUySPIy/9WHllaWwL+Vh7Q1DH6SDHUMfpIMdQx0x/6UDHRUmDwCYE6OCNWHYBA9A5voRLy9NT0BNTU0SDQ1NTRAdDTf9M/0gDTf9N/0SKOOF8GAdDU1NEB0NN/0z/SANN/03/RVifQ1DH6SDHUMfpIMFKg8AUEyMt/E8s/ygDLf8t/ycjMzMkB4w0DyFxdAfSBOjgjVh2AQPQOb6ES8vTU9ATU1NEB0NTU0QHQ03/TP9IA03/Tf9FWJ9DUMfpIMdQx+kgwUqDwBQTIy38Tyz/KAMt/y3/JyMzMyQPIzBL0ABLMzFIyER2AQPRDVh7Q1DH6SDHUMfpIMCPIyz/6UlYczwv/ycjPjxgABF4A3s8L/yPPFCLPFMkrViIJViIJViJRkAlWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIglWIgkIESIIBxEhBwYRIAYFER8FEDQQIwERIAERH/ASAhEXAlBEAwBWNlYn0NQx+kgx1DH6SDAQRRA0QTBUJqDwBQTIy38Tyz/KAMt/y3/JyMzMyQB+zBL0AMzMUjIRHYBA9ENWHtDUMfpIMdQx+kgwI8jLP/pSVhzPC//JyM+PGAAEghDrpIwLzwv3cc8LYczJcPsAACSCEM9QWfzPC/dxzwthzMlw+wACASBhYgIBIH1+AgEgY2QCASBrbAIBIGVmAgEgZ2gAaRQzV8LNzc3OATDAJUibrPDAJFw4pc1RRVQM9pQ4F8EMoE6OgHQ9AQx9AQx9ATRWPACs/L0gAJEVxJXEF8PMmwzM9DTP/pIMdcL/wKAQPQOb6GTXwNw4dMfMdMfMdP/MdP/MdMP0w/SANGTXwRw4QOXMKiBJxCpBOAyqIEnEKkEgAZUODk5Ojo6Ojo6Ojo6Pj4+PgPDAJUpbrPDAJFw4p49EHwQaxBaEElQBwjaweBsVTUH0NQx+kgx1DH6SDHUMdMfMfpQ0SBu4wNfCHCBpAfcJcMAlSdus8MAkXDijidXEgIRFAIBERMBERIjVhVWFVYVVhUr2oMCERQCARETARESgQCFERLegTo+VhvQ1DH6SDHUMfpI10z4KMjPhAL6UhL6UskByM+E0MzM+RbIz4oAQMv/z1AmxwXy9PQEIW6YMSDHAJIwbeCS0dDigagCQJ9DT/zHT/9Qx1DHR+CgFyPpSFMwYzMnIz5EEp0QmFcs/zBXLHxP0ABPL//pS9ADJyM+FiBL6Us+EEHP6AnHPC2XMyYBA+wB/AMogbo4wMG2LBMjPkD4p+pYVyz9QA/oCUhD6UvpU9ADPhCDOycjPhQgS+lJxzwtuzMmAQPsA4Gwi+kjU1NFWGtDUMfpIMdT6SDHUMdMfMfpQMdHQ+kgx+lAx+lAx0QNuk1jwFOFfBAIBIG1uAgEgcnMB9QkwwCVJW6zwwCRcOKOHFcRBhETBgUREgUEEREEVQIREFYR2nNP7YEAhQ3gM9AC0ALXLCfT7SIk8r/TP9TTHzH0AfpQMAHQ0/8x1NHQ1DHTP/pIMdP/MfpI0QXT/zHT/9TXTAfI+lIW+lIhzwv/ycjPjxgABIIQN91vboG8B9QlwwCVLm6zwwCRcOKOJ1cSAhEUAgEREwERElYUVhRWFFYUVhHacwIRFAIBERMBERKBAIUREt4RFREaERURFBEZERQRExEYERMREhEXERIREREWEREREBEaERAPERkPDhEYDg0RFw0MERYMCxEaCwoRGQoJERgJCBEXCIHAAcs8L93DPC2ETyz8SzMlw+wAhbpJfBY4hA8jMFMzJyM+FiBT6UoIQ9DKk488Ljss/EszL/8mAQPsA4gH4BxEWBwYRGgYFERkFBBEYBAMRFwMCERYCAREaAREZVhhWGFYYVh1WHfAWA44wXwNXFlcWVxZXFlcWERARFREQDxEUDw4REw4NERINDBERDAsREAsQrxCeEI0QfFVG4BEYER0RGBEXERwRFxEWERsRFhEVERoRFREUERkRFHEAfhETERgRExESERcREhERERYREREQERUREA8RFA8OERMODRESDQwREQwLERALEK8QnhCNEHwQaxBaEEkQOFjwGwH1CXDAJUtbrPDAJFw4o4oVxIHERQHBhETBgUREgVVAxERLNqHBhETBgUREgUEEREEgQCFERFVMOAi0NP/MdTU9AT0BDHRAtD6SDHTP9Qx0//6SNGBOj1WINDUMfpIMdQx+kgwWMcF8vSBOjkiVh2AQPQOb6Ex8vRWHlYegdABRFcSVxBfDzJsMwKAQPQOb6GSW3Dh1DH0BNQx1DHRAfkAAYMH9A5voTGAB/FYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WF/AQVh3Q9AQx9AT0BDHRUiCAQPQOb6GT+kjRkjBt4oE6PiFus/L0gTo+URrHBfL0KcMAllYUbrPDAJFw4p5WGVYZVhlWGVPFVhraYN5WHlYeVh5WHnUB/lYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYeVh5WHlYXgTpAERrwFxPy9FYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAVYdAREY8BhWHQJWHQJWHQJ2A/xWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQJWHQLwGSPjDyJWGcjPkNR9344nzws/Js8UJc8LH1JA+lTJIsjLHyLPC/9WHM8L/8kpViAIViAIViBRgAhWIAhWIAhWIAhWIAh3eHkC/lYc0NQx+kgx1DH6SDHUMdMf+lAx0VJA8AmBOjgiVhuAQPQOb6ES8vTU9ATU1NEg0NTU0dDTf9M/0gDTf9N/0SKOOF8GAdDU1NHQ03/TP9IA03/Tf9FWJdDUMfpIMdQx+kgwUqDwBQTIy38Tyz/KAMt/y3/JAcjMzMkB4w0DyMx6ewH2gTo4IlYbgED0Dm+hEvL01PQE1NTRAdDU1NHQ03/TP9IA03/Tf9FWJdDUMfpIMdQx+kgwUqDwBQTIy38Tyz/KAMt/y3/JAcjMzMkDyMwS9AASzMxSIhEbgED0Q1Yc0NQx+kgx1DH6SDACyMs/EvpSVhnPC//JyM+PGAAEfACaViAIViAIViAIViAIViAIViAIViAIViAIViAIViAIViAIViAIViAIViAIBxEgBwYRHwYFER4FBBEeBAMRHgMCER8CAREg8BoBERYBUDMAWDZWJdDUMfpIMdQx+kgwEEUQNEEwVCag8AUEyMt/E8s/ygDLf8t/yQHIzMzJAH4S9ADMzFIiERuAQPRDVhzQ1DH6SDHUMfpIMALIyz8S+lJWGc8L/8nIz48YAASCEMvEDlvPC/dxzwthzMlw+wAAJIIQi7JfqM8L93HPC2HMyXD7AAIBIH+AAgEgiIkCASCBggIBIIOEAGMVxBfDzVfAzIgbpEw4DHQgTpBIddJgwe6lyHXSsAAwwCRcOLy9NP/0YE6QSGEB7vy9IACHFcSVxBfDzU1W1MgupIwMeBTILyeEqGBOkIhwU7y9PADqQTgWKGBOkIhwU7y9PADgTpCIZmE/yKpBCO+wwCRf+Ly9KiABoQ3ODg4ODg4OTk5OTk9PT09AcMAlStus8MAkXDijhE8EGsQWhBJEDgQR14jQDTaseBsMzMzNgbQ1DH6SDHUMfpIMdQx0x8x+lDRIG7jA18HcIIUC8QowwCVLm6zwwCRcOKOGQsRGAsKERcKCREWCQgRFQgu2sQDERADT+3gMjMD0NP/MdTUMfQEMfQEMdHQ+kjTP9Qx0/8x+kjRAsj6UskCyPpSF/pSE8v/EszJyM+PGAAEghDpwAyXzwv3cM8LYRXLPxTMyXD7ACJu4w+CGhwCKJtDTHzHT/9P/MdH4KAfI+lITzBfMycjPkcDwrWIVyz8TzBLL/8sfEvpS9ADJyM+FiBL6Us+EEHP6AnHPC2XMyYBA+wB/AARfAwA4yMv/ycjPhYgT+lKCEODogvXPC47LP8zJgED7AAIBIIqLAK1BNfA1cSVxBfDzJsMwPQ1DH6SDHUMfpIMdQx0x/6UDHRUjDwCQGAQPQOb6GWW3BUcABw4dMf0x/T/9P/0w/TD9IA0ZdfB3BUcABw4QaUMDEDf+AxNAN/gAHQxMiBus5THBcMAkltw4oAL3FcSVxBfDzIzM4E6ODQSgED0Dm+hE/L0AdQx9AQx1NTRAuMCMdDU1NEB0NN/0z/SANN/03/R+CNQBKEjqBSgUjDwCPgjAcjLf8s/ygASy3/Lf8kB0NN/0z/SANN/03/R+CNQBKEjqBSgUjDwCPgjAcjLf8s/ygASy3/Lf4IyNALIw0NTU0QHQ03/TP9IA03/Tf9H4I1AEoSOoFKBSMPAI+CMByMt/yz/KABLLf8t/yQHQ03/TP9IA03/Tf9H4I1AEoSOoFKBSMPAI+CMByMt/yz/KABLLf8t/yQACyQIBIJCRAgEgsLECASCSkwIBIKSlAgEglJUCASCiowIBIJaXAgEgnp8CAWaYmQIBSJydAgFImpsAcaHHtRNDU9AQx9AQx0SDQMdQx1DHTBzH0BPQEMdFtIYBA9IZvpTKRAZ1SAm8CURKAQPR8b6Uy6DAxgBZsv2omhqegIY+gIY6JBoGOpqGOmDmPoCGPoCGOjoahj9JBjqGP0kGOoY64WPwACeynaiaGoY+gIY+gJowCB6BzfQmMABlpXXaiaGp6Ahj6Ahjo6GoY6mmDmPoCGPoCGOjoegIY+gJ6AhjowCB6BzfQyf0kaMkYNvFAEunI9qJoanoCGPoCGOjoamoY6YOY+gIY+gIY6OhqGP0kGOoY/SQYQIBIKChAKmt2HaiaGp6AnoCaJFoamppg/oCegJowIBCtra2tra2yXgFgDa2trbJeAUACIiIi4iIiIgIiwiIB4iKh4cIigcGiImGhwiJBy8eiGeqlcCAQygZ+AjAAGKpX40JWxpbmsuY2hhaW4udG9uLmNjaXAuQnVybk1pbnRUb2tlblBvb2yCLUwLjEuMIACip3e1E0NQx9AT0BDHRgED0Dm+hMQA3s2o7UTQ1PQEMfQEMdHQ1DHUMdMH9AQx9AQx0YACnsB87UTQ1PQE9ATRItDU1NMH9AT0BNGBAIVtbW1tbW2S8AsAbW1tbZLwCgAREREWEREREBEVERAPERQPDhETDg0REg0PEREPDhEQDlUdgQCGWfAXgAgEgpqcCASCurwIBIKipAGGycbtRNDU9AQx9AQx0SDQMdTUMdMHMfQEMfQEMdHQ1DH6SDHUMfpIMdQx0x8x+lDRgAgEgqqsCAWKsrQDkqoftRNDU9AT0BNEi0NTU0wf0BPQE0YEAhW1tbW1tbZLwCwBtbW1tkvAKABERERoREREQERkREA8RGA8OERcODREWDREUERURFBETERQRExESERMREgwREgwLERELChEQChCfEI4QfRBsVVWBAIZVUPAeAGqpHe1E0NT0BDH0BDHR0NTUMdMHMfQEMfQEMdHQ1PpIMdQx+kgx1DHTHzH6UDHR0PpI+lAx0QBTofu1E0NT0BDH0BDHRINAx1NQx0wcx9AQx9AQx0dDUMfpIMdQx+kgwxwWAFOgf7UTQ1PQEMfQEMdEg0DHU1DHTBzH0BDH0BDHR0NQx10zQ+kj6UPpQ0YAp7Jeu1E0NT0BPQE0SLQ1NTTB/QE9ATRgQCFbW1tbW1tkvALAG1tbW2S8AoAERERFhERERARFREQDxEUDw4REw4NERINDxERDw4REA5VHYEAhlnwHYABnsuG7UTQ1PQEMfQEMdHQ1DHU0wcx9AQx9AQx0dD0BPQEMfQEMdGAQPQOb6GT+kjRkjBt4oAIBILKzAgEgtLUAXbR9vaiaGp6Ahj6Ahjo6GpqGOmDmPoCGPoCGOjoahj9JGoY/SQY6hjpj5j9KBjowAIW33P2omhqegIY+gIY6JBoGOoY6hjpg5j6Ahj6AmjAIHoHN9DHCWmP6Y/p/+n/6Yfph+kAaMCARMyYNra2tra2trhxQAKG0jb2omhqegIY+gIY6JBoGOoY6hjpg5j6AnoCGOjAnRwswCB6BzfQiXl6ahj6AmoY6hjotpDBg/pDN9LITwDqaKw3gSiJQYP6PjfS9AgRr4HACASC2twIBari5AEWyHHtRNDU9AQx9AQx0dDUMdQx0wcx9AT0BDHRgED0Dm+hMYABlpV/aiaGp6Ahj6AhjokGgY6hjqGOmDmPoCegIY6MCdHCzAIHoHN9CJeXpqegIY6hjqGOjAFGnA9qJoanoCGPoCGOjoahjqaYOY+gIY+gIY6Oh6Ahj6Ahj6AmiA+AFZw==');

    static Errors = {
        'Common_Error.CrossChainAddressOutOfRange': 5,
        'Utils_Error.InvalidData': 13500,
        'TokenPool_Error.InvalidTransferFeeBps': 14900,
        'TokenPool_Error.InvalidTokenTransferFeeConfig': 14901,
        'TokenPool_Error.ZeroAddressInvalid': 14903,
        'TokenPool_Error.NonExistentChain': 14904,
        'TokenPool_Error.ChainNotAllowed': 14905,
        'TokenPool_Error.CursedByRMN': 14906,
        'TokenPool_Error.ChainAlreadyExists': 14907,
        'TokenPool_Error.InvalidToken': 14909,
        'TokenPool_Error.Unauthorized': 14910,
        'TokenPool_Error.PoolAlreadyAdded': 14911,
        'TokenPool_Error.InvalidRemotePoolForChain': 14912,
        'TokenPool_Error.InvalidRemoteChainDecimals': 14913,
        'TokenPool_Error.OverflowDetected': 14914,
        'TokenPool_Error.UnsupportedOperation': 14917,
        'TokenPool_Error.InvalidRequestedFinality': 14921,
        'RateLimiter_Error.BucketOverfilled': 26300,
        'RateLimiter_Error.TokenMaxCapacityExceeded': 26301,
        'RateLimiter_Error.TokenRateLimitReached': 26302,
        'BurnMintTokenPool_Error.PendingBurnAlreadyExists': 41200,
        'BurnMintTokenPool_Error.PendingMintAlreadyExists': 41202,
        'BurnMintTokenPool_Error.PendingMintNotFound': 41203,
        'BurnMintTokenPool_Error.UnexpectedBurnConfirmationSender': 41204,
        'BurnMintTokenPool_Error.UnexpectedMintConfirmationSender': 41205,
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

    static registerCustomPackUnpack<T>(
        typeName: string,
        packToBuilderFn: CustomPackToBuilderFn<T> | null,
        unpackFromSliceFn: CustomUnpackFromSliceFn<T> | null,
    ) {
        if (customSerializersRegistry.has(typeName)) {
            throw new Error(`Custom pack/unpack for 'BurnMintTokenPool.${typeName}' already registered`);
        }
        customSerializersRegistry.set(typeName, [packToBuilderFn, unpackFromSliceFn]);
    }

    static fromAddress(address: c.Address) {
        return new BurnMintTokenPool(address);
    }

    static fromStorage(emptyStorage: {
        poolData: CellRef<TokenPool_Data>
        pendingBurns: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingBurn>>
        pendingMints: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingMint>>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BurnMintTokenPool.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BurnMintTokenPool(address, initialState);
    }

    static createCellOfTokenPoolLockOrBurn(body: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }) {
        return TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFinished(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }) {
        return TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPreflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }) {
        return TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolReleaseOrMint(body: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }) {
        return TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFinished(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }) {
        return TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body));
    }

    static createCellOfTokenPoolPostflightCheckFailed(body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }) {
        return TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body));
    }

    static createCellOfTokenPoolApplyChainUpdates(body: {
        queryId: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }) {
        return TokenPool_ApplyChainUpdates.toCell(TokenPool_ApplyChainUpdates.create(body));
    }

    static createCellOfTokenPoolAddRemotePool(body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }) {
        return TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body));
    }

    static createCellOfTokenPoolRemoveRemotePool(body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }) {
        return TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body));
    }

    static createCellOfTokenPoolSetDynamicConfig(body: {
        queryId: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }) {
        return TokenPool_SetDynamicConfig.toCell(TokenPool_SetDynamicConfig.create(body));
    }

    static createCellOfTokenPoolSetAllowedFinalityConfig(body: {
        queryId: uint64
        allowedFinalityConfig: uint32
    }) {
        return TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body));
    }

    static createCellOfTokenPoolSetAdvancedPoolHooks(body: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }) {
        return TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body));
    }

    static createCellOfTokenPoolSetRateLimitConfig(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }) {
        return TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body));
    }

    static createCellOfTokenPoolApplyTokenTransferFeeConfigUpdates(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }) {
        return TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body));
    }

    static createCellOfTokenPoolUpdateRampAccess(body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }) {
        return TokenPool_UpdateRampAccess.toCell(TokenPool_UpdateRampAccess.create(body));
    }

    static createCellOfTokenPoolSetRMNProxy(body: {
        queryId: uint64
        rmnProxy: c.Address
    }) {
        return TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body));
    }

    static createCellOfTokenPoolSetCursedSubjects(body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }) {
        return TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body));
    }

    static createCellOfBurnMintTokenPoolClaimMinterAdmin(body: {
        queryId: uint64
    }) {
        return BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body));
    }

    static createCellOfReturnExcessesBack(body: {
        queryId: uint64
    }) {
        return ReturnExcessesBack.toCell(ReturnExcessesBack.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendTokenPoolLockOrBurn(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        request: CellRef<TokenPool_LockOrBurnInV1>
        requestedFinalityConfig: uint32
        tokenArgs: c.Cell | null
        replyTo: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_LockOrBurn.toCell(TokenPool_LockOrBurn.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFinished.toCell(TokenPool_PreflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPreflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_LockOrBurnForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PreflightCheckFailed.toCell(TokenPool_PreflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolReleaseOrMint(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        requestedFinalityConfig: uint32
        replyTo?: c.Address | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFinished(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFinished.toCell(TokenPool_PostflightCheckFinished.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolPostflightCheckFailed(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        forwardPayload: CellRef<TokenPool_ReleaseOrMintForwardPayload>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_PostflightCheckFailed.toCell(TokenPool_PostflightCheckFailed.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyChainUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        remoteChainSelectorsToRemove: SnakedCell<uint64>
        chainsToAdd: SnakedCell<TokenPool_ChainUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ApplyChainUpdates.toCell(TokenPool_ApplyChainUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolAddRemotePool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_AddRemotePool.toCell(TokenPool_AddRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolRemoveRemotePool(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        remoteChainSelector: uint64
        remotePoolAddress: CellRef<CrossChainAddress>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_RemoveRemotePool.toCell(TokenPool_RemoveRemotePool.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetDynamicConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        router: c.Address
        rateLimitAdmin?: c.Address | null /* = null */
        feeAdmin?: c.Address | null /* = null */
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetDynamicConfig.toCell(TokenPool_SetDynamicConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAllowedFinalityConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        allowedFinalityConfig: uint32
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAllowedFinalityConfig.toCell(TokenPool_SetAllowedFinalityConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetAdvancedPoolHooks(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        advancedPoolHooks: c.Address | null
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetAdvancedPoolHooks.toCell(TokenPool_SetAdvancedPoolHooks.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetRateLimitConfig(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RateLimitConfigArgs>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRateLimitConfig.toCell(TokenPool_SetRateLimitConfig.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolApplyTokenTransferFeeConfigUpdates(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>
        disableChainSelectors: SnakedCell<uint64>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_ApplyTokenTransferFeeConfigUpdates.toCell(TokenPool_ApplyTokenTransferFeeConfigUpdates.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolUpdateRampAccess(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        updates: SnakedCell<TokenPool_RampUpdate>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_UpdateRampAccess.toCell(TokenPool_UpdateRampAccess.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetRMNProxy(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        rmnProxy: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetRMNProxy.toCell(TokenPool_SetRMNProxy.create(body)),
            ...extraOptions
        });
    }

    async sendTokenPoolSetCursedSubjects(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        cursedSubjects: CursedSubjects
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenPool_SetCursedSubjects.toCell(TokenPool_SetCursedSubjects.create(body)),
            ...extraOptions
        });
    }

    async sendBurnMintTokenPoolClaimMinterAdmin(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body)),
            ...extraOptions
        });
    }

    async sendReturnExcessesBack(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: ReturnExcessesBack.toCell(ReturnExcessesBack.create(body)),
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

    async getToken(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('token', []));
        return r.readSlice().loadAddress();
    }

    async getTokenDecimals(provider: ContractProvider): Promise<uint8> {
        const r = StackReader.fromGetMethod(1, await provider.get('tokenDecimals', []));
        return r.readBigInt();
    }

    async getIsSupportedChain(provider: ContractProvider, remoteChainSelector: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isSupportedChain', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readBoolean();
    }

    async getOnRamp(provider: ContractProvider, remoteChainSelector: uint64): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('onRamp', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getOffRamp(provider: ContractProvider, remoteChainSelector: uint64): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('offRamp', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getHasPendingBurn(provider: ContractProvider, queryId: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasPendingBurn', [
            { type: 'int', value: queryId },
        ]));
        return r.readBoolean();
    }

    async getHasPendingMint(provider: ContractProvider, queryId: uint64): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('hasPendingMint', [
            { type: 'int', value: queryId },
        ]));
        return r.readBoolean();
    }

    async getRMNProxy(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRMNProxy', []));
        return r.readSlice().loadAddress();
    }

    async getVerifyNotCursed(provider: ContractProvider, subject: uint128): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('verifyNotCursed', [
            { type: 'int', value: subject },
        ]));
        return r.readBoolean();
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getCurrentRateLimiterState(provider: ContractProvider, remoteChainSelector: uint64, fastFinality: boolean): Promise<TokenPool_RateLimiterPair> {
        const r = StackReader.fromGetMethod(2, await provider.get('getCurrentRateLimiterState', [
            { type: 'int', value: remoteChainSelector },
            { type: 'int', value: (fastFinality ? -1n : 0n) },
        ]));
        return ({
            $: 'TokenPool_RateLimiterPair',
            outbound: r.readCellRef<RateLimiter_TokenBucket>(RateLimiter_TokenBucket.fromSlice),
            inbound: r.readCellRef<RateLimiter_TokenBucket>(RateLimiter_TokenBucket.fromSlice),
        });
    }

    async getIsSupportedToken(provider: ContractProvider, token: c.Address): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isSupportedToken', [
            { type: 'slice', cell: makeCellFrom<c.Address>(token,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBoolean();
    }

    async getDynamicConfig(provider: ContractProvider): Promise<TokenPool_DynamicConfig> {
        const r = StackReader.fromGetMethod(3, await provider.get('getDynamicConfig', []));
        return ({
            $: 'TokenPool_DynamicConfig',
            router: r.readSlice().loadAddress(),
            rateLimitAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
            feeAdmin: r.readNullable<c.Address>(
                (r) => r.readSlice().loadAddress()
            ),
        });
    }

    async getAllowedFinalityConfig(provider: ContractProvider): Promise<uint32> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAllowedFinalityConfig', []));
        return r.readBigInt();
    }

    async getAdvancedPoolHooks(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getAdvancedPoolHooks', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }

    async getSupportedChains(provider: ContractProvider): Promise<lisp_list<uint64>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getSupportedChains', []));
        return r.readLispListOf<uint64>(
            (r) => r.readBigInt()
        );
    }

    async getIsRemotePool(provider: ContractProvider, remoteChainSelector: uint64, remotePoolAddress: CellRef<CrossChainAddress>): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('isRemotePool', [
            { type: 'int', value: remoteChainSelector },
            { type: 'cell', cell: CrossChainAddress.toCell(remotePoolAddress.ref) },
        ]));
        return r.readBoolean();
    }

    async getRemoteToken(provider: ContractProvider, remoteChainSelector: uint64): Promise<CellRef<CrossChainAddress>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemoteToken', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice);
    }

    async getRemotePools(provider: ContractProvider, remoteChainSelector: uint64): Promise<lisp_list<CellRef<CrossChainAddress>>> {
        const r = StackReader.fromGetMethod(1, await provider.get('getRemotePools', [
            { type: 'int', value: remoteChainSelector },
        ]));
        return r.readLispListOf<CellRef<CrossChainAddress>>(
            (r) => r.readCellRef<CrossChainAddress>(CrossChainAddress.fromSlice)
        );
    }

    async getTokenTransferFeeConfig(provider: ContractProvider, destChainSelector: uint64): Promise<TokenPool_TokenTransferFeeConfig | null> {
        const r = StackReader.fromGetMethod(8, await provider.get('getTokenTransferFeeConfig', [
            { type: 'int', value: destChainSelector },
        ]));
        return r.readWideNullable<TokenPool_TokenTransferFeeConfig>(8,
            (r) => ({
                $: 'TokenPool_TokenTransferFeeConfig',
                destGasOverhead: r.readBigInt(),
                destBytesOverhead: r.readBigInt(),
                finalityFeeUSDCents: r.readBigInt(),
                fastFinalityFeeUSDCents: r.readBigInt(),
                finalityTransferFeeBps: r.readBigInt(),
                fastFinalityTransferFeeBps: r.readBigInt(),
                isEnabled: r.readBoolean(),
            })
        );
    }

    async getFee(provider: ContractProvider, localToken: c.Address, destChainSelector: uint64, amount: uint256, feeToken: c.Address, requestedFinalityConfig: uint32, tokenArgs: c.Cell | null): Promise<[
        uint256,
        uint32,
        uint32,
        uint16,
        boolean,
    ]> {
        const r = StackReader.fromGetMethod(5, await provider.get('getFee', [
            { type: 'slice', cell: makeCellFrom<c.Address>(localToken,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: destChainSelector },
            { type: 'int', value: amount },
            { type: 'slice', cell: makeCellFrom<c.Address>(feeToken,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: requestedFinalityConfig },
            tokenArgs === null ? { type: 'null' } : { type: 'cell', cell: tokenArgs },
        ]));
        return [
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
        ];
    }

    async getFeeAmount(provider: ContractProvider, transfer: TokenPool_LockOrBurnTransfer, requestedFinalityConfig: uint32): Promise<uint256> {
        const r = StackReader.fromGetMethod(1, await provider.get('getFeeAmount', [
            { type: 'int', value: transfer.id },
            { type: 'cell', cell: makeCellFrom<TokenPool_TransferDetails<c.Address, CellRef<CrossChainAddress>>>(transfer.details.ref,
                (v,b) => { storeCellRef<CrossChainAddress>(v.receiver, b, CrossChainAddress.store);
                b.storeUint(v.remoteChainSelector, 64);
                b.storeAddress(v.originalSender);
                b.storeUint(v.amount, 256);
                b.storeAddress(v.localToken); }
            ) },
            { type: 'int', value: requestedFinalityConfig },
        ]));
        return r.readBigInt();
    }
}
