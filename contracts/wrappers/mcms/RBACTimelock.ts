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
import { createHash } from 'crypto'

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
export type InMessage =
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

/// @dev Batch of transactions represented as a operation, which can be scheduled and executed.
export type OperationBatch = {
  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
  // Predecessor operation ID
  predecessor: bigint
  // Salt used to derive the operation ID
  salt: bigint
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
          .storeUint(msg.minDelay, 64)
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
          .storeUint(msg.delay, 64)
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
          .storeUint(msg.newDelay, 64)
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
      operationBatch: (op: OperationBatch): Cell => {
        return beginCell()
          .storeRef(op.calls)
          .storeUint(op.predecessor, 256)
          .storeUint(op.salt, 256)
          .endCell()
      },
    }),
  },
}

// Helper function to compute a 32-bit SHA-256 hash of a string (e.g., Tolk's stringSha256_32)
const sha256_32 = (input: string): bigint => {
  const hash = createHash('sha256').update(input).digest()
  // Take the first 4 bytes as a 32-bit unsigned integer (big-endian)
  return BigInt(hash.readUInt32BE(0))
}

// TODO: keccak256 should be used as a default (compatibility with EVM contracts)
export const roles = {
  admin: sha256_32('ADMIN_ROLE'), // 2112602974n
  proposer: sha256_32('PROPOSER_ROLE'), // 2908596091n
  canceller: sha256_32('CANCELLER_ROLE'), // 973072761n
  executor: sha256_32('EXECUTOR_ROLE'), // 2599814779n
  bypasser: sha256_32('BYPASSER_ROLE'), // 544836961n
}

export const DONE_TIMESTAMP = 1

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

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0) {
    const init = { code, data: builder.data.encode().contractData(data) }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendInit(provider: ContractProvider, via: Sender, value: bigint, body: Init) {
    return this.sendInternal(provider, via, value, builder.message.encode().init(body))
  }

  async sendTopUp(provider: ContractProvider, via: Sender, value: bigint = 0n, body: TopUp) {
    return this.sendInternal(provider, via, value, builder.message.encode().topUp(body))
  }

  async sendScheduleBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ScheduleBatch,
  ) {
    return this.sendInternal(p, via, value, builder.message.encode().scheduleBatch(body))
  }

  async sendCancel(p: ContractProvider, via: Sender, value: bigint = 0n, body: Cancel) {
    return this.sendInternal(p, via, value, builder.message.encode().cancel(body))
  }

  async sendExecuteBatch(p: ContractProvider, via: Sender, value: bigint = 0n, body: ExecuteBatch) {
    return this.sendInternal(p, via, value, builder.message.encode().executeBatch(body))
  }

  async sendUpdateDelay(p: ContractProvider, via: Sender, value: bigint = 0n, body: UpdateDelay) {
    return this.sendInternal(p, via, value, builder.message.encode().updateDelay(body))
  }

  async sendBlockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BlockFunctionSelector,
  ) {
    return this.sendInternal(p, via, value, builder.message.encode().blockFunctionSelector(body))
  }

  async sendUnblockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: UnblockFunctionSelector,
  ) {
    return this.sendInternal(p, via, value, builder.message.encode().unblockFunctionSelector(body))
  }

  async sendBypasserExecuteBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BypasserExecuteBatch,
  ) {
    return this.sendInternal(p, via, value, builder.message.encode().bypasserExecuteBatch(body))
  }

  // --- Getters ---

  async getTypeAndVersion(p: ContractProvider): Promise<[string, string]> {
    const r = await p.get('typeAndVersion', [])
    const type = r.stack.readString()
    const version = r.stack.readString()
    return [type, version]
  }

  async isOperation(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isOperation', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async isOperationPending(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isOperationPending', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async isOperationReady(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isOperationReady', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async isOperationDone(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isOperationDone', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async getTimestamp(p: ContractProvider, id: bigint): Promise<bigint> {
    return p
      .get('getTimestamp', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBigNumber())
  }

  async getMinDelay(p: ContractProvider): Promise<bigint> {
    return p // break line
      .get('getMinDelay', [])
      .then((result) => result.stack.readBigNumber())
  }

  async getHashOperationBatch(p: ContractProvider, op: OperationBatch): Promise<bigint> {
    return p
      .get('hashOperationBatch', [
        {
          type: 'slice',
          cell: builder.data.encode().operationBatch(op),
        },
      ])
      .then((r) => r.stack.readBigNumber())
  }

  async getBlockedFunctionSelectorCount(p: ContractProvider): Promise<number> {
    return p.get('getBlockedFunctionSelectorCount', []).then((r) => r.stack.readNumber())
  }

  async getBlockedFunctionSelectorAt(p: ContractProvider, index: number): Promise<number> {
    return p
      .get('getBlockedFunctionSelectorAt', [
        {
          type: 'int',
          value: BigInt(index),
        },
      ])
      .then((r) => r.stack.readNumber())
  }
}
