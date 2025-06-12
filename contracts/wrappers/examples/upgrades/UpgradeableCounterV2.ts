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
import { Upgradeable } from '../../libraries/upgrades/Upgradeable'
import { compile } from '@ton/blueprint'

export type CounterConfig = {
  id: number
  value: number
}

export function counterConfigToCell(config: CounterConfig): Cell {
  return beginCell().storeUint(config.id, 32).storeUint(config.value, 32).endCell()
}

export const Opcodes = {
  OP_STEP: 0x00000001,
}

export class UpgradeableCounterV2 extends Upgradeable implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super(address, init)
  }

  static createFromAddress(address: Address) {
    return new UpgradeableCounterV2(address)
  }

  static code(): Promise<Cell> {
    return compile('examples.upgrades.UpgradeableCounterV2')
  }

  code(): Promise<Cell> {
    return compile('examples.upgrades.UpgradeableCounterV2')
  }

  static createFromConfig(config: CounterConfig, code: Cell, workchain = 0) {
    const data = counterConfigToCell(config)
    const init = { code, data }
    return new UpgradeableCounterV2(contractAddress(workchain, init), init)
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
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_STEP, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .endCell(),
    })
  }

  async getValue(provider: ContractProvider) {
    const result = await provider.get('value', [])
    return result.stack.readNumber()
  }

  async getTypeAndVersion(provider: ContractProvider): Promise<string> {
    const result = await provider.get('typeAndVersion', [])
    return result.stack.readString()
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    const result = await provider.get('code', [])
    return result.stack.readCell()
  }

  async getCodeHash(provider: ContractProvider): Promise<BigInt> {
    const result = await provider.get('codeHash', [])
    return result.stack.readBigNumber()
  }
}
