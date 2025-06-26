import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryValue,
  Sender,
  SendMode,
} from '@ton/core'

import { Ownable2StepConfig } from "../libraries/access/Ownable2Step"

export type FeeQuoterStorage = {
  ownable: Ownable2StepConfig,
  maxFeeJuelsPerMsg: bigint,
  linkToken: Address,
  tokenPriceStalenessThreshold: bigint,
  usdPerToken: Dictionary<Address, TimestampedPrice>,
  premiumMultiplierWeiPerEth: Dictionary<Address, bigint>,
}

export type TimestampedPrice = {
  value: bigint,
  timestamp: bigint,
}

export function createTimestampedPriceValue(): DictionaryValue<TimestampedPrice> {
    return {
        serialize: (src, builder) => {
            builder
              .storeUint(src.value, 224)
              .storeUint(src.timestamp, 64);
        },
        parse: (src): TimestampedPrice => {
            return {
              value: src.loadUintBig(224),
              timestamp: src.loadUintBig(64),
            }
        }
    }
}
export const Builder = {
  asStorage: (config: FeeQuoterStorage): Cell => {
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
      .storeUint(config.maxFeeJuelsPerMsg, 96)
      .storeAddress(config.linkToken)
      .storeUint(config.tokenPriceStalenessThreshold, 64)
      // Map<> type
        .storeDict(config.usdPerToken)
        .storeUint(64, 16) // keyLen
      // Map<> type
        .storeDict(config.premiumMultiplierWeiPerEth)
        .storeUint(64, 16) // keyLen
      .endCell()
  },
}
export abstract class Params {
}

export abstract class Opcodes {
}

export abstract class Errors {
}

export class FeeQuoter implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}


  static createFromAddress(address: Address) {
    return new FeeQuoter(address)
  }

  static createFromConfig(config: FeeQuoterStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
    const init = { code, data }
    return new FeeQuoter(contractAddress(workchain, init), init)
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
