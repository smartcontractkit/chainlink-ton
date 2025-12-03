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

export enum error {
  StateNotExpected = CCIP_SEND_EXECUTOR_ERROR_CODE,
  Unauthorized,
  InsufficientFunds,
  InsufficientFee,
  TokenTransfersNotSupported,
}

export type InitialData = {
  onramp: Address
  id: bigint
}

export type Data = {
  id: bigint
  onrampSend: or.OnRampSend
  addresses: Addresses
  state: State
}

export type Addresses = {
  onramp: Address
  feeQuoter: Address
}

export type State = Initialized | OnGoingFeeValidation

export type Initialized = {
  kind: 'initialized'
}

export type OnGoingFeeValidation = {
  kind: 'on-going-fee-validation'
}

export type Config = {
  feeQuoter: Address
}

export type Execute = {
  onrampSend: or.OnRampSend
  config: Config
}

export const builder = (() => {
  const dataBuilder = (() => {
    const contractInitData: CellCodec<InitialData> = {
      encode: (data: InitialData): Builder => {
        return beginCell().storeAddress(data.onramp).storeUint(data.id, 224)
      },
      load: (src: Slice): InitialData => {
        return {
          onramp: src.loadAddress(),
          id: src.loadUintBig(224),
        }
      },
    }

    const addresses: CellCodec<Addresses> = {
      encode: (data: Addresses): Builder => {
        return beginCell().storeAddress(data.onramp).storeAddress(data.feeQuoter)
      },
      load: (src: Slice): Addresses => {
        return {
          onramp: src.loadAddress(),
          feeQuoter: src.loadAddress(),
        }
      },
    }

    const state: CellCodec<State> = {
      encode: function (data: State): Builder {
        switch (data.kind) {
          case 'initialized':
            return beginCell().storeUint(0, 1)
          case 'on-going-fee-validation':
            return beginCell().storeUint(1, 1)
        }
      },
      load: function (src: Slice): State {
        const kind = src.loadUint(1)
        switch (kind) {
          case 0:
            return { kind: 'initialized' }
          case 1:
            return { kind: 'on-going-fee-validation' }
          default:
            throw new Error(`Unknown State kind: ${kind}`)
        }
      },
    }

    const config: CellCodec<Config> = {
      encode: (data: Config): Builder => {
        return beginCell().storeAddress(data.feeQuoter)
      },
      load: (src: Slice): Config => {
        return {
          feeQuoter: src.loadAddress(),
        }
      },
    }

    const contractData: CellCodec<Data> = {
      encode: (data: Data): Builder => {
        let stateBuilder = beginCell()
          .storeUint(data.id, 224)
          .storeBuilder(or.builder.messages.in.onrampSend.encode(data.onrampSend))
          .storeBuilder(addresses.encode(data.addresses))
          .storeBuilder(state.encode(data.state))
        return stateBuilder
      },
      load: (src: Slice): Data => {
        return {
          id: src.loadUintBig(224),
          onrampSend: or.builder.messages.in.onrampSend.load(src),
          addresses: addresses.load(src),
          state: state.load(src),
        }
      },
    }

    return {
      contractInitData,
      contractData,
      state,
      config,
    }
  })()

  const message = {
    in: (() => {
      const execute: CellCodec<Execute> = {
        encode: (data: Execute): Builder => {
          return beginCell()
            .storeUint(Opcodes.execute, 32)
            .storeBuilder(or.builder.messages.in.onrampSend.encode(data.onrampSend))
            .storeRef(dataBuilder.config.encode(data.config).asCell())
        },
        load: (src: Slice): Execute => {
          src.skip(32) // opcode
          return {
            onrampSend: or.builder.messages.in.onrampSend.load(src),
            config: dataBuilder.config.load(src.loadRef().beginParse()),
          }
        },
      }

      return {
        execute,
        messageValidated: fq.builder.message.out.messageValidated,
        messageValidationFailed: fq.builder.message.out.messageValidationFailed,
      }
    })(),
  }

  return {
    data: dataBuilder,
    message,
  }
})()
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
    const data = builder.data.contractInitData.encode(config).asCell()
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
