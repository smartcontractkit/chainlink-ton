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
  Slice,
  Builder,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { asSnakeData } from '../../src/utils'
import { CellCodec } from '../utils'
import * as rt from './Router'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/TypeAndVersion'
import { compile } from '@ton/blueprint'

export const ONRAMP_FACILITY_NAME = 'com.chainlink.ton.ccip.OnRamp'
export const ONRAMP_FACILITY_ID = 181
export const ONRAMP_ERROR_CODE = 18100 //FACILITY_ID * 100

export const ONRAMP_CONTRACT_VERSION = '0.0.7'

export const CCIP_SEND_EXECUTOR_FACILITY_NAME = 'com.chainlink.ton.ccip.CCIPSendExecutor'
export const CCIP_SEND_EXECUTOR_FACILITY_ID = 436
export const CCIP_SEND_EXECUTOR_ERROR_CODE = 43600 //FACILITY_ID * 100

export enum OnRampError {
  UnknownDestChainSelector = ONRAMP_ERROR_CODE,
  Unauthorized,
  SenderNotAllowed,
}
export enum CCIPSendExecutorError {
  StateNotExpected = CCIP_SEND_EXECUTOR_ERROR_CODE,
  Unauthorized,
}

export type OnRampStorage = {
  id: number
  ownable: ownable2step.Data
  chainSelector: bigint
  config: {
    feeQuoter: Address
    feeAggregator: Address
    allowlistAdmin: Address
  }
  destChainConfigs: Dictionary<bigint, Cell>
  executor_code: Cell
  currentMessageId: bigint
}

export type OnRampSend = {
  msg: rt.CCIPSend
  metadata: Metadata
}

export type Metadata = {
  sender: Address
}

export type DestChainConfig = {
  router: Address
  sequenceNumber: bigint
  allowlistEnabled: boolean
  allowedSenders: Dictionary<Address, boolean>
}

export type UpdateDestChainConfig = {
  destChainSelector: bigint
  router: Address
  allowlistEnabled: boolean
}

const metadataCodec: CellCodec<Metadata> = {
  encode: function (data: Metadata): Builder {
    return beginCell().storeAddress(data.sender)
  },
  load: function (src: Slice): Metadata {
    return { sender: src.loadAddress() }
  },
}

export const builder = {
  data: {
    metadata: metadataCodec,
    contractData: ((): CellCodec<OnRampStorage> => {
      return {
        encode: function (data: OnRampStorage): Builder {
          return (
            beginCell()
              .storeUint(data.id, 32)
              .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
              .storeUint(data.chainSelector, 64)
              // Cell<DynamicConfig>
              .storeRef(
                beginCell()
                  .storeAddress(data.config.feeQuoter)
                  .storeAddress(data.config.feeAggregator)
                  .storeAddress(data.config.allowlistAdmin)
                  .endCell(),
              )
              .storeDict(data.destChainConfigs)
              .storeRef(data.executor_code)
              .storeUint(data.currentMessageId, 224)
          )
        },
        load: function (src: Slice): OnRampStorage {
          throw new Error('Function not implemented.')
        },
      }
    })(),
    destChainConfig: (): CellCodec<DestChainConfig> => {
      return {
        encode: function (data: DestChainConfig): Builder {
          return beginCell()
            .storeAddress(data.router)
            .storeUint(data.sequenceNumber, 64)
            .storeBit(data.allowlistEnabled)
            .storeDict(data.allowedSenders)
        },
        load: function (src: Slice): DestChainConfig {
          return {
            router: src.loadAddress(),
            sequenceNumber: src.loadUintBig(64),
            allowlistEnabled: src.loadBit(),
            allowedSenders: src.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool()),
          }
        },
      }
    },
  },
  messages: {
    in: {
      ccipSend: rt.builder.message.in.ccipSend,
      onrampSend: ((): CellCodec<OnRampSend> => {
        return {
          encode: function (data: OnRampSend): Builder {
            return beginCell()
              .storeUint(Opcodes.onrampSend, 32)
              .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
              .storeBuilder(metadataCodec.encode(data.metadata))
          },
          load: function (src: Slice): OnRampSend {
            src.skip(32)
            return {
              msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
              metadata: metadataCodec.load(src),
            }
          },
        }
      })(),
    },
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static ccipSend = 0x00000001
  static setDynamicConfig = 0x10000003
  static updateDestChainConfigs = 0x10000004
  static onrampSend = 0x10000002
}

export abstract class Errors {}

export class OnRamp implements Contract, withdrawable.Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new OnRamp(address)
  }

  static createFromConfig(config: OnRampStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
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
      body: Cell.EMPTY,
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
    return ONRAMP_CONTRACT_VERSION
  }

  static type() {
    return ONRAMP_FACILITY_NAME
  }

  static async code() {
    return await compile('OnRamp')
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
      destChainConfigs: UpdateDestChainConfig[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.updateDestChainConfigs, 32)
        .storeRef(
          asSnakeData(opts.destChainConfigs, (config) =>
            new Builder()
              .storeUint(config.destChainSelector, 64)
              .storeAddress(config.router)
              .storeBit(config.allowlistEnabled),
          ),
        )
        .endCell(),
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
