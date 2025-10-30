import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec, sha256_32 } from '../utils'
import { keccak256 } from '@ethersproject/keccak256'
import { asSnakeData, fromSnakeData, uint8ArrayToBigInt } from '../../src/utils'

// Initializes the contract
export type Init = {
  // Query ID of the change request.
  queryId: bigint

  // Minimum delay in seconds for future operations.
  minDelay: bigint

  // Address of the admin account.
  admin: Address

  // Collection of addresses to be granted proposer, executor, canceller and bypasser roles.
  proposers: Address[]
  executors: Address[]
  cancellers: Address[]
  bypassers: Address[]

  // Flag to enable/disable the executor role check (if disabled, anyone can execute)
  executorRoleCheckEnabled: boolean
  // The timeout required to finalize the currently executing op
  opFinalizationTimeout: bigint
}

// Schedule an operation containing a batch of transactions.
export type ScheduleBatch = {
  // Query ID of the change request.
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

// Cancel an operation.
export type Cancel = {
  // Query ID of the change request.
  queryId: bigint

  // ID of the operation to cancel.
  id: bigint
}

// Execute an (ready) operation containing a batch of transactions.
export type ExecuteBatch = {
  // Query ID of the change request.
  queryId: bigint

  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
  // Predecessor operation ID
  predecessor: bigint
  // Salt used to derive the operation ID
  salt: bigint
}

// Changes the minimum timelock duration for future operations.
export type UpdateDelay = {
  // Query ID of the change request.
  queryId: bigint

  // New minimum delay in seconds for future operations.
  newDelay: number
}

/// Changes the timeout required to finalize the currently executing op
export type UpdateOpFinalizationTimeout = {
  // Query ID of the change request.
  queryId: bigint

  // The timeout required to finalize the currently executing op
  newOpFinalizationTimeout: number
}

// Blocks a function selector from being used
export type BlockFunctionSelector = {
  // Query ID of the change request.
  queryId: bigint

  // Function selector to block.
  selector: number
}

// Unblocks a previously blocked function selector so it can be used again.
export type UnblockFunctionSelector = {
  /// Query ID of the change request.
  queryId: bigint

  /// Function selector to unblock.
  selector: number
}

// @dev Directly execute a batch of transactions, bypassing any other checks.
export type BypasserExecuteBatch = {
  // Query ID of the change request.
  queryId: bigint

  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
}

// Updates the executor role check (enabled/disabled) which guards the execution of operations.
export type UpdateExecutorRoleCheck = {
  // Query ID of the change request.
  queryId: bigint

  // Flag to enable/disable the executor role check (if disabled, anyone can execute)
  enabled: boolean
}

// Submit an oracle error report, which marks an operation in error state.
//
// The error report is used for a category of errors which might occur during execution
// of an operation, but can't be caught on-chain (OOG errors, and downstream tx-trace errors).
//
// struct (0xf4538b79) Timelock_SubmitErrorReport {
export type SubmitErrorReport = {
  // Query ID of the change request.
  queryId: bigint

  // The operation which produced the error (used to re-derive the op id).
  opBatch: OperationBatch // Cell<OperationBatch>
  // The hash of the execute transaction.
  opTxHash: bigint

  /// The hash of the transaction which errored (part of the tx trace).
  errorTxHash: bigint
  /// The error code.
  errorCode: number
}

// Union of all (input) messages.
export type InMessage =
  | Init
  | ScheduleBatch
  | Cancel
  | ExecuteBatch
  | UpdateDelay
  | BlockFunctionSelector
  | UnblockFunctionSelector
  | BypasserExecuteBatch
  | UpdateExecutorRoleCheck
  | SubmitErrorReport

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

  // Flag to enable/disable the executor role check (if disabled, anyone can execute)
  executorRoleCheckEnabled: boolean
  // Information about the currently pending operation.
  opPendingInfo: OpPendingInfo

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

/// Batch of transactions represented as a operation, which can be scheduled and executed.
export type OperationBatch = {
  // Array of calls to be scheduled
  calls: Cell // vec<Timelock_Call>
  // Predecessor operation ID
  predecessor: bigint
  // Salt used to derive the operation ID
  salt: bigint
}

/// Information about the currently pending operation.
///
/// @dev TON-specific additional data required to support reliable execution in the async environment.
export type OpPendingInfo = {
  /// The time at which the scheduled ops becomes valid to execute [executionTime(opCount -
  /// At this time the previous executed operation is considered optimistically final and successful,
  /// meaning no bounce was received and we can continue executing.
  validAfter: number
  /// The timeout required to finalize the currently executing op
  opFinalizationTimeout: bigint
  /// The id of the currently pending operation (OperationBatch hash)
  opPendingId: bigint
}

export type ExecuteData = {
  tonValue: bigint
  predecessor: bigint
  salt: bigint
  targetAccount: Address
  msgToSend: Cell
}

// Events

export type CallScheduled = {
  queryId: number
  id: bigint
  index: number
  call: Cell
  predecessor: bigint
  salt: bigint
  delay: number
}

export type CallExecuted = {
  queryId: number
  id: bigint
  index: number
  target: Address
  value: bigint
  data: Cell
}

export type BypasserCallExecuted = {
  queryId: number
  index: number
  target: Address
  value: bigint
  data: Cell
}

export type Canceled = {
  queryId: number
  id: bigint
}

export type MinDelayChange = {
  queryId: number
  oldDelay: number
  newDelay: number
}

export type FunctionSelectorBlocked = {
  queryId: number
  selector: number
}

export type FunctionSelectorUnblocked = {
  queryId: number
  selector: number
}

export const opcodes = {
  in: {
    Init: crc32('Timelock_Init'),
    ScheduleBatch: crc32('Timelock_ScheduleBatch'),
    Cancel: crc32('Timelock_Cancel'),
    ExecuteBatch: crc32('Timelock_ExecuteBatch'),
    UpdateDelay: crc32('Timelock_UpdateDelay'),
    BlockFunctionSelector: crc32('Timelock_BlockFunctionSelector'),
    UnblockFunctionSelector: crc32('Timelock_UnblockFunctionSelector'),
    BypasserExecuteBatch: crc32('Timelock_BypasserExecuteBatch'),
    UpdateExecutorRoleCheck: crc32('Timelock_UpdateExecutorRoleCheck'),
    SubmitErrorReport: crc32('Timelock_SubmitErrorReport'),
    UpdateOpFinalizationTimeout: crc32('Timelock_UpdateOpFinalizationTimeout'),
  },
  out: {
    BatchScheduled: crc32('Timelock_BatchScheduled'),
    CallScheduled: crc32('Timelock_CallScheduled'),
    BatchExecuted: crc32('Timelock_BatchExecuted'),
    CallExecuted: crc32('Timelock_CallExecuted'),
    BypasserBatchExecuted: crc32('Timelock_BypasserBatchExecuted'),
    BypasserCallExecuted: crc32('Timelock_BypasserCallExecuted'),
    Canceled: crc32('Timelock_Canceled'),
    MinDelayChange: crc32('Timelock_MinDelayChange'),
    FunctionSelectorBlocked: crc32('Timelock_FunctionSelectorBlocked'),
    FunctionSelectorUnblocked: crc32('Timelock_FunctionSelectorUnblocked'),
    ExecutorRoleCheckUpdated: crc32('Timelock_ExecutorRoleCheckUpdated'),
    ErrorReportSubmitted: crc32('Timelock_ErrorReportSubmitted'),
    OpFinalizationTimeoutChange: crc32('Timelock_OpFinalizationTimeoutChange'),
  },
}

// extracted to use in closure
const operationBatch: CellCodec<OperationBatch> = {
  encode: (op: OperationBatch): Builder => {
    return beginCell() // break
      .storeRef(op.calls)
      .storeUint(op.predecessor, 256)
      .storeUint(op.salt, 256)
  },
  load: (src: Slice): OperationBatch => {
    return {
      calls: src.loadRef(),
      predecessor: src.loadUintBig(256),
      salt: src.loadUintBig(256),
    }
  },
}

export const builder = {
  message: {
    in: (() => {
      const init: CellCodec<Init> = {
        encode: (msg: Init): Builder => {
          return beginCell()
            .storeUint(opcodes.in.Init, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.minDelay, 64)
            .storeAddress(msg.admin)
            .storeRef(asSnakeData<Address>(msg.proposers, (a) => beginCell().storeAddress(a)))
            .storeRef(asSnakeData<Address>(msg.executors, (a) => beginCell().storeAddress(a)))
            .storeRef(asSnakeData<Address>(msg.cancellers, (a) => beginCell().storeAddress(a)))
            .storeRef(asSnakeData<Address>(msg.bypassers, (a) => beginCell().storeAddress(a)))
            .storeBit(msg.executorRoleCheckEnabled)
            .storeUint(msg.opFinalizationTimeout, 64)
        },
        load: (src: Slice): Init => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            minDelay: src.loadUintBig(64),
            admin: src.loadAddress(),
            proposers: fromSnakeData<Address>(src.loadRef(), (s) => s.loadAddress()),
            executors: fromSnakeData<Address>(src.loadRef(), (s) => s.loadAddress()),
            cancellers: fromSnakeData<Address>(src.loadRef(), (s) => s.loadAddress()),
            bypassers: fromSnakeData<Address>(src.loadRef(), (s) => s.loadAddress()),
            executorRoleCheckEnabled: src.loadBit(),
            opFinalizationTimeout: src.loadUintBig(64),
          }
        },
      }

      const scheduleBatch: CellCodec<ScheduleBatch> = {
        encode: (msg: ScheduleBatch): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ScheduleBatch, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.calls)
            .storeUint(msg.predecessor, 256)
            .storeUint(msg.salt, 256)
            .storeUint(msg.delay, 64)
        },
        load: (src: Slice): ScheduleBatch => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            calls: src.loadRef(),
            predecessor: src.loadUintBig(256),
            salt: src.loadUintBig(256),
            delay: src.loadUintBig(64),
          }
        },
      }

      const cancel: CellCodec<Cancel> = {
        encode: (msg: Cancel): Builder => {
          return beginCell()
            .storeUint(opcodes.in.Cancel, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.id, 256)
        },
        load: (src: Slice): Cancel => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            id: src.loadUintBig(256),
          }
        },
      }

      const executeBatch: CellCodec<ExecuteBatch> = {
        encode: (msg: ExecuteBatch): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ExecuteBatch, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.calls)
            .storeUint(msg.predecessor, 256)
            .storeUint(msg.salt, 256)
        },
        load: (src: Slice): ExecuteBatch => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            calls: src.loadRef(),
            predecessor: src.loadUintBig(256),
            salt: src.loadUintBig(256),
          }
        },
      }

      const updateDelay: CellCodec<UpdateDelay> = {
        encode: (msg: UpdateDelay): Builder => {
          return beginCell()
            .storeUint(opcodes.in.UpdateDelay, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.newDelay, 64)
        },
        load: (src: Slice): UpdateDelay => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newDelay: -1, // TODO: decode delay properly (number vs bigint mismatch)
            // newDelay: src.loadUintBig(64),
          }
        },
      }

      const updateOpFinalizationTimeout: CellCodec<UpdateOpFinalizationTimeout> = {
        encode: (msg: UpdateOpFinalizationTimeout): Builder => {
          return beginCell()
            .storeUint(opcodes.in.UpdateOpFinalizationTimeout, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.newOpFinalizationTimeout, 64)
        },
        load: (src: Slice): UpdateOpFinalizationTimeout => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newOpFinalizationTimeout: -1, // TODO: decode delay properly (number vs bigint mismatch)
            // newOpFinalizationTimeout: src.loadUintBig(64),
          }
        },
      }

      const blockFunctionSelector: CellCodec<BlockFunctionSelector> = {
        encode: (msg: BlockFunctionSelector): Builder => {
          return beginCell()
            .storeUint(opcodes.in.BlockFunctionSelector, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.selector, 32)
        },
        load: (src: Slice): BlockFunctionSelector => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            selector: src.loadUint(32),
          }
        },
      }

      const unblockFunctionSelector: CellCodec<UnblockFunctionSelector> = {
        encode: (msg: UnblockFunctionSelector): Builder => {
          return beginCell()
            .storeUint(opcodes.in.UnblockFunctionSelector, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.selector, 32)
        },
        load: (src: Slice): UnblockFunctionSelector => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            selector: src.loadUint(32),
          }
        },
      }

      const bypasserExecuteBatch: CellCodec<BypasserExecuteBatch> = {
        encode: (msg: BypasserExecuteBatch): Builder => {
          return beginCell()
            .storeUint(opcodes.in.BypasserExecuteBatch, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.calls)
        },
        load: (src: Slice): BypasserExecuteBatch => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            calls: src.loadRef(),
          }
        },
      }

      const updateExecutorRoleCheck: CellCodec<UpdateExecutorRoleCheck> = {
        encode: (msg: UpdateExecutorRoleCheck): Builder => {
          return beginCell()
            .storeUint(opcodes.in.UpdateExecutorRoleCheck, 32)
            .storeUint(msg.queryId, 64)
            .storeBit(msg.enabled)
        },
        load: (s: Slice): UpdateExecutorRoleCheck => {
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            enabled: s.loadBit(),
          }
        },
      }

      const submitErrorReport: CellCodec<SubmitErrorReport> = {
        encode: (msg: SubmitErrorReport): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SubmitErrorReport, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(operationBatch.encode(msg.opBatch).asCell())
            .storeUint(msg.opTxHash, 256)
            .storeUint(msg.errorTxHash, 256)
            .storeUint(msg.errorCode, 32)
        },
        load: (s: Slice): SubmitErrorReport => {
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            opBatch: operationBatch.load(s.loadRef().asSlice()),
            opTxHash: s.loadUintBig(256),
            errorTxHash: s.loadUintBig(256),
            errorCode: s.loadUint(32),
          }
        },
      }

      return {
        init,
        scheduleBatch,
        cancel,
        executeBatch,
        updateDelay,
        updateOpFinalizationTimeout,
        blockFunctionSelector,
        unblockFunctionSelector,
        bypasserExecuteBatch,
        updateExecutorRoleCheck,
        submitErrorReport,
      }
    })(),
    out: (() => {
      const callScheduled: CellCodec<CallScheduled> = {
        encode: (event: CallScheduled): Builder => {
          return beginCell()
            .storeUint(opcodes.out.CallScheduled, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.id, 256)
            .storeUint(event.index, 64)
            .storeRef(event.call)
            .storeUint(event.predecessor, 256)
            .storeUint(event.salt, 256)
            .storeUint(event.delay, 64)
        },
        load: (src: Slice): CallScheduled => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            id: src.loadUintBig(256),
            index: src.loadUint(64),
            call: src.loadRef(),
            predecessor: src.loadUintBig(256),
            salt: src.loadUintBig(256),
            delay: src.loadUint(64),
          }
        },
      }
      const callExecuted: CellCodec<CallExecuted> = {
        encode: (event: CallExecuted): Builder => {
          return beginCell()
            .storeUint(opcodes.out.CallExecuted, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.id, 256)
            .storeUint(event.index, 64)
            .storeAddress(event.target)
            .storeCoins(event.value)
            .storeRef(event.data)
        },
        load: (src: Slice): CallExecuted => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            id: src.loadUintBig(256),
            index: src.loadUint(64),
            target: src.loadAddress(),
            value: src.loadCoins(),
            data: src.loadRef(),
          }
        },
      }
      const bypasserCallExecuted: CellCodec<BypasserCallExecuted> = {
        encode: (event: BypasserCallExecuted): Builder => {
          return beginCell()
            .storeUint(opcodes.out.BypasserCallExecuted, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.index, 64)
            .storeAddress(event.target)
            .storeCoins(event.value)
            .storeRef(event.data)
        },
        load: (src: Slice): BypasserCallExecuted => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            index: src.loadUint(64),
            target: src.loadAddress(),
            value: src.loadCoins(),
            data: src.loadRef(),
          }
        },
      }
      const canceled: CellCodec<Canceled> = {
        encode: (event: Canceled): Builder => {
          return beginCell()
            .storeUint(opcodes.out.Canceled, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.id, 256)
        },
        load: (src: Slice): Canceled => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            id: src.loadUintBig(256),
          }
        },
      }
      const minDelayChange: CellCodec<MinDelayChange> = {
        encode: (event: MinDelayChange): Builder => {
          return beginCell()
            .storeUint(opcodes.out.MinDelayChange, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.oldDelay, 64)
            .storeUint(event.newDelay, 64)
        },
        load: (src: Slice): MinDelayChange => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            oldDelay: src.loadUint(64),
            newDelay: src.loadUint(64),
          }
        },
      }
      const functionSelectorBlocked: CellCodec<FunctionSelectorBlocked> = {
        encode: (event: FunctionSelectorBlocked): Builder => {
          return beginCell()
            .storeUint(opcodes.out.FunctionSelectorBlocked, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.selector, 32)
        },
        load: (src: Slice): FunctionSelectorBlocked => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            selector: src.loadUint(32),
          }
        },
      }
      const functionSelectorUnblocked: CellCodec<FunctionSelectorUnblocked> = {
        encode: (event: FunctionSelectorUnblocked): Builder => {
          return beginCell()
            .storeUint(opcodes.out.FunctionSelectorUnblocked, 32)
            .storeUint(event.queryId, 64)
            .storeUint(event.selector, 32)
        },
        load: (src: Slice): FunctionSelectorUnblocked => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUint(64),
            selector: src.loadUint(32),
          }
        },
      }

      return {
        callScheduled,
        callExecuted,
        bypasserCallExecuted,
        canceled,
        minDelayChange,
        functionSelectorBlocked,
        functionSelectorUnblocked,
      }
    })(),
  },
  data: (() => {
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Builder => {
        return beginCell()
          .storeUint(data.id, 32)
          .storeUint(data.minDelay, 64)
          .storeDict(data.timestamps)
          .storeUint(data.blockedFnSelectorsLen || 0, 32) // blocked_fn_selectors_len
          .storeDict(
            data.blockedFnSelectors ||
              Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Buffer(0)),
          )
          .storeBit(data.executorRoleCheckEnabled)
          .storeUint(data.opPendingInfo.validAfter, 32)
          .storeUint(data.opPendingInfo.opFinalizationTimeout, 64)
          .storeUint(data.opPendingInfo.opPendingId, 256)
          .storeRef(data.rbac)
      },
      load: (src: Slice): ContractData => {
        throw new globalThis.Error('not implemented')
      },
    }
    const call: CellCodec<Call> = {
      encode: (call: Call): Builder => {
        return beginCell().storeAddress(call.target).storeCoins(call.value).storeRef(call.data)
      },
      load: (src: Slice): Call => {
        return {
          target: src.loadAddress(),
          value: src.loadCoins(),
          data: src.loadRef(),
        }
      },
    }

    return {
      contractData,
      call,
      operationBatch,
    }
  })(),
}

