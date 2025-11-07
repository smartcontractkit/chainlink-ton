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
  TupleItem,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { asSnakeData, asSnakeDataUint, fromSnakeData, uint8ArrayToBigInt } from '../../src/utils'
import { CellCodec } from '../utils'

import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { compile } from '@ton/blueprint'

export const ROUTER_CONTRACT_VERSION = '0.0.7'

export const ROUTER_FACILITY_NAME = 'com.chainlink.ton.ccip.Router'
export const ROUTER_FACILITY_ID = 496
export const ROUTER_ERROR_CODE = 49600 //FACILITY_ID * 100

export enum RouterError {
  DestChainNotEnabled = ROUTER_ERROR_CODE,
}

export type Storage = {
  id: bigint
  ownable: ownable2step.Data
  wrappedNative: Address
  onRamps: Dictionary<bigint, Address>
  offRamps: Dictionary<bigint, Address>
}

export abstract class Params {}

export abstract class Opcodes {
  static setRamps = 0x20272c81
  static ccipSend = 0x31768d95
  static updateOffRamps = 0x234110a7
  static ccipReceiveConfirm = 0x1e55bbf6
  static routeMessage = 0xfc69c50b
  static curse = 0x41e8c1dc
  static uncurse = 0x3c3f5e73
  static verifyNotCursed = 0xa6e4b7e1
  static messageSent = 0x6513f8e1
  static messageRejected = 0x8ae25114
}

export type Ramp = {
  chainSelector: bigint //64
  address: Address
}

export abstract class OutgoingOpcodes {
  static ccipSendACK = 0x78d0f21e
  static ccipSendNACK = 0x5a45d434
}

export class Router
  implements upgradeable.Interface, withdrawable.Interface, typeAndVersion.Interface, Contract
{
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

  async getOnRamp(provider: ContractProvider, chainSelector: bigint) {
    return await provider
      .get('onRamp', [
        {
          type: 'int',
          value: BigInt(chainSelector),
        },
      ])
      .then((r) => r.stack.readAddress())
  }

  async getOffRamp(provider: ContractProvider, chainSelector: bigint) {
    return await provider
      .get('offRamp', [
        {
          type: 'int',
          value: BigInt(chainSelector),
        },
      ])
      .then((r) => r.stack.readAddress())
  }

  async getOnRamps(provider: ContractProvider) {
    const result = await provider.get('onRamps', [])
    const items = result.stack.readLispList()
    const onRamps = items.map((t: TupleItem) => {
      if (t.type !== 'cell' && t.type !== 'slice' && t.type !== 'builder') {
        throw Error('Not a cell: ' + t.type)
      }
      const cs = t.cell.beginParse()
      const ramp: Ramp = {
        chainSelector: cs.loadUintBig(64),
        address: cs.loadAddress(),
      }
      return ramp
    })
    return onRamps
  }

  async getOffRamps(provider: ContractProvider) {
    const result = await provider.get('offRamps', [])
    const items = result.stack.readLispList()
    const offRamps = items.map((t: TupleItem) => {
      if (t.type !== 'cell' && t.type !== 'slice' && t.type !== 'builder') {
        throw Error('Not a cell: ' + t.type)
      }
      const cs = t.cell.beginParse()
      const ramp: Ramp = {
        chainSelector: cs.loadUintBig(64),
        address: cs.loadAddress(),
      }
      return ramp
    })
    return offRamps
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
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
    return ROUTER_CONTRACT_VERSION
  }

  static type() {
    return ROUTER_FACILITY_NAME
  }

  static async code() {
    return await compile('Router')
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

  async sendUpdateOffRamps(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      sourceChainSelectorAdd: bigint[]
      offRampAdd?: Address
      sourceChainSelectorRemove: bigint[]
      offRampRemove?: Address
    },
  ) {
    const bs = beginCell()
      .storeUint(Opcodes.updateOffRamps, 32)
      .storeUint(opts.queryId ?? 0, 64)
      .storeRef(asSnakeDataUint(opts.sourceChainSelectorAdd, 64))

    bs.storeMaybeBuilder(opts.offRampAdd && beginCell().storeAddress(opts.offRampAdd))
    bs.storeRef(asSnakeDataUint(opts.sourceChainSelectorRemove, 64))
    if (!opts.offRampRemove) {
      bs.storeBit(false)
    } else {
      bs.storeBit(true)
      bs.storeAddress(opts.offRampRemove)
    }
    const body = bs.endCell()

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
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

  async getDestChainSelectors(provider: ContractProvider): Promise<bigint[]> {
    const res = await provider.get('destChainSelectors', [])
    const tupleItems = res.stack.readLispList()
    const chainSelectors: bigint[] = tupleItems.map((t: TupleItem) => {
      if (t.type != 'int') {
        throw Error('Not an int: ' + t.type)
      }
      return t.value
    })
    return chainSelectors
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

  async sendCurse(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; queryID?: number; subjects: bigint[] },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.curse, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(asSnakeData<bigint>(opts.subjects, (item) => new Builder().storeUint(item, 128)))
        .asCell(),
    })
  }

  async sendUncurse(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; queryID?: number; subjects: bigint[] },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.uncurse, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(asSnakeData<bigint>(opts.subjects, (item) => new Builder().storeUint(item, 128)))
        .asCell(),
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

