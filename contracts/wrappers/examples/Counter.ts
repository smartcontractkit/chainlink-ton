import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { TypeAndVersion } from '../libraries/TypeAndVersion'
import * as ownable2step from '../libraries/access/Ownable2Step'
import { CellCodec } from '../utils'

/// @dev Message to set the counter value.
export type SetCount = {
  // Query ID of the change owner request.
  queryId: bigint
  newCount: number
}

/// Message to increase the counter value.
export type IncreaseCount = {
  // Query ID of the change owner request.
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
  id: number // uint32
  value: number // uint32

  ownable: ownable2step.Data
}

export const builder = {
  message: {
    in: {
      // Creates a new `SetCount` message.
      setCount: {
        encode: (msg: SetCount): Cell => {
          return beginCell() // break line
            .storeUint(opcodes.in.SetCount, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.newCount, 32)
            .endCell()
        },
        decode: (cell: Cell): SetCount => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            newCount: s.loadUint(32),
          }
        },
      },
      // Creates a new `IncreaseCount` message.
      increaseCount: {
        encode: (msg: IncreaseCount): Cell => {
          return beginCell()
            .storeUint(opcodes.in.IncreaseCount, 32)
            .storeUint(msg.queryId, 64)
            .endCell()
        },
        decode: (cell: Cell): IncreaseCount => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
          }
        },
      },
    },
  },
  data: (() => {
    // Creates a new `Counter_Data` contract data cell
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Cell => {
        let _pendingOwnerMaybe = data.ownable.pendingOwner
          ? beginCell().storeAddress(data.ownable.pendingOwner)
          : null
        let ownable = beginCell()
          .storeAddress(data.ownable.owner)
          .storeMaybeBuilder(_pendingOwnerMaybe)
        return beginCell()
          .storeUint(data.id, 32)
          .storeUint(data.value, 32)
          .storeBuilder(ownable)
          .endCell()
      },
      decode: (cell: Cell): ContractData => {
        const s = cell.beginParse()
        const id = s.loadUintBig(32)
        const value = s.loadUintBig(32)
        return {
          id: s.loadUint(32),
          value: s.loadUint(32),
          ownable: {
            // TODO: use ownable2step decoder
            owner: s.loadAddress(),
            pendingOwner: s.loadMaybeAddress(),
          },
        }
      },
    }

    return {
      contractData,
    }
  })(),
}

export class ContractClient implements Contract, TypeAndVersion {
  private typeAndVersion: TypeAndVersion

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.typeAndVersion = new TypeAndVersion()
  }

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0): ContractClient {
    const init = { code, data: builder.data.contractData.encode(data) }
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
    const body = beginCell().endCell()
    await this.sendInternal(p, via, value, body)
  }

  async sendSetCount(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetCount) {
    return this.sendInternal(p, via, value, builder.message.in.setCount.encode(body))
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
    return this.typeAndVersion.getTypeAndVersion(provider)
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    return this.typeAndVersion.getCode(provider)
  }

  async getCodeHash(provider: ContractProvider): Promise<bigint> {
    return this.typeAndVersion.getCodeHash(provider)
  }
}
