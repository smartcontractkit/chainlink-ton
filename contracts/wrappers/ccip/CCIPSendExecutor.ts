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
import { contractCode } from '../codeLoader'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as or from './OnRamp'
import * as fq from './FeeQuoter'

export const CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.CCIPSendExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum error {
  StateNotExpected = 17800, // Facility ID * 100
  Unauthorized,
  InsufficientFunds,
  InsufficientFee,
  FeeQuoterBounce,
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
  // Null when the send carries no token transfers.
  tokenRegistry?: Address | null
}

export type State =
  | Initialized
  | OnGoingFeeValidation
  | TokenRegistryAccess
  | TokenTransfer
  | Finalized

export type Initialized = {
  kind: 'initialized'
}

export type OnGoingFeeValidation = {
  kind: 'on-going-fee-validation'
}

export type TokenRegistryAccess = {
  kind: 'token-registry-access'
  fee: fq.Fee
}

export type TokenTransfer = {
  kind: 'token-transfer'
  tokenPool: Address
  fee: fq.Fee
}

export type Finalized = {
  kind: 'finalized'
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
        return beginCell()
          .storeAddress(data.onramp)
          .storeAddress(data.feeQuoter)
          .storeAddress(data.tokenRegistry ?? null)
      },
      load: (src: Slice): Addresses => {
        return {
          onramp: src.loadAddress(),
          feeQuoter: src.loadAddress(),
          tokenRegistry: src.loadMaybeAddress(),
        }
      },
    }

    const state: CellCodec<State> = {
      encode: function (data: State): Builder {
        switch (data.kind) {
          case 'initialized':
            return beginCell().storeUint(0b000, 3).storeRef(beginCell().endCell())
          case 'on-going-fee-validation':
            return beginCell().storeUint(0b001, 3).storeRef(beginCell().endCell())
          case 'token-registry-access':
            return beginCell()
              .storeUint(0b010, 3)
              .storeRef(fq.builder.data.fee.encode(data.fee).endCell())
          case 'token-transfer':
            return beginCell()
              .storeUint(0b011, 3)
              .storeRef(
                beginCell()
                  .storeAddress(data.tokenPool)
                  .storeBuilder(fq.builder.data.fee.encode(data.fee))
                  .endCell(),
              )
          case 'finalized':
            return beginCell().storeUint(0b100, 3).storeRef(beginCell().endCell())
        }
      },
      load: function (src: Slice): State {
        const tag = src.loadUint(3)
        switch (tag) {
          case 0b000:
            src.loadRef()
            return { kind: 'initialized' }
          case 0b001:
            src.loadRef()
            return { kind: 'on-going-fee-validation' }
          case 0b010: {
            const feeSlice = src.loadRef().beginParse()
            return { kind: 'token-registry-access', fee: fq.builder.data.fee.load(feeSlice) }
          }
          case 0b011: {
            const inner = src.loadRef().beginParse()
            return {
              kind: 'token-transfer',
              tokenPool: inner.loadAddress(),
              fee: fq.builder.data.fee.load(inner),
            }
          }
          case 0b100:
            src.loadRef()
            return { kind: 'finalized' }
          default:
            throw new Error(`Unknown State tag: ${tag}`)
        }
      },
    }

    //TODO deprecate with TT
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
            .storeUint(opcodes.in.execute, 32)
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

export const opcodes = {
  in: {
    execute: 0xaf3c62b3,
    messageValidated: fq.opcodes.out.messageValidated,
    messageValidationFailed: fq.opcodes.out.messageValidationFailed,
    tokenRegistryReturnTokenInfo: 0xddccddb5,
    mockTokenPoolNotifySuccessfulLockOrBurn: 0x7adb20bb,
  },
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

  async sendExecute(
    provider: ContractProvider,
    via: Sender,
    value: bigint | string,
    body: Execute,
  ) {
    return provider.internal(via, {
      value,
      body: builder.message.in.execute.encode(body).asCell(),
    })
  }

  async sendMessageValidated(
    provider: ContractProvider,
    via: Sender,
    value: bigint | string,
    body: fq.MessageValidated,
  ) {
    return provider.internal(via, {
      value,
      body: fq.builder.message.out.messageValidated.encode(body).asCell(),
    })
  }

  async sendMessageValidationFailed(
    provider: ContractProvider,
    via: Sender,
    value: bigint | string,
    body: fq.MessageValidationFailed,
  ) {
    return provider.internal(via, {
      value,
      body: fq.builder.message.out.messageValidationFailed.encode(body).asCell(),
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

  static version() {
    return CONTRACT_VERSION
  }

  static type() {
    return FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('CCIPSendExecutor')
  }
}
