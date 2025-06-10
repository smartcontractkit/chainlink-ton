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

export type CounterConfig = {
  id: number
  value: number
}

export function counterConfigToCell(config: CounterConfig): Cell {
  return beginCell().storeUint(config.id, 32).storeUint(config.value, 32).endCell()
}

export const Opcodes = {
  OP_STEP: 0x1,
  OP_UPGRADE: 0xa,
}

export class UpgradeableCounterV1 implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new UpgradeableCounterV1(address)
  }

  static createFromConfig(config: CounterConfig, code: Cell, workchain = 0) {
    const data = counterConfigToCell(config)
    const init = { code, data }
    return new UpgradeableCounterV1(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendStep(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
    },
  ) {
    console.log('sendStep')
    let body = beginCell()
      .storeUint(Opcodes.OP_STEP, 32)
      .storeUint(opts.queryId ?? 0, 64)
      .endCell()
    console.log('body', body.asSlice())
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    })
  }

  async getValue(provider: ContractProvider) {
    const result = await provider.get('value', [])
    return result.stack.readNumber()
  }
}
