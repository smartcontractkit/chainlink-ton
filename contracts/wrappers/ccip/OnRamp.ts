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
  TupleItem,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { asSnakeData, fromSnakeData } from '../../src/utils'
import { CellCodec } from '../utils'
import * as rt from './Router'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { compile } from '@ton/blueprint'

export const ONRAMP_FACILITY_NAME = 'com.chainlink.ton.ccip.OnRamp'
export const ONRAMP_FACILITY_ID = 181
export const ONRAMP_ERROR_CODE = 18100 //FACILITY_ID * 100

export const ONRAMP_CONTRACT_VERSION = '1.6.0'

export enum OnRampError {
  UnknownDestChainSelector = ONRAMP_ERROR_CODE,
  Unauthorized,
  SenderNotAllowed,
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
  executor: ExecutorDeployment
}

export type ExecutorDeployment = {
  deployableCode: Cell
  executorCode: Cell
  currentID: bigint
}

export type OnRampSend = {
  msg: rt.CCIPSend
  metadata: Metadata
}

export type Metadata = {
  sender: Address
  value: bigint
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

export type MessageValidated = {
  fee: bigint
  msg: rt.CCIPSend
  context: Slice
}

export type MessageValidationFailed = {
  error: bigint
  msg: rt.CCIPSend
  context: Slice
}

export type ExecutorFinishedSuccessfully = {
  messageID: bigint
  msg: Cell | rt.CCIPSend
  metadata: Metadata
  fee: bigint
}

export type ExecutorFinishedWithError = {
  messageID: bigint
  msg: Cell | rt.CCIPSend
  metadata: Metadata
  error: bigint
}

export type UpdateSendExecutor = {
  code: Cell
}

export type UpdateAllowlists = {
  updates: UpdateAllowlist[]
}

export type UpdateAllowlist = {
  destChainSelector: bigint
  add: Address[]
  remove: Address[]
}

export type DynamicConfig = {
  feeQuoter: Address
  feeAggregator: Address
  allowlistAdmin: Address
}

export type GetValidatedFee = {
  msg: rt.CCIPSend
  context: Slice
}

const metadataCodec: CellCodec<Metadata> = {
  encode: function (data: Metadata): Builder {
    return beginCell().storeAddress(data.sender).storeCoins(data.value)
  },
  load: function (src: Slice): Metadata {
    return { sender: src.loadAddress(), value: src.loadCoins() }
  },
}

export const builder = {
  data: (() => {
    const dynamicConfig: CellCodec<DynamicConfig> = {
      encode: (data: DynamicConfig): Builder => {
        return beginCell()
          .storeAddress(data.feeQuoter)
          .storeAddress(data.feeAggregator)
          .storeAddress(data.allowlistAdmin)
      },
      load: (src: Slice): DynamicConfig => {
        return {
          feeQuoter: src.loadAddress(),
          feeAggregator: src.loadAddress(),
          allowlistAdmin: src.loadAddress(),
        }
      },
    }

    const executor: CellCodec<ExecutorDeployment> = {
      encode: function (data: ExecutorDeployment): Builder {
        return beginCell()
          .storeRef(data.deployableCode)
          .storeRef(data.executorCode)
          .storeUint(data.currentID, 224)
      },
      load: function (src: Slice): ExecutorDeployment {
        return {
          deployableCode: src.loadRef(),
          executorCode: src.loadRef(),
          currentID: src.loadUintBig(224),
        }
      },
    }

    const metadata = metadataCodec

    const contractData: CellCodec<OnRampStorage> = {
      encode: function (data: OnRampStorage): Builder {
        return beginCell()
          .storeUint(data.id, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
          .storeUint(data.chainSelector, 64)
          .storeRef(dynamicConfig.encode(data.config).asCell())
          .storeDict(data.destChainConfigs)
          .storeBuilder(executor.encode(data.executor))
      },
      load: function (src: Slice): OnRampStorage {
        const id = src.loadUint(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const chainSelector = src.loadUintBig(64)
        const config = dynamicConfig.load(src.loadRef().beginParse())
        const destChainConfigs = src.loadDict(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell())
        const executorData = executor.load(src)
        return {
          id,
          ownable,
          chainSelector,
          config,
          destChainConfigs,
          executor: executorData,
        }
      },
    }

    const destChainConfig: CellCodec<DestChainConfig> = {
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

    const updateAllowlist: CellCodec<UpdateAllowlist> = {
      encode: (data: UpdateAllowlist): Builder => {
        return beginCell()
          .storeUint(data.destChainSelector, 64)
          .storeRef(
            asSnakeData(data.add, (x) => {
              return beginCell().storeAddress(x)
            }),
          )
          .storeRef(
            asSnakeData(data.remove, (x) => {
              return beginCell().storeAddress(x)
            }),
          )
      },
      load: (src: Slice): UpdateAllowlist => {
        return {
          destChainSelector: src.loadUintBig(64),
          add: fromSnakeData(src.loadRef(), (item) => item.loadAddress()),
          remove: fromSnakeData(src.loadRef(), (item) => item.loadAddress()),
        }
      },
    }

    return {
      contractData,
      destChainConfig,
      executor,
      metadata,
      dynamicConfig,
      updateAllowlist,
    }
  })(),
  messages: (() => {
    const messageIn = (() => {
      const getValidatedFee: CellCodec<GetValidatedFee> = {
        encode: (data: GetValidatedFee): Builder => {
          return beginCell()
            .storeUint(Opcodes.getValidatedFee, 32)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: (src: Slice): GetValidatedFee => {
          src.skip(32)
          return {
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }

      const onrampSend: CellCodec<OnRampSend> = {
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

      const executorFinishedSuccessfully: CellCodec<ExecutorFinishedSuccessfully> = {
        encode: function (data: ExecutorFinishedSuccessfully): Builder {
          return beginCell()
            .storeUint(Opcodes.executorFinishedSuccessfully, 32)
            .storeUint(data.messageID, 224)
            .storeRef(
              data.msg instanceof Cell ? data.msg : rt.builder.message.in.ccipSend.encode(data.msg),
            )
            .storeBuilder(metadataCodec.encode(data.metadata))
            .storeCoins(data.fee)
        },
        load: function (src: Slice): ExecutorFinishedSuccessfully {
          src.skip(32)
          return {
            messageID: src.loadUintBig(224),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: metadataCodec.load(src),
            fee: src.loadCoins(),
          }
        },
      }

      const executorFinishedWithError: CellCodec<ExecutorFinishedWithError> = {
        encode: function (data: ExecutorFinishedWithError): Builder {
          return beginCell()
            .storeUint(Opcodes.executorFinishedWithError, 32)
            .storeUint(data.messageID, 224)
            .storeRef(
              data.msg instanceof Cell ? data.msg : rt.builder.message.in.ccipSend.encode(data.msg),
            )
            .storeBuilder(metadataCodec.encode(data.metadata))
            .storeUint(data.error, 256)
        },
        load: function (src: Slice): ExecutorFinishedWithError {
          src.skip(32)
          return {
            messageID: src.loadUintBig(224),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: metadataCodec.load(src),
            error: src.loadUintBig(256),
          }
        },
      }

      const updateSendExecutor: CellCodec<UpdateSendExecutor> = {
        encode: function (data: UpdateSendExecutor): Builder {
          return beginCell().storeUint(Opcodes.updateSendExecutor, 32).storeRef(data.code)
        },
        load: function (src: Slice): UpdateSendExecutor {
          src.skip(32)
          return {
            code: src.loadRef(),
          }
        },
      }

      const updateAllowlists: CellCodec<UpdateAllowlists> = {
        encode: (data: UpdateAllowlists): Builder => {
          return beginCell()
            .storeUint(Opcodes.updateAllowlists, 32)
            .storeRef(asSnakeData(data.updates, builder.data.updateAllowlist.encode))
        },
        load: (src: Slice): UpdateAllowlists => {
          src.skip(32)
          return {
            updates: fromSnakeData(src.loadRef(), (item) =>
              builder.data.updateAllowlist.load(item),
            ),
          }
        },
      }

      return {
        ccipSend: rt.builder.message.in.ccipSend,
        getValidatedFee,
        onrampSend,
        executorFinishedSuccessfully,
        executorFinishedWithError,
        updateSendExecutor,
        updateAllowlists,
      }
    })()

    const messageOut = (() => {
      const messageValidated: CellCodec<MessageValidated> = {
        encode: (data: MessageValidated): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidated, 32)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeCoins(data.fee)
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidated => {
          src.skip(32)
          return {
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            fee: src.loadCoins(),
            context: src,
          }
        },
      }

      const messageValidationFailed: CellCodec<MessageValidationFailed> = {
        encode: (data: MessageValidationFailed): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidationFailed, 32)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeUint(data.error, 256)
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidationFailed => {
          src.skip(32)
          return {
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            error: src.loadUintBig(256),
            context: src,
          }
        },
      }

      return {
        messageValidated,
        messageValidationFailed,
      }
    })()

    return {
      in: messageIn,
      out: messageOut,
    }
  })(),
}
export abstract class Params {}

export abstract class Opcodes {
  static ccipSend = 0x31768d95
  static getValidatedFee = 0x9c2ccc7e
  static setDynamicConfig = 0x10000003
  static updateDestChainConfigs = 0x10000004
  static onrampSend = 0x10000002
  static executorFinishedSuccessfully = 0xcfa6b336
  static executorFinishedWithError = 0xc4068e21
  static updateSendExecutor = 0x82901c45
  static updateAllowlists = 0x9dc06185
}

export abstract class OutOpcodes {
  static messageValidated = 0x2afb11bd
  static messageValidationFailed = 0xac1dd12e
}

export abstract class Errors {}

const cloneToSlice = (value?: Slice | Cell): Slice => {
  if (!value) {
    return Cell.EMPTY.beginParse()
  }
  if (value instanceof Cell) {
    return value.beginParse()
  }
  const sliceValue = value as Slice
  const cloned = beginCell().storeSlice(sliceValue).endCell()
  return cloned.beginParse()
}

export class OnRamp implements Contract, withdrawable.Interface, ownable2step.ContractClient {
  public ownable: ownable2step.ContractClient

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.ownable = new ownable2step.ContractClient(address)
  }

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

  getStaticConfig(provider: ContractProvider): Promise<bigint> {
    return provider.get('staticConfig', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  getFeeQuoter(provider: ContractProvider, destChainSelector: bigint): Promise<Address> {
    return provider.get('feeQuoter', [{ type: 'int', value: destChainSelector }]).then((res) => {
      return res.stack.readAddress()
    })
  }

  getAllowedSendersList(provider: ContractProvider, destChainSelector: bigint): Promise<Address[]> {
    return provider
      .get('allowedSendersList', [{ type: 'int', value: destChainSelector }])
      .then((res) => {
        const stack = res.stack
        return stack.readLispList().map((t: TupleItem) => {
          if (t.type !== 'cell' && t.type !== 'slice' && t.type !== 'builder') {
            throw Error('Not a cell: ' + t.type)
          }
          return t.cell.beginParse().loadAddress()
        })
      })
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
      config: DynamicConfig
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.setDynamicConfig, 32)
        .storeAddress(opts.config.feeQuoter)
        .storeAddress(opts.config.feeAggregator)
        .storeAddress(opts.config.allowlistAdmin)
        .endCell(),
    })
  }

  async sendGetValidatedFee(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msg: rt.CCIPSend
      context?: Slice | Cell
    },
  ) {
    const body = builder.messages.in.getValidatedFee
      .encode({
        msg: opts.msg,
        context: cloneToSlice(opts.context),
      })
      .asCell()

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
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

  async sendExecutorFinishedSuccessfully(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      body: ExecutorFinishedSuccessfully
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.executorFinishedSuccessfully.encode(opts.body).asCell(),
    })
  }

  async sendExecutorFinishedWithError(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      body: ExecutorFinishedWithError
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.executorFinishedWithError.encode(opts.body).asCell(),
    })
  }

  async sendUpdateSendExecutor(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      code: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.updateSendExecutor.encode({ code: opts.code }).asCell(),
    })
  }

  async sendUpdateAllowlists(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      updateAllowlists: UpdateAllowlists
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.updateAllowlists.encode(opts.updateAllowlists).asCell(),
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

  // Ownership methods
  async getOwner(provider: ContractProvider): Promise<Address> {
    return this.ownable.getOwner(provider)
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    return this.ownable.getPendingOwner(provider)
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
