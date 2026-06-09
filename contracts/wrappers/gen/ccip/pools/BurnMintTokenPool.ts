// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a BurnMintTokenPool contract in Tolk.
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

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
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
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_AdminConfig {
    readonly $: 'TokenPool_AdminConfig'
    ownable: CellRef<Ownable2Step>
    rmnProxy: c.Address
    dynamicConfig: CellRef<TokenPool_DynamicConfig>
    allowedFinalityConfig: uint32 /* = 0 as uint32 */
}

export const TokenPool_AdminConfig = {
    create(args: {
        ownable: CellRef<Ownable2Step>
        rmnProxy: c.Address
        dynamicConfig: CellRef<TokenPool_DynamicConfig>
        allowedFinalityConfig?: uint32 /* = 0 as uint32 */
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
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_AdminConfig, b: c.Builder): void {
        storeCellRef<Ownable2Step>(self.ownable, b, Ownable2Step.store);
        b.storeAddress(self.rmnProxy);
        storeCellRef<TokenPool_DynamicConfig>(self.dynamicConfig, b, TokenPool_DynamicConfig.store);
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_AdminConfig): c.Cell {
        return makeCellFrom<TokenPool_AdminConfig>(self, TokenPool_AdminConfig.store);
    }
}

/**
 > struct TokenPool_Data {
 >     adminConfig: Cell<TokenPool_AdminConfig>
 >     mirroredPolicy: Cell<TokenPool_MirroredPolicy>
 >     token: address
 >     tokenDecimals: uint8
 >     remoteChainConfigs: map<uint64, TokenPool_RemoteChainConfig>
 >     tokenTransferFeeConfigs: map<uint64, TokenPool_TokenTransferFeeConfig>
 > }
 */
export interface TokenPool_Data {
    readonly $: 'TokenPool_Data'
    adminConfig: CellRef<TokenPool_AdminConfig>
    mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
    token: c.Address
    tokenDecimals: uint8
    remoteChainConfigs: c.Dictionary<uint64, TokenPool_RemoteChainConfig>
    tokenTransferFeeConfigs: c.Dictionary<uint64, TokenPool_TokenTransferFeeConfig>
}

export const TokenPool_Data = {
    create(args: {
        adminConfig: CellRef<TokenPool_AdminConfig>
        mirroredPolicy: CellRef<TokenPool_MirroredPolicy>
        token: c.Address
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
            token: s.loadAddress(),
            tokenDecimals: s.loadUintBig(8),
            remoteChainConfigs: c.Dictionary.load<uint64, TokenPool_RemoteChainConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_RemoteChainConfig>(TokenPool_RemoteChainConfig.fromSlice, TokenPool_RemoteChainConfig.store), s),
            tokenTransferFeeConfigs: c.Dictionary.load<uint64, TokenPool_TokenTransferFeeConfig>(c.Dictionary.Keys.BigUint(64), createDictionaryValue<TokenPool_TokenTransferFeeConfig>(TokenPool_TokenTransferFeeConfig.fromSlice, TokenPool_TokenTransferFeeConfig.store), s),
        }
    },
    store(self: TokenPool_Data, b: c.Builder): void {
        storeCellRef<TokenPool_AdminConfig>(self.adminConfig, b, TokenPool_AdminConfig.store);
        storeCellRef<TokenPool_MirroredPolicy>(self.mirroredPolicy, b, TokenPool_MirroredPolicy.store);
        b.storeAddress(self.token);
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
 > struct TokenPool_TokenTransferFeeConfig {
 >     isEnabled: bool
 >     finalityFeeUSDCents: uint256
 >     fastFinalityFeeUSDCents: uint256
 >     destGasOverhead: uint32
 >     destBytesOverhead: uint32
 >     finalityTransferFeeBps: uint16
 >     fastFinalityTransferFeeBps: uint16
 > }
 */
export interface TokenPool_TokenTransferFeeConfig {
    readonly $: 'TokenPool_TokenTransferFeeConfig'
    isEnabled: boolean
    finalityFeeUSDCents: uint256
    fastFinalityFeeUSDCents: uint256
    destGasOverhead: uint32
    destBytesOverhead: uint32
    finalityTransferFeeBps: uint16
    fastFinalityTransferFeeBps: uint16
}

export const TokenPool_TokenTransferFeeConfig = {
    create(args: {
        isEnabled: boolean
        finalityFeeUSDCents: uint256
        fastFinalityFeeUSDCents: uint256
        destGasOverhead: uint32
        destBytesOverhead: uint32
        finalityTransferFeeBps: uint16
        fastFinalityTransferFeeBps: uint16
    }): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_TokenTransferFeeConfig {
        return {
            $: 'TokenPool_TokenTransferFeeConfig',
            isEnabled: s.loadBoolean(),
            finalityFeeUSDCents: s.loadUintBig(256),
            fastFinalityFeeUSDCents: s.loadUintBig(256),
            destGasOverhead: s.loadUintBig(32),
            destBytesOverhead: s.loadUintBig(32),
            finalityTransferFeeBps: s.loadUintBig(16),
            fastFinalityTransferFeeBps: s.loadUintBig(16),
        }
    },
    store(self: TokenPool_TokenTransferFeeConfig, b: c.Builder): void {
        b.storeBit(self.isEnabled);
        b.storeUint(self.finalityFeeUSDCents, 256);
        b.storeUint(self.fastFinalityFeeUSDCents, 256);
        b.storeUint(self.destGasOverhead, 32);
        b.storeUint(self.destBytesOverhead, 32);
        b.storeUint(self.finalityTransferFeeBps, 16);
        b.storeUint(self.fastFinalityTransferFeeBps, 16);
    },
    toCell(self: TokenPool_TokenTransferFeeConfig): c.Cell {
        return makeCellFrom<TokenPool_TokenTransferFeeConfig>(self, TokenPool_TokenTransferFeeConfig.store);
    }
}

/**
 > struct TokenPool_LockOrBurnInV1 {
 >     receiver: Cell<CrossChainAddress>
 >     remoteChainSelector: uint64
 >     originalSender: address
 >     amount: uint256
 >     localToken: address
 > }
 */
export interface TokenPool_LockOrBurnInV1 {
    readonly $: 'TokenPool_LockOrBurnInV1'
    receiver: CellRef<CrossChainAddress>
    remoteChainSelector: uint64
    originalSender: c.Address
    amount: uint256
    localToken: c.Address
}

export const TokenPool_LockOrBurnInV1 = {
    create(args: {
        receiver: CellRef<CrossChainAddress>
        remoteChainSelector: uint64
        originalSender: c.Address
        amount: uint256
        localToken: c.Address
    }): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnInV1 {
        return {
            $: 'TokenPool_LockOrBurnInV1',
            receiver: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remoteChainSelector: s.loadUintBig(64),
            originalSender: s.loadAddress(),
            amount: s.loadUintBig(256),
            localToken: s.loadAddress(),
        }
    },
    store(self: TokenPool_LockOrBurnInV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.receiver, b, CrossChainAddress.store);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.originalSender);
        b.storeUint(self.amount, 256);
        b.storeAddress(self.localToken);
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
 >     originalSender: Cell<CrossChainAddress>
 >     remoteChainSelector: uint64
 >     receiver: address
 >     sourceDenominatedAmount: uint256
 >     localToken: address
 >     sourcePoolAddress: Cell<CrossChainAddress>
 >     sourcePoolData: cell?
 >     offchainTokenData: cell?
 > }
 */
export interface TokenPool_ReleaseOrMintInV1 {
    readonly $: 'TokenPool_ReleaseOrMintInV1'
    originalSender: CellRef<CrossChainAddress>
    remoteChainSelector: uint64
    receiver: c.Address
    sourceDenominatedAmount: uint256
    localToken: c.Address
    sourcePoolAddress: CellRef<CrossChainAddress>
    sourcePoolData: c.Cell | null
    offchainTokenData: c.Cell | null
}

export const TokenPool_ReleaseOrMintInV1 = {
    create(args: {
        originalSender: CellRef<CrossChainAddress>
        remoteChainSelector: uint64
        receiver: c.Address
        sourceDenominatedAmount: uint256
        localToken: c.Address
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
            originalSender: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            remoteChainSelector: s.loadUintBig(64),
            receiver: s.loadAddress(),
            sourceDenominatedAmount: s.loadUintBig(256),
            localToken: s.loadAddress(),
            sourcePoolAddress: loadCellRef<CrossChainAddress>(s, CrossChainAddress.fromSlice),
            sourcePoolData: s.loadBoolean() ? s.loadRef() : null,
            offchainTokenData: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: TokenPool_ReleaseOrMintInV1, b: c.Builder): void {
        storeCellRef<CrossChainAddress>(self.originalSender, b, CrossChainAddress.store);
        b.storeUint(self.remoteChainSelector, 64);
        b.storeAddress(self.receiver);
        b.storeUint(self.sourceDenominatedAmount, 256);
        b.storeAddress(self.localToken);
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
 > struct (0x19e65bea) TokenPool_LockOrBurnResponse {
 >     queryId: uint64
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: uint256
 > }
 */
export interface TokenPool_LockOrBurnResponse {
    readonly $: 'TokenPool_LockOrBurnResponse'
    queryId: uint64
    out: CellRef<TokenPool_LockOrBurnOutV1>
    destTokenAmount: uint256
}

export const TokenPool_LockOrBurnResponse = {
    PREFIX: 0x19e65bea,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_LockOrBurnOutV1>
        destTokenAmount: uint256
    }): TokenPool_LockOrBurnResponse {
        return {
            $: 'TokenPool_LockOrBurnResponse',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_LockOrBurnResponse {
        loadAndCheckPrefix32(s, 0x19e65bea, 'TokenPool_LockOrBurnResponse');
        return {
            $: 'TokenPool_LockOrBurnResponse',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadUintBig(256),
        }
    },
    store(self: TokenPool_LockOrBurnResponse, b: c.Builder): void {
        b.storeUint(0x19e65bea, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeUint(self.destTokenAmount, 256);
    },
    toCell(self: TokenPool_LockOrBurnResponse): c.Cell {
        return makeCellFrom<TokenPool_LockOrBurnResponse>(self, TokenPool_LockOrBurnResponse.store);
    }
}

/**
 > struct (0x7ec43aee) TokenPool_ReleaseOrMintResponse {
 >     queryId: uint64
 >     out: Cell<TokenPool_ReleaseOrMintOutV1>
 > }
 */
export interface TokenPool_ReleaseOrMintResponse {
    readonly $: 'TokenPool_ReleaseOrMintResponse'
    queryId: uint64
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
}

export const TokenPool_ReleaseOrMintResponse = {
    PREFIX: 0x7ec43aee,

    create(args: {
        queryId: uint64
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
    }): TokenPool_ReleaseOrMintResponse {
        return {
            $: 'TokenPool_ReleaseOrMintResponse',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleaseOrMintResponse {
        loadAndCheckPrefix32(s, 0x7ec43aee, 'TokenPool_ReleaseOrMintResponse');
        return {
            $: 'TokenPool_ReleaseOrMintResponse',
            queryId: s.loadUintBig(64),
            out: loadCellRef<TokenPool_ReleaseOrMintOutV1>(s, TokenPool_ReleaseOrMintOutV1.fromSlice),
        }
    },
    store(self: TokenPool_ReleaseOrMintResponse, b: c.Builder): void {
        b.storeUint(0x7ec43aee, 32);
        b.storeUint(self.queryId, 64);
        storeCellRef<TokenPool_ReleaseOrMintOutV1>(self.out, b, TokenPool_ReleaseOrMintOutV1.store);
    },
    toCell(self: TokenPool_ReleaseOrMintResponse): c.Cell {
        return makeCellFrom<TokenPool_ReleaseOrMintResponse>(self, TokenPool_ReleaseOrMintResponse.store);
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
 > struct TokenPool_ReleasedOrMintedParticipants {
 >     sender: address
 >     recipient: address
 > }
 */
export interface TokenPool_ReleasedOrMintedParticipants {
    readonly $: 'TokenPool_ReleasedOrMintedParticipants'
    sender: c.Address
    recipient: c.Address
}

export const TokenPool_ReleasedOrMintedParticipants = {
    create(args: {
        sender: c.Address
        recipient: c.Address
    }): TokenPool_ReleasedOrMintedParticipants {
        return {
            $: 'TokenPool_ReleasedOrMintedParticipants',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_ReleasedOrMintedParticipants {
        return {
            $: 'TokenPool_ReleasedOrMintedParticipants',
            sender: s.loadAddress(),
            recipient: s.loadAddress(),
        }
    },
    store(self: TokenPool_ReleasedOrMintedParticipants, b: c.Builder): void {
        b.storeAddress(self.sender);
        b.storeAddress(self.recipient);
    },
    toCell(self: TokenPool_ReleasedOrMintedParticipants): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMintedParticipants>(self, TokenPool_ReleasedOrMintedParticipants.store);
    }
}

/**
 > struct TokenPool_ReleasedOrMintedDetails {
 >     token: address
 >     amount: uint256
 >     participants: Cell<TokenPool_ReleasedOrMintedParticipants>
 > }
 */
export interface TokenPool_ReleasedOrMintedDetails {
    readonly $: 'TokenPool_ReleasedOrMintedDetails'
    token: c.Address
    amount: uint256
    participants: CellRef<TokenPool_ReleasedOrMintedParticipants>
}

export const TokenPool_ReleasedOrMintedDetails = {
    create(args: {
        token: c.Address
        amount: uint256
        participants: CellRef<TokenPool_ReleasedOrMintedParticipants>
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
            amount: s.loadUintBig(256),
            participants: loadCellRef<TokenPool_ReleasedOrMintedParticipants>(s, TokenPool_ReleasedOrMintedParticipants.fromSlice),
        }
    },
    store(self: TokenPool_ReleasedOrMintedDetails, b: c.Builder): void {
        b.storeAddress(self.token);
        b.storeUint(self.amount, 256);
        storeCellRef<TokenPool_ReleasedOrMintedParticipants>(self.participants, b, TokenPool_ReleasedOrMintedParticipants.store);
    },
    toCell(self: TokenPool_ReleasedOrMintedDetails): c.Cell {
        return makeCellFrom<TokenPool_ReleasedOrMintedDetails>(self, TokenPool_ReleasedOrMintedDetails.store);
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
 > struct TokenPool_DynamicConfigSet {
 >     router: address
 >     rateLimitAdmin: address?
 >     feeAdmin: address?
 > }
 */
export interface TokenPool_DynamicConfigSet {
    readonly $: 'TokenPool_DynamicConfigSet'
    router: c.Address
    rateLimitAdmin: c.Address | null
    feeAdmin: c.Address | null
}

export const TokenPool_DynamicConfigSet = {
    create(args: {
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
        return {
            $: 'TokenPool_DynamicConfigSet',
            router: s.loadAddress(),
            rateLimitAdmin: s.loadMaybeAddress(),
            feeAdmin: s.loadMaybeAddress(),
        }
    },
    store(self: TokenPool_DynamicConfigSet, b: c.Builder): void {
        b.storeAddress(self.router);
        b.storeAddress(self.rateLimitAdmin);
        b.storeAddress(self.feeAdmin);
    },
    toCell(self: TokenPool_DynamicConfigSet): c.Cell {
        return makeCellFrom<TokenPool_DynamicConfigSet>(self, TokenPool_DynamicConfigSet.store);
    }
}

/**
 > struct TokenPool_FinalityConfigSet {
 >     allowedFinalityConfig: uint32
 > }
 */
export interface TokenPool_FinalityConfigSet {
    readonly $: 'TokenPool_FinalityConfigSet'
    allowedFinalityConfig: uint32
}

export const TokenPool_FinalityConfigSet = {
    create(args: {
        allowedFinalityConfig: uint32
    }): TokenPool_FinalityConfigSet {
        return {
            $: 'TokenPool_FinalityConfigSet',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenPool_FinalityConfigSet {
        return {
            $: 'TokenPool_FinalityConfigSet',
            allowedFinalityConfig: s.loadUintBig(32),
        }
    },
    store(self: TokenPool_FinalityConfigSet, b: c.Builder): void {
        b.storeUint(self.allowedFinalityConfig, 32);
    },
    toCell(self: TokenPool_FinalityConfigSet): c.Cell {
        return makeCellFrom<TokenPool_FinalityConfigSet>(self, TokenPool_FinalityConfigSet.store);
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
 > struct TokenPool_CursedSubjectsUpdated {
 > }
 */
export interface TokenPool_CursedSubjectsUpdated {
    readonly $: 'TokenPool_CursedSubjectsUpdated'
}

export const TokenPool_CursedSubjectsUpdated = {
    create(): TokenPool_CursedSubjectsUpdated {
        return {
            $: 'TokenPool_CursedSubjectsUpdated',
        }
    },
    fromSlice(s: c.Slice): TokenPool_CursedSubjectsUpdated {
        return {
            $: 'TokenPool_CursedSubjectsUpdated',
        }
    },
    store(self: TokenPool_CursedSubjectsUpdated, b: c.Builder): void {
    },
    toCell(self: TokenPool_CursedSubjectsUpdated): c.Cell {
        return makeCellFrom<TokenPool_CursedSubjectsUpdated>(self, TokenPool_CursedSubjectsUpdated.store);
    }
}

/**
 > struct (0x93c174a1) BurnMintTokenPool_ClaimMinterAdmin {
 >     queryId: uint64
 > }
 */
export interface BurnMintTokenPool_ClaimMinterAdmin {
    readonly $: 'BurnMintTokenPool_ClaimMinterAdmin'
    queryId: uint64
}

export const BurnMintTokenPool_ClaimMinterAdmin = {
    PREFIX: 0x93c174a1,

    create(args: {
        queryId: uint64
    }): BurnMintTokenPool_ClaimMinterAdmin {
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_ClaimMinterAdmin {
        loadAndCheckPrefix32(s, 0x93c174a1, 'BurnMintTokenPool_ClaimMinterAdmin');
        return {
            $: 'BurnMintTokenPool_ClaimMinterAdmin',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: BurnMintTokenPool_ClaimMinterAdmin, b: c.Builder): void {
        b.storeUint(0x93c174a1, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: BurnMintTokenPool_ClaimMinterAdmin): c.Cell {
        return makeCellFrom<BurnMintTokenPool_ClaimMinterAdmin>(self, BurnMintTokenPool_ClaimMinterAdmin.store);
    }
}

/**
 > struct BurnMintTokenPool_PendingBurn {
 >     replyTo: address?
 >     request: Cell<TokenPool_LockOrBurnInV1>
 >     out: Cell<TokenPool_LockOrBurnOutV1>
 >     destTokenAmount: uint256
 >     expectedSender: address
 > }
 */
export interface BurnMintTokenPool_PendingBurn {
    readonly $: 'BurnMintTokenPool_PendingBurn'
    replyTo: c.Address | null /* = null */
    request: CellRef<TokenPool_LockOrBurnInV1>
    out: CellRef<TokenPool_LockOrBurnOutV1>
    destTokenAmount: uint256
    expectedSender: c.Address
}

export const BurnMintTokenPool_PendingBurn = {
    create(args: {
        replyTo?: c.Address | null /* = null */
        request: CellRef<TokenPool_LockOrBurnInV1>
        out: CellRef<TokenPool_LockOrBurnOutV1>
        destTokenAmount: uint256
        expectedSender: c.Address
    }): BurnMintTokenPool_PendingBurn {
        return {
            $: 'BurnMintTokenPool_PendingBurn',
            replyTo: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): BurnMintTokenPool_PendingBurn {
        return {
            $: 'BurnMintTokenPool_PendingBurn',
            replyTo: s.loadMaybeAddress(),
            request: loadCellRef<TokenPool_LockOrBurnInV1>(s, TokenPool_LockOrBurnInV1.fromSlice),
            out: loadCellRef<TokenPool_LockOrBurnOutV1>(s, TokenPool_LockOrBurnOutV1.fromSlice),
            destTokenAmount: s.loadUintBig(256),
            expectedSender: s.loadAddress(),
        }
    },
    store(self: BurnMintTokenPool_PendingBurn, b: c.Builder): void {
        b.storeAddress(self.replyTo);
        storeCellRef<TokenPool_LockOrBurnInV1>(self.request, b, TokenPool_LockOrBurnInV1.store);
        storeCellRef<TokenPool_LockOrBurnOutV1>(self.out, b, TokenPool_LockOrBurnOutV1.store);
        b.storeUint(self.destTokenAmount, 256);
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
    replyTo: c.Address | null /* = null */
    request: CellRef<TokenPool_ReleaseOrMintInV1>
    out: CellRef<TokenPool_ReleaseOrMintOutV1>
    expectedSender: c.Address
}

export const BurnMintTokenPool_PendingMint = {
    create(args: {
        replyTo?: c.Address | null /* = null */
        request: CellRef<TokenPool_ReleaseOrMintInV1>
        out: CellRef<TokenPool_ReleaseOrMintOutV1>
        expectedSender: c.Address
    }): BurnMintTokenPool_PendingMint {
        return {
            $: 'BurnMintTokenPool_PendingMint',
            replyTo: null,
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
 >     jettonClient: Cell<JettonClient>
 >     pendingBurns: map<uint64, Cell<BurnMintTokenPool_PendingBurn>>
 >     pendingMints: map<uint64, Cell<BurnMintTokenPool_PendingMint>>
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    poolData: CellRef<TokenPool_Data>
    jettonClient: CellRef<JettonClient>
    pendingBurns: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingBurn>>
    pendingMints: c.Dictionary<uint64, CellRef<BurnMintTokenPool_PendingMint>>
}

export const Storage = {
    create(args: {
        poolData: CellRef<TokenPool_Data>
        jettonClient: CellRef<JettonClient>
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
            jettonClient: loadCellRef<JettonClient>(s, JettonClient.fromSlice),
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
        storeCellRef<JettonClient>(self.jettonClient, b, JettonClient.store);
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
 > struct RateLimiter_TokenBucket {
 >     tokens: uint256
 >     lastUpdated: uint64
 >     isEnabled: bool
 >     capacity: uint256
 >     rate: uint256
 > }
 */
export interface RateLimiter_TokenBucket {
    readonly $: 'RateLimiter_TokenBucket'
    tokens: uint256
    lastUpdated: uint64
    isEnabled: boolean
    capacity: uint256
    rate: uint256
}

export const RateLimiter_TokenBucket = {
    create(args: {
        tokens: uint256
        lastUpdated: uint64
        isEnabled: boolean
        capacity: uint256
        rate: uint256
    }): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            ...args
        }
    },
    fromSlice(s: c.Slice): RateLimiter_TokenBucket {
        return {
            $: 'RateLimiter_TokenBucket',
            tokens: s.loadUintBig(256),
            lastUpdated: s.loadUintBig(64),
            isEnabled: s.loadBoolean(),
            capacity: s.loadUintBig(256),
            rate: s.loadUintBig(256),
        }
    },
    store(self: RateLimiter_TokenBucket, b: c.Builder): void {
        b.storeUint(self.tokens, 256);
        b.storeUint(self.lastUpdated, 64);
        b.storeBit(self.isEnabled);
        b.storeUint(self.capacity, 256);
        b.storeUint(self.rate, 256);
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
    static CodeCell = c.Cell.fromBase64('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');

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
        'TokenPool_Error.InvalidRequestedFinality': 14918,
        'Error.IncorrectJettonSender': 41200,
        'Error.MissingTransferInitiator': 41201,
        'Error.MissingForwardPayload': 41202,
        'Error.AmountMismatch': 41203,
        'Error.PendingBurnAlreadyExists': 41204,
        'Error.PendingMintAlreadyExists': 41206,
        'Error.PendingMintNotFound': 41207,
        'Error.UnexpectedBurnConfirmationSender': 41208,
        'Error.UnexpectedMintConfirmationSender': 41209,
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
        jettonClient: CellRef<JettonClient>
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

    static createCellOfBurnMintTokenPoolClaimMinterAdmin(body: {
        queryId: uint64
    }) {
        return BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
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

    async sendBurnMintTokenPoolClaimMinterAdmin(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: BurnMintTokenPool_ClaimMinterAdmin.toCell(BurnMintTokenPool_ClaimMinterAdmin.create(body)),
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
}
