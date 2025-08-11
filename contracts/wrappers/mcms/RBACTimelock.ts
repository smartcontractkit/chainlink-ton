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
import { CellCodec, sha256_32 } from '../utils'

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
  delay: bigint
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
  | BlockFunctionSelector
  | UnblockFunctionSelector
  | BypasserExecuteBatch

// RBACTimelock contract storage
export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: number // uint32

  // Minimum delay for operations in seconds
  minDelay: bigint
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
    init: {
      encode: (msg: Init): Cell => {
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
      decode: (cell: Cell): Init => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          minDelay: s.loadUintBig(64),
          admin: s.loadAddress(),
          proposers: s.loadRef(),
          executors: s.loadRef(),
          cancellers: s.loadRef(),
          bypassers: s.loadRef(),
        }
      },
    } as CellCodec<Init>,

    topUp: {
      encode: (msg: TopUp): Cell => {
        return beginCell() // break line
          .storeUint(opcodes.in.TopUp, 32)
          .storeUint(msg.queryId, 64)
          .endCell()
      },
      decode: (cell: Cell): TopUp => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
        }
      },
    } as CellCodec<TopUp>,

    scheduleBatch: {
      encode: (msg: ScheduleBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.ScheduleBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .storeUint(msg.predecessor, 256)
          .storeUint(msg.salt, 256)
          .storeUint(msg.delay, 64)
          .endCell()
      },
      decode: (cell: Cell): ScheduleBatch => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          calls: s.loadRef(),
          predecessor: s.loadUintBig(256),
          salt: s.loadUintBig(256),
          delay: s.loadUintBig(64),
        }
      },
    } as CellCodec<ScheduleBatch>,

    cancel: {
      encode: (msg: Cancel): Cell => {
        return beginCell()
          .storeUint(opcodes.in.Cancel, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.id, 256)
          .endCell()
      },
      decode: (cell: Cell): Cancel => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          id: s.loadUintBig(256),
        }
      },
    } as CellCodec<Cancel>,

    executeBatch: {
      encode: (msg: ExecuteBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.ExecuteBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .storeUint(msg.predecessor, 256)
          .storeUint(msg.salt, 256)
          .endCell()
      },
      decode: (cell: Cell): ExecuteBatch => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          calls: s.loadRef(),
          predecessor: s.loadUintBig(256),
          salt: s.loadUintBig(256),
        }
      },
    } as CellCodec<ExecuteBatch>,

    updateDelay: {
      encode: (msg: UpdateDelay): Cell => {
        return beginCell()
          .storeUint(opcodes.in.UpdateDelay, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.newDelay, 64)
          .endCell()
      },
      decode: (cell: Cell): UpdateDelay => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          newDelay: -1, // TODO: decode delay properly (number vs bigint mismatch)
          // newDelay: s.loadUintBig(64),
        }
      },
    } as CellCodec<UpdateDelay>,

    blockFunctionSelector: {
      encode: (msg: BlockFunctionSelector): Cell => {
        return beginCell()
          .storeUint(opcodes.in.BlockFunctionSelector, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.selector, 32)
          .endCell()
      },
      decode: (cell: Cell): BlockFunctionSelector => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          selector: s.loadUint(32),
        }
      },
    } as CellCodec<BlockFunctionSelector>,

    unblockFunctionSelector: {
      encode: (msg: UnblockFunctionSelector): Cell => {
        return beginCell()
          .storeUint(opcodes.in.UnblockFunctionSelector, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.selector, 32)
          .endCell()
      },
      decode: (cell: Cell): UnblockFunctionSelector => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          selector: s.loadUint(32),
        }
      },
    } as CellCodec<UnblockFunctionSelector>,

    bypasserExecuteBatch: {
      encode: (msg: BypasserExecuteBatch): Cell => {
        return beginCell()
          .storeUint(opcodes.in.BypasserExecuteBatch, 32)
          .storeUint(msg.queryId, 64)
          .storeRef(msg.calls)
          .endCell()
      },
      decode: (cell: Cell): BypasserExecuteBatch => {
        const s = cell.beginParse()
        s.skip(32) // skip opcode
        return {
          queryId: s.loadUintBig(64),
          calls: s.loadRef(),
        }
      },
    } as CellCodec<BypasserExecuteBatch>,
  },
  data: {
    contractData: {
      encode: (data: ContractData): Cell => {
        return beginCell()
          .storeUint(data.id, 32)
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
      decode: (cell: Cell): ContractData => {
        throw new Error('not implemented')
      },
    } as CellCodec<ContractData>,

    call: {
      encode: (call: Call): Cell => {
        return beginCell()
          .storeAddress(call.target)
          .storeCoins(call.value)
          .storeRef(call.data)
          .endCell()
      },
      decode: (cell: Cell): Call => {
        const stack = cell.beginParse()
        return {
          target: stack.loadAddress(),
          value: stack.loadCoins(),
          data: stack.loadRef(),
        }
      },
    } as CellCodec<Call>,

    operationBatch: {
      encode: (op: OperationBatch): Cell => {
        return beginCell()
          .storeRef(op.calls)
          .storeUint(op.predecessor, 256)
          .storeUint(op.salt, 256)
          .endCell()
      },
      decode: (cell: Cell): OperationBatch => {
        const s = cell.beginParse()
        return {
          calls: s.loadRef(),
          predecessor: s.loadUintBig(256),
          salt: s.loadUintBig(256),
        }
      },
    } as CellCodec<OperationBatch>,
  },
}

