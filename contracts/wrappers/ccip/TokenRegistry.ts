import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
  Builder,
} from '@ton/core'

import { CellCodec } from '../utils'
import * as rt from './Router'

export type Storage = {
  onramp: Address
  minterAddress: Address
  info?: TokenInfo
}

export function InitStorage(onramp: Address, minterAddress: Address): Storage {
  return {
    onramp,
    minterAddress,
    info: undefined,
  }
}

export type TokenInfo = {
  tokenPool: Address
  walletCode: Cell
  enabled: boolean
}

export type SetInfo = {
  queryId: number
  info: TokenInfo
}

export type GetTokenInfo = {
  queryId: number
  ccipSend: rt.CCIPSend
  executorJettonWallet: Address
}

export type TokenPoolInfo = {
  queryId: number
  tokenPool: Address
}

export const builder = {
  data: (() => {
    const tokenInfo: CellCodec<TokenInfo> = {
      encode: function (data: TokenInfo): Builder {
        return beginCell()
          .storeAddress(data.tokenPool)
          .storeRef(data.walletCode)
          .storeBit(data.enabled)
      },
      load: function (src: Slice): TokenInfo {
        return {
          tokenPool: src.loadAddress(),
          walletCode: src.loadRef(),
          enabled: src.loadBit(),
        }
      },
    }
    const contractData: CellCodec<Storage> = {
      encode: function (data: Storage): Builder {
        const builder = beginCell().storeAddress(data.onramp).storeAddress(data.minterAddress)

        // Store whether info exists
        if (data.info) {
          builder.storeBit(true)
          builder.storeBuilder(tokenInfo.encode(data.info))
        } else {
          builder.storeBit(false)
        }

        return builder
      },
      load: function (src: Slice): Storage {
        const onramp = src.loadAddress()
        const minterAddress = src.loadAddress()
        const hasInfo = src.loadBit()

        let info: TokenInfo | undefined
        if (hasInfo) {
          info = tokenInfo.load(src)
        }

        return {
          onramp,
          minterAddress,
          info,
        }
      },
    }
    return { tokenInfo, contractData }
  })(),
  messages: {
    in: {
      setInfo: ((): CellCodec<SetInfo> => {
        return {
          encode: function (data: SetInfo): Builder {
            return beginCell()
              .storeUint(Opcodes.setInfo, 32)
              .storeUint(data.queryId, 64)
              .storeBuilder(builder.data.tokenInfo.encode(data.info))
          },
          load: function (src: Slice): SetInfo {
            src.skip(32)
            return {
              queryId: src.loadUint(64),
              info: builder.data.tokenInfo.load(src),
            }
          },
        }
      })(),
      getTokenInfo: ((): CellCodec<GetTokenInfo> => {
        return {
          encode: function (data: GetTokenInfo): Builder {
            return beginCell()
              .storeUint(Opcodes.getTokenInfo, 32)
              .storeUint(data.queryId, 64)
              .storeRef(rt.builder.message.in.ccipSend.encode(data.ccipSend).endCell())
              .storeAddress(data.executorJettonWallet)
          },
          load: function (src: Slice): GetTokenInfo {
            src.skip(32)
            return {
              queryId: src.loadUint(64),
              ccipSend: rt.builder.message.in.ccipSend.load(src.loadRef().beginParse()),
              executorJettonWallet: src.loadAddress(),
            }
          },
        }
      })(),
    },
    out: {
      tokenPoolInfo: ((): CellCodec<TokenPoolInfo> => {
        return {
          encode: function (data: TokenPoolInfo): Builder {
            return beginCell()
              .storeUint(OutgoingOpcodes.tokenPoolInfo, 32)
              .storeUint(data.queryId, 64)
              .storeAddress(data.tokenPool)
          },
          load: function (src: Slice): TokenPoolInfo {
            src.skip(32)
            return {
              queryId: src.loadUint(64),
              tokenPool: src.loadAddress(),
            }
          },
        }
      })(),
    },
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static setInfo = 0x22e22393 // crc32('TokenRegistry_SetInfo')
  static getTokenInfo = 0xdd5d5127 // crc32('TokenRegistry_GetTokenInfo')
}

export abstract class OutgoingOpcodes {
  static tokenPoolInfo = 0xb8f88a81 // crc32('TokenRegistry_TokenPoolInfo')
}

export abstract class Errors {
  static infoNotSet = 5
  static invalidMessage = 10
}

export class TokenRegistry implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TokenRegistry(address)
  }

  static createFromConfig(config: Storage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new TokenRegistry(contractAddress(workchain, init), init)
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

  async sendSetInfo(provider: ContractProvider, via: Sender, opts: SetInfo, value: bigint) {
    const body = builder.messages.in.setInfo
      .encode({
        queryId: opts.queryId ?? 0,
        info: opts.info,
      })
      .asCell()
    await this.sendInternal(provider, via, value, body)
  }

  async sendGetTokenInfo(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId: number
      ccipSend: rt.CCIPSend
      executorJettonWallet: Address
    },
  ) {
    const body = builder.messages.in.getTokenInfo
      .encode({
        queryId: opts.queryId,
        ccipSend: opts.ccipSend,
        executorJettonWallet: opts.executorJettonWallet,
      })
      .asCell()
    await this.sendInternal(provider, via, opts.value, body)
  }
}
