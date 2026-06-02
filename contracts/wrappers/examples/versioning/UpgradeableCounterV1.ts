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
import * as upgradeable from '../../libraries/versioning/Upgradeable'
import { contractCode } from '../../codeLoader'
import * as typeAndVersion from '../../libraries/versioning/TypeAndVersion'
import * as ownable2step from '../../libraries/access/Ownable2Step'
import { CellCodec } from '../../utils'

export const FACILITY_NAME = 'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter'
export const CONTRACT_VERSION = '1.0.0'

export type CounterConfig = {
  id: number
  value: number
  ownable: ownable2step.Data
}

export type Step = {
  queryId: bigint
}

export const opcodes = {
  Step: 0x00000001,
}

export const builder = {
  message: {
    in: {
      step: ((): CellCodec<Step> => {
        return {
          encode: (msg: Step): Builder => {
            return beginCell().storeUint(opcodes.Step, 32).storeUint(msg.queryId, 64)
          },
          load: (src: Slice): Step => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
            }
          },
        }
      })(),
      upgrade: upgradeable.builder.message.in.upgrade,
    },
  },
  data: {
    counterConfig: ((): CellCodec<CounterConfig> => {
      return {
        encode: (config: CounterConfig): Builder => {
          return beginCell()
            .storeUint(config.id, 32)
            .storeUint(config.value, 32)
            .storeBuilder(ownable2step.builder.data.traitData.encode(config.ownable))
        },
        load: (src: Slice): CounterConfig => {
          throw new Error('Not implemented')
        },
      }
    })(),
  },
}

export class ContractClient implements typeAndVersion.Interface, upgradeable.Interface {
  private ownable: ownable2step.ContractClient

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.ownable = new ownable2step.ContractClient(address)
  }

  static createFromAddress(address: Address) {
    return new ContractClient(address)
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('examples.versioning.upgrades.UpgradeableCounterV1')
  }

  static version() {
    return CONTRACT_VERSION
  }

  static type() {
    return FACILITY_NAME
  }

  static createFromConfig(config: CounterConfig, code: Cell, workchain = 0) {
    const data = builder.data.counterConfig.encode(config).endCell()
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendStep(provider: ContractProvider, via: Sender, value: bigint, body: Step) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.step.encode(body).endCell(),
    })
  }

  async getValue(provider: ContractProvider) {
    const result = await provider.get('value', [])
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

  // Delegate Upgradeable methods
  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: upgradeable.Upgrade,
  ) {
    await upgradeable.sendUpgrade(provider, via, value, body)
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