// Compute the role ID for a given role name as keccak256(<role>)
export const computeRoleID = (role: string): bigint => {
  const hash = keccak256(new Uint8Array(Buffer.from(role)))
  const bytes = Buffer.from(hash.slice(2), 'hex')
  return uint8ArrayToBigInt(bytes)
}

// Notice: uses keccak256 (compatibility with EVM contracts)
export const roles = {
  // 0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775
  admin: computeRoleID('ADMIN_ROLE'),
  // 0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1
  proposer: computeRoleID('PROPOSER_ROLE'),
  // 0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783
  canceller: computeRoleID('CANCELLER_ROLE'),
  // 0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63
  executor: computeRoleID('EXECUTOR_ROLE'),
  // 0xa1b2b8005de234c4b8ce8cd0be058239056e0d54f6097825b5117101469d5a8d
  bypasser: computeRoleID('BYPASSER_ROLE'),
  // 0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1
  oracle: computeRoleID('ORACLE_ROLE'),
}

export const topics = {
  BypasserCallExecuted: crc32('Timelock_BypasserCallExecuted'),
  CallScheduled: crc32('Timelock_CallScheduled'),
  CallExecuted: crc32('Timelock_CallExecuted'),
}

// Timestamp value used to mark an operation as done
export const DONE_TIMESTAMP = 1n
// Timestamp value used to mark an operation as error
export const ERROR_TIMESTAMP = 2n