// TODO: keccak256 should be used as a default (compatibility with EVM contracts)
export const roles = {
  admin: sha256_32('ADMIN_ROLE'), // 2112602974n
  proposer: sha256_32('PROPOSER_ROLE'), // 2908596091n
  canceller: sha256_32('CANCELLER_ROLE'), // 973072761n
  executor: sha256_32('EXECUTOR_ROLE'), // 2599814779n
  bypasser: sha256_32('BYPASSER_ROLE'), // 544836961n
}

// Timestamp value used to mark an operation as done
export const DONE_TIMESTAMP = 1

export enum Errors {
  SelectorIsBlocked = 101,
  OperationNotReady = 102,
  OperationMissingDependency = 103,
  OperationCanNotBeCancelled = 104,
  OperationAlreadyScheduled = 105,
  InsufficientDelay = 106,
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
    const init = { code, data: builder.data.contractData.encode(data) }
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
    return this.sendInternal(provider, via, value, builder.message.init.encode(body))
  }

  async sendTopUp(provider: ContractProvider, via: Sender, value: bigint = 0n, body: TopUp) {
    return this.sendInternal(provider, via, value, builder.message.topUp.encode(body))
  }

  async sendScheduleBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ScheduleBatch,
  ) {
    return this.sendInternal(p, via, value, builder.message.scheduleBatch.encode(body))
  }

  async sendCancel(p: ContractProvider, via: Sender, value: bigint = 0n, body: Cancel) {
    return this.sendInternal(p, via, value, builder.message.cancel.encode(body))
  }

  async sendExecuteBatch(p: ContractProvider, via: Sender, value: bigint = 0n, body: ExecuteBatch) {
    return this.sendInternal(p, via, value, builder.message.executeBatch.encode(body))
  }

  async sendUpdateDelay(p: ContractProvider, via: Sender, value: bigint = 0n, body: UpdateDelay) {
    return this.sendInternal(p, via, value, builder.message.updateDelay.encode(body))
  }

  async sendBlockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BlockFunctionSelector,
  ) {
    return this.sendInternal(p, via, value, builder.message.blockFunctionSelector.encode(body))
  }

  async sendUnblockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: UnblockFunctionSelector,
  ) {
    return this.sendInternal(p, via, value, builder.message.unblockFunctionSelector.encode(body))
  }

  async sendBypasserExecuteBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BypasserExecuteBatch,
  ) {
    return this.sendInternal(p, via, value, builder.message.bypasserExecuteBatch.encode(body))
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
    return (
      p
        // Notice: to encode an `op: OperationBatch` struct,
        // members need to individually be encoded as arguments
        .get('hashOperationBatch', [
          {
            type: 'cell',
            cell: op.calls,
          },
          {
            type: 'int',
            value: op.predecessor,
          },
          {
            type: 'int',
            value: op.salt,
          },
        ])
        .then((r) => r.stack.readBigNumber())
    )
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
