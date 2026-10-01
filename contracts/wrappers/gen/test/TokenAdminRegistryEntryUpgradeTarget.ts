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

    readCellRef<T>(loadFn_T: LoadCallback<T>): T {
        return loadFn_T(this.readCell().beginParse());
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint16 = bigint
type uint64 = bigint

/**
 > struct UpgradeTarget_Storage {
 >     previousStorage: cell
 >     resumed: Cell<TokenAdminRegistryEntry_MessageFromRoot>?
 > }
 */
export interface UpgradeTarget_Storage {
    readonly $: 'UpgradeTarget_Storage'
    previousStorage: c.Cell
    resumed: TokenAdminRegistryEntry_MessageFromRoot | null
}

export const UpgradeTarget_Storage = {
    create(args: {
        previousStorage: c.Cell
        resumed: TokenAdminRegistryEntry_MessageFromRoot | null
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
            resumed: s.loadBoolean() ? loadCellRef<TokenAdminRegistryEntry_MessageFromRoot>(s, TokenAdminRegistryEntry_MessageFromRoot.fromSlice) : null,
        }
    },
    store(self: UpgradeTarget_Storage, b: c.Builder): void {
        b.storeRef(self.previousStorage);
        storeTolkNullable<TokenAdminRegistryEntry_MessageFromRoot>(self.resumed, b,
            (v,b) => storeCellRef<TokenAdminRegistryEntry_MessageFromRoot>(v, b, TokenAdminRegistryEntry_MessageFromRoot.store)
        );
    },
    toCell(self: UpgradeTarget_Storage): c.Cell {
        return makeCellFrom<UpgradeTarget_Storage>(self, UpgradeTarget_Storage.store);
    }
}

/**
 > type TokenAdminRegistryEntry_RootMessage = TokenAdminRegistryEntry_ResolveTokenInfo | TokenAdminRegistryEntry_ProposeAdministrator | TokenAdminRegistryEntry_TransferAdminRole | TokenAdminRegistryEntry_AcceptAdminRole | TokenAdminRegistryEntry_SetPool
 */
export type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_ResolveTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool

export const TokenAdminRegistryEntry_RootMessage = {
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_RootMessage {
        return lookupPrefix(s, 0x4f60fff3, 32) ? TokenAdminRegistryEntry_ResolveTokenInfo.fromSlice(s) :
            lookupPrefix(s, 0x6dcbe573, 32) ? TokenAdminRegistryEntry_ProposeAdministrator.fromSlice(s) :
            lookupPrefix(s, 0x8b1503cf, 32) ? TokenAdminRegistryEntry_TransferAdminRole.fromSlice(s) :
            lookupPrefix(s, 0x39c6e872, 32) ? TokenAdminRegistryEntry_AcceptAdminRole.fromSlice(s) :
            lookupPrefix(s, 0xa64e05c9, 32) ? TokenAdminRegistryEntry_SetPool.fromSlice(s) :
            throwNonePrefixMatch('TokenAdminRegistryEntry_RootMessage');
    },
    store(self: TokenAdminRegistryEntry_RootMessage, b: c.Builder): void {
        switch (self.$) {
            case 'TokenAdminRegistryEntry_ResolveTokenInfo':
                TokenAdminRegistryEntry_ResolveTokenInfo.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_ProposeAdministrator':
                TokenAdminRegistryEntry_ProposeAdministrator.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_TransferAdminRole':
                TokenAdminRegistryEntry_TransferAdminRole.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_AcceptAdminRole':
                TokenAdminRegistryEntry_AcceptAdminRole.store(self, b);
                break;
            case 'TokenAdminRegistryEntry_SetPool':
                TokenAdminRegistryEntry_SetPool.store(self, b);
                break;
        }
    },
    toCell(self: TokenAdminRegistryEntry_RootMessage): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_RootMessage>(self, TokenAdminRegistryEntry_RootMessage.store);
    }
}

/**
 > struct (0x558e7559) TokenAdminRegistryEntry_MessageFromRoot {
 >     queryId: uint64
 >     minEntryVersion: uint16
 >     content: Cell<TokenAdminRegistryEntry_RootMessage>
 > }
 */
export interface TokenAdminRegistryEntry_MessageFromRoot {
    readonly $: 'TokenAdminRegistryEntry_MessageFromRoot'
    queryId: uint64
    minEntryVersion: uint16
    content: TokenAdminRegistryEntry_RootMessage
}

