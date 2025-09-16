import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import { CellCodec } from '../utils'
import { asSnakeData } from '../../src/utils'
import { DestChainConfig } from './FeeQuoter'

export type Storage = {
  ownable: ownable2step.Data

  onRamps: Dictionary<bigint, Address>
}

export abstract class Params {}

export abstract class Opcodes {
  static setRamp = 0x10000001
  static ccipSend = 0x00000001
}

export abstract class Errors {}

export class Router implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new Router(address)
  }

  static createFromConfig(config: Storage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new Router(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendSetRamp(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      destChainSelector: bigint
      onRamp: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.setRamp, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.destChainSelector, 64)
        .storeAddress(opts.onRamp)
        .endCell(),
    })
  }

  async sendCcipSend(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: CCIPSend },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.ccipSend.encode(opts.body).asCell(),
    })
  }
}

export type TokenAmount = {
  amount: bigint
  token: Address
}

export type CCIPSend = {
  queryID?: number
  destChainSelector: bigint
  receiver: Buffer
  data: Cell
  tokenAmounts: TokenAmount[]
  feeToken: Address
  extraArgs: Cell
}

const tokenAmountCodec: CellCodec<TokenAmount> = {
  encode: (amount: TokenAmount): Builder => {
    return beginCell().storeCoins(amount.amount).storeAddress(amount.token)
  },
  load: (src: Slice): TokenAmount => {
    return {
      amount: src.loadCoins(),
      token: src.loadAddress(),
    }
  },
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Storage> = {
      encode: (config: Storage): Builder => {
        return beginCell()
          .storeAddress(config.ownable.owner)
          .storeMaybeBuilder(
            config.ownable.pendingOwner
              ? beginCell().storeAddress(config.ownable.pendingOwner)
              : null,
          )
          .storeDict(config.onRamps)
          .storeUint(64, 16) // keyLen
      },

      load: (src: Slice): Storage => {
        return {
          ownable: ownable2step.builder.data.traitData.load(src.loadRef().beginParse()),
          onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64)),
        }
      },
    }

    return {
      contractData,
      tokenAmountCodec,
    }
  })(),
  message: {
    in: (() => {
      const ccipSend: CellCodec<CCIPSend> = {
        encode: (opts: CCIPSend): Builder => {
          return (
            beginCell()
              .storeUint(Opcodes.ccipSend, 32)
              .storeUint(opts.queryID ?? 0, 64)
              .storeUint(opts.destChainSelector, 64)
              // CrossChainAddress TODO: assert =< 64
              .storeUint(opts.receiver.byteLength, 8)
              .storeBuffer(opts.receiver, opts.receiver.byteLength)
              .storeRef(opts.data)
              .storeRef(
                asSnakeData(opts.tokenAmounts, (tokenAmount) =>
                  tokenAmountCodec.encode(tokenAmount),
                ),
              ) // TODO: pack inputs
              .storeAddress(opts.feeToken)
              .storeRef(opts.extraArgs)
          )
        },
        load: function (src: Slice): CCIPSend {
          throw new Error('Function not implemented.')
        },
      }

      return {
        ccipSend,
      }
    })(),
  },
}
