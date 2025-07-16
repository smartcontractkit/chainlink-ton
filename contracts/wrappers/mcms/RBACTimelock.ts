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
} from '@ton/core'
import { crc32 } from 'zlib'

// @dev Initializes the contract
export type Init = {
  // Query ID of the change owner request.
  queryId: bigint

  // Minimum delay in seconds for future operations.
  minDelay: bigint

  // Address of the admin account.
  admin: Address

  // Collection of addresses to be granted proposer, executor, canceller and bypasser roles.
  proposers: Cell // vec<address>
  executors: Cell // vec<address>
  cancellers: Cell // vec<address>
  bypassers: Cell // vec<address>
}

// @dev Top up contract with TON coins.
export type TopUp = {
  // Query ID of the change owner request.
  queryId: bigint
}

// @dev Schedule an operation containing a batch of transactions.
export type ScheduleBatch = {
  // Query ID of the change owner request.
  queryId: bigint

  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
  // Predecessor operation ID
  predecessor: bigint
  // Salt used to derive the operation ID
  salt: bigint
  // Delay in seconds before the operation can be executed
  delay: number
}

// @dev Cancel an operation.
export type Cancel = {
  // Query ID of the change owner request.
  queryId: bigint

  // ID of the operation to cancel.
  id: bigint
}

// @dev Execute an (ready) operation containing a batch of transactions.
export type ExecuteBatch = {
  // Query ID of the change owner request.
  queryId: bigint

  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
  // Predecessor operation ID
  predecessor: bigint
  // Salt used to derive the operation ID
  salt: bigint
}

// @dev Changes the minimum timelock duration for future operations.
export type UpdateDelay = {
  // Query ID of the change owner request.
  queryId: bigint

  // New minimum delay in seconds for future operations.
  newDelay: number
}

// @dev Blocks a function selector from being used
export type BlockFunctionSelector = {
  // Query ID of the change owner request.
  queryId: bigint

  // Function selector to block.
  selector: number
}

// @dev Unblocks a previously blocked function selector so it can be used again.
export type UnblockFunctionSelector = {
  /// Query ID of the change owner request.
  queryId: bigint

  /// Function selector to unblock.
  selector: number
}

// @dev Directly execute a batch of transactions, bypassing any other checks.
export type BypasserExecuteBatch = {
  // Query ID of the change owner request.
  queryId: bigint

  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
}

// @dev Union of all (input) messages.
export type Message =
  | Init
  | TopUp
  | ScheduleBatch
  | Cancel
  | ExecuteBatch
  | UpdateDelay
  | UnblockFunctionSelector
  | BlockFunctionSelector
  | UnblockFunctionSelector
  | BypasserExecuteBatch

// RBACTimelock contract storage
export type ContractData = {
  // Minimum delay for operations in seconds
  minDelay: number
  // Map of operation id to timestamp
  timestamps?: Dictionary<Buffer, Buffer>

  // Number of fn selectors blocked by the contract.
  blockedFnSelectorsLen?: number
  // Map of blocked function selectors.
  blockedFnSelectors?: Dictionary<number, Buffer>

  // AccessControl trait data
  rbac: Cell
}

// Represents a single call
export type Call = {
  // Address of the target contract to call.
  target: Address
  // Value in TONs to send with the call.
  value: bigint
  // Data to send with the call - message body.
  data: Cell
}

export type ExecuteData = {
  tonValue: bigint
  predecessor: bigint
  salt: bigint
  targetAccount: Address
  msgToSend: Cell
}

export const opcodes = {
  in: {
    Init: crc32('Timelock_Init'),
    TopUp: crc32('Timelock_TopUp'),
    ScheduleBatch: crc32('Timelock_ScheduleBatch'),
    Cancel: crc32('Timelock_Cancel'),
    ExecuteBatch: crc32('Timelock_ExecuteBatch'),
    UpdateDelay: crc32('Timelock_UpdateDelay'),
    BlockFunctionSelector: crc32('Timelock_BlockFunctionSelector'),
    UnblockFunctionSelector: crc32('Timelock_UnblockFunctionSelector'),
    BypasserExecuteBatch: crc32('Timelock_BypasserExecuteBatch'),
  },
  out: {
    CallScheduled: crc32('Timelock_CallScheduled'),
    CallExecuted: crc32('Timelock_CallExecuted'),
    BypasserCallExecuted: crc32('Timelock_BypasserCallExecuted'),
    Canceled: crc32('Timelock_Canceled'),
    MinDelayChange: crc32('Timelock_MinDelayChange'),
    FunctionSelectorBlocked: crc32('Timelock_FunctionSelectorBlocked'),
    FunctionSelectorUnblocked: crc32('Timelock_FunctionSelectorUnblocked'),
  },
}

