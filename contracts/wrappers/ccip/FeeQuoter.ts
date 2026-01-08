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
  TupleItem,
  Tuple,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { CellCodec, StackCodec } from '../utils'
import { asSnakeData } from '../../src/utils'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { loadContractCode } from '../codeLoader'
import * as rt from './Router'
import { crc32 } from 'zlib'
import { Maybe } from '@ton/core/dist/utils/maybe'

export const FEE_QUOTER_CONTRACT_VERSION = '1.6.0'

export const FACILITY_NAME = 'com.chainlink.ton.ccip.FeeQuoter'
export const FACILITY_ID = 248
export const ERROR_CODE = FACILITY_ID * 100

export enum errors {
  UnsupportedChainFamilySelector = ERROR_CODE,
  GasLimitTooHigh,
  ExtraArgOutOfOrderExecutionMustBeTrue,
  InvalidExtraArgsData,
  UnsupportedNumberOfTokens,
  InvalidEVMReceiverAddress,
  Invalid32ByteReceiverAddress,
  InvalidSuiReceiverAddress,
  InvalidSVMReceiverAddress,
  InvalidTokenReceiver,
  TooManySuiExtraArgsReceiverObjectIds,
  MsgDataTooLarge,
  StaleGasPrice,
  DestChainNotEnabled,
  FeeTokenNotSupported,
  InvalidMsgData,
  TokenNotSupported,
  UnknownDestChainSelector,
  InsufficientFee,
  TokenTransfersNotSupported,
  UnauthorizedPriceUpdater,
  // Overflow protection errors
  ExecutionCostOverflow,
  PremiumFeeOverflow,
  DataAvailabilityCostOverflow,
  FeeCalculationOverflow,
  TokenPriceTooLow,
  FeeOverflow,
  MessageFeeTooHigh,
}

export type FeeQuoterStorage = {
  id: bigint
  ownable: ownable2step.Data
  allowedPriceUpdaters: Dictionary<Address, Buffer>
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

  defaultTokenFeeUsdCents: number
  defaultTokenDestGasOverhead: number
  defaultTxGasLimit: number

  // Multiplier for gas costs, 1e18 based so 11e17 = 10% extra cost.
  gasMultiplierWeiPerEth: bigint
  gasPriceStalenessThreshold: number
  networkFeeUsdCents: number
}

export type GetValidatedFee = {
  msg: rt.CCIPSend
  context: Slice
}

export type Fee = {
  feeTokenAmount: bigint // fee value in fee token
  feeValueJuels: bigint // fee value in juels
}

export type MessageValidated = {
  fee: Fee
  msg: rt.CCIPSend
  context: Slice
}

export type MessageValidationFailed = {
  error: bigint
  msg: rt.CCIPSend
  context: Slice
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
    .storeUint(config.defaultTokenFeeUsdCents, 16)
    .storeUint(config.defaultTokenDestGasOverhead, 32)
    .storeUint(config.defaultTxGasLimit, 32)
    .storeUint(config.gasMultiplierWeiPerEth, 64)
    .storeUint(config.gasPriceStalenessThreshold, 32)
    .storeUint(config.networkFeeUsdCents, 32)
}