export type MessageSent = {
  queryID: bigint
  messageId: bigint
  destChainSelector: bigint
  sender: Address
}

export type MessageRejected = {
  queryID: bigint
  destChainSelector: bigint
  sender: Address
  error: bigint
}

export type CCIPSendACK = {
  queryID: bigint
  messageId: bigint
}

export type CCIPSendNACK = {
  queryID: bigint
  error: bigint
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

export type CCIPReceiveConfirm = {
  rootId: bigint
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Storage> = {
      encode: (config: Storage): Builder => {
        return beginCell()
          .storeUint(config.id, 32)
          .storeAddress(config.ownable.owner)
          .storeMaybeBuilder(
            config.ownable.pendingOwner
              ? beginCell().storeAddress(config.ownable.pendingOwner)
              : null,
          )
          .storeAddress(config.wrappedNative)
          .storeDict(config.onRamps)
          .storeDict(config.offRamps)
          .storeRef(
            // RMN Remote
            beginCell()
              // default RMN admin to router owner
              .storeAddress(config.ownable.owner)
              .storeMaybeBuilder(
                config.ownable.pendingOwner
                  ? beginCell().storeAddress(config.ownable.pendingOwner)
                  : null,
              )
              .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(128)))
              .storeDict(Dictionary.empty(Dictionary.Keys.Address())),
          )
      },

      load: (src: Slice): Storage => {
        return {
          id: src.loadUintBig(32),
          ownable: ownable2step.builder.data.traitData.load(src.loadRef().beginParse()),
          wrappedNative: src.loadAddress(),
          onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64)),
          offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64)),
          // TODO: rmnRemote loading
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
      const ccipReceiveConfirm: CellCodec<CCIPReceiveConfirm> = {
        encode: (confirm: CCIPReceiveConfirm): Builder => {
          return beginCell()
            .storeUint(Opcodes.ccipReceiveConfirm, 32)
            .storeUint(confirm.rootId, 192)
        },
        load: (src: Slice): CCIPReceiveConfirm => {
          expect(src.loadUint(32)).toBe(Opcodes.ccipReceiveConfirm)
          return {
            rootId: src.loadUintBig(192),
          }
        },
      }

      const messageSent: CellCodec<MessageSent> = {
        encode: (opts: MessageSent): Builder => {
          return beginCell()
            .storeUint(Opcodes.messageSent, 32)
            .storeUint(opts.queryID, 64)
            .storeUint(opts.messageId, 256)
            .storeUint(opts.destChainSelector, 64)
            .storeAddress(opts.sender)
        },
        load: function (src: Slice): MessageSent {
          src.skip(32)
          return {
            queryID: src.loadUintBig(64),
            messageId: src.loadUintBig(256),
            destChainSelector: src.loadUintBig(64),
            sender: src.loadAddress(),
          }
        },
      }

      const messageRejected: CellCodec<MessageRejected> = {
        encode: (opts: MessageRejected): Builder => {
          return beginCell()
            .storeUint(Opcodes.messageRejected, 32)
            .storeUint(opts.queryID, 64)
            .storeUint(opts.destChainSelector, 64)
            .storeAddress(opts.sender)
            .storeUint(opts.error, 256)
        },
        load: function (src: Slice): MessageRejected {
          src.skip(32)
          return {
            queryID: src.loadUintBig(64),
            destChainSelector: src.loadUintBig(64),
            sender: src.loadAddress(),
            error: src.loadUintBig(256),
          }
        },
      }

      return {
        ccipSend,
        ccipReceiveConfirm,
        messageSent,
        messageRejected,
      }
    })(),
    out: (() => {
      const ccipSendACK: CellCodec<CCIPSendACK> = {
        encode: (opts: CCIPSendACK): Builder => {
          return beginCell()
            .storeUint(OutgoingOpcodes.ccipSendACK, 32)
            .storeUint(opts.queryID, 64)
            .storeUint(opts.messageId, 256)
        },
        load: function (src: Slice): CCIPSendACK {
          src.skip(32)
          return {
            queryID: src.loadUintBig(64),
            messageId: src.loadUintBig(256),
          }
        },
      }
      const ccipSendNACK: CellCodec<CCIPSendNACK> = {
        encode: (opts: CCIPSendNACK): Builder => {
          return beginCell()
            .storeUint(OutgoingOpcodes.ccipSendNACK, 32)
            .storeUint(opts.queryID, 64)
            .storeUint(opts.error, 256)
        },
        load: function (src: Slice): CCIPSendNACK {
          src.skip(32)
          return {
            queryID: src.loadUintBig(64),
            error: src.loadUintBig(256),
          }
        },
      }

      return {
        ccipSendACK,
        ccipSendNACK,
      }
    })(),
  },
}
