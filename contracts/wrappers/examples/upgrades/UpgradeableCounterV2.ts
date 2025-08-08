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
import * as ownable2step from '../../libraries/access/Ownable2Step'

export type CounterConfig = {
  id: number
  value: number
  ownable: ownable2step.Data
}

export function counterConfigToCell(config: CounterConfig): Cell {
  const builder = beginCell().storeUint(config.id, 32).storeUint(config.value, 32)

  ownable2step.storeOwnable2StepConfig(builder, config.ownable)
  return builder.endCell()
}

export const Opcodes = {
  OP_STEP: 0x00000001,
}

export class UpgradeableCounterV2 implements Contract, TypeAndVersion, Upgradeable {
  private typeAndVersion: TypeAndVersion
  private upgradeable: Upgradeable
  private ownable: ownable2step.ContractClient

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.typeAndVersion = new TypeAndVersion()
    this.upgradeable = new Upgradeable()
    this.ownable = new ownable2step.ContractClient(address)
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

  // Ownership methods
  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    const result = await provider.get('pendingOwner', [])
    return result.stack.readAddressOpt()
  }

  // TODO: remove this, no need to proxy ownership methods, just use the ownable2step client directly
  async sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ownable2step.TransferOwnership,
  ) {
    return this.ownable.sendTransferOwnership(p, via, value, body)
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ownable2step.AcceptOwnership,
  ) {
    return this.ownable.sendAcceptOwnership(p, via, value, body)
  }
}
