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

import * as ownable2step from '../libraries/access/Ownable2Step'
import { CellCodec } from '../utils'
import { asSnakeData, fromSnakeData } from '../../src/utils'
import { loadMap, loadDict, storeTolkUMap } from '../../src/utils/dict'

export type FeeQuoterStorage = {
  ownable: ownable2step.Data
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
    .storeUint(config.destDataAvailabilityMultiplierBps, 16)
    .storeUint(config.chainFamilySelector, 32)
    .storeBit(config.enforceOutOfOrder)
    .storeUint(config.defaultTokenFeeUsdCents, 16)
    .storeUint(config.defaultTokenDestGasOverhead, 32)
    .storeUint(config.defaultTxGasLimit, 32)
    .storeUint(config.gasMultiplierWeiPerEth, 64)
    .storeUint(config.gasPriceStalenessThreshold, 32)
    .storeUint(config.networkFeeUsdCents, 32)
}

export const builder = {
  message: {
    in: (() => {
      const updatePrices: CellCodec<UpdatePrices> = {
        encode: (data: UpdatePrices): Cell => {
          const tokenPrices = asSnakeData(data.updates.tokenPricesUpdates, encodeTokenPriceUpdate)
          const gasPrices = asSnakeData(data.updates.gasPricesUpdates, encodeGasPriceUpdate)

          return beginCell()
            .storeUint(Opcodes.updatePrices, 32)
            .storeRef(tokenPrices)
            .storeRef(gasPrices)
            .endCell()
        },
        decode: (cell: Cell): UpdatePrices => {
          throw new Error('Not implemented') // TODO implement if needed
        },
      }
      const updateFeeTokens: CellCodec<UpdateFeeTokens> = {
        encode: (data: UpdateFeeTokens): Cell => {
          let add = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigUint(64))
          for (const [token, feeToken] of data.add) {
            add.set(token, feeToken.premiumMultiplierWeiPerEth)
          }
          const remove = asSnakeData(data.remove, (addr) => new TonBuilder().storeAddress(addr))

          return beginCell()
            .storeUint(Opcodes.updateFeeTokens, 32)
            .storeDict(add)
            .storeRef(remove)
            .endCell()
        },
        decode: function (cell: Cell) {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      const updateTokenTransferFeeConfigs: CellCodec<UpdateTokenTransferFeeConfigs> = {
        encode: (data: UpdateTokenTransferFeeConfigs): Cell => {
          const configs = Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell())
          for (const [destChainSelector, updateTokenTransferFeeConfig] of data.updates) {
            let add = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Cell())
            let remove = Cell.EMPTY // TODO
            for (const [
              token,
              tokenTransferFeeConfig,
            ] of updateTokenTransferFeeConfig.add.entries()) {
              const tokenTransferFeeConfigCell = beginCell()
                .storeBit(tokenTransferFeeConfig.isEnabled)
                .storeInt(tokenTransferFeeConfig.minFeeUsdCents, 32)
                .storeInt(tokenTransferFeeConfig.maxFeeUsdCents, 32)
                .storeInt(tokenTransferFeeConfig.deciBps, 16)
                .storeInt(tokenTransferFeeConfig.destGasOverhead, 32)
                .storeInt(tokenTransferFeeConfig.destBytesOverhead, 32)
                .endCell()

              add.set(token, tokenTransferFeeConfigCell)
            }
            var updateTokenTransferFeeConfigCell = beginCell()
              .storeDict(add)
              .storeRef(remove)
              .endCell()
            configs.set(destChainSelector, updateTokenTransferFeeConfigCell)
          }

          var msg = beginCell().storeUint(Opcodes.updateTransferFeeConfigs, 32)
          msg = storeTolkUMap(msg, { keyLen: 64, dict: configs })

          return msg.endCell()
        },
        decode: function (cell: Cell): UpdateTokenTransferFeeConfigs {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      const updateDestChainConfig: CellCodec<UpdateDestChainConfig> = {
        encode: (msg: UpdateDestChainConfig): Cell => {
          return beginCell()
            .storeUint(Opcodes.updateDestChainConfig, 32)
            .storeUint(msg.destChainSelector, 64)
            .storeBuilder(destChainConfigToBuilder(msg.destChainConfig))
            .endCell()
        },
        decode: function (cell: Cell): UpdateDestChainConfig {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      return {
        updatePrices,
        updateFeeTokens,
        updateTokenTransferFeeConfigs,
        updateDestChainConfig,
      }
    })(),
  },
  data: (() => {
    const timestampedPrice: CellCodec<TimestampedPrice> = {
      encode: (data: TimestampedPrice): Cell => {
        return beginCell().storeUint(data.value, 224).storeUint(data.timestamp, 64).endCell()
      },
      decode: (cell: Cell): TimestampedPrice => {
        const s = cell.beginParse()
        return {
          value: s.loadUintBig(224),
          timestamp: s.loadUintBig(64),
        }
      },
    }

    const destChainConfig: CellCodec<DestChainConfig> = {
      encode: (data: DestChainConfig): Cell => {
        return destChainConfigToBuilder(data).endCell()
      },
      decode: (cell: Cell): DestChainConfig => {
        const s = cell.beginParse()
        return {
          isEnabled: s.loadBoolean(),
          maxNumberOfTokensPerMsg: s.loadUint(16),
          maxDataBytes: s.loadUint(32),
          maxPerMsgGasLimit: s.loadUint(32),
          destGasOverhead: s.loadUint(32),
          destGasPerPayloadByteBase: s.loadUint(8),
          destGasPerPayloadByteHigh: s.loadUint(8),
          destGasPerPayloadByteThreshold: s.loadUint(16),
          destDataAvailabilityOverheadGas: s.loadUint(32),
          destGasPerDataAvailabilityByte: s.loadUint(16),
          destDataAvailabilityMultiplierBps: s.loadUint(16),
          chainFamilySelector: s.loadUint(32),
          enforceOutOfOrder: s.loadBoolean(),
          defaultTokenFeeUsdCents: s.loadUint(16),
          defaultTokenDestGasOverhead: s.loadUint(32),
          defaultTxGasLimit: s.loadUint(32),
          gasMultiplierWeiPerEth: s.loadUintBig(64),
          gasPriceStalenessThreshold: s.loadUint(32),
          networkFeeUsdCents: s.loadUint(32),
        }
      },
    }

    const tokenTransferFeeConfig: CellCodec<TokenTransferFeeConfig> = {
      encode: (data: TokenTransferFeeConfig): Cell => {
        return beginCell()
          .storeBit(data.isEnabled)
          .storeInt(data.minFeeUsdCents, 32)
          .storeInt(data.maxFeeUsdCents, 32)
          .storeInt(data.deciBps, 16)
          .storeInt(data.destGasOverhead, 32)
          .storeInt(data.destBytesOverhead, 32)
          .endCell()
      },
      decode: (cell: Cell): TokenTransferFeeConfig => {
        const s = cell.beginParse()
        return {
          isEnabled: s.loadBoolean(),
          minFeeUsdCents: s.loadUint(32),
          maxFeeUsdCents: s.loadUint(32),
          deciBps: s.loadUint(16),
          destGasOverhead: s.loadUint(32),
          destBytesOverhead: s.loadUint(32),
        }
      },
    }

    const contractData: CellCodec<FeeQuoterStorage> = {
      encode: (data: FeeQuoterStorage): Cell => {
        return beginCell()
          .storeAddress(data.ownable.owner)
          .storeMaybeBuilder(
            data.ownable.pendingOwner ? beginCell().storeAddress(data.ownable.pendingOwner) : null,
          )
          .storeUint(data.maxFeeJuelsPerMsg, 96)
          .storeAddress(data.linkToken)
          .storeUint(data.tokenPriceStalenessThreshold, 64)
          .storeDict(data.usdPerToken)
          .storeDict(data.premiumMultiplierWeiPerEth)
          .storeDict(data.destChainConfigs)
          .storeUint(64, 16) // keyLen
          .endCell()
      },
      decode: (cell: Cell): FeeQuoterStorage => {
        const s = cell.beginParse()

        const ownable = ownable2step.builder.data.traitData.load(s)
        const maxFeeJuelsPerMsg = s.loadUintBig(96)
        const linkToken = s.loadAddress()
        const tokenPriceStalenessThreshold = s.loadUintBig(64)

        const usdPerToken = Dictionary.loadDirect(
          Dictionary.Keys.Address(),
          createTimestampedPriceValue(),
          s.loadRef(),
        )

        const premiumMultiplierWeiPerEth = Dictionary.loadDirect(
          Dictionary.Keys.Address(),
          Dictionary.Values.BigUint(64),
          s.loadRef(),
        )

        const destChainConfigsRaw = Dictionary.loadDirect(
          Dictionary.Keys.BigUint(64),
          Dictionary.Values.Cell(),
          s.loadRef(),
        )

        // Convert Cell dictionary to DestChainConfig dictionary
        const destChainConfigs = Dictionary.empty<bigint, DestChainConfig>()
        for (const [key, configCell] of destChainConfigsRaw) {
          destChainConfigs.set(key, destChainConfig.decode(configCell))
        }

        return {
          ownable,
          maxFeeJuelsPerMsg,
          linkToken,
          tokenPriceStalenessThreshold,
          usdPerToken,
          premiumMultiplierWeiPerEth,
          destChainConfigs,
        }
      },
    }

    return {
      timestampedPrice,
      destChainConfig,
      tokenTransferFeeConfig,
      contractData,
    }
  })(),
}
export abstract class Params {}

export abstract class Opcodes {
  static updatePrices = 0x20000001
  static updateFeeTokens = 0x20000002
  static updateTransferFeeConfigs = 0x20000003
  static updateDestChainConfig = 0x20000004
}

export type TokenPriceUpdate = {
  token: Address
  price: bigint
}

export type GasPriceUpdate = {
  chainSelector: bigint
  executionGasPrice: bigint
  dataAvailabilityGasPrice: bigint
}

export type PriceUpdates = {
  tokenPricesUpdates: TokenPriceUpdate[]
  gasPricesUpdates: GasPriceUpdate[]
}

export type UpdatePrices = {
  updates: PriceUpdates
}

export type UpdateFeeTokens = {
  add: Map<Address, FeeToken> // token address -> premium multiplier
  remove: Address[]
}

export type FeeToken = {
  premiumMultiplierWeiPerEth: bigint
}

export type UpdateTokenTransferFeeConfigs = {
  updates: Map<bigint, UpdateTokenTransferFeeConfig> // destChainSelector -> updates
}

export type TokenTransferFeeConfig = {
  isEnabled: boolean
  minFeeUsdCents: number
  maxFeeUsdCents: number
  deciBps: number
  destGasOverhead: number
  destBytesOverhead: number
}

export type UpdateTokenTransferFeeConfig = {
  add: Map<Address, TokenTransferFeeConfig> // token address -> config
  remove: Address[] // vector<address>
}

export type UpdateDestChainConfig = {
  destChainSelector: bigint
  destChainConfig: DestChainConfig
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
    const data = builder.data.contractData.encode(config)
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
      msg: UpdateDestChainConfig
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateDestChainConfig.encode(opts.msg),
    })
  }

  async sendUpdatePrices(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: UpdatePrices
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updatePrices.encode(opts.msg),
    })
  }

  async sendUpdateFeeTokens(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: UpdateFeeTokens
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateFeeTokens.encode(opts.msg),
    })
  }

  async sendUpdateTokenTransferFeeConfigs(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: UpdateTokenTransferFeeConfigs
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateTokenTransferFeeConfigs.encode(opts.msg),
    })
  }
}

function encodeGasPriceUpdate(gasPriceUpdate: GasPriceUpdate): TonBuilder {
  return new TonBuilder()
    .storeInt(gasPriceUpdate.chainSelector, 64)
    .storeInt(gasPriceUpdate.executionGasPrice, 112)
    .storeInt(gasPriceUpdate.dataAvailabilityGasPrice, 112)
}

function encodeTokenPriceUpdate(tokenPriceUpdate: TokenPriceUpdate): TonBuilder {
  return new TonBuilder().storeAddress(tokenPriceUpdate.token).storeInt(tokenPriceUpdate.price, 224)
}
