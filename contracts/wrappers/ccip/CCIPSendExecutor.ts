import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'

import { CellCodec } from '../utils'
import * as rt from './Router'

// Storage types
export type CCIPSendExecutorInitialData = {
  onramp: Address
  messageId: bigint
}

export type CCIPSendExecutorConfig = {
  feeQuoter: Address
  tokenRegistry?: Address
}

export type CCIPSendExecutorAddresses = {
  onramp: Address
  feeQuoter: Address
}

export type OnRampSend = {
  msg: rt.CCIPSend
  metadata: Metadata
}

export type Metadata = {
  sender: Address
}

export type CCIPSendExecutorPendingJettonLock = {
  tokenRegistry: Address
  jettonWallet: Address
  tokenPool: Address
}

// State types
export type CCIPSendExecutorStateInitialized = {
  tokenRegistry?: Address
}

export type CCIPSendExecutorStateWaitingForJettons = {
  tokenRegistry: Address
}

export type CCIPSendExecutorStateOnGoingTokenRegistryQuery = {
  tokenRegistry: Address
  jettonWallet: Address
}

export type CCIPSendExecutorStateOnGoingFeeValidation = {
  pendingJettonLock?: CCIPSendExecutorPendingJettonLock
}

export type CCIPSendExecutorStateOnGoingLockOrBurn = {}

// Message types
export type CCIPSendExecutorExecute = {
  onrampSend: OnRampSend
  config: CCIPSendExecutorConfig
  onrampJettonWallet?: Address
}

export type OnRampWithdrawJettons = {
  msgId: bigint
  tokens: Cell // vec<TokenAmount>
  onrampJettonWallet: Address
}

export type OnRampExecutorFinishedSuccessfully = {
  msgId: bigint
  msg: Cell // Cell<CCIPSend>
  metadata: Metadata
  fee: bigint
}

// Codecs
const metadataCodec: CellCodec<Metadata> = {
  encode: function (data: Metadata): Builder {
    return beginCell().storeAddress(data.sender)
  },
  load: function (src: Slice): Metadata {
    return { sender: src.loadAddress() }
  },
}

const configCodec: CellCodec<CCIPSendExecutorConfig> = {
  encode: function (data: CCIPSendExecutorConfig): Builder {
    return beginCell()
      .storeAddress(data.feeQuoter)
      .storeMaybeBuilder(data.tokenRegistry && new Builder().storeAddress(data.tokenRegistry))
  },
  load: function (src: Slice): CCIPSendExecutorConfig {
    const feeQuoter = src.loadAddress()
    const hasTokenRegistry = src.loadBit()
    const tokenRegistry = hasTokenRegistry ? src.loadAddress() : undefined
    return {
      feeQuoter,
      tokenRegistry,
    }
  },
}

// TODO import from OnRamp
const onrampSendCodec: CellCodec<OnRampSend> = {
  encode: function (data: OnRampSend): Builder {
    return beginCell()
      .storeRef(rt.builder.message.in.ccipSend.encode(data.msg))
      .storeBuilder(metadataCodec.encode(data.metadata))
  },
  load: function (src: Slice): OnRampSend {
    return {
      msg: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
      metadata: metadataCodec.load(src),
    }
  },
}

