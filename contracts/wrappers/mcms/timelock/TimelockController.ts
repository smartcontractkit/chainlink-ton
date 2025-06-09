import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
} from '@ton/core';

export type TimelockControllerConfig = {
    minDelay: number;
    adminAccounts: Dictionary<Buffer, Buffer>;
    proposerAccounts: Dictionary<Buffer, Buffer>;
    cancellerAccounts: Dictionary<Buffer, Buffer>;
    executorAccounts: Dictionary<Buffer, Buffer>;
};

export type ExecuteData = {
    tonValue: bigint;
    predecessor: bigint;
    salt: bigint;
    targetAccount: Address;
    msgToSend: Cell;
};

export function createAccountsDictionary(accounts: Address[]): Dictionary<Buffer, Buffer> {
    let dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Buffer(0));

    for (let i = 0; i < accounts.length; i++) {
        dict.set(accounts[i].hash, Buffer.alloc(0));
    }

    return dict;
}

export function timelockControllerConfigToCell(config: TimelockControllerConfig): Cell {
    return beginCell()
        .storeUint(config.minDelay, 32)
        .storeUint(0, 32) // timestamp_count
        .storeRef(
            beginCell()
                .storeDict(config.adminAccounts)
                .storeDict(config.proposerAccounts)
                .storeDict(config.cancellerAccounts)
                .storeDict(config.executorAccounts)
                .endCell(),
        )
        .storeDict() // timestamps
        .endCell();
}

export abstract class Params {
    static done_timestamp = 1;
    static admin_role = 0;
    static proposer_role = 1;
    static canceller_role = 2;
    static executor_role = 3;
    static add_account = 0;
    static remove_account = 1;
    static unset_state = 0;
    static waiting_state = 1;
    static ready_state = 2;
    static done_state = 3;
}

export abstract class Opcodes {
    static schedule = 0xc3e106f4;
    static cancel = 0x70b511b7;
    static execute = 0x2f25a5fd;
    static top_up = 0x2a6fa953;
    static update_delay = 0x7be47a8e;
    static update_accounts = 0x1f6ce878;
    static clear_timestamps = 0xe8448df0;
    static upgrade = 0x6720c139;
}

export abstract class Errors {
    static zero_input = 81;
    static invalid_caller = 82;
    static insufficient_gas = 83;
    static wrong_workchain = 85;
    static wrong_address = 86;
    static invalid_amount = 87;
    static invalid_call = 88;
    static invalid_role = 89;
    static invalid_delay = 90;
    static operation_exists = 91;
    static operation_not_exists = 92;
    static invalid_operation_state = 93;
    static invalid_predecessor_state = 94;
    static account_exists = 95;
    static account_not_exists = 96;
    static predecessor_not_exists = 97;
    static wrong_op = 0xffff;
}

