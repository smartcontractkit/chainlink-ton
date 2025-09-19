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
import { asSnakeData } from '../../src/utils'
import { CellCodec } from '../utils'
import * as rt from './Router'
import { crc32 } from 'zlib'

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
        return beginCell()
          .storeAddress(data.onramp)
          .storeAddress(data.minterAddress)
          .storeMaybeBuilder(data.info && tokenInfo.encode(data.info))
      },
      load: function (src: Slice): Storage {
        return {
          onramp: src.loadAddress(),
          minterAddress: src.loadAddress(),
          info: (() => {
            const maybeTokenInfo = src.loadMaybeRef()
            if (maybeTokenInfo != null) {
              return tokenInfo.load(maybeTokenInfo.beginParse())
            }
            return undefined
          })(),
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
              .storeRef(builder.data.tokenInfo.encode(data.info).endCell())
          },
          load: function (src: Slice): SetInfo {
            src.skip(32)
            return {
              queryId: src.loadUint(64),
              info: builder.data.tokenInfo.load(src.loadRef().beginParse()),
            }
          },
        }
      })(),
    },
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static setInfo = crc32('TokenRegistry_SetInfo')
}

export abstract class Errors {}

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
      destChainConfigs: { destChainSelector: bigint; router: Address; allowlistEnabled: boolean }[]
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
}
