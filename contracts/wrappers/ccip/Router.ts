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

export const ROUTER_CONTRACT_VERSION = '1.6.0'

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
  static applyRampUpdates = 0xf6b0a5ca
  static setRamps = 0x20272c81
  static ccipSend = 0x31768d95
  static updateOffRamps = 0x234110a7
  static ccipReceiveConfirm = 0x1e55bbf6
  static routeMessage = 0xfc69c50b
  static curse = 0x41e8c1dc
  static uncurse = 0x3c3f5e73
  static verifyNotCursed = 0xa6e4b7e1
  static messageSent = 0x6513f8e1 // TODO move to OutOpcodes
  static messageRejected = 0x8ae25114 // TODO move to OutOpcodes
  static getValidatedFee = 0x4dd6aa82
}

export abstract class OutOpcodes {
  static messageValidated = 0x9e2155ec
  static messageValidationFailed = 0xec23c562
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
  implements
    upgradeable.Interface,
    withdrawable.Interface,
    typeAndVersion.Interface,
    ownable2step.ContractClient,
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

  sendGetValidatedFee(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    msg: CCIPSend,
    context: Slice,
  ): Promise<void> {
    return provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.getValidatedFee.encode({ msg, context }).asCell(),
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
    return ROUTER_CONTRACT_VERSION
  }

  static type() {
    return ROUTER_FACILITY_NAME
  }

  static async code() {
    return await compile('Router')
  }

