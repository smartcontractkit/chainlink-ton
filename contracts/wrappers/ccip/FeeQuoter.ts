import {
  Address,
  Builder as TonBuilder,
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

import { Ownable2StepConfig } from '../libraries/access/Ownable2Step'

export type FeeQuoterStorage = {
  ownable: Ownable2StepConfig
  maxFeeJuelsPerMsg: bigint
  linkToken: Address
  tokenPriceStalenessThreshold: bigint
  usdPerToken: Dictionary<Address, TimestampedPrice>
  premiumMultiplierWeiPerEth: Dictionary<Address, bigint>
  destChainConfigs: Dictionary<bigint, DestChainConfig>
}

export type TimestampedPrice = {
  value: bigint
  timestamp: bigint
}

export function createTimestampedPriceValue(): DictionaryValue<TimestampedPrice> {
  return {
    serialize: (src, builder) => {
      builder.storeUint(src.value, 224).storeUint(src.timestamp, 64)
    },
    parse: (src): TimestampedPrice => {
      return {
        value: src.loadUintBig(224),
        timestamp: src.loadUintBig(64),
      }
    },
  }
}

export type DestChainConfig = {
  isEnabled: boolean
  maxNumberOfTokensPerMsg: number
  maxDataBytes: number
  maxPerMsgGasLimit: number
  destGasOverhead: number
  destGasPerPayloadByteBase: number
  destGasPerPayloadByteHigh: number
  destGasPerPayloadByteThreshold: number
  destDataAvailabilityOverheadGas: number
  destGasPerDataAvailabilityByte: number
  destDataAvailabilityMultiplierBps: number

  chainFamilySelector: number // 4 bytes
  enforceOutOfOrder: boolean

  defaultTokenFeeUsdCents: number
  defaultTokenDestGasOverhead: number
  defaultTxGasLimit: number

  // Multiplier for gas costs, 1e18 based so 11e17 = 10% extra cost.
  gasMultiplierWeiPerEth: bigint
  gasPriceStalenessThreshold: number
  networkFeeUsdCents: number
}

export function destChainConfigToBuilder(config: DestChainConfig): TonBuilder {
  return beginCell()
    .storeBit(config.isEnabled)
    .storeUint(config.maxNumberOfTokensPerMsg, 16)
    .storeUint(config.maxDataBytes, 32)
    .storeUint(config.maxPerMsgGasLimit, 32)
    .storeUint(config.destGasOverhead, 32)
    .storeUint(config.destGasPerPayloadByteBase, 8)
    .storeUint(config.destGasPerPayloadByteHigh, 8)
    .storeUint(config.destGasPerPayloadByteThreshold, 16)
    .storeUint(config.destDataAvailabilityOverheadGas, 32)
    .storeUint(config.destGasPerDataAvailabilityByte, 16)
    .storeUint(config.destDataAvailabilityMultiplierBps, 32)
    .storeUint(config.chainFamilySelector, 32)
    .storeBit(config.enforceOutOfOrder)
    .storeUint(config.defaultTokenFeeUsdCents, 16)
    .storeUint(config.defaultTokenDestGasOverhead, 32)
    .storeUint(config.defaultTxGasLimit, 32)
    .storeUint(config.gasMultiplierWeiPerEth, 64)
    .storeUint(config.gasPriceStalenessThreshold, 32)
    .storeUint(config.networkFeeUsdCents, 32)
}

export const Builder = {
  asStorage: (config: FeeQuoterStorage): Cell => {
    let builder = beginCell().storeAddress(config.ownable.owner)
    // TODO: use storeMaybeBuilder()
    if (config.ownable.pendingOwner) {
      builder
        .storeBit(1) // Store '1' to indicate the address is present
        .storeAddress(config.ownable.pendingOwner) // Then store the address
    } else {
      builder.storeBit(0) // Store '0' to indicate the address is absent
    }

    return (
      builder
        .storeUint(config.maxFeeJuelsPerMsg, 96)
        .storeAddress(config.linkToken)
        .storeUint(config.tokenPriceStalenessThreshold, 64)
        .storeDict(config.usdPerToken)
        .storeDict(config.premiumMultiplierWeiPerEth)
        // UMap<> type
        .storeDict(config.destChainConfigs)
        .storeUint(64, 16) // keyLen
        .endCell()
    )
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static updateDestChainConfig = 0x10000005
}

export abstract class Errors {}

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

  async sendUpdateDestChainConfig(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      destChainSelector: bigint
      config: DestChainConfig
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.updateDestChainConfig, 32)
        .storeUint(opts.destChainSelector, 64)
        .storeBuilder(destChainConfigToBuilder(opts.config))
        .endCell(),
    })
  }
}
