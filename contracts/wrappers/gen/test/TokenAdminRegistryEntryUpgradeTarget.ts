// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a TokenAdminRegistryEntryUpgradeTarget contract in Tolk.
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
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

/**
 > struct UpgradeTarget_Storage {
 >     previousStorage: cell
 >     resumed: Cell<TokenAdminRegistryEntry_Pending>?
 > }
 */
export interface UpgradeTarget_Storage {
    readonly $: 'UpgradeTarget_Storage'
    previousStorage: c.Cell
    resumed: TokenAdminRegistryEntry_Pending | null
}

export const UpgradeTarget_Storage = {
    create(args: {
        previousStorage: c.Cell
        resumed: TokenAdminRegistryEntry_Pending | null
    }): UpgradeTarget_Storage {
        return {
            $: 'UpgradeTarget_Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpgradeTarget_Storage {
        return {
            $: 'UpgradeTarget_Storage',
            previousStorage: s.loadRef(),
            resumed: s.loadBoolean() ? loadCellRef<TokenAdminRegistryEntry_Pending>(s, TokenAdminRegistryEntry_Pending.fromSlice) : null,
        }
    },
    store(self: UpgradeTarget_Storage, b: c.Builder): void {
        b.storeRef(self.previousStorage);
        storeTolkNullable<TokenAdminRegistryEntry_Pending>(self.resumed, b,
            (v,b) => storeCellRef<TokenAdminRegistryEntry_Pending>(v, b, TokenAdminRegistryEntry_Pending.store)
        );
    },
    toCell(self: UpgradeTarget_Storage): c.Cell {
        return makeCellFrom<UpgradeTarget_Storage>(self, UpgradeTarget_Storage.store);
    }
}

/**
 > struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
 >     pending: Cell<TokenAdminRegistryEntry_Pending>
 > }
 */
export interface TokenAdminRegistryEntry_Resume {
    readonly $: 'TokenAdminRegistryEntry_Resume'
    pending: TokenAdminRegistryEntry_Pending
}

export const TokenAdminRegistryEntry_Resume = {
    PREFIX: 0x47d63a64,

    create(args: {
        pending: TokenAdminRegistryEntry_Pending
    }): TokenAdminRegistryEntry_Resume {
        return {
            $: 'TokenAdminRegistryEntry_Resume',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_Resume {
        loadAndCheckPrefix32(s, 0x47d63a64, 'TokenAdminRegistryEntry_Resume');
        return {
            $: 'TokenAdminRegistryEntry_Resume',
            pending: loadCellRef<TokenAdminRegistryEntry_Pending>(s, TokenAdminRegistryEntry_Pending.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_Resume, b: c.Builder): void {
        b.storeUint(0x47d63a64, 32);
        storeCellRef<TokenAdminRegistryEntry_Pending>(self.pending, b, TokenAdminRegistryEntry_Pending.store);
    },
    toCell(self: TokenAdminRegistryEntry_Resume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Resume>(self, TokenAdminRegistryEntry_Resume.store);
    }
}

/**
 > struct TokenAdminRegistryEntry_Pending {
 >     sender: address
 >     body: cell
 > }
 */
export interface TokenAdminRegistryEntry_Pending {
    readonly $: 'TokenAdminRegistryEntry_Pending'
    sender: c.Address
    body: c.Cell
}

export const TokenAdminRegistryEntry_Pending = {
    create(args: {
        sender: c.Address
        body: c.Cell
    }): TokenAdminRegistryEntry_Pending {
        return {
            $: 'TokenAdminRegistryEntry_Pending',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_Pending {
        return {
            $: 'TokenAdminRegistryEntry_Pending',
            sender: s.loadAddress(),
            body: s.loadRef(),
        }
    },
    store(self: TokenAdminRegistryEntry_Pending, b: c.Builder): void {
        b.storeAddress(self.sender);
        b.storeRef(self.body);
    },
    toCell(self: TokenAdminRegistryEntry_Pending): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Pending>(self, TokenAdminRegistryEntry_Pending.store);
    }
}

// ————————————————————————————————————————————
//    class TokenAdminRegistryEntryUpgradeTarget
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

export class TokenAdminRegistryEntryUpgradeTarget implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgEBCgEAnQABFP8A9KQT9LzyyAsBAgFiAgMCAsYEBQIBIAgJAFXT8SPkgQgf8SXwUY4L5enaiaGp6AhjogOuWER9Y6ZJ5X+umAORmegBk9qpAgOj0gYHAC0gU28AYtTEuNi4wjHBfL0bQHIzPQAyYAAPItTIuMC4wiAAFb5T/2omhqegIY6MADe/ocdqJoahj6AmiQN0oYNra4TGh9JGpowIBCcU');

    static Errors = {
        'Upgradeable_Error.VersionMismatch': 19900,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new TokenAdminRegistryEntryUpgradeTarget(address);
    }

    static fromStorage(emptyStorage: {
        previousStorage: c.Cell
        resumed: TokenAdminRegistryEntry_Pending | null
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistryEntryUpgradeTarget.CodeCell,
            data: UpgradeTarget_Storage.toCell(UpgradeTarget_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistryEntryUpgradeTarget(address, initialState);
    }

    static createCellOfTokenAdminRegistryEntryResume(body: {
        pending: TokenAdminRegistryEntry_Pending
    }) {
        return TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body));
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

    async sendTokenAdminRegistryEntryResume(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        pending: TokenAdminRegistryEntry_Pending
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TokenAdminRegistryEntry_Resume.toCell(TokenAdminRegistryEntry_Resume.create(body)),
            ...extraOptions
        });
    }

    async getPreviousStorage(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('previousStorage', []));
        return r.readCell();
    }

    async getResumed(provider: ContractProvider): Promise<TokenAdminRegistryEntry_Pending | null> {
        const r = StackReader.fromGetMethod(3, await provider.get('resumed', []));
        return r.readWideNullable<TokenAdminRegistryEntry_Pending>(3,
            (r) => ({
                $: 'TokenAdminRegistryEntry_Pending',
                sender: r.readSlice().loadAddress(),
                body: r.readCell(),
            })
        );
    }
}
