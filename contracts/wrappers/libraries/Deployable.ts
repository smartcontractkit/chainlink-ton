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
import { CellCodec } from '../utils'

export type DeployableStorage = {
  owner: Address
  id: Builder
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
  },
  messages: {
    in: {
      initialize: ((): CellCodec<Initialize> => {
        return {
          encode: (data: Initialize): Builder => {
            return beginCell().storeRef(data.code).storeRef(data.data)
          },
          load: (src: Slice): Initialize => {
            return { code: src.loadRef(), data: src.loadRef() }
          },
        }
      })(),
    },
  },
}

export enum OpCodes {
  Initialize = 0xba466447,
}

export enum Errors {
  ErrorNotOwner = 0x1,
}

export type Initialize = {
  code: Cell
  data: Cell
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

  async sendInitialize(provider: ContractProvider, via: Sender, value: bigint, msg: Initialize) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.initialize.encode(msg).asCell(),
    })
  }
}
