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
import { asSnakeData, asSnakeDataUint, fromSnakeData } from '../../src/utils'

export type Storage = {
  ownable: ownable2step.Data

  onRamps: Dictionary<bigint, Address>
}

export abstract class Params {}

export abstract class Opcodes {
  static setRamps = 0x10000001
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

  async onRamp(provider: ContractProvider, chainSelector: bigint) {
    return await provider
      .get('onRamp', [
        {
          type: 'int',
          value: BigInt(chainSelector),
        },
      ])
      .then((r) => r.stack.readAddress())
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendSetRamps(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      destChainSelector: bigint[]
      onRamp: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.setRamps, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(asSnakeDataUint(opts.destChainSelector, 64))
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

type GenericExtraArgsV2 = {
  kind: 'generic-v2'
  gasLimit?: bigint
  allowOutOfOrderExecution: boolean
}

type SVMExtraArgsV1 = {
  kind: 'svm-v1'
  computeUnits: bigint
  accountIsWritableBitMap: bigint
  allowOutOfOrderExecution: boolean
  tokenReceiver: bigint
  accounts: Cell
}

type ExtraArgs = GenericExtraArgsV2 | SVMExtraArgsV1

export const ExtraArgsOpcodes = {
  genericV2: 0x181dcf10,
  svmV1: 0x1f3b3aba,
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
    const extraArgs: CellCodec<ExtraArgs> = {
      encode: function (data: ExtraArgs): Builder {
        // switch on type of data: ExtraArgs: GenericExtraArgsV2 | SVMExtraArgsV1
        switch (data.kind) {
          case 'generic-v2':
            return beginCell()
              .storeUint(ExtraArgsOpcodes.genericV2, 32)
              .storeMaybeUint(data.gasLimit, 256)
              .storeBit(data.allowOutOfOrderExecution)
          case 'svm-v1':
            return beginCell()
              .storeUint(ExtraArgsOpcodes.svmV1, 32)
              .storeUint(data.computeUnits, 32)
              .storeUint(data.accountIsWritableBitMap, 64)
              .storeBit(data.allowOutOfOrderExecution)
              .storeUint(data.tokenReceiver, 256)
              .storeRef(data.accounts)
        }
      },
      load: function (src: Slice): ExtraArgs {
        throw new Error('Function not implemented.')
      },
    }

    return {
      contractData,
      tokenAmountCodec,
      extraArgs,
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
              .storeRef(asSnakeData(opts.tokenAmounts, tokenAmountCodec.encode)) // TODO: pack inputs
              .storeAddress(opts.feeToken)

              .storeRef(opts.extraArgs)
          )
        },
        load: function (src: Slice): CCIPSend {
          src.skip(32)
          return {
            queryID: src.loadUint(64),
            destChainSelector: src.loadUintBig(64),
            receiver: src.loadBuffer(src.loadUint(8)),
            data: src.loadRef(),
            tokenAmounts: fromSnakeData(src.loadRef(), tokenAmountCodec.load),
            feeToken: src.loadAddress(),
            extraArgs: src.loadRef(),
          }
        },
      }

      return {
        ccipSend,
      }
    })(),
  },
}
