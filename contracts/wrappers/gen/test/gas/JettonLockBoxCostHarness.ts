// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a JettonLockBoxCostHarness contract in Tolk.
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
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint64 = bigint

/**
 > struct (0x6d077f2e) JettonLockBox_Deposited {
 >     queryId: uint64
 >     token: address
 >     depositor: address
 >     amount: coins
 >     context: cell?
 > }
 */
export interface JettonLockBox_Deposited {
    readonly $: 'JettonLockBox_Deposited'
    queryId: uint64
    token: c.Address
    depositor: c.Address
    amount: coins
    context: c.Cell | null
}

export const JettonLockBox_Deposited = {
    PREFIX: 0x6d077f2e,

    create(args: {
        queryId?: uint64
        token: c.Address
        depositor: c.Address
        amount: coins
        context: c.Cell | null
    }): JettonLockBox_Deposited {
        return {
            $: 'JettonLockBox_Deposited',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): JettonLockBox_Deposited {
        loadAndCheckPrefix32(s, 0x6d077f2e, 'JettonLockBox_Deposited');
        return {
            $: 'JettonLockBox_Deposited',
            queryId: s.loadUintBig(64),
            token: s.loadAddress(),
            depositor: s.loadAddress(),
            amount: s.loadCoins(),
            context: s.loadBoolean() ? s.loadRef() : null,
        }
    },
    store(self: JettonLockBox_Deposited, b: c.Builder): void {
        b.storeUint(0x6d077f2e, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.token);
        b.storeAddress(self.depositor);
        b.storeCoins(self.amount);
        storeTolkNullable<c.Cell>(self.context, b,
            (v,b) => b.storeRef(v)
        );
    },
    toCell(self: JettonLockBox_Deposited): c.Cell {
        return makeCellFrom<JettonLockBox_Deposited>(self, JettonLockBox_Deposited.store);
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

// ————————————————————————————————————————————
//    class JettonLockBoxCostHarness
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

export class JettonLockBoxCostHarness implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECEgEAAdwAART/APSkE/S88sgLAQIBYgIDABjQ+JHyQIQPAccA8vQCASAEBQIBIAYHAgEgCgsAJbqEz4KPpEMIIA6mAB+DYBqgCggCASAICQATt2RfBR9Ihh8G0AALtb6QLqYQAgEgDA0CAVgODwBjtkTfBR8FHwUZGfI2g7+XQtln/0pCn0pLH0BegBk5GfChAl9KTjnhbdmZMGDQYTY/YRAArbV9HwUfSIYORG4uHGCELjxgjaQN0CMExFxghC3QI6crAHxgigS1DnAgdG4fB5QALh8G1ABuHwbCdA5wIIEwQgEswDAOHwb0CxUQIH0UAlQQLqYLHwbUEAANs5QggDqYIAGjsKII9DXLCaDLhg08r/TP/pIMdM/MfoA+kj0BNEgbrOb0PpQ+gD0BNGBAIiVMG1tbXDiIMMAlSNus8MAkXDiQEjjBCLDAJJwMt8CwwBQBm3jBIBAB/iBukjBtji0g0IIQLWFgDCHXScEgklt/lwHXCx+9wwDi3NDXLCFrCwBk8r/6SDH0BDH0BNHibcjPkLWFgDIZ+lIZ9AAY9ADJyPQAz1CBAJDIz5A+KfqWFcs/UAP6AvpSFvpUFPQAAfoCE87JyM+FiBP6Us+EEHP6AnHPC2USzMkRAAwBgwmx+wg=');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new JettonLockBoxCostHarness(address);
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

    async getDepositGasUnits(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_depositGasUnits', []));
        return r.readBigInt();
    }

    async getWithdrawGasUnits(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_withdrawGasUnits', []));
        return r.readBigInt();
    }

    async getDepositMinValue(provider: ContractProvider, fwdFee: coins): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_depositMinValue', [
            { type: 'int', value: fwdFee },
        ]));
        return r.readBigInt();
    }

    async getDepositReplyFee(provider: ContractProvider, queryId: uint64, amount: coins, depositContext: c.Cell | null): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_depositReplyFee', [
            { type: 'int', value: queryId },
            { type: 'int', value: amount },
            depositContext === null ? { type: 'null' } : { type: 'cell', cell: depositContext },
        ]));
        return r.readBigInt();
    }

    async getWithdrawMinValue(provider: ContractProvider, forwardTonAmount: coins, fwdFee: coins): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_withdrawMinValue', [
            { type: 'int', value: forwardTonAmount },
            { type: 'int', value: fwdFee },
        ]));
        return r.readBigInt();
    }

    async getWithdrawFwdFee(provider: ContractProvider, withdraw: c.Cell, sender: c.Address, walletAddress: c.Address, lockboxAddress: c.Address): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_withdrawFwdFee', [
            { type: 'cell', cell: withdraw },
            { type: 'slice', cell: makeCellFrom<c.Address>(sender,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'slice', cell: makeCellFrom<c.Address>(walletAddress,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'slice', cell: makeCellFrom<c.Address>(lockboxAddress,
                (v,b) => b.storeAddress(v)
            ) },
        ]));
        return r.readBigInt();
    }

    async getCalculateGasFee(provider: ContractProvider, gasUsed: bigint): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_calculateGasFee', [
            { type: 'int', value: gasUsed },
        ]));
        return r.readBigInt();
    }
}