export enum Error {
  SelectorIsBlocked = 19300,
  OperationNotReady,
  OperationMissingDependency,
  OperationCanNotBeCancelled,
  OperationAlreadyScheduled,
  InsufficientDelay,
  /// Thrown when trying to execute a pending operation while another pending operation is not yet final
  PendingOperationNotFinal,
  /// Thrown when the provided op.value is insufficient (min required value not met).
  InsufficientValue,
  /// Thrown when trying to submit an error report for an operation that is not done.
  OperationNotDone,
  /// Thrown when trying to initialize the contract more than once.
  ContractAlreadyInitialized,
  /// Thrown when trying to call a function on an uninitialized contract.
  ContractNotInitialized,
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
    const init = { code, data: builder.data.contractData.encode(data).asCell() }
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
    return this.sendInternal(provider, via, value, builder.message.in.init.encode(body).asCell())
  }

  async sendScheduleBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ScheduleBatch,
  ) {
    return this.sendInternal(p, via, value, builder.message.in.scheduleBatch.encode(body).asCell())
  }

  async sendCancel(p: ContractProvider, via: Sender, value: bigint = 0n, body: Cancel) {
    return this.sendInternal(p, via, value, builder.message.in.cancel.encode(body).asCell())
  }

  async sendExecuteBatch(p: ContractProvider, via: Sender, value: bigint = 0n, body: ExecuteBatch) {
    return this.sendInternal(p, via, value, builder.message.in.executeBatch.encode(body).asCell())
  }

  async sendUpdateDelay(p: ContractProvider, via: Sender, value: bigint = 0n, body: UpdateDelay) {
    return this.sendInternal(p, via, value, builder.message.in.updateDelay.encode(body).asCell())
  }

  async sendBlockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BlockFunctionSelector,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.blockFunctionSelector.encode(body).asCell(),
    )
  }

  async sendUnblockFunctionSelector(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: UnblockFunctionSelector,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.unblockFunctionSelector.encode(body).asCell(),
    )
  }

  async sendBypasserExecuteBatch(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: BypasserExecuteBatch,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.bypasserExecuteBatch.encode(body).asCell(),
    )
  }

  // --- Getters ---

  async getTypeAndVersion(p: ContractProvider): Promise<[string, string]> {
    const r = await p.get('typeAndVersion', [])
    const type = r.stack.readString()
    const version = r.stack.readString()
    return [type, version]
  }

  async getId(p: ContractProvider): Promise<number> {
    return p.get('getId', []).then((r) => r.stack.readNumber())
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

  async isOperationError(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isOperationError', [
        {
          type: 'int',
          value: id,
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async isPendingOperationFinal(p: ContractProvider, id: bigint): Promise<boolean> {
    return p
      .get('isPendingOperationFinal', [
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

  async isExecutorRoleCheckEnabled(p: ContractProvider): Promise<boolean> {
    return p.get('isExecutorRoleCheckEnabled', []).then((r) => r.stack.readBoolean())
  }

  async getOpPendingInfo(p: ContractProvider): Promise<OpPendingInfo> {
    return p // break line
      .get('getOpPendingInfo', [])
      .then((result) => ({
        validAfter: result.stack.readNumber(),
        opFinalizationTimeout: result.stack.readBigNumber(),
        opPendingId: result.stack.readBigNumber(),
      }))
  }
}