  async sendApplyRampUpdatesSetRamps(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      data: ApplyRampUpdates
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.applyRampUpdates.encode(opts.data).asCell(),
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

export type ApplyRampUpdates = {
  queryID: bigint
  onRamps?: OnRamps
  offRampAdds?: OffRamps
  offRampRemoves?: OffRamps
}

export type OnRamps = {
  destChainSelectors: bigint[]
  onRamp: Address
}

export type OffRamps = {
  sourceChainSelectors: bigint[]
  offRamp: Address
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
  tokenReceiver: Buffer
  accounts: Buffer[]
}

type SuiExtraArgsV1 = {
  kind: 'sui-v1'
  gasLimit: bigint
  allowOutOfOrderExecution: boolean
  tokenReceiver: Buffer
  receiverObjectIds: Buffer[]
}

export type ExtraArgs = GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1

export const ExtraArgsOpcodes = {
  genericV2: 0x181dcf10,
  svmV1: 0x1f3b3aba,
  suiV1: 0x21ea4ca9,
}

export type CCIPReceiveConfirm = {
  rootId: bigint
}

export type GetValidatedFee = {
  msg: CCIPSend
  context: Slice
}

export type MessageValidated = {
  msg: CCIPSend
  fee: bigint
  context: Slice
}

export type MessageValidationFailed = {
  msg: CCIPSend
  error: bigint
  context: Slice
}

const crossChainAddressCodec: CellCodec<Buffer> = {
  encode: (addr: Buffer): Builder => {
    if (addr.byteLength > 64) {
      throw new Error('CrossChainAddress too long')
    }
    return beginCell().storeUint(addr.length, 8).storeBuffer(addr, addr.length)
  },
  load: (src: Slice): Buffer => {
    const len = Number(src.loadUint(8))
    if (len > 64) {
      throw new Error('CrossChainAddress too long')
    }
    return src.loadBuffer(len)
  },
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
              .storeBuffer(data.tokenReceiver, 32)
              .storeRef(
                asSnakeData(data.accounts, (account) => new Builder().storeBuffer(account, 32)),
              )
          case 'sui-v1':
            return beginCell()
              .storeUint(ExtraArgsOpcodes.suiV1, 32)
              .storeUint(data.gasLimit, 256)
              .storeBit(data.allowOutOfOrderExecution)
              .storeBuffer(data.tokenReceiver, 32)
              .storeRef(
                asSnakeData(data.receiverObjectIds, (objectId) =>
                  new Builder().storeBuffer(objectId, 32),
                ),
              )
        }
      },
      load: function (src: Slice): ExtraArgs {
        throw new Error('Function not implemented.')
      },
    }

    const onRamps: CellCodec<OnRamps> = {
      encode: function (data: OnRamps): Builder {
        return beginCell()
          .storeRef(asSnakeDataUint(data.destChainSelectors, 64))
          .storeAddress(data.onRamp)
      },
      load: function (src: Slice): OnRamps {
        throw new Error('Function not implemented.')
      },
    }

    const offRamps: CellCodec<OffRamps> = {
      encode: function (data: OffRamps): Builder {
        return beginCell()
          .storeRef(asSnakeDataUint(data.sourceChainSelectors, 64))
          .storeAddress(data.offRamp)
      },
      load: function (src: Slice): OffRamps {
        throw new Error('Function not implemented.')
      },
    }

    return {
      contractData,
      tokenAmount: tokenAmountCodec,
      extraArgs,
      onRamps,
      offRamps,
      crossChainAddress: crossChainAddressCodec,
    }
  })(),
  message: (() => {
    const messageIn = (() => {
      const ccipSend: CellCodec<CCIPSend> = {
        encode: (opts: CCIPSend): Builder => {
          return beginCell()
            .storeUint(Opcodes.ccipSend, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.destChainSelector, 64)
            .storeBuilder(crossChainAddressCodec.encode(opts.receiver))
            .storeRef(opts.data)
            .storeRef(asSnakeData(opts.tokenAmounts, tokenAmountCodec.encode)) // TODO: pack inputs
            .storeAddress(opts.feeToken)

            .storeRef(opts.extraArgs)
        },
        load: function (src: Slice): CCIPSend {
          src.skip(32)
          return {
            queryID: src.loadUint(64),
            destChainSelector: src.loadUintBig(64),
            receiver: crossChainAddressCodec.load(src),
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

      const applyRampUpdates: CellCodec<ApplyRampUpdates> = {
        encode: (opts: ApplyRampUpdates): Builder => {
          return beginCell()
            .storeUint(Opcodes.applyRampUpdates, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeMaybeBuilder(opts.onRamps ? builder.data.onRamps.encode(opts.onRamps) : null)
            .storeMaybeBuilder(
              opts.offRampAdds ? builder.data.offRamps.encode(opts.offRampAdds) : null,
            )
            .storeMaybeBuilder(
              opts.offRampRemoves ? builder.data.offRamps.encode(opts.offRampRemoves) : null,
            )
        },
        load: function (src: Slice): ApplyRampUpdates {
          throw new Error('Function not implemented.')
        },
      }

      const getValidatedFee: CellCodec<GetValidatedFee> = {
        encode: function (data: GetValidatedFee): Builder {
          return beginCell()
            .storeUint(Opcodes.getValidatedFee, 32)
            .storeRef(ccipSend.encode(data.msg))
            .storeSlice(data.context)
        },
        load: function (src: Slice): GetValidatedFee {
          src.skip(32)
          return {
            msg: ccipSend.load(src.loadRef().beginParse()),
            context: src,
          }
        },
      }

      return {
        ccipSend,
        getValidatedFee,
        ccipReceiveConfirm,
        messageSent,
        messageRejected,
        applyRampUpdates,
      }
    })()
    const out = (() => {
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

      const messageValidated: CellCodec<MessageValidated> = {
        encode: (data: MessageValidated): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidated, 32)
            .storeRef(messageIn.ccipSend.encode(data.msg))
            .storeCoins(data.fee)
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidated => {
          src.skip(32) // opcode
          return {
            msg: messageIn.ccipSend.load(src.loadRef().beginParse()),
            fee: src.loadCoins(),
            context: src,
          }
        },
      }

      const messageValidationFailed: CellCodec<MessageValidationFailed> = {
        encode: (data: MessageValidationFailed): Builder => {
          return beginCell()
            .storeUint(OutOpcodes.messageValidationFailed, 32)
            .storeRef(messageIn.ccipSend.encode(data.msg))
            .storeUint(data.error, 256)
            .storeSlice(data.context)
        },
        load: (src: Slice): MessageValidationFailed => {
          src.skip(32) // opcode
          return {
            msg: messageIn.ccipSend.load(src.loadRef().beginParse()),
            error: src.loadUintBig(256),
            context: src,
          }
        },
      }

      return {
        messageValidated,
        messageValidationFailed,
        ccipSendACK,
        ccipSendNACK,
      }
    })()

    return { in: messageIn, out }
  })(),
}