export const builder = {
  message: {
    encode: () => ({
      // Creates a new `AccessControl_Init` message.
      init: (msg: Init): Cell => {
        return beginCell()
          .storeUint(opcodes.in.Init, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.minDelay, 32)
          .storeAddress(msg.admin)
          .storeRef(msg.proposers)
          .storeRef(msg.executors)
          .storeRef(msg.cancellers)
          .storeRef(msg.bypassers)
          .endCell()
      },
      // Creates a new `Timelock_TopUp` message.
      topUp: (msg: TopUp): Cell => {
        return beginCell() // break line
          .storeUint(opcodes.in.TopUp, 32)
          .storeUint(msg.queryId, 64)
          .endCell()
      },
      // Creates a new `Timelock_ScheduleBatch` message.
      scheduleBatch: (msg: ScheduleBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.ScheduleBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .storeUint(msg.predecessor, 256)
          .storeUint(msg.salt, 256)
          .storeUint(msg.delay, 32)
          .endCell()
      },
      // Creates a new `Timelock_Cancel` message.
      cancel: (msg: Cancel): Cell => {
        return beginCell()
          .storeUint(opcodes.in.Cancel, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.id, 256)
          .endCell()
      },
      // Creates a new `Timelock_ExecuteBatch` message.
      executeBatch: (msg: ExecuteBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.ExecuteBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .storeUint(msg.predecessor, 256)
          .storeUint(msg.salt, 256)
          .endCell()
      },
      // Creates a new `Timelock_UpdateDelay` message.
      updateDelay: (msg: UpdateDelay): Cell => {
        return beginCell()
          .storeUint(opcodes.in.UpdateDelay, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.newDelay, 32)
          .endCell()
      },
      // Creates a new `Timelock_BlockFunctionSelector` message.
      blockFunctionSelector: (msg: BlockFunctionSelector): Cell => {
        return beginCell()
          .storeUint(opcodes.in.BlockFunctionSelector, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.selector, 32)
          .endCell()
      },
      // Creates a new `Timelock_UnblockFunctionSelector` message.
      unblockFunctionSelector: (msg: UnblockFunctionSelector): Cell => {
        return beginCell()
          .storeUint(opcodes.in.UnblockFunctionSelector, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.selector, 32)
          .endCell()
      },
      // Creates a new `Timelock_BypasserExecuteBatch` message.
      bypasserExecuteBatch: (msg: BypasserExecuteBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.BypasserExecuteBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .endCell()
      },
    }),
    decode: {}, // Decoding functions can be added here if needed
  },
  data: {
    encode: () => ({
      // Creates a new `Timelock_Data` contract data cell
      contractData: (data: ContractData): Cell => {
        return beginCell()
          .storeUint(data.minDelay, 64)
          .storeDict(data.timestamps)
          .storeUint(data.blockedFnSelectorsLen || 0, 32) // blocked_fn_selectors_len
          .storeDict(
            data.blockedFnSelectors ||
              Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Buffer(0)),
          )
          .storeRef(data.rbac)
          .endCell()
      },
      // Creates a new `Timelock_Call.hasRole` data cell
      call: (call: Call): Cell => {
        return beginCell()
          .storeAddress(call.target)
          .storeCoins(call.value)
          .storeRef(call.data)
          .endCell()
      },
    }),
  },
}

export abstract class Params {
  static done_timestamp = 1

  // TODO: sha256 hash of the function selector
  static admin_role = 2112602974n
  static proposer_role = 2908596091n
  static canceller_role = 973072761n
  static executor_role = 2599814779n
  static bypasser_role = 544836961n

  static add_account = 0
  static remove_account = 1
  static unset_state = 0
  static waiting_state = 1
  static ready_state = 2
  static done_state = 3
}