export const builder = (() => {
  const dataBuilder = (() => {
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
          .storeDict(data.allowedPriceUpdaters)
          .storeUint(data.maxFeeJuelsPerMsg, 96)
          .storeAddress(data.linkToken)
          .storeUint(data.tokenPriceStalenessThreshold, 64)
          .storeDict(data.usdPerToken)
          .storeDict(data.premiumMultiplierWeiPerEth)
          .storeDict(data.destChainConfigs)
      },
      load: (src: Slice): FeeQuoterStorage => {
        const id = src.loadUintBig(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const maxFeeJuelsPerMsg = src.loadUintBig(96)
        const linkToken = src.loadAddress()
        const tokenPriceStalenessThreshold = src.loadUintBig(64)

        const allowedPriceUpdaters = Dictionary.loadDirect(
          Dictionary.Keys.Address(),
          Dictionary.Values.Buffer(0),
          src.loadRef(),
        )

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
          allowedPriceUpdaters,
          maxFeeJuelsPerMsg,
          linkToken,
          tokenPriceStalenessThreshold,
          usdPerToken,
          premiumMultiplierWeiPerEth,
          destChainConfigs,
        }
      },
    }
    const fee: CellCodec<Fee> = {
      encode: (data: Fee): Builder => {
        return beginCell().storeCoins(data.feeTokenAmount).storeUint(data.feeValueJuels, 96)
      },
      load: (src: Slice): Fee => {
        return {
          feeTokenAmount: src.loadCoins(),
          feeValueJuels: src.loadUintBig(96),
        }
      },
    }

    return {
      fee,
      timestampedPrice,
      destChainConfig,
      tokenTransferFeeConfig,
      contractData,
    }
  })()
  const message = {
    in: (() => {
      const addPriceUpdater: CellCodec<AddPriceUpdater> = {
        encode: (data: AddPriceUpdater): Builder => {
          return beginCell()
            .storeUint(opcodes.in.addPriceUpdater, 32)
            .storeAddress(data.priceUpdater)
        },
        load: (src: Slice): AddPriceUpdater => {
          throw new Error('Not implemented') // TODO implement if needed
        },
      }
      const removePriceUpdater: CellCodec<RemovePriceUpdater> = {
        encode: (data: RemovePriceUpdater): Builder => {
          return beginCell()
            .storeUint(opcodes.in.removePriceUpdater, 32)
            .storeAddress(data.priceUpdater)
        },
        load: (src: Slice): RemovePriceUpdater => {
          throw new Error('Not implemented') // TODO implement if needed
        },
      }
      const updatePrices: CellCodec<UpdatePrices> = {
        encode: (data: UpdatePrices): Builder => {
          const tokenPrices = asSnakeData(data.updates.tokenPricesUpdates, encodeTokenPriceUpdate)
          const gasPrices = asSnakeData(data.updates.gasPricesUpdates, encodeGasPriceUpdate)

          return beginCell()
            .storeUint(opcodes.in.updatePrices, 32)
            .storeRef(tokenPrices)
            .storeRef(gasPrices)
            .storeAddress(data.sendExcessesTo)
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

          return beginCell()
            .storeUint(opcodes.in.updateFeeTokens, 32)
            .storeDict(add)
            .storeRef(remove)
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

          return beginCell()
            .storeUint(opcodes.in.updateTransferFeeConfigs, 32)
            .storeDict(updatesDict)
        },
        load(src: Slice): UpdateTokenTransferFeeConfigs {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }
      const updateDestChainConfigs: CellCodec<UpdateDestChainConfigs> = {
        encode: (updates: UpdateDestChainConfigs): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateDestChainConfig, 32)
            .storeRef(
              asSnakeData(updates, (update) =>
                new TonBuilder()
                  .storeUint(update.destChainSelector, 64)
                  .storeBuilder(destChainConfigToBuilder(update.config)),
              ),
            )
        },
        load(src: Slice): UpdateDestChainConfigs {
          throw new Error('Function not implemented.') // TODO implement if needed
        },
      }

      const getValidatedFee: CellCodec<GetValidatedFee> = {
        encode: function (data: GetValidatedFee): Builder {
          return beginCell()
            .storeUint(opcodes.in.getValidatedFee, 32)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: function (src: Slice): GetValidatedFee {
          src.skip(32) // opcode
          return {
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }

      return {
        addPriceUpdater,
        removePriceUpdater,
        updatePrices,
        updateFeeTokens,
        updateTokenTransferFeeConfigs,
        updateDestChainConfigs,
        getValidatedFee,
      }
    })(),
    out: (() => {
      const messageValidated: CellCodec<MessageValidated> = {
        encode: (data: MessageValidated): TonBuilder => {
          return beginCell()
            .storeUint(opcodes.out.messageValidated, 32)
            .storeBuilder(dataBuilder.fee.encode(data.fee))
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidated => {
          src.skip(32) // opcode
          return {
            fee: dataBuilder.fee.load(src),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }

      const messageValidationFailed: CellCodec<MessageValidationFailed> = {
        encode: (data: MessageValidationFailed): TonBuilder => {
          return beginCell()
            .storeUint(opcodes.out.messageValidationFailed, 32)
            .storeUint(data.error, 256)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidationFailed => {
          src.skip(32) // opcode
          return {
            error: src.loadUintBig(256),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }
      return {
        messageValidated,
        messageValidationFailed,
      }
    })(),
  }
  return {
    data: dataBuilder,
    message,
  }
})()

export const stackBuilder = {
  data: {
    ccipSend: ((): StackCodec<rt.CCIPSend> => {
      return {
        encode: function (data: rt.CCIPSend): TupleItem[] {
          return [
            { type: 'int', value: BigInt(data.queryID ?? 0) },
            { type: 'int', value: data.destChainSelector },
            {
              type: 'slice',
              cell: beginCell().storeBuffer(data.receiver, data.receiver.length).endCell(),
            },
            { type: 'cell', cell: data.data },
            {
              type: 'cell',
              cell: asSnakeData(data.tokenAmounts, rt.builder.data.tokenAmount.encode),
            },
            { type: 'slice', cell: beginCell().storeAddress(data.feeToken).endCell() },
            { type: 'cell', cell: data.extraArgs },
          ]
        },
        load: function (src: TupleItem[]): rt.CCIPSend {
          throw new Error('Function not implemented.')
        },
      }
    })(),
  },
}

export abstract class Params {}

export const opcodes = {
  in: {
    updatePrices: 0xde852b1b,
    updateFeeTokens: 0xd0984986,
    updateTransferFeeConfigs: 0xb2826316,
    updateDestChainConfig: 0x2d2410f6,
    getValidatedFee: 0x7496ff56,
    addPriceUpdater: crc32('FeeQuoter_AddPriceUpdater'),
    removePriceUpdater: crc32('FeeQuoter_RemovePriceUpdater'),
  },
  out: {
    messageValidated: 0x1fa60374,
    messageValidationFailed: 0xbcf0ab0f,
  },
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

export type AddPriceUpdater = {
  priceUpdater: Address
}

export type RemovePriceUpdater = {
  priceUpdater: Address
}

export type UpdatePrices = {
  updates: PriceUpdates
  sendExcessesTo: Maybe<Address>
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

export class FeeQuoter
  implements
    upgradeable.Interface,
    withdrawable.Interface,
    typeAndVersion.Interface,
    ownable2step.Interface,
    Contract
{
  private ownable: ownable2step.ContractClient
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.ownable = new ownable2step.ContractClient(address)
  }

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

  async getValidatedFeeCell(provider: ContractProvider, msg: rt.CCIPSend): Promise<bigint> {
    const result = await provider.get('validatedFeeCell', [
      { type: 'cell', cell: rt.builder.message.in.ccipSend.encode(msg).asCell() },
    ])

    return result.stack.readBigNumber()
  }

  async getValidatedFee(provider: ContractProvider, msg: rt.CCIPSend): Promise<bigint> {
    const result = await provider.get('validatedFee', stackBuilder.data.ccipSend.encode(msg))

    return result.stack.readBigNumber()
  }

  async getDataAvailabilityCost(
    provider: ContractProvider,
    destChainSelector: bigint,
    dataAvailabilityGasPrice: bigint,
    calldataLen: bigint,
    tokenCount: bigint,
    tokenTransferBytesOverhead: bigint,
  ): Promise<bigint> {
    const { stack } = await provider.get('dataAvailabilityCost', [
      { type: 'int', value: destChainSelector },
      { type: 'int', value: dataAvailabilityGasPrice },
      { type: 'int', value: calldataLen },
      { type: 'int', value: tokenCount },
      { type: 'int', value: tokenTransferBytesOverhead },
    ])
    return stack.readBigNumber()
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
    return FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return loadContractCode('FeeQuoter')
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

  async sendAddPriceUpdater(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: AddPriceUpdater
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.addPriceUpdater.encode(opts.msg).asCell(),
    })
  }

  async sendRemovePriceUpdater(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: RemovePriceUpdater
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.removePriceUpdater.encode(opts.msg).asCell(),
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

  async sendGetValidatedFee(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: GetValidatedFee
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.getValidatedFee.encode(opts.msg).asCell(),
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

  // Getter methods for price queries
  async getTokenPrice(provider: ContractProvider, token: Address): Promise<TimestampedPrice> {
    const { stack } = await provider.get('tokenPrice', [
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() },
    ])
    // The contract returns TimestampedPrice struct directly (value: uint224, timestamp: uint32)
    const value = stack.readBigNumber()
    const timestamp = stack.readBigNumber()
    return { value, timestamp }
  }

  async getDestinationChainGasPrice(
    provider: ContractProvider,
    destChainSelector: bigint,
  ): Promise<any> {
    const { stack } = await provider.get('destinationChainGasPrice', [
      { type: 'int', value: destChainSelector },
    ])
    // The getter returns a cell containing GasPrice struct
    const gasCell = stack.readCell()
    const slice = gasCell.beginParse()
    return {
      value: {
        executionGasPrice: slice.loadUintBig(112),
        dataAvailabilityGasPrice: slice.loadUintBig(112),
        timestamp: slice.loadUintBig(64),
      },
    }
  }

  async getPremiumMultiplierWeiPerEth(provider: ContractProvider, token: Address): Promise<bigint> {
    const { stack } = await provider.get('premiumMultiplierWeiPerEth', [
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() },
    ])
    return stack.readBigNumber()
  }

  async getDestChainConfig(
    provider: ContractProvider,
    destChainSelector: bigint,
  ): Promise<DestChainConfig> {
    const { stack } = await provider.get('destChainConfig', [
      { type: 'int', value: destChainSelector },
    ])
    return {
      isEnabled: stack.readBoolean(),
      maxNumberOfTokensPerMsg: stack.readNumber(),
      maxDataBytes: stack.readNumber(),
      maxPerMsgGasLimit: stack.readNumber(),
      destGasOverhead: stack.readNumber(),
      destGasPerPayloadByteBase: stack.readNumber(),
      destGasPerPayloadByteHigh: stack.readNumber(),
      destGasPerPayloadByteThreshold: stack.readNumber(),
      destDataAvailabilityOverheadGas: stack.readNumber(),
      destGasPerDataAvailabilityByte: stack.readNumber(),
      destDataAvailabilityMultiplierBps: stack.readNumber(),
      chainFamilySelector: stack.readNumber(),
      defaultTokenFeeUsdCents: stack.readNumber(),
      defaultTokenDestGasOverhead: stack.readNumber(),
      defaultTxGasLimit: stack.readNumber(),
      gasMultiplierWeiPerEth: stack.readBigNumber(),
      gasPriceStalenessThreshold: stack.readNumber(),
      networkFeeUsdCents: stack.readNumber(),
    }
  }

  async getTokenTransferFeeConfig(
    provider: ContractProvider,
    destChainSelector: bigint,
    token: Address,
  ): Promise<TokenTransferFeeConfig> {
    const { stack } = await provider.get('tokenTransferFeeConfig', [
      { type: 'int', value: destChainSelector },
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() },
    ])
    const tokenTransferFeeConfig: TokenTransferFeeConfig = {
      isEnabled: stack.readBoolean(),
      minFeeUsdCents: Number(stack.readNumber()),
      maxFeeUsdCents: Number(stack.readNumber()),
      deciBps: Number(stack.readNumber()),
      destGasOverhead: Number(stack.readNumber()),
      destBytesOverhead: Number(stack.readNumber()),
    }
    return tokenTransferFeeConfig
  }

  // Ownership methods
  async getOwner(provider: ContractProvider): Promise<Address> {
    return this.ownable.getOwner(provider)
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    return this.ownable.getPendingOwner(provider)
  }

  async getFeeTokens(provider: ContractProvider): Promise<Address[] | null> {
    const result = await provider.get('feeTokens', [])
    const items = result.stack.readLispList()
    const addresses: Address[] = items.map((t: TupleItem) => {
      if (t.type !== 'cell' && t.type !== 'slice' && t.type !== 'builder') {
        throw Error('Not a cell: ' + t.type)
      }
      return t.cell.beginParse().loadAddress()
    })
    return addresses
  }

  async getDestChainSelectors(provider: ContractProvider): Promise<bigint[] | null> {
    const result = await provider.get('destChainSelectors', [])
    const items = result.stack.readLispList()
    const selectors: bigint[] = items.map((t: TupleItem) => {
      if (t.type !== 'int') {
        throw Error('Not an int: ' + t.type)
      }
      return t.value
    })
    return selectors
  }

  async getTokenPrices(
    provider: ContractProvider,
    tokens: Address[],
  ): Promise<(TimestampedPrice | undefined)[]> {
    const tupleItems: TupleItem[] = []
    for (const token of tokens) {
      tupleItems.push({
        type: 'slice',
        cell: beginCell().storeAddress(token).endCell(),
      } as TupleItem)
    }
    const tuple = { type: 'tuple', items: tupleItems } as Tuple
    const result = await provider.get('tokenPrices', [tuple])
    const resultTuple = result.stack.readTuple()
    const prices: (TimestampedPrice | undefined)[] = []
    while (resultTuple.remaining > 0) {
      const priceCell = resultTuple.readCellOpt()
      if (!priceCell) {
        prices.push(undefined)
        continue
      }
      const priceSlice = priceCell.beginParse()
      prices.push({
        value: priceSlice.loadUintBig(224),
        timestamp: priceSlice.loadUintBig(32),
      })
    }
    return prices
  }

  async getStaticConfig(provider: ContractProvider): Promise<{
    maxFeeJuelsPerMsg: bigint
    linkToken: Address
    tokenPriceStalenessThreshold: bigint
  }> {
    const result = await provider.get('staticConfig', [])
    return {
      maxFeeJuelsPerMsg: result.stack.readBigNumber(),
      linkToken: result.stack.readAddress(),
      tokenPriceStalenessThreshold: result.stack.readBigNumber(),
    }
  }

  async getFacilityId(provider: ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getTokenAndGasPrices(
    provider: ContractProvider,
    token: Address,
    destChainSelector: bigint,
  ): Promise<any> {
    const result = await provider.get('tokenAndGasPrices', [
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() } as TupleItem,
      { type: 'int', value: destChainSelector } as TupleItem,
    ])
    // Note: This getter has an empty implementation in the contract
    return result
  }

  async sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: ownable2step.TransferOwnership,
  ) {
    return this.ownable.sendTransferOwnership(p, via, value, body)
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: ownable2step.AcceptOwnership,
  ) {
    return this.ownable.sendAcceptOwnership(p, via, value, body)
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
    .storeUint(gasPriceUpdate.chainSelector, 64)
    .storeUint(gasPriceUpdate.executionGasPrice, 112)
    .storeUint(gasPriceUpdate.dataAvailabilityGasPrice, 112)
}

function encodeTokenPriceUpdate(tokenPriceUpdate: TokenPriceUpdate): TonBuilder {
  return new TonBuilder()
    .storeAddress(tokenPriceUpdate.token)
    .storeUint(tokenPriceUpdate.price, 224)
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
