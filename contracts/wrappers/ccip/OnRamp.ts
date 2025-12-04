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
import * as fq from './FeeQuoter'

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
  id: bigint
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

export type InMessageValidated = {
  fee: fq.Fee
  msg: rt.CCIPSend
  context: GetValidatedFeeContext
}

export type InMessageValidationFailed = {
  error: bigint
  msg: rt.CCIPSend
  context: GetValidatedFeeContext
}

export type GetValidatedFeeContext = {
  onrampContext: Address // router address
  userContext: Slice
}

export type ExecutorFinishedSuccessfully = {
  executorID: bigint
  fee: fq.Fee
  msg: Cell | rt.CCIPSend
  metadata: Metadata
}

export type ExecutorFinishedWithError = {
  executorID: bigint
  error: bigint
  msg: Cell | rt.CCIPSend
  metadata: Metadata
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

export type SetDynamicConfig = {
  config: DynamicConfig
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

export type RampMessageHeader = {
  messageId: bigint
  sourceChainSelector: bigint
  destChainSelector: bigint
  sequenceNumber: bigint
  nonce: bigint
}

export type TVM2AnyRampMessageBody = {
  receiver: Cell
  data: Cell
  extraArgs: Cell
  tokenAmounts: Cell
  feeToken: Address
  feeTokenAmount: bigint
}

export type TVM2AnyRampMessage = {
  header: RampMessageHeader
  sender: Address
  body: TVM2AnyRampMessageBody
  feeValueJuels: bigint
}

export type CCIPMessageSent = {
  message: TVM2AnyRampMessage
}

export const builder = (() => {
  const dataBuilder = (() => {
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
        const id = src.loadUintBig(32)
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

    const getValidatedFeeContext: CellCodec<GetValidatedFeeContext> = {
      encode: function (data: GetValidatedFeeContext): Builder {
        return beginCell().storeAddress(data.onrampContext).storeSlice(data.userContext)
      },
      load: function (src: Slice): GetValidatedFeeContext {
        return {
          onrampContext: src.loadAddress(),
          userContext: src,
        }
      },
    }

    const rampMessageHeader: CellCodec<RampMessageHeader> = {
      encode: function (data: RampMessageHeader): Builder {
        return beginCell()
          .storeUint(data.messageId, 256)
          .storeUint(data.sourceChainSelector, 64)
          .storeUint(data.destChainSelector, 64)
          .storeUint(data.sequenceNumber, 64)
          .storeUint(data.nonce, 64)
      },
      load: function (src: Slice): RampMessageHeader {
        return {
          messageId: src.loadUintBig(256),
          sourceChainSelector: src.loadUintBig(64),
          destChainSelector: src.loadUintBig(64),
          sequenceNumber: src.loadUintBig(64),
          nonce: src.loadUintBig(64),
        }
      },
    }

    const tvm2AnyRampMessageBody: CellCodec<TVM2AnyRampMessageBody> = {
      encode: function (data: TVM2AnyRampMessageBody): Builder {
        return beginCell()
          .storeRef(data.receiver)
          .storeRef(data.data)
          .storeRef(data.extraArgs)
          .storeRef(data.tokenAmounts)
          .storeAddress(data.feeToken)
          .storeUint(data.feeTokenAmount, 256)
      },
      load: function (src: Slice): TVM2AnyRampMessageBody {
        return {
          receiver: src.loadRef(),
          data: src.loadRef(),
          extraArgs: src.loadRef(),
          tokenAmounts: src.loadRef(),
          feeToken: src.loadAddress(),
          feeTokenAmount: src.loadUintBig(256),
        }
      },
    }

    const tvm2AnyRampMessage: CellCodec<TVM2AnyRampMessage> = {
      encode: function (data: TVM2AnyRampMessage): Builder {
        return beginCell()
          .storeBuilder(rampMessageHeader.encode(data.header))
          .storeAddress(data.sender)
          .storeRef(tvm2AnyRampMessageBody.encode(data.body))
          .storeUint(data.feeValueJuels, 96)
      },
      load: function (src: Slice): TVM2AnyRampMessage {
        return {
          header: rampMessageHeader.load(src),
          sender: src.loadAddress(),
          body: tvm2AnyRampMessageBody.load(src.loadRef().beginParse()),
          feeValueJuels: src.loadUintBig(96),
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
      getValidatedFeeContext,
      rampMessageHeader,
      tvm2AnyRampMessageBody,
      tvm2AnyRampMessage,
    }
  })()
  const messages = (() => {
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
            .storeUint(data.executorID, 224)
            .storeBuilder(fq.builder.data.fee.encode(data.fee))
            .storeRef(
              data.msg instanceof Cell ? data.msg : rt.builder.message.in.ccipSend.encode(data.msg),
            )
            .storeBuilder(metadataCodec.encode(data.metadata))
        },
        load: function (src: Slice): ExecutorFinishedSuccessfully {
          src.skip(32)
          return {
            executorID: src.loadUintBig(224),
            fee: fq.builder.data.fee.load(src),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: metadataCodec.load(src),
          }
        },
      }

      const executorFinishedWithError: CellCodec<ExecutorFinishedWithError> = {
        encode: function (data: ExecutorFinishedWithError): Builder {
          return beginCell()
            .storeUint(Opcodes.executorFinishedWithError, 32)
            .storeUint(data.executorID, 224)
            .storeUint(data.error, 256)
            .storeRef(
              data.msg instanceof Cell ? data.msg : rt.builder.message.in.ccipSend.encode(data.msg),
            )
            .storeBuilder(metadataCodec.encode(data.metadata))
        },
        load: function (src: Slice): ExecutorFinishedWithError {
          src.skip(32)
          return {
            executorID: src.loadUintBig(224),
            error: src.loadUintBig(256),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            metadata: metadataCodec.load(src),
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

      const messageValidated: CellCodec<InMessageValidated> = {
        encode: (data: InMessageValidated): Builder => {
          return fq.builder.message.out.messageValidated.encode({
            fee: data.fee,
            msg: data.msg,
            context: builder.data.getValidatedFeeContext.encode(data.context).asSlice(),
          })
        },
        load: (src: Slice): InMessageValidated => {
          const decoded = fq.builder.message.out.messageValidated.load(src)
          return {
            fee: decoded.fee,
            msg: decoded.msg,
            context: builder.data.getValidatedFeeContext.load(decoded.context),
          }
        },
      }

      const messageValidationFailed: CellCodec<InMessageValidationFailed> = {
        encode: (data: InMessageValidationFailed): Builder => {
          return fq.builder.message.out.messageValidationFailed.encode({
            error: data.error,
            msg: data.msg,
            context: builder.data.getValidatedFeeContext.encode(data.context).asSlice(),
          })
        },
        load: (src: Slice): InMessageValidationFailed => {
          const decoded = fq.builder.message.out.messageValidationFailed.load(src)
          return {
            error: decoded.error,
            msg: decoded.msg,
            context: builder.data.getValidatedFeeContext.load(decoded.context),
          }
        },
      }

      const setDynamicConfig: CellCodec<SetDynamicConfig> = {
        encode: function (data: SetDynamicConfig): Builder {
          return beginCell()
            .storeUint(Opcodes.setDynamicConfig, 32)
            .storeBuilder(dataBuilder.dynamicConfig.encode(data.config))
        },
        load: function (src: Slice): SetDynamicConfig {
          src.skip(32)
          return {
            config: dataBuilder.dynamicConfig.load(src),
          }
        },
      }

      return {
        getValidatedFee,
        messageValidated,
        messageValidationFailed,
        onrampSend,
        executorFinishedSuccessfully,
        executorFinishedWithError,
        setDynamicConfig,
        updateSendExecutor,
        updateAllowlists,
      }
    })()

    const messageOut = (() => {
      const messageValidated: CellCodec<MessageValidated> = {
        encode: (data: MessageValidated): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidated, 32)
            .storeCoins(data.fee)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidated => {
          src.skip(32)
          return {
            fee: src.loadCoins(),
            msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }

      const messageValidationFailed: CellCodec<MessageValidationFailed> = {
        encode: (data: MessageValidationFailed): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidationFailed, 32)
            .storeUint(data.error, 256)
            .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidationFailed => {
          src.skip(32)
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
    })()

    return {
      in: messageIn,
      out: messageOut,
    }
  })()

  const events = (() => {
    const ccipMessageSent: CellCodec<CCIPMessageSent> = {
      encode: function (data: CCIPMessageSent): Builder {
        return builder.data.tvm2AnyRampMessage.encode(data.message)
      },
      load: function (src: Slice): CCIPMessageSent {
        return { message: builder.data.tvm2AnyRampMessage.load(src) }
      },
    }

    return {
      ccipMessageSent,
    }
  })()

  return {
    data: dataBuilder,
    messages,
    events,
  }
})()

export abstract class Params {}

export abstract class Opcodes {
  static onrampSend = 0x10000002
  static getValidatedFee = 0x9c2ccc7e
  static messageValidated = fq.OutOpcodes.messageValidated
  static messageValidationFailed = fq.OutOpcodes.messageValidationFailed
  static executorFinishedSuccessfully = 0xcfa6b336
  static executorFinishedWithError = 0xc4068e21
  static setDynamicConfig = 0x10000003
  static updateDestChainConfigs = 0x10000004
  static updateSendExecutor = 0x82901c45
  static updateAllowlists = 0x9dc06185
}

export abstract class OutOpcodes {
  static messageValidated = 0x2afb11bd
  static messageValidationFailed = 0xac1dd12e
}

export enum Errors {
  UnknownDestChainSelector = 18100, // Facility ID * 100
  Unauthorized,
  SenderNotAllowed,
  InvalidConfig,
}

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

  async getSendExecutorCode(provider: ContractProvider): Promise<Cell> {
    const { stack } = await provider.get('sendExecutorCode', [])
    return stack.readCell()
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
      body: SetDynamicConfig
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.setDynamicConfig.encode(opts.body).asCell(),
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
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.getValidatedFee
        .encode({
          msg: opts.msg,
          context: cloneToSlice(opts.context),
        })
        .asCell(),
    })
  }

  async sendMessageValidated(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      body: InMessageValidated
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.messageValidated.encode(opts.body).asCell(),
    })
  }

  async sendMessageValidationFailed(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      body: InMessageValidationFailed
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.messageValidationFailed.encode(opts.body).asCell(),
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
    return await provider.internal(via, {
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
    return await provider.internal(via, {
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
    return await provider.internal(via, {
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
    return await provider.internal(via, {
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
    return await withdrawable.sendWithdraw(provider, via, value, body)
  }

  async getDynamicConfig(provider: ContractProvider): Promise<DynamicConfig> {
    const { stack } = await provider.get('dynamicConfig', [])
    return {
      feeQuoter: stack.readAddress(),
      feeAggregator: stack.readAddress(),
      allowlistAdmin: stack.readAddress(),
    }
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

  // Send CCIP Send
  async sendSend(provider: ContractProvider, via: Sender, value: bigint, body: OnRampSend) {
    return this.sendInternal(
      provider,
      via,
      value,
      builder.messages.in.onrampSend.encode(body).asCell(),
    )
  }
}