export class TimelockController implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new TimelockController(address);
    }

    static createFromConfig(config: TimelockControllerConfig, code: Cell, workchain = 0) {
        const data = timelockControllerConfigToCell(config);
        const init = { code, data };
        return new TimelockController(contractAddress(workchain, init), init);
    }

    async sendSchedule(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            delay: number;
            tonValue: bigint;
            predecessor: bigint;
            salt: bigint;
            targetAccount: Address;
            msgToSend: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.schedule, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.delay, 32)
                .storeCoins(opts.tonValue)
                .storeUint(opts.predecessor, 256)
                .storeUint(opts.salt, 256)
                .storeAddress(opts.targetAccount)
                .storeRef(opts.msgToSend)
                .endCell(),
        });
    }

    async sendCancel(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            id: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.cancel, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.id, 256)
                .endCell(),
        });
    }

    async sendExecute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            tonValue: bigint;
            predecessor: bigint;
            salt: bigint;
            targetAccount: Address;
            msgToSend: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.execute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeCoins(opts.tonValue)
                .storeUint(opts.predecessor, 256)
                .storeUint(opts.salt, 256)
                .storeAddress(opts.targetAccount)
                .storeRef(opts.msgToSend)
                .endCell(),
        });
    }

    async sendUpdateDelay(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            delay: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_delay, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.delay, 32)
                .endCell(),
        });
    }

    async sendClearTimestamps(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            ids: bigint[];
        },
    ) {
        const ids = opts.ids;
        const idsSlice = beginCell();

        for (let i = 0; i < ids.length; i++) {
            idsSlice.storeUint(ids[i], 256);
        }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.clear_timestamps, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(ids.length, 32)
                .storeSlice(idsSlice.endCell().beginParse())
                .endCell(),
        });
    }

    async sendAddAccount(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            role: number;
            account: Address;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_accounts, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(Params.add_account, 1)
                .storeUint(opts.role, 32)
                .storeAddress(opts.account)
                .endCell(),
        });
    }

    async sendRemoveAccount(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            role: number;
            account: Address;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_accounts, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(Params.remove_account, 1)
                .storeUint(opts.role, 32)
                .storeAddress(opts.account)
                .endCell(),
        });
    }

    async sendTopUp(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.top_up, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    async sendUpgrade(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            newData: Cell;
            newCode: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.upgrade, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeRef(opts.newData)
                .storeRef(opts.newCode)
                .endCell(),
        });
    }

    async getTimelockControllerData(provider: ContractProvider) {
        const { stack } = await provider.get('getTimelockControllerData', []);
        return {
            minDelay: stack.readNumber(),
            timestampCount: stack.readNumber(),
            adminAccounts: stack.readCellOpt(),
            proposerAccounts: stack.readCellOpt(),
            cancellerAccounts: stack.readCellOpt(),
            executorAccounts: stack.readCellOpt(),
            timestamps: stack.readCellOpt(),
        };
    }

    async getTimestamp(provider: ContractProvider, id: bigint) {
        const result = await provider.get('getTimestamp', [
            {
                type: 'int',
                value: id,
            },
        ]);
        return result.stack.readNumber();
    }

    async getHashOperation(
        provider: ContractProvider,
        tonValue: bigint,
        predecessor: bigint,
        salt: bigint,
        target: Address,
        msgToSend: Cell,
    ) {
        const result = await provider.get('getHashOperation', [
            {
                type: 'int',
                value: tonValue,
            },
            {
                type: 'int',
                value: predecessor,
            },
            {
                type: 'int',
                value: salt,
            },
            {
                type: 'slice',
                cell: beginCell().storeAddress(target).endCell(),
            },
            {
                type: 'cell',
                cell: msgToSend,
            },
        ]);
        return result.stack.readBigNumber();
    }

    async getOperationState(provider: ContractProvider, id: bigint) {
        const result = await provider.get('getOperationState', [
            {
                type: 'int',
                value: id,
            },
        ]);
        return result.stack.readNumber();
    }

    async getIsAdmin(provider: ContractProvider, account: Address) {
        const result = await provider.get('getHasRole', [
            {
                type: 'int',
                value: BigInt(Params.admin_role),
            },
            {
                type: 'slice',
                cell: beginCell().storeAddress(account).endCell(),
            },
        ]);
        return result.stack.readBoolean();
    }

    async getIsProposer(provider: ContractProvider, account: Address) {
        const result = await provider.get('getHasRole', [
            {
                type: 'int',
                value: BigInt(Params.proposer_role),
            },
            {
                type: 'slice',
                cell: beginCell().storeAddress(account).endCell(),
            },
        ]);
        return result.stack.readBoolean();
    }

    async getIsCanceller(provider: ContractProvider, account: Address) {
        const result = await provider.get('getHasRole', [
            {
                type: 'int',
                value: BigInt(Params.canceller_role),
            },
            {
                type: 'slice',
                cell: beginCell().storeAddress(account).endCell(),
            },
        ]);
        return result.stack.readBoolean();
    }

    async getIsExecutor(provider: ContractProvider, account: Address) {
        const result = await provider.get('getHasRole', [
            {
                type: 'int',
                value: BigInt(Params.executor_role),
            },
            {
                type: 'slice',
                cell: beginCell().storeAddress(account).endCell(),
            },
        ]);
        return result.stack.readBoolean();
    }
}
