import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryValue,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'

import { CellCodec } from '../utils'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { compile } from '@ton/blueprint'
import * as or from './OnRamp'
import * as fq from './FeeQuoter'
import * as rt from './Router'

export const CCIP_SEND_EXECUTOR_CONTRACT_VERSION = '1.6.0'

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

export const builder = {
  message: {
    in: (() => {
      const execute: CellCodec<Execute> = {
        encode: (data: Execute): Builder => {
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

      return {
        execute,
        messageValidated: fq.builder.message.out.messageValidated,
        messageValidationFailed: fq.builder.message.out.messageValidationFailed,
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
  static messageValidated = fq.OutOpcodes.messageValidated
  static messageValidationFailed = fq.OutOpcodes.messageValidationFailed
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
