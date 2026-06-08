// This contract is used to test version mismatch during upgrade
import {
  Address,
  beginCell,
  Builder,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import * as upgradeable from '../../libraries/versioning/Upgradeable'
import { contractCode } from '../../codeLoader'
import * as typeAndVersion from '../../libraries/versioning/TypeAndVersion'
import { CellCodec } from '../../utils'

export type Storage = {
  id: number
  version: string
}

export const builder = {
  message: {
    in: {
      upgrade: upgradeable.builder.message.in.upgrade,
    },
  },
  data: {
    counterConfig: ((): CellCodec<Storage> => {
      return {
        encode: (config: Storage): Builder => {
          return beginCell().storeUint(config.id, 32).storeStringTail(config.version)
        },
        load: (src: Slice): Storage => {
          return {
            id: src.loadUint(32),
            version: src.loadStringTail(),
          }
        },
      }
    })(),
  },
}

export class ContractClient implements /*typeAndVersion.TypeAndVersion,*/ upgradeable.Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new ContractClient(address)
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('examples.versioning.upgrades.WrongVersion')
  }

  static createFromConfig(config: Storage, code: Cell, workchain = 0) {
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

  // Delegate Upgradeable methods
  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: upgradeable.Upgrade,
  ) {
    await upgradeable.sendUpgrade(provider, via, value, body)
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
}
