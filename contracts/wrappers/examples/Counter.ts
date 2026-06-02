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
import { loadContractCode } from '../codeLoader'

import { CellCodec } from '../utils'
import * as ownable2step from '../libraries/access/Ownable2Step'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const CONTRACT_VERSION = '1.1.3'

/// @dev Message to set the counter value.
export type SetCount = {
  // Query ID of the change request.
  queryId: bigint
  newCount: number
}

/// Message to increase the counter value.
export type IncreaseCount = {
  // Query ID of the change request.
  queryId: bigint
}

export const opcodes = {
  in: {
    SetCount: 0x00000004,
    IncreaseCount: 0x10000005,
  },
  out: {},
}

export const EventTopics = {
  COUNT_SET_TOPIC: 0x1947b328, // crc32("CountSet")
  COUNT_INCREASED_TOPIC: 0x1947b328, // crc32("CountIncreased")
}

export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: bigint | number // uint32
  value: number // uint32

  ownable: ownable2step.Data
}

export const builder = {
  message: {
    in: (() => {
      // Creates a new `SetCount` message.
      const setCount: CellCodec<SetCount> = {
        encode: (msg: SetCount): Builder => {
          return beginCell() // break line
            .storeUint(opcodes.in.SetCount, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.newCount, 32)
        },
        load: (src: Slice): SetCount => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newCount: src.loadUint(32),
          }
        },
      }
      // Creates a new `IncreaseCount` message.
      const increaseCount: CellCodec<IncreaseCount> = {
        encode: (msg: IncreaseCount): Builder => {
          return beginCell().storeUint(opcodes.in.IncreaseCount, 32).storeUint(msg.queryId, 64)
        },
        load: (src: Slice): IncreaseCount => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      }

      return { setCount, increaseCount }
    })(),
  },
  data: (() => {
    // Creates a new `Counter_Data` contract data cell
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Builder => {
        return beginCell()
          .storeUint(data.id, 32)
          .storeUint(data.value, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
      },
      load: (src: Slice): ContractData => {
        const id = src.loadUintBig(32)
        const value = src.loadUintBig(32)
        return {
          id: src.loadUintBig(32),
          value: src.loadUint(32),
          ownable: {
            // TODO: use ownable2step decoder
            owner: src.loadAddress(),
            pendingOwner: src.loadMaybeAddress(),
          },
        }
      },
    }

    return {
      contractData,
    }
  })(),
}

export class ContractClient implements Contract, typeAndVersion.Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0): ContractClient {
    const init = { code, data: builder.data.contractData.encode(data).asCell() }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(p: ContractProvider, via: Sender, value: bigint): Promise<void> {
    const body = Cell.EMPTY
    await this.sendInternal(p, via, value, body)
  }

  async sendSetCount(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetCount) {
    return this.sendInternal(p, via, value, builder.message.in.setCount.encode(body).asCell())
  }

  async sendIncreaseCount(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      newCount: number
    },
  ): Promise<void> {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(opcodes.in.SetCount, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .endCell(),
    })
  }

  static code(): Promise<Cell> {
    return loadContractCode('examples.Counter')
  }

  async getValue(provider: ContractProvider): Promise<number> {
    const result = await provider.get('value', [])
    return result.stack.readNumber()
  }

  async getId(provider: ContractProvider): Promise<number> {
    const result = await provider.get('id', [])
    return result.stack.readNumber()
  }

  // Delegate TypeAndVersion methods
  async getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }

  async getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }
}
