import * as c from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

import { contractCode } from '../codeLoader'
import { CellCodec } from '../utils'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as deployable from '../libraries/Deployable'
import { CCIPNamespace } from '../ccip/NameSpace'
import { Blockchain, SandboxContract } from '@ton/sandbox'
import { Encoder, Builder } from '../../src/utils/codec'

export const FACILITY_NAME = 'link.chain.ton.lib.Deployable'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Errors {
  ErrorNotOwner = 9200, // Facility ID * 100
}

export type DeployableStorage = {
  owner: c.Address
  id: c.Builder
}

export type Namespaced = {
  namespace: number
  id: c.Builder
}

type ContractState = {
  code: c.Cell
  data: c.Cell
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
  body: c.Cell
}

export const builder = {
  data: {
    contractData: ((): CellCodec<DeployableStorage> => {
      return {
        encode: (data: DeployableStorage): c.Builder => {
          return c.beginCell().storeAddress(data.owner).storeBuilder(data.id)
        },
        load: (src: c.Slice): DeployableStorage => {
          return { owner: src.loadAddress(), id: src.asBuilder() }
        },
      }
    })(),
    namespaced: ((): CellCodec<Namespaced> => {
      return {
        encode: (data: Namespaced): c.Builder => {
          return c.beginCell().storeUint(data.namespace, 32).storeBuilder(data.id)
        },
        load: (src: c.Slice): Namespaced => {
          return { namespace: src.loadUint(32), id: src.asBuilder() }
        },
      }
    })(),
  },
  messages: {
    in: {
      initialize: ((): CellCodec<Initialize> => {
        return {
          encode: (data: Initialize): c.Builder => {
            return c
              .beginCell()
              .storeUint(opcodes.in.initialize, 32)
              .storeRef(data.stateInit.code)
              .storeRef(data.stateInit.data)
          },
          load: (src: c.Slice): Initialize => {
            src.skip(32) // opcode
            return {
              stateInit: { code: src.loadRef(), data: src.loadRef() },
            }
          },
        }
      })(),
      initializeAndSend: ((): CellCodec<InitializeAndSend> => {
        return {
          encode: (data: InitializeAndSend): c.Builder => {
            return c
              .beginCell()
              .storeUint(opcodes.in.initializeAndSend, 32)
              .storeRef(data.stateInit.code)
              .storeRef(data.stateInit.data)
              .storeCoins(data.selfMessage.value)
              .storeRef(data.selfMessage.body)
          },
          load: (src: c.Slice): InitializeAndSend => {
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

export class ContractClient implements c.Contract {
  constructor(
    readonly address: c.Address,
    readonly init?: { code: c.Cell; data: c.Cell },
  ) {}

  static createFromAddress(address: c.Address) {
    return new ContractClient(address)
  }

  static createFromConfig(config: DeployableStorage, code: c.Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new ContractClient(c.contractAddress(workchain, init), init)
  }
  static code(): Promise<c.Cell> {
    return contractCode.ccip.local('Deployable')
  }

  getTypeAndVersion(provider: c.ContractProvider): Promise<[c.Slice, c.Slice]> {
    return typeAndVersion.getTypeAndVersion(provider)
  }

  getCode(provider: c.ContractProvider): Promise<c.Cell> {
    return typeAndVersion.getCode(provider)
  }

  getCodeHash(provider: c.ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }

  async getFacilityId(provider: c.ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: c.ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async sendInternal(
    provider: c.ContractProvider,
    via: c.Sender,
    args: {
      value: bigint | string
      bounce?: boolean
      sendMode?: c.SendMode
      body?: c.Cell | string
    },
  ) {
    await provider.internal(via, {
      sendMode: c.SendMode.PAY_GAS_SEPARATELY,
      ...args,
    })
  }

  async sendInitialize(
    provider: c.ContractProvider,
    via: c.Sender,
    value: bigint,
    msg: Initialize,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: c.SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initialize.encode(msg).asCell(),
    })
  }

  async sendInitializeAndSend(
    provider: c.ContractProvider,
    via: c.Sender,
    value: bigint,
    msg: InitializeAndSend,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: c.SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initializeAndSend.encode(msg).asCell(),
    })
  }
}

interface Wrapper<T> {
  fromAddress(address: c.Address): T
}

export async function Deploy<T extends c.Contract, S, D>(
  blockchain: Blockchain,
  deployer: c.Sender,
  value: bigint,
  namespace: CCIPNamespace,
  config: DeployableStorage,
  wrapper: Wrapper<T>,
  storage: S,
  encoder: Builder<S, D> & Encoder<D>,
  code: c.Cell,
): Promise<SandboxContract<T>> {
  const dep = blockchain.openContract(
    ContractClient.createFromConfig(
      {
        owner: config.owner,
        id: deployable.builder.data.namespaced.encode({
          namespace,
          id: config.id,
        }),
      },
      await contractCode.ccip.local('Deployable'),
    ),
  )
  {
    const result = await dep.sendInternal(deployer, {
      value: c.toNano('1'),
      bounce: false,
    })
    expect(result.transactions).toHaveTransaction({
      to: dep.address,
      deploy: true,
    })
  }
  {
    const b = c.beginCell()
    encoder.store(encoder.create(storage), b)
    const result = await dep.sendInitialize(blockchain.sender(config.owner), value, {
      stateInit: {
        code,
        data: b.endCell(),
      },
    })
    expect(result.transactions).toHaveTransaction({
      from: config.owner,
      to: dep.address,
      success: true,
    })
  }
  return blockchain.openContract(wrapper.fromAddress(dep.address))
}
