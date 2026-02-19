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
import { errorCode, facilityId } from '../utils'

import { loadContractCode } from '../codeLoader'
import { CellCodec } from '../utils'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const FACILITY_NAME = 'link.chain.ton.lib.Deployable'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Errors {
  ErrorNotOwner = 9200, // Facility ID * 100
}

export type DeployableStorage = {
  owner: Address
  id: Builder
}

export type Namespaced = {
  namespace: number
  id: Builder
}

type ContractState = {
  code: Cell
  data: Cell
}

export type Initialize = {
  stateInit: ContractState
}

export type InitializeAndSend = {
  stateInit: ContractState
  selfMessage: Message
}

export type Message = {
  value: bigint
  body: Cell
}

export const builder = {
  data: {
    contractData: ((): CellCodec<DeployableStorage> => {
      return {
        encode: (data: DeployableStorage): Builder => {
          return beginCell().storeAddress(data.owner).storeBuilder(data.id)
        },
        load: (src: Slice): DeployableStorage => {
          return { owner: src.loadAddress(), id: src.asBuilder() }
        },
      }
    })(),
    namespaced: ((): CellCodec<Namespaced> => {
      return {
        encode: (data: Namespaced): Builder => {
          return beginCell().storeUint(data.namespace, 32).storeBuilder(data.id)
        },
        load: (src: Slice): Namespaced => {
          return { namespace: src.loadUint(32), id: src.asBuilder() }
        },
      }
    })(),
  },
  messages: {
    in: {
      initialize: ((): CellCodec<Initialize> => {
        return {
          encode: (data: Initialize): Builder => {
            return beginCell()
              .storeUint(opcodes.in.initialize, 32)
              .storeRef(data.stateInit.code)
              .storeRef(data.stateInit.data)
          },
          load: (src: Slice): Initialize => {
            src.skip(32) // opcode
            return {
              stateInit: { code: src.loadRef(), data: src.loadRef() },
            }
          },
        }
      })(),
      initializeAndSend: ((): CellCodec<InitializeAndSend> => {
        return {
          encode: (data: InitializeAndSend): Builder => {
            return beginCell()
              .storeUint(opcodes.in.initializeAndSend, 32)
              .storeRef(data.stateInit.code)
              .storeRef(data.stateInit.data)
              .storeCoins(data.selfMessage.value)
              .storeRef(data.selfMessage.body)
          },
          load: (src: Slice): InitializeAndSend => {
            src.skip(32) // opcode
            return {
              stateInit: {
                code: src.loadRef(),
                data: src.loadRef(),
              },
              selfMessage: {
                value: src.loadCoins(),
                body: src.loadRef(),
              },
            }
          },
        }
      })(),
    },
  },
}

export const opcodes = {
  in: {
    initialize: 0xba466447,
    initializeAndSend: 0xb0ec5157,
  },
}

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new ContractClient(address)
  }

  static createFromConfig(config: DeployableStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
  }
  static code(): Promise<Cell> {
    return loadContractCode('Deployable')
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

  async sendInternal(
    provider: ContractProvider,
    via: Sender,
    args: {
      value: bigint | string
      bounce?: boolean
      sendMode?: SendMode
      body?: Cell | string
    },
  ) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      ...args,
    })
  }

  async sendInitialize(provider: ContractProvider, via: Sender, value: bigint, msg: Initialize) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initialize.encode(msg).asCell(),
    })
  }

  async sendInitializeAndSend(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    msg: InitializeAndSend,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initializeAndSend.encode(msg).asCell(),
    })
  }
}
