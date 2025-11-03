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
  Builder,
  Slice,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { CellCodec } from '../utils'
import { asSnakeData, fromSnakeData } from '../../src/utils'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { compile } from '@ton/blueprint'

export const FEE_QUOTER_CONTRACT_VERSION = '0.0.8'

export const FEE_QUOTER_FACILITY_NAME = 'com.chainlink.ton.ccip.FeeQuoter'
export const FEE_QUOTER_FACILITY_ID = 248
export const FEE_QUOTER_ERROR_CODE = 24800 //FACILITY_ID * 100

export enum FeeQuoterError {
  UnsupportedChainFamilySelector = FEE_QUOTER_ERROR_CODE,
  GasLimitTooHigh,
  ExtraArgOutOfOrderExecutionMustBeTrue,
  InvalidExtraArgsData,
  UnsupportedNumberOfTokens,
  InvalidSuiReceiverAddress,
  InvalidTokenReceiver,
  TooManySuiExtraArgsReceiverObjectIds,
  MsgDataTooLarge,
  StaleGasPrice,
  DestChainNotEnabled,
  FeeTokenNotSupported,
  InvalidMsgData,
  TokenNotSupported,
  UnknownDestChainSelector,
}

export type FeeQuoterStorage = {
  id: number
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
      builder.storeUint(src.value, 224).storeUint(src.timestamp, 32)
    },
    parse: (src): TimestampedPrice => {
      return {
        value: src.loadUintBig(224),
        timestamp: src.loadUintBig(32),
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
        encode: (data: UpdatePrices): Builder => {
          const tokenPrices = asSnakeData(data.updates.tokenPricesUpdates, encodeTokenPriceUpdate)
          const gasPrices = asSnakeData(data.updates.gasPricesUpdates, encodeGasPriceUpdate)

          return beginCell()
            .storeUint(Opcodes.updatePrices, 32)
            .storeRef(tokenPrices)
            .storeRef(gasPrices)
        },
        load: (src: Slice): UpdatePrices => {
          throw new Error('Not implemented') // TODO implement if needed
        },
      }
      const updateFeeTokens: CellCodec<UpdateFeeTokens> = {
        encode: (data: UpdateFeeTokens): Builder => {
          let add = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigUint(64))
          for (const [token, feeToken] of data.add) {
            add.set(token, feeToken.premiumMultiplierWeiPerEth)
          }
          const remove = asSnakeData(data.remove, (addr) => new TonBuilder().storeAddress(addr))

          return beginCell().storeUint(Opcodes.updateFeeTokens, 32).storeDict(add).storeRef(remove)
        },
        load: (src: Slice) => {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      const updateTokenTransferFeeConfigs: CellCodec<UpdateTokenTransferFeeConfigs> = {
        encode: (data: UpdateTokenTransferFeeConfigs): Builder => {
          const updatesDict = Dictionary.empty(
            Dictionary.Keys.BigUint(64),
            UpdateTokenTransferFeeConfigDictionaryValueType(),
          )
          for (const [destChainSelector, updateTokenTransferFeeConfig] of data.updates) {
            updatesDict.set(destChainSelector, updateTokenTransferFeeConfig)
          }

          return beginCell().storeUint(Opcodes.updateTransferFeeConfigs, 32).storeDict(updatesDict)
        },
        load(src: Slice): UpdateTokenTransferFeeConfigs {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      const updateDestChainConfigs: CellCodec<UpdateDestChainConfigs> = {
        encode: (updates: UpdateDestChainConfigs): Builder => {
          return beginCell()
            .storeUint(Opcodes.updateDestChainConfig, 32)
            .storeRef(
              asSnakeData(updates, (update) =>
                new TonBuilder()
                  .storeInt(update.destChainSelector, 64)
                  .storeBuilder(destChainConfigToBuilder(update.config)),
              ),
            )
        },
        load(src: Slice): UpdateDestChainConfigs {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      return {
        updatePrices,
        updateFeeTokens,
        updateTokenTransferFeeConfigs,
        updateDestChainConfigs,
      }
    })(),
  },
  data: (() => {
    const timestampedPrice: CellCodec<TimestampedPrice> = {
      encode: (data: TimestampedPrice): Builder => {
        return beginCell().storeUint(data.value, 224).storeUint(data.timestamp, 32)
      },
      load: (src: Slice): TimestampedPrice => {
        return {
          value: src.loadUintBig(224),
          timestamp: src.loadUintBig(32),
        }
      },
    }

    const destChainConfig: CellCodec<DestChainConfig> = {
      encode: (data: DestChainConfig): Builder => {
        return destChainConfigToBuilder(data)
      },
      load: (src: Slice): DestChainConfig => {
        return {
          isEnabled: src.loadBoolean(),
          maxNumberOfTokensPerMsg: src.loadUint(16),
          maxDataBytes: src.loadUint(32),
          maxPerMsgGasLimit: src.loadUint(32),
          destGasOverhead: src.loadUint(32),
          destGasPerPayloadByteBase: src.loadUint(8),
          destGasPerPayloadByteHigh: src.loadUint(8),
          destGasPerPayloadByteThreshold: src.loadUint(16),
          destDataAvailabilityOverheadGas: src.loadUint(32),
          destGasPerDataAvailabilityByte: src.loadUint(16),
          destDataAvailabilityMultiplierBps: src.loadUint(16),
          chainFamilySelector: src.loadUint(32),
          enforceOutOfOrder: src.loadBoolean(),
          defaultTokenFeeUsdCents: src.loadUint(16),
          defaultTokenDestGasOverhead: src.loadUint(32),
          defaultTxGasLimit: src.loadUint(32),
          gasMultiplierWeiPerEth: src.loadUintBig(64),
          gasPriceStalenessThreshold: src.loadUint(32),
          networkFeeUsdCents: src.loadUint(32),
        }
      },
    }

    const tokenTransferFeeConfig: CellCodec<TokenTransferFeeConfig> = {
      encode: (data: TokenTransferFeeConfig): Builder => {
        return beginCell()
          .storeBit(data.isEnabled)
          .storeInt(data.minFeeUsdCents, 32)
          .storeInt(data.maxFeeUsdCents, 32)
          .storeInt(data.deciBps, 16)
          .storeInt(data.destGasOverhead, 32)
          .storeInt(data.destBytesOverhead, 32)
      },
      load: (src: Slice): TokenTransferFeeConfig => {
        return {
          isEnabled: src.loadBoolean(),
          minFeeUsdCents: src.loadUint(32),
          maxFeeUsdCents: src.loadUint(32),
          deciBps: src.loadUint(16),
          destGasOverhead: src.loadUint(32),
          destBytesOverhead: src.loadUint(32),
        }
      },
    }

    const contractData: CellCodec<FeeQuoterStorage> = {
      encode: (data: FeeQuoterStorage): Builder => {
        return beginCell()
          .storeUint(data.id, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
          .storeUint(data.maxFeeJuelsPerMsg, 96)
          .storeAddress(data.linkToken)
          .storeUint(data.tokenPriceStalenessThreshold, 64)
          .storeDict(data.usdPerToken)
          .storeDict(data.premiumMultiplierWeiPerEth)
          .storeDict(data.destChainConfigs)
      },
      load: (src: Slice): FeeQuoterStorage => {
        const id = src.loadUint(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const maxFeeJuelsPerMsg = src.loadUintBig(96)
        const linkToken = src.loadAddress()
        const tokenPriceStalenessThreshold = src.loadUintBig(64)

        const usdPerToken = Dictionary.loadDirect(
          Dictionary.Keys.Address(),
          createTimestampedPriceValue(),
          src.loadRef(),
        )

        const premiumMultiplierWeiPerEth = Dictionary.loadDirect(
          Dictionary.Keys.Address(),
          Dictionary.Values.BigUint(64),
          src.loadRef(),
        )

        const destChainConfigsRaw = Dictionary.loadDirect(
          Dictionary.Keys.BigUint(64),
          Dictionary.Values.Cell(),
          src.loadRef(),
        )

        // Convert Cell dictionary to DestChainConfig dictionary
        const destChainConfigs = Dictionary.empty<bigint, DestChainConfig>()
        for (const [key, configCell] of destChainConfigsRaw) {
          destChainConfigs.set(key, destChainConfig.load(configCell.beginParse()))
        }

        return {
          id,
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
  static updateFeeTokens = 0xd0984986
  static updateTransferFeeConfigs = 0xb2826316
  static updateDestChainConfig = 0x29950baa
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

export type UpdateDestChainConfigs = {
  destChainSelector: bigint
  config: DestChainConfig
}[]

export abstract class Errors {}

export class FeeQuoter
  implements upgradeable.Interface, withdrawable.Interface, typeAndVersion.Interface, Contract
{
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new FeeQuoter(address)
  }

  static createFromConfig(config: FeeQuoterStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
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

  sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: upgradeable.Upgrade,
  ): Promise<void> {
    return upgradeable.sendUpgrade(provider, via, value, body)
  }

  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }
  getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
  getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }

  static version() {
    return FEE_QUOTER_CONTRACT_VERSION
  }

  static type() {
    return FEE_QUOTER_FACILITY_NAME
  }

  static async code() {
    return await compile('FeeQuoter')
  }

  async sendUpdateDestChainConfigs(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      updates: UpdateDestChainConfigs
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateDestChainConfigs.encode(opts.updates).asCell(),
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
      body: builder.message.in.updatePrices.encode(opts.msg).asCell(),
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
      body: builder.message.in.updateFeeTokens.encode(opts.msg).asCell(),
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
      body: builder.message.in.updateTokenTransferFeeConfigs.encode(opts.msg).asCell(),
    })
  }

  // Withdrawable methods
  async sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: withdrawable.Withdraw,
  ) {
    await withdrawable.sendWithdraw(provider, via, value, body)
  }

  async getReserve(provider: ContractProvider): Promise<bigint> {
    return await withdrawable.getReserve(provider)
  }
}

function encodeUpdateTokenTransferFeeConfig(
  updateTokenTransferFeeConfig: UpdateTokenTransferFeeConfig,
): Cell {
  let add = Dictionary.empty(Dictionary.Keys.Address(), TokenTransferFeeConfigDictionaryValueType())
  let remove = asSnakeData(updateTokenTransferFeeConfig.remove, (addr) =>
    new TonBuilder().storeAddress(addr),
  )
  for (const [token, tokenTransferFeeConfig] of updateTokenTransferFeeConfig.add.entries()) {
    add.set(token, tokenTransferFeeConfig)
  }
  var updateTokenTransferFeeConfigCell = beginCell().storeDict(add).storeRef(remove).endCell()
  return updateTokenTransferFeeConfigCell
}

function encodeTokenTransferFeeConfig(tokenTransferFeeConfig: TokenTransferFeeConfig): Cell {
  return beginCell()
    .storeBit(tokenTransferFeeConfig.isEnabled)
    .storeInt(tokenTransferFeeConfig.minFeeUsdCents, 32)
    .storeInt(tokenTransferFeeConfig.maxFeeUsdCents, 32)
    .storeInt(tokenTransferFeeConfig.deciBps, 16)
    .storeInt(tokenTransferFeeConfig.destGasOverhead, 32)
    .storeInt(tokenTransferFeeConfig.destBytesOverhead, 32)
    .endCell()
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

function UpdateTokenTransferFeeConfigDictionaryValueType(): DictionaryValue<UpdateTokenTransferFeeConfig> {
  const serialize = (src: UpdateTokenTransferFeeConfig, builder: Builder): void => {
    builder.storeBuilder(encodeUpdateTokenTransferFeeConfig(src).asBuilder())
  }
  const parse = (src: Slice): UpdateTokenTransferFeeConfig => {
    throw new Error('Function not implemented.')
  }
  return { serialize, parse }
}

function TokenTransferFeeConfigDictionaryValueType(): DictionaryValue<TokenTransferFeeConfig> {
  const serialize = (src: TokenTransferFeeConfig, builder: Builder): void => {
    builder.storeBuilder(encodeTokenTransferFeeConfig(src).asBuilder())
  }
  const parse = (src: Slice): TokenTransferFeeConfig => {
    throw new Error('Function not implemented.')
  }
  return { serialize, parse }
}