export const TokenAdminRegistryEntry_MessageFromRoot = {
    PREFIX: 0x558e7559,

    create(args: {
        queryId?: uint64
        minEntryVersion: uint16
        content: TokenAdminRegistryEntry_RootMessage
    }): TokenAdminRegistryEntry_MessageFromRoot {
        return {
            $: 'TokenAdminRegistryEntry_MessageFromRoot',
            ...args,
            queryId: args.queryId ?? 0n
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_MessageFromRoot {
        loadAndCheckPrefix32(s, 0x558e7559, 'TokenAdminRegistryEntry_MessageFromRoot');
        return {
            $: 'TokenAdminRegistryEntry_MessageFromRoot',
            queryId: s.loadUintBig(64),
            minEntryVersion: s.loadUintBig(16),
            content: loadCellRef<TokenAdminRegistryEntry_RootMessage>(s, TokenAdminRegistryEntry_RootMessage.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_MessageFromRoot, b: c.Builder): void {
        b.storeUint(0x558e7559, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.minEntryVersion, 16);
        storeCellRef<TokenAdminRegistryEntry_RootMessage>(self.content, b, TokenAdminRegistryEntry_RootMessage.store);
    },
    toCell(self: TokenAdminRegistryEntry_MessageFromRoot): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_MessageFromRoot>(self, TokenAdminRegistryEntry_MessageFromRoot.store);
    }
}

/**
 > struct (0x4f60fff3) TokenAdminRegistryEntry_ResolveTokenInfo {
 >     token: address
 >     requester: address
 > }
 */
export interface TokenAdminRegistryEntry_ResolveTokenInfo {
    readonly $: 'TokenAdminRegistryEntry_ResolveTokenInfo'
    token: c.Address
    requester: c.Address
}

export const TokenAdminRegistryEntry_ResolveTokenInfo = {
    PREFIX: 0x4f60fff3,

    create(args: {
        token: c.Address
        requester: c.Address
    }): TokenAdminRegistryEntry_ResolveTokenInfo {
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ResolveTokenInfo {
        loadAndCheckPrefix32(s, 0x4f60fff3, 'TokenAdminRegistryEntry_ResolveTokenInfo');
        return {
            $: 'TokenAdminRegistryEntry_ResolveTokenInfo',
            token: s.loadAddress(),
            requester: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ResolveTokenInfo, b: c.Builder): void {
        b.storeUint(0x4f60fff3, 32);
        b.storeAddress(self.token);
        b.storeAddress(self.requester);
    },
    toCell(self: TokenAdminRegistryEntry_ResolveTokenInfo): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ResolveTokenInfo>(self, TokenAdminRegistryEntry_ResolveTokenInfo.store);
    }
}

/**
 > struct (0x6dcbe573) TokenAdminRegistryEntry_ProposeAdministrator {
 >     administrator: address
 > }
 */
export interface TokenAdminRegistryEntry_ProposeAdministrator {
    readonly $: 'TokenAdminRegistryEntry_ProposeAdministrator'
    administrator: c.Address
}

export const TokenAdminRegistryEntry_ProposeAdministrator = {
    PREFIX: 0x6dcbe573,

    create(args: {
        administrator: c.Address
    }): TokenAdminRegistryEntry_ProposeAdministrator {
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_ProposeAdministrator {
        loadAndCheckPrefix32(s, 0x6dcbe573, 'TokenAdminRegistryEntry_ProposeAdministrator');
        return {
            $: 'TokenAdminRegistryEntry_ProposeAdministrator',
            administrator: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_ProposeAdministrator, b: c.Builder): void {
        b.storeUint(0x6dcbe573, 32);
        b.storeAddress(self.administrator);
    },
    toCell(self: TokenAdminRegistryEntry_ProposeAdministrator): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_ProposeAdministrator>(self, TokenAdminRegistryEntry_ProposeAdministrator.store);
    }
}

/**
 > struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
 >     actor: address
 >     newAdministrator: address?
 > }
 */
export interface TokenAdminRegistryEntry_TransferAdminRole {
    readonly $: 'TokenAdminRegistryEntry_TransferAdminRole'
    actor: c.Address
    newAdministrator: c.Address | null
}

export const TokenAdminRegistryEntry_TransferAdminRole = {
    PREFIX: 0x8b1503cf,

    create(args: {
        actor: c.Address
        newAdministrator: c.Address | null
    }): TokenAdminRegistryEntry_TransferAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_TransferAdminRole {
        loadAndCheckPrefix32(s, 0x8b1503cf, 'TokenAdminRegistryEntry_TransferAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_TransferAdminRole',
            actor: s.loadAddress(),
            newAdministrator: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_TransferAdminRole, b: c.Builder): void {
        b.storeUint(0x8b1503cf, 32);
        b.storeAddress(self.actor);
        b.storeAddress(self.newAdministrator);
    },
    toCell(self: TokenAdminRegistryEntry_TransferAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_TransferAdminRole>(self, TokenAdminRegistryEntry_TransferAdminRole.store);
    }
}

/**
 > struct (0x39c6e872) TokenAdminRegistryEntry_AcceptAdminRole {
 >     actor: address
 > }
 */
export interface TokenAdminRegistryEntry_AcceptAdminRole {
    readonly $: 'TokenAdminRegistryEntry_AcceptAdminRole'
    actor: c.Address
}

export const TokenAdminRegistryEntry_AcceptAdminRole = {
    PREFIX: 0x39c6e872,

    create(args: {
        actor: c.Address
    }): TokenAdminRegistryEntry_AcceptAdminRole {
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_AcceptAdminRole {
        loadAndCheckPrefix32(s, 0x39c6e872, 'TokenAdminRegistryEntry_AcceptAdminRole');
        return {
            $: 'TokenAdminRegistryEntry_AcceptAdminRole',
            actor: s.loadAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_AcceptAdminRole, b: c.Builder): void {
        b.storeUint(0x39c6e872, 32);
        b.storeAddress(self.actor);
    },
    toCell(self: TokenAdminRegistryEntry_AcceptAdminRole): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_AcceptAdminRole>(self, TokenAdminRegistryEntry_AcceptAdminRole.store);
    }
}

/**
 > struct (0xa64e05c9) TokenAdminRegistryEntry_SetPool {
 >     actor: address
 >     tokenPool: address?
 > }
 */
export interface TokenAdminRegistryEntry_SetPool {
    readonly $: 'TokenAdminRegistryEntry_SetPool'
    actor: c.Address
    tokenPool: c.Address | null
}

export const TokenAdminRegistryEntry_SetPool = {
    PREFIX: 0xa64e05c9,

    create(args: {
        actor: c.Address
        tokenPool: c.Address | null
    }): TokenAdminRegistryEntry_SetPool {
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            ...args
        }
    },
    fromSlice(s: c.Slice): TokenAdminRegistryEntry_SetPool {
        loadAndCheckPrefix32(s, 0xa64e05c9, 'TokenAdminRegistryEntry_SetPool');
        return {
            $: 'TokenAdminRegistryEntry_SetPool',
            actor: s.loadAddress(),
            tokenPool: s.loadMaybeAddress(),
        }
    },
    store(self: TokenAdminRegistryEntry_SetPool, b: c.Builder): void {
        b.storeUint(0xa64e05c9, 32);
        b.storeAddress(self.actor);
        b.storeAddress(self.tokenPool);
    },
    toCell(self: TokenAdminRegistryEntry_SetPool): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_SetPool>(self, TokenAdminRegistryEntry_SetPool.store);
    }
}

/**
 > struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
 >     request: Cell<TokenAdminRegistryEntry_MessageFromRoot>
 > }
 */
export interface TokenAdminRegistryEntry_Resume {
    readonly $: 'TokenAdminRegistryEntry_Resume'
    request: TokenAdminRegistryEntry_MessageFromRoot
}

export const TokenAdminRegistryEntry_Resume = {
    PREFIX: 0x47d63a64,

    create(args: {
        request: TokenAdminRegistryEntry_MessageFromRoot
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
            request: loadCellRef<TokenAdminRegistryEntry_MessageFromRoot>(s, TokenAdminRegistryEntry_MessageFromRoot.fromSlice),
        }
    },
    store(self: TokenAdminRegistryEntry_Resume, b: c.Builder): void {
        b.storeUint(0x47d63a64, 32);
        storeCellRef<TokenAdminRegistryEntry_MessageFromRoot>(self.request, b, TokenAdminRegistryEntry_MessageFromRoot.store);
    },
    toCell(self: TokenAdminRegistryEntry_Resume): c.Cell {
        return makeCellFrom<TokenAdminRegistryEntry_Resume>(self, TokenAdminRegistryEntry_Resume.store);
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
    static CodeCell = c.Cell.fromBase64('te6ccgEBCgEAxAABFP8A9KQT9LzyyAsBAgFiAgMCAsYEBQIBIAgJAInT8SPkgdqJoanoCGOiQaH0kGP0oGP0kGOmPmOpowgf8SQFofSR9KBj9KBjoiWOC+XoA65YRH1jpknlf66YA5GZ6AGT2qkCA6PSBgcALSBTbwBi1MS42LjCMcF8vRtAcjM9ADJgAA8i1Mi4wLjCIAAVvlP/aiaGp6AhjowAUb+hx2omhqGPoCaJA3Spg2tra4Rwnoa5YRVjnVZnlf6Z/ph+powIBCcU');

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
        resumed: TokenAdminRegistryEntry_MessageFromRoot | null
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? TokenAdminRegistryEntryUpgradeTarget.CodeCell,
            data: UpgradeTarget_Storage.toCell(UpgradeTarget_Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new TokenAdminRegistryEntryUpgradeTarget(address, initialState);
    }

    static createCellOfTokenAdminRegistryEntryResume(body: {
        request: TokenAdminRegistryEntry_MessageFromRoot
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
        request: TokenAdminRegistryEntry_MessageFromRoot
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

    async getResumed(provider: ContractProvider): Promise<TokenAdminRegistryEntry_MessageFromRoot | null> {
        const r = StackReader.fromGetMethod(4, await provider.get('resumed', []));
        return r.readWideNullable<TokenAdminRegistryEntry_MessageFromRoot>(4,
            (r) => ({
                $: 'TokenAdminRegistryEntry_MessageFromRoot',
                queryId: r.readBigInt(),
                minEntryVersion: r.readBigInt(),
                content: r.readCellRef<TokenAdminRegistryEntry_RootMessage>(TokenAdminRegistryEntry_RootMessage.fromSlice),
            })
        );
    }
}
