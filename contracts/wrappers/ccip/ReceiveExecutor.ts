import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'

import { OCR3Base } from '../libraries/ocr/MultiOCR3Base'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as of from './OffRamp'

export const RECEIVE_EXECUTOR_CONTRACT_VERSION_PREV = '1.6.0'
export const RECEIVE_EXECUTOR_CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.ReceiveExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Errors {
  StateIsNotUntouched = 37600, // Facility ID * 100
  UpdatingStateOfNonExecutedMessage,
  NotificationFromInvalidReceiver,
  Unauthorized,
}

export enum MessageState {
  Untouched = 0,
  Execute,
  ExecuteFailed,
  Success,
}

export const opcodes = {
  in: {
    initExecute: 0x64cd2fd2,
    confirm: 0x00e5dd97,
    bounced: 0x05dee1bb,
  },
}

export type ReceiveExecutorStorage = {
  owner: Address
  message: of.Any2TVMRampMessage
  root: Address
  execId: bigint
  state: MessageState
  lastExecutionTimestamp: bigint
}

export type InitExecute = {
  gasOverride?: bigint
  root: Address
  sequenceNumber: bigint
  sourceChainSelector: bigint
  messageId: bigint
}

export type Confirm = {
  receiver: Address
}

export type Bounced = {
  receiver: Address
  reason: ReceiveExecutor_BouncedReason
}

export enum ReceiveExecutor_BouncedReason {
  NotEnoughGas = 0,
  BouncedFromReceiver,
  BouncedFromRouter,
}

export const builder = {
  data: {
    contractData: ((): CellCodec<ReceiveExecutorStorage> => {
      return {
        encode: function (data: ReceiveExecutorStorage): Builder {
          return beginCell()
            .storeAddress(data.owner)
            .storeRef(of.builder.data.any2TVMRampMessage.encode(data.message))
            .storeAddress(data.root)
            .storeUint(data.execId, 192)
            .storeUint(data.state, 2)
            .storeUint(data.lastExecutionTimestamp, 64)
        },
        load: function (src: Slice): ReceiveExecutorStorage {
          throw new Error('Function not implemented.')
        },
      }
    })(),
  },
  messages: {
    in: (() => {
      const initExecute: CellCodec<InitExecute> = {
        encode: function (data: InitExecute): Builder {
          return beginCell()
            .storeUint(opcodes.in.initExecute, 32)
            .storeMaybeCoins(data.gasOverride)
            .storeAddress(data.root)
            .storeUint(data.sequenceNumber, 64)
            .storeUint(data.sourceChainSelector, 64)
            .storeUint(data.messageId, 256)
        },
        load: function (src: Slice): InitExecute {
          src.skip(32) // opcode
          return {
            gasOverride: src.loadMaybeCoins() ?? undefined,
            root: src.loadAddress(),
            sequenceNumber: src.loadUintBig(64),
            sourceChainSelector: src.loadUintBig(64),
            messageId: src.loadUintBig(256),
          }
        },
      }
      const confirm: CellCodec<Confirm> = {
        encode: function (data: Confirm): Builder {
          return beginCell().storeUint(opcodes.in.confirm, 32).storeAddress(data.receiver)
        },
        load: function (src: Slice): Confirm {
          src.skip(32) // opcode
          return {
            receiver: src.loadAddress(),
          }
        },
      }
      const bounced: CellCodec<Bounced> = {
        encode: function (data: Bounced): Builder {
          return beginCell()
            .storeUint(opcodes.in.bounced, 32)
            .storeAddress(data.receiver)
            .storeUint(data.reason, 8)
        },
        load: function (src: Slice): Bounced {
          src.skip(32) // opcode
          return {
            receiver: src.loadAddress()!,
            reason: Number(src.loadUint(8)),
          }
        },
      }
      return {
        initExecute,
        confirm,
        bounced,
      }
    })(),
  },
}

export class ReceiveExecutor extends OCR3Base implements typeAndVersion.Interface, Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

  static createFromAddress(address: Address) {
    return new ReceiveExecutor(address)
  }

  static createFromConfig(config: ReceiveExecutorStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).endCell()
    const init = { code, data }
    return new ReceiveExecutor(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
      bounce: false,
    })
  }

  async sendInitExecute(provider: ContractProvider, via: Sender, value: bigint, body: InitExecute) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initExecute.encode(body).endCell(),
    })
  }

  async sendConfirm(provider: ContractProvider, via: Sender, value: bigint, body: Confirm) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.confirm.encode(body).endCell(),
    })
  }

  async sendBounced(provider: ContractProvider, via: Sender, value: bigint, body: Bounced) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.bounced.encode(body).endCell(),
      bounce: false,
    })
  }

  async getFacilityId(provider: ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }
  getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
  getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }
}
