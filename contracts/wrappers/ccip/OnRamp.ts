import {
  Address,
  Builder as TonBuilder,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import { asSnakeData } from '../../utils'

export type OnRampStorage = {
  ownable: ownable2step.Data
  chainSelector: bigint
  config: {
    feeQuoter: Address
    feeAggregator: Address
    allowlistAdmin: Address
  }
  destChainConfigs: Dictionary<bigint, Cell>
}

export type DestChainConfig = {
  router: Address
  sequenceNumber: number
  allowlistEnabled: boolean
  allowedSenders: Dictionary<Address, boolean>
}

export const Builder = {
  asStorage: (config: OnRampStorage): Cell => {
    return (
      beginCell()
        .storeAddress(config.ownable.owner)
        .storeMaybeBuilder(
          config.ownable.pendingOwner
            ? beginCell().storeAddress(config.ownable.pendingOwner)
            : null,
        )
        .storeUint(config.chainSelector, 64)
        // Cell<DynamicConfig>
        .storeRef(
          beginCell()
            .storeAddress(config.config.feeQuoter)
            .storeAddress(config.config.feeAggregator)
            .storeAddress(config.config.allowlistAdmin)
            .endCell(),
        )
        // UMap<> type
        .storeDict(config.destChainConfigs)
        .storeUint(64, 16) // keyLen
        .endCell()
    )
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static ccipSend = 0x00000001
  static setDynamicConfig = 0x10000003
  static updateDestChainConfigs = 0x10000004
}

export abstract class Errors {}

export class OnRamp implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new OnRamp(address)
  }

  static createFromConfig(config: OnRampStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
    const init = { code, data }
    return new OnRamp(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendSetDynamicConfig(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      config: boolean
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.setDynamicConfig, 32).endCell(),
    })
  }

  async sendUpdateDestChainConfigs(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      destChainConfigs: { destChainSelector: bigint; router: Address; allowlistEnabled: boolean }[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.updateDestChainConfigs, 32)
        .storeRef(
          asSnakeData(opts.destChainConfigs, (config) =>
            new TonBuilder()
              .storeUint(config.destChainSelector, 64)
              .storeAddress(config.router)
              .storeBit(config.allowlistEnabled),
          ),
        )
        .endCell(),
    })
  }
}
