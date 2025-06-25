import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'

import { Ownable2StepConfig } from "../libraries/access/Ownable2Step"

export type OnRampStorage = {
  ownable: Ownable2StepConfig,
  chainSelector: bigint,
  config: {
    feeQuoter: Address,
    feeAggregator: Address,
    allowlistAdmin: Address,
  },
  destChainConfigs: Dictionary<bigint, Cell>,
}

export type DestChainConfig = {
  router: Address,
  sequenceNumber: number,
  allowlistEnabled: boolean,
  allowedSenders: Dictionary<Address, boolean>,
}

export const Builder = {
  asStorage: (config: OnRampStorage): Cell => {
    let builder = beginCell()
      .storeAddress(config.ownable.owner)
    // TODO: use storeMaybeBuilder()
    if (config.ownable.pendingOwner) {
      builder
        .storeBit(1) // Store '1' to indicate the address is present
        .storeAddress(config.ownable.pendingOwner) // Then store the address
    } else {
      builder.storeBit(0) // Store '0' to indicate the address is absent
    }

    return builder
      .storeUint(config.chainSelector, 64)
       // Cell<DynamicConfig>
       .storeRef(
       beginCell()
         .storeAddress(config.config.feeQuoter)
         .storeAddress(config.config.feeAggregator)
         .storeAddress(config.config.allowlistAdmin)
         .endCell()
       )
      // Map<> type
        .storeDict(config.destChainConfigs)
        .storeUint(64, 16) // keyLen
      .endCell()
  },
}
export abstract class Params {
}

export abstract class Opcodes {
  static ccipSend = 0x00000001
}

export abstract class Errors {
}

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
}
