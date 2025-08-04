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

export type CounterConfig = {
  id: number
  value: number
}

export function counterConfigToCell(config: CounterConfig): Cell {
  return beginCell().storeUint(config.id, 32).storeUint(config.value, 32).endCell()
}

export const Opcodes = {
  OP_SET_COUNT: 0x00000004,
  OP_INCREASE_COUNT: 0x10000005,
}

export const EventTopics = {
  COUNT_SET_TOPIC: 0x1947b328, // crc32("CountSet")
  COUNT_INCREASED_TOPIC: 0x1947b328, // crc32("CountIncreased")
}

export class Counter implements Contract, TypeAndVersion {
  private typeAndVersion: TypeAndVersion

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.typeAndVersion = new TypeAndVersion()
  }

  static createFromAddress(address: Address): Counter {
    return new Counter(address)
  }

  static createFromConfig(config: CounterConfig, code: Cell, workchain = 0): Counter {
    const data = counterConfigToCell(config)
    const init = { code, data }
    return new Counter(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendSetCount(
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
        .storeUint(Opcodes.OP_SET_COUNT, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .storeUint(opts.newCount, 32)
        .endCell(),
    })
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
        .storeUint(Opcodes.OP_SET_COUNT, 32)
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