export const builder = {
  data: {
    initialData: ((): CellCodec<CCIPSendExecutorInitialData> => {
      return {
        encode: function (data: CCIPSendExecutorInitialData): Builder {
          return beginCell().storeAddress(data.onramp).storeUint(data.messageId, 224)
        },
        load: function (src: Slice): CCIPSendExecutorInitialData {
          return {
            onramp: src.loadAddress(),
            messageId: BigInt(src.loadUint(224)),
          }
        },
      }
    })(),
  },
  messages: {
    in: {
      execute: ((): CellCodec<CCIPSendExecutorExecute> => {
        return {
          encode: function (data: CCIPSendExecutorExecute): Builder {
            return beginCell()
              .storeUint(Opcodes.execute, 32)
              .storeBuilder(onrampSendCodec.encode(data.onrampSend))
              .storeRef(configCodec.encode(data.config).endCell())
              .storeMaybeBuilder(
                data.onrampJettonWallet && new Builder().storeAddress(data.onrampJettonWallet),
              )
          },
          load: function (src: Slice): CCIPSendExecutorExecute {
            src.skip(32) // skip opcode
            const onrampSend = onrampSendCodec.load(src)
            const config = configCodec.load(src.loadRef().beginParse())
            const hasJettonWallet = src.loadBit()
            const onrampJettonWallet = hasJettonWallet ? src.loadAddress() : undefined
            return {
              onrampSend,
              config,
              onrampJettonWallet,
            }
          },
        }
      })(),
      withdrawJettons: ((): CellCodec<OnRampWithdrawJettons> => {
        return {
          encode: function (data: OnRampWithdrawJettons): Builder {
            return beginCell()
              .storeUint(Opcodes.withdrawJettons, 32)
              .storeUint(data.msgId, 224)
              .storeRef(data.tokens)
              .storeAddress(data.onrampJettonWallet)
          },
          load: function (src: Slice): OnRampWithdrawJettons {
            src.skip(32) // skip opcode
            return {
              msgId: BigInt(src.loadUint(224)),
              tokens: src.loadRef(),
              onrampJettonWallet: src.loadAddress(),
            }
          },
        }
      })(),
      executorFinishedSuccessfully: ((): CellCodec<OnRampExecutorFinishedSuccessfully> => {
        return {
          encode: function (data: OnRampExecutorFinishedSuccessfully): Builder {
            return beginCell()
              .storeUint(Opcodes.executorFinishedSuccessfully, 32)
              .storeUint(data.msgId, 224)
              .storeRef(data.msg)
              .storeBuilder(metadataCodec.encode(data.metadata))
              .storeCoins(data.fee)
          },
          load: function (src: Slice): OnRampExecutorFinishedSuccessfully {
            src.skip(32) // skip opcode
            return {
              msgId: BigInt(src.loadUint(224)),
              msg: src.loadRef(),
              metadata: metadataCodec.load(src),
              fee: src.loadCoins(),
            }
          },
        }
      })(),
    },
  },
}

export abstract class Opcodes {
  static execute = 0xaf3c62b3 // crc32('CCIPSendExecutor_Execute')
  static withdrawJettons = 0x266aeacf // crc32('OnRamp_WithdrawJettons')
  static executorFinishedSuccessfully = 0xcfa6b336 // crc32('OnRamp_ExecutorFinishedSuccessfully')
}

export abstract class Errors {
  static stateNotExpected = 500
}

export class CCIPSendExecutor implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new CCIPSendExecutor(address)
  }

  static createFromConfig(config: CCIPSendExecutorInitialData, code: Cell, workchain = 0) {
    const data = builder.data.initialData.encode(config).asCell()
    const init = { code, data }
    return new CCIPSendExecutor(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendExecute(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      onrampSend: OnRampSend
      config: CCIPSendExecutorConfig
      onrampJettonWallet?: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.execute
        .encode({
          onrampSend: opts.onrampSend,
          config: opts.config,
          onrampJettonWallet: opts.onrampJettonWallet,
        })
        .asCell(),
    })
  }

  async sendWithdrawJettons(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msgId: bigint
      tokens: Cell
      onrampJettonWallet: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.withdrawJettons
        .encode({
          msgId: opts.msgId,
          tokens: opts.tokens,
          onrampJettonWallet: opts.onrampJettonWallet,
        })
        .asCell(),
    })
  }

  async sendExecutorFinishedSuccessfully(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      msgId: bigint
      msg: Cell
      metadata: Metadata
      fee: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.executorFinishedSuccessfully
        .encode({
          msgId: opts.msgId,
          msg: opts.msg,
          metadata: opts.metadata,
          fee: opts.fee,
        })
        .asCell(),
    })
  }

  // Getters would be added here if the contract has any getter methods
  // Since this is primarily a state machine contract, it likely doesn't expose many getters
}