export abstract class Opcodes {
  static schedule = 0xc3e106f4
  static cancel = 0x70b511b7
  static execute = 0x2f25a5fd
  static top_up = 0x2a6fa953
  static update_delay = 0x7be47a8e
  static update_accounts = 0x1f6ce878
  static clear_timestamps = 0xe8448df0
}

export abstract class Errors {
  static zero_input = 81
  static invalid_caller = 82
  static insufficient_gas = 83
  static wrong_workchain = 85
  static wrong_address = 86
  static invalid_amount = 87
  static invalid_call = 88
  static invalid_role = 89
  static invalid_delay = 90
  static operation_exists = 91
  static operation_not_exists = 92
  static invalid_operation_state = 93
  static invalid_predecessor_state = 94
  static account_exists = 95
  static account_not_exists = 96
  static predecessor_not_exists = 97
  static wrong_op = 0xffff
}

export class RBACTimelock implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): RBACTimelock {
    return new RBACTimelock(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0) {
    const init = { code, data: builder.data.encode().contractData(data) }
    return new RBACTimelock(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendSchedule(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      delay: number
      tonValue: bigint
      predecessor: bigint
      salt: bigint
      targetAccount: Address
      msgToSend: Cell
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
    })
  }

  async sendCancel(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      id: bigint
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
    })
  }

  async sendExecute(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      tonValue: bigint
      predecessor: bigint
      salt: bigint
      targetAccount: Address
      msgToSend: Cell
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
    })
  }

  async sendUpdateDelay(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      delay: number
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
    })
  }

  async sendClearTimestamps(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      ids: bigint[]
    },
  ) {
    const ids = opts.ids
    const idsSlice = beginCell()

    for (let i = 0; i < ids.length; i++) {
      idsSlice.storeUint(ids[i], 256)
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
    })
  }

  async sendAddAccount(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      role: number
      account: Address
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
    })
  }

  async sendRemoveAccount(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      role: number
      account: Address
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
    })
  }

  async sendTopUp(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(opcodes.in.TopUp, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .endCell(),
    })
  }

  async getRBACTimelockData(provider: ContractProvider) {
    const { stack } = await provider.get('getRBACTimelockData', [])
    return {
      minDelay: stack.readNumber(),
      adminAccounts: stack.readCellOpt(),
      proposerAccounts: stack.readCellOpt(),
      cancellerAccounts: stack.readCellOpt(),
      executorAccounts: stack.readCellOpt(),
      timestamps: stack.readCellOpt(),
    }
  }

  async getTimestamp(provider: ContractProvider, id: bigint) {
    const result = await provider.get('getTimestamp', [
      {
        type: 'int',
        value: id,
      },
    ])
    return result.stack.readNumber()
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
    ])
    return result.stack.readBigNumber()
  }

  async getOperationState(provider: ContractProvider, id: bigint) {
    const result = await provider.get('getOperationState', [
      {
        type: 'int',
        value: id,
      },
    ])
    return result.stack.readNumber()
  }

  async getIsAdmin(provider: ContractProvider, account: Address) {
    const result = await provider.get('hasRole', [
      {
        type: 'int',
        value: BigInt(Params.admin_role),
      },
      {
        type: 'slice',
        cell: beginCell().storeAddress(account).endCell(),
      },
    ])
    return result.stack.readBoolean()
  }

  async getIsProposer(provider: ContractProvider, account: Address) {
    const result = await provider.get('hasRole', [
      {
        type: 'int',
        value: BigInt(Params.proposer_role),
      },
      {
        type: 'slice',
        cell: beginCell().storeAddress(account).endCell(),
      },
    ])
    return result.stack.readBoolean()
  }

  async getIsCanceller(provider: ContractProvider, account: Address) {
    const result = await provider.get('hasRole', [
      {
        type: 'int',
        value: BigInt(Params.canceller_role),
      },
      {
        type: 'slice',
        cell: beginCell().storeAddress(account).endCell(),
      },
    ])
    return result.stack.readBoolean()
  }

  async getIsExecutor(provider: ContractProvider, account: Address) {
    const result = await provider.get('hasRole', [
      {
        type: 'int',
        value: BigInt(Params.executor_role),
      },
      {
        type: 'slice',
        cell: beginCell().storeAddress(account).endCell(),
      },
    ])
    return result.stack.readBoolean()
  }
}
