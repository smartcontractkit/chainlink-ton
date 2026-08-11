// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a OnRampAccount contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type RemainingBitsAndRefs = c.Slice

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

    readNullable<T>(readFn_T: (r: StackReader) => T): T | null {
        if (this.tuple[0].type === 'null') {
            this.tuple.shift();
            return null;
        }
        return readFn_T(this);
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint64 = bigint

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
        queryId?: uint64
        jettonAmount: coins
        transferRecipient: c.Address
        sendExcessesTo: c.Address | null
        customPayload: c.Cell | null
        forwardTonAmount: coins
        forwardPayload: ForwardPayloadRemainder
    }): AskToTransfer {
        return {
            $: 'AskToTransfer',
            ...args,
            queryId: args.queryId ?? 0n
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
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }): TransferNotificationForRecipient {
        return {
            $: 'TransferNotificationForRecipient',
            ...args,
            queryId: args.queryId ?? 0n
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
 > struct OnRampAccount_Data {
 >     owner: address
 >     beneficiary: address
 >     jettonClient: Cell<JettonClient>?
 > }
 */
export interface OnRampAccount_Data {
    readonly $: 'OnRampAccount_Data'
    owner: c.Address
    beneficiary: c.Address
    jettonClient: JettonClient | null /* = null */
}

export const OnRampAccount_Data = {
    create(args: {
        owner: c.Address
        beneficiary: c.Address
        jettonClient?: JettonClient | null /* = null */
    }): OnRampAccount_Data {
        return {
            $: 'OnRampAccount_Data',
            jettonClient: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): OnRampAccount_Data {
        return {
            $: 'OnRampAccount_Data',
            owner: s.loadAddress(),
            beneficiary: s.loadAddress(),
            jettonClient: s.loadBoolean() ? loadCellRef<JettonClient>(s, JettonClient.fromSlice) : null,
        }
    },
    store(self: OnRampAccount_Data, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.beneficiary);
        storeTolkNullable<JettonClient>(self.jettonClient, b,
            (v,b) => storeCellRef<JettonClient>(v, b, JettonClient.store)
        );
    },
    toCell(self: OnRampAccount_Data): c.Cell {
        return makeCellFrom<OnRampAccount_Data>(self, OnRampAccount_Data.store);
    }
}

/**
 > struct (0x2c1f6a90) OnRampAccount_Init {
 >     queryId: uint64
 >     jettonClient: JettonClient
 > }
 */
export interface OnRampAccount_Init {
    readonly $: 'OnRampAccount_Init'
    queryId: uint64
    jettonClient: JettonClient
}

export const OnRampAccount_Init = {
    PREFIX: 0x2c1f6a90,

    create(args: {
        queryId?: uint64
        jettonClient: JettonClient
    }): OnRampAccount_Init {
        return {
            $: 'OnRampAccount_Init',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRampAccount_Init {
        loadAndCheckPrefix32(s, 0x2c1f6a90, 'OnRampAccount_Init');
        return {
            $: 'OnRampAccount_Init',
            queryId: s.loadUintBig(64),
            jettonClient: JettonClient.fromSlice(s),
        }
    },
    store(self: OnRampAccount_Init, b: c.Builder): void {
        b.storeUint(0x2c1f6a90, 32);
        b.storeUint(self.queryId, 64);
        JettonClient.store(self.jettonClient, b);
    },
    toCell(self: OnRampAccount_Init): c.Cell {
        return makeCellFrom<OnRampAccount_Init>(self, OnRampAccount_Init.store);
    }
}

/**
 > struct (0x0a53d7e1) OnRampAccount_InitAck {
 >     queryId: uint64
 >     jettonWallet: address
 > }
 */
export interface OnRampAccount_InitAck {
    readonly $: 'OnRampAccount_InitAck'
    queryId: uint64
    jettonWallet: c.Address
}

export const OnRampAccount_InitAck = {
    PREFIX: 0x0a53d7e1,

    create(args: {
        queryId?: uint64
        jettonWallet: c.Address
    }): OnRampAccount_InitAck {
        return {
            $: 'OnRampAccount_InitAck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRampAccount_InitAck {
        loadAndCheckPrefix32(s, 0x0a53d7e1, 'OnRampAccount_InitAck');
        return {
            $: 'OnRampAccount_InitAck',
            queryId: s.loadUintBig(64),
            jettonWallet: s.loadAddress(),
        }
    },
    store(self: OnRampAccount_InitAck, b: c.Builder): void {
        b.storeUint(0x0a53d7e1, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.jettonWallet);
    },
    toCell(self: OnRampAccount_InitAck): c.Cell {
        return makeCellFrom<OnRampAccount_InitAck>(self, OnRampAccount_InitAck.store);
    }
}

/**
 > struct (0x8f6c1a21) OnRampAccount_Withdraw {
 >     queryId: uint64
 >     walletAddress: address
 >     ask: AskToTransfer
 > }
 */
export interface OnRampAccount_Withdraw {
    readonly $: 'OnRampAccount_Withdraw'
    queryId: uint64
    walletAddress: c.Address
    ask: AskToTransfer
}

export const OnRampAccount_Withdraw = {
    PREFIX: 0x8f6c1a21,

    create(args: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }): OnRampAccount_Withdraw {
        return {
            $: 'OnRampAccount_Withdraw',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRampAccount_Withdraw {
        loadAndCheckPrefix32(s, 0x8f6c1a21, 'OnRampAccount_Withdraw');
        return {
            $: 'OnRampAccount_Withdraw',
            queryId: s.loadUintBig(64),
            walletAddress: s.loadAddress(),
            ask: AskToTransfer.fromSlice(s),
        }
    },
    store(self: OnRampAccount_Withdraw, b: c.Builder): void {
        b.storeUint(0x8f6c1a21, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.walletAddress);
        AskToTransfer.store(self.ask, b);
    },
    toCell(self: OnRampAccount_Withdraw): c.Cell {
        return makeCellFrom<OnRampAccount_Withdraw>(self, OnRampAccount_Withdraw.store);
    }
}

/**
 > struct (0x5d0fb6c4) OnRampAccount_WithdrawAck {
 >     queryId: uint64
 > }
 */
export interface OnRampAccount_WithdrawAck {
    readonly $: 'OnRampAccount_WithdrawAck'
    queryId: uint64
}

export const OnRampAccount_WithdrawAck = {
    PREFIX: 0x5d0fb6c4,

    create(args: {
        queryId?: uint64
    }): OnRampAccount_WithdrawAck {
        return {
            $: 'OnRampAccount_WithdrawAck',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): OnRampAccount_WithdrawAck {
        loadAndCheckPrefix32(s, 0x5d0fb6c4, 'OnRampAccount_WithdrawAck');
        return {
            $: 'OnRampAccount_WithdrawAck',
            queryId: s.loadUintBig(64),
        }
    },
    store(self: OnRampAccount_WithdrawAck, b: c.Builder): void {
        b.storeUint(0x5d0fb6c4, 32);
        b.storeUint(self.queryId, 64);
    },
    toCell(self: OnRampAccount_WithdrawAck): c.Cell {
        return makeCellFrom<OnRampAccount_WithdrawAck>(self, OnRampAccount_WithdrawAck.store);
    }
}

// ————————————————————————————————————————————
//    class OnRampAccount
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

export class OnRampAccount implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECDwEAArMAART/APSkE/S88sgLAQIBYgIDAgLOBAUCASAJCgKjT4kfJA7UTQ+kj6SPQE0SPXLCFg+1SE4wLXLCR7YNEM4wLXLCObFoTkjh00A9M/+gD6UPiSEGcQVlUw8AICyPpS+lL0AMntVOBfBIQPAccA8vSAYHAfdDGBEASBEAUmbrPy9CXQ+kjU0fgoyM+EAvpSEvpSyQHIz4TQzMz5FsjPigBAy//PUFAFxwUU8vQC9AQhbpsxIMcAkjBt4MjOyZHR4iBukl8D4IEQBSRus/L0I9D6SNTR+CjIz4QC+lIS+lLJAcjPhNDMzPkWyM+KAEDL/4CAD6NAPTP/pI10z4koEQAlMWxwWRf5ZTFccFwwDi8vSBEAYHbhfy9AHI+lLMyYEQBSFus/L0IND6SNTR+CjIz4QC+lIS+lLJAcjPhNDMzPkWyM+KAEDL/89QyM+FCBb6UoIQClPX4c8LjhLLPxT6UsmAQPsAAcj6UvpS9ADJ7VQAzDEzAtM/MfpI1ywgfFP1LPK/0z/6APpI+lD0BPoA+JIggRACC8cFkzA5f5ZQCscFwwDiGPL0yM+QPin6lhXLP1AD+gL6UvpU9ABY+gISzsnIz4WIEvpSz4QQc/oCcc8LZczJgFD7AACGz1D4KG2CCJiWgATI9ADPUMjPkD4p+pYWyz9QBvoCUnD6UvpUFPQAAfoCzsnIz4WIEvpSz4QQc/oCcc8LZczJgFD7AAIBSAsMAgFiDQ4AW7Yr8aELY0tzWXMbQwtLcXOje3FzGxtLgXJ7cpMLa4ILGxt7q3OkEWpgXGJcYRAAF7XQPaiaH0kGP0kGEAARs6J7UTQ+kgwgAIGxSrtRND6SDH6SDH0BSBukjBtjiuBEAUhbrPy9ND6SNTR+CjIz4QC+lIS+lLJAcjPhNDMzPkWyM+KAEDL/89Q4oA==');

    static Errors = {
        'OnRampAccount_Error.OnlyOwnerOrBeneficiary': 4098,
        'OnRampAccount_Error.OnlyOwnWallet': 4100,
        'OnRampAccount_Error.NotInitialized': 4101,
        'OnRampAccount_Error.AlreadyInit': 4102,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new OnRampAccount(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        beneficiary: c.Address
        jettonClient?: JettonClient | null /* = null */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? OnRampAccount.CodeCell,
            data: OnRampAccount_Data.toCell(OnRampAccount_Data.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new OnRampAccount(address, initialState);
    }

    static createCellOfOnRampAccountInit(body: {
        queryId?: uint64
        jettonClient: JettonClient
    }) {
        return OnRampAccount_Init.toCell(OnRampAccount_Init.create(body));
    }

    static createCellOfOnRampAccountWithdraw(body: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }) {
        return OnRampAccount_Withdraw.toCell(OnRampAccount_Withdraw.create(body));
    }

    static createCellOfTransferNotificationForRecipient(body: {
        queryId?: uint64
        jettonAmount: coins
        transferInitiator: c.Address | null
        forwardPayload: ForwardPayloadRemainder
    }) {
        return TransferNotificationForRecipient.toCell(TransferNotificationForRecipient.create(body));
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

    async sendOnRampAccountInit(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        jettonClient: JettonClient
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRampAccount_Init.toCell(OnRampAccount_Init.create(body)),
            ...extraOptions
        });
    }

    async sendOnRampAccountWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
        walletAddress: c.Address
        ask: AskToTransfer
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: OnRampAccount_Withdraw.toCell(OnRampAccount_Withdraw.create(body)),
            ...extraOptions
        });
    }

    async sendTransferNotificationForRecipient(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId?: uint64
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

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getOwner', []));
        return r.readSlice().loadAddress();
    }

    async getBeneficiary(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('getBeneficiary', []));
        return r.readSlice().loadAddress();
    }

    async getJettonWallet(provider: ContractProvider): Promise<c.Address | null> {
        const r = StackReader.fromGetMethod(1, await provider.get('getJettonWallet', []));
        return r.readNullable<c.Address>(
            (r) => r.readSlice().loadAddress()
        );
    }
}
