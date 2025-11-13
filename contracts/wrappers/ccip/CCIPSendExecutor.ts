import {
  Address,
  Builder as TonBuilder,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryValue,
  Sender,
  SendMode,
  Builder,
  Slice,
} from '@ton/core'

import { CellCodec } from '../utils'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { compile } from '@ton/blueprint'
import * as or from './OnRamp'
import * as rt from './Router'

export const CCIP_SEND_EXECUTOR_CONTRACT_VERSION = '0.0.6'

export const CCIP_SEND_EXECUTOR_FACILITY_NAME = 'com.chainlink.ton.ccip.CCIPSendExecutor'
export const CCIP_SEND_EXECUTOR_FACILITY_ID = 436
export const CCIP_SEND_EXECUTOR_ERROR_CODE = 43600 //FACILITY_ID * 100

export enum Error {
  StateNotExpected = CCIP_SEND_EXECUTOR_ERROR_CODE,
  Unauthorized,
  InsufficientFunds,
  InsufficientFee,
  TokenTransfersNotSupported,
}

export type InitialData = {
  onramp: Address
  messageId: bigint
}

export type Config = {
  feeQuoter: Address
}

export type Execute = {
  onrampSend: or.OnRampSend
  config: Cell // Config
}

export type MessageValidated = {
  fee: bigint
  msg: rt.CCIPSend
  metadata: Cell
}

export type MessageValidationFailed = {
  error: bigint
  msg: rt.CCIPSend
  metadata: Cell
}

export const builder = {
  message: {
    in: (() => {
      const execute: CellCodec<Execute> = {
        encode: (data: Execute): TonBuilder => {
          return beginCell()
            .storeUint(Opcodes.execute, 32)
            .storeBuilder(or.builder.messages.in.onrampSend.encode(data.onrampSend))
            .storeRef(data.config)
        },
        load: (src: Slice): Execute => {
          src.skip(32) // opcode
          return {
            onrampSend: or.builder.messages.in.onrampSend.load(src),
            config: src.loadRef(),
          }
        },
      }

      const messageValidated: CellCodec<MessageValidated> = {
        encode: (data: MessageValidated): TonBuilder => {
          return beginCell()
            .storeUint(Opcodes.messageValidated, 32)
            .storeCoins(data.fee)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeRef(data.metadata)
        },
        load: (src: Slice): MessageValidated => {
          src.skip(32) // opcode
          return {
            fee: src.loadCoins(),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: src.loadRef(),
          }
        },
      }

      const messageValidationFailed: CellCodec<MessageValidationFailed> = {
        encode: (data: MessageValidationFailed): TonBuilder => {
          return beginCell()
            .storeUint(Opcodes.messageValidationFailed, 32)
            .storeUint(data.error, 256)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeRef(data.metadata)
        },
        load: (src: Slice): MessageValidationFailed => {
          src.skip(32) // opcode
          return {
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: src.loadRef(),
            error: src.loadUintBig(256),
          }
        },
      }

      return {
        execute,
        messageValidated,
        messageValidationFailed,
      }
    })(),
  },
  data: (() => {
    const contractData: CellCodec<InitialData> = {
      encode: (data: InitialData): Builder => {
        return beginCell().storeAddress(data.onramp).storeUint(data.messageId, 224)
      },
      load: (src: Slice): InitialData => {
        return {
          onramp: src.loadAddress(),
          messageId: src.loadUintBig(224),
        }
      },
    }

    return {
      contractData,
    }
  })(),
}
export abstract class Params {}

export abstract class Opcodes {
  static execute = 0xaf3c62b3
  static messageValidated = 0x1fa60374
  static messageValidationFailed = 0xbcf0ab0f
}

export class ContractClient implements typeAndVersion.Interface, Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new ContractClient(address)
  }

  static createFromConfig(config: InitialData, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
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
      body: beginCell().endCell(),
    })
  }

  // TODO : implement contract methods

  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }
  getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
  getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }

  static version() {
    return CCIP_SEND_EXECUTOR_CONTRACT_VERSION
  }

  static type() {
    return CCIP_SEND_EXECUTOR_FACILITY_NAME
  }

  static async code() {
    return await compile('CCIPSendExecutor')
  }
}
