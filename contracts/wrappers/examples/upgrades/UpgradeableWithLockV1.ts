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
import { TypeAndVersion } from '../../libraries/TypeAndVersion'

export type WithLockConfig = {
  id: number
}

export function withLockConfigToCell(config: WithLockConfig): Cell {
  return beginCell().storeUint(config.id, 32).storeBit(true).endCell()
}

export const Opcodes = {
  OP_SWITCH_LOCK: 0x00000001,
}

export class UpgradeableWithLockV1 implements TypeAndVersion, Upgradeable {
  private typeAndVersion: TypeAndVersion
  private upgradeable: Upgradeable

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.typeAndVersion = new TypeAndVersion()
    this.upgradeable = new Upgradeable()
  }

  static createFromAddress(address: Address) {
    return new UpgradeableWithLockV1(address)
  }

  static code(): Promise<Cell> {
    return compile('examples.upgrades.UpgradeableWithLockV1')
  }

  code(): Promise<Cell> {
    return compile('examples.upgrades.UpgradeableWithLockV1')
  }

  static createFromConfig(config: WithLockConfig, code: Cell, workchain = 0) {
    const data = withLockConfigToCell(config)
    const init = { code, data }
    return new UpgradeableWithLockV1(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendSwitchLock(
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
        .storeUint(Opcodes.OP_SWITCH_LOCK, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .endCell(),
    })
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

  // Delegate Upgradeable methods
  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      code: Cell
    },
  ) {
    await this.upgradeable.sendUpgrade(provider, via, opts)
  }
}
