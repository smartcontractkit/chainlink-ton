// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a CctCostHarness contract in Tolk.
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
//   auto-generated serializers to/from cells
//

type coins = bigint

// ————————————————————————————————————————————
//    class CctCostHarness
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

export class CctCostHarness implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECHgEAARMAART/APSkE/S88sgLAQIBYgIDABjQ+JHyQIQPAccA8vQCASAEBQIBWAYHAgEgEBECASAICQATt31QIwlOHwbUEAIBIAoLAAuyyJw+DaACASAMDQIBWA4PAAqrkIEdOQAeqmFzgQQJghAJZgGAcPg3ABGmducCB0bh8HkACaatAjCVAgEgEhMCASAWFwIBIBQVAAe2tG4wAHWwXqRcZFw4gFyceMEWKhzgQOjcPg8oIEYSnD4NqCBHTlw+Dagc4EECYIQCWYBgHD4N6ABcXIB4wSopIAALsW3gRMSgAgEgGBkAD7c78EEBMS0QAgEgGhsCAWYcHQANralBAehIQAALr/1AjCVAAAmlSQIelwAJpJkCBeU=');

    static Errors = {
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new CctCostHarness(address);
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

    async getGasConsumptionJettonTransfer(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_gasConsumptionJettonTransfer', []));
        return r.readBigInt();
    }

    async getGasConsumptionJettonReceive(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_gasConsumptionJettonReceive', []));
        return r.readBigInt();
    }

    async getGasConsumptionBurnRequest(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_gasConsumptionBurnRequest', []));
        return r.readBigInt();
    }

    async getGasConsumptionBurnNotification(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_gasConsumptionBurnNotification', []));
        return r.readBigInt();
    }

    async getGasConsumptionMint(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_gasConsumptionMint', []));
        return r.readBigInt();
    }

    async getMessageSizeBurnNotificationBits(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_messageSizeBurnNotificationBits', []));
        return r.readBigInt();
    }

    async getMessageSizeBurnNotificationCells(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_messageSizeBurnNotificationCells', []));
        return r.readBigInt();
    }

    async getForwardInitStateOverhead(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_forwardInitStateOverhead', []));
        return r.readBigInt();
    }

    async getJettonWalletMinStorageFee(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_jettonWalletMinStorageFee', []));
        return r.readBigInt();
    }

    async getCalculateGasFee(provider: ContractProvider, gasUsed: bigint): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_calculateGasFee', [
            { type: 'int', value: gasUsed },
        ]));
        return r.readBigInt();
    }

    async getJettonTransferFee(provider: ContractProvider, fwdFee: coins, hasForward: boolean, generic: boolean): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_jettonTransferFee', [
            { type: 'int', value: fwdFee },
            { type: 'int', value: (hasForward ? -1n : 0n) },
            { type: 'int', value: (generic ? -1n : 0n) },
        ]));
        return r.readBigInt();
    }

    async getCctMintOpBudget(provider: ContractProvider, walletDeployFee: coins): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_cctMintOpBudget', [
            { type: 'int', value: walletDeployFee },
        ]));
        return r.readBigInt();
    }

    async getCcipMinValueGasUnits(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_ccipMinValueGasUnits', []));
        return r.readBigInt();
    }

    async getCcipAdmissionGasUnits(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_ccipAdmissionGasUnits', []));
        return r.readBigInt();
    }
}
