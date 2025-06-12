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
}

export class Counter extends TypeAndVersion implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super(address, init)
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

  async getValue(provider: ContractProvider): Promise<number> {
    const result = await provider.get('value', [])
    return result.stack.readNumber()
  }

  async getId(provider: ContractProvider): Promise<number> {
    const result = await provider.get('id', [])
    return result.stack.readNumber()
  }
}
