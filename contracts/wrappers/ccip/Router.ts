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

import { asSnakeData, asSnakeDataUint, fromSnakeData } from '../../src/utils'
import { CellCodec } from '../utils'
import { loadContractCode } from '../codeLoader'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as or from '../ccip/OnRamp'
import * as of from './OffRamp'
import { Maybe } from '@ton/core/dist/utils/maybe'

export const ROUTER_CONTRACT_VERSION = '1.6.0'

export const FACILITY_NAME = 'com.chainlink.ton.ccip.Router'
export const FACILITY_ID = 496
export const ERROR_CODE = FACILITY_ID * 100

export enum RouterError {
  DestChainNotEnabled = ERROR_CODE,
  SourceChainNotEnabled,
  SenderIsNotOffRamp,
  OffRampNotSetForSelector,
  OffRampAddressMismatch,
  SubjectCursed,
  NotOnRamp,
  MissingTokenAmounts,
  NoMultiTokenTransfers,
  InsufficientFee,
}

export type Storage = {
  id: bigint
  ownable: ownable2step.Data
  wrappedNative: Address
  onRamps: Dictionary<bigint, Address>
  offRamps: Dictionary<bigint, Address>
}

export abstract class Params {}

export const opcodes = {
  in: {
    applyRampUpdates: 0x7db6745d,
    ccipSend: 0x31768d95,
    ccipReceiveConfirm: 0x1e55bbf6,
    routeMessage: 0xfc69c50b,
    rmnRemoteCurse: 0xf3388046,
    rmnRemoteUncurse: 0x3f153a31,
    verifyNotCursed: 0x0b95aa4e,
    messageSent: 0x6513f8e1,
    messageRejected: 0x8ae25114,
    getValidatedFee: 0x4dd6aa82,
    rmnOwnableMessage: 0xaf7a9ac6,
  },
  out: {
    messageValidated: 0x9e2155ec,
    messageValidationFailed: 0xec23c562,
    ccipSendACK: 0x78d0f21e,
    ccipSendNACK: 0x5a45d434,
    rmnRemoteVerifyNotCursedResponse: 0x22ba83b3,
  },
}

export type Ramp = {
  chainSelector: bigint //64
  address: Address
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
  readonly RMNOwnable: ownable2step.ContractClient

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.ownable = new ownable2step.ContractClient(address)
    this.RMNOwnable = new ownable2step.ContractClient(address, {
      opcode: opcodes.in.rmnOwnableMessage,
      getter: 'rmn',
    })
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

  sendMessageValidated(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: InMessageValidated,
  ): Promise<void> {
    return provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.messageValidated.encode(body).asCell(),
    })
  }

  sendMessageValidationFailed(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: InMessageValidationFailed,
  ): Promise<void> {
    return provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.messageValidationFailed.encode(body).asCell(),
    })
  }

  async getFacilityId(provider: ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
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
    return FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return loadContractCode('Router')
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

  async sendMessageSent(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: MessageSent },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.messageSent.encode(opts.body).asCell(),
    })
  }

  async sendMessageRejected(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: MessageRejected },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.messageRejected.encode(opts.body).asCell(),
    })
  }

  async sendRouteMessage(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: RouteMessage },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.routeMessage.encode(opts.body).asCell(),
    })
  }

  async sendCCIPReceiveConfirm(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: CCIPReceiveConfirm },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.ccipReceiveConfirm.encode(opts.body).asCell(),
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

  async getVerifyNotCursed(provider: ContractProvider, subject: bigint): Promise<boolean> {
    const res = await provider.get('verifyNotCursed', [{ type: 'int', value: subject }])
    return res.stack.readBoolean()
  }

  async getCursedSubjects(provider: ContractProvider): Promise<bigint[]> {
    const res = await provider.get('cursedSubjects', [])
    const tupleItems = res.stack.readLispList()
    const cursedSubjects: bigint[] = tupleItems.map((t: TupleItem) => {
      if (t.type != 'int') {
        throw Error('Not an int: ' + t.type)
      }
      return t.value
    })
    return cursedSubjects
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

  async sendRMNRemoteCurse(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: RMNRemoteCurse },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.rmnRemoteCurse.encode(opts.body).asCell(),
    })
  }

  async sendRMNRemoteUncurse(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: RMNRemoteUncurse },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.rmnRemoteUncurse.encode(opts.body).asCell(),
    })
  }

  async sendRMNRemoteVerifyNotCursed(
    provider: ContractProvider,
    via: Sender,
    opts: { value: string | bigint; body: RMNRemoteVerifyNotCursed },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.rmnRemoteVerifyNotCursed.encode(opts.body).asCell(),
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
  onRamp?: Address
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
  feeToken: Maybe<Address>
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
  execID: bigint
}

export type GetValidatedFee = {
  msg: CCIPSend
  context: Slice
}

export type InMessageValidated = {
  msg: CCIPSend
  fee: bigint
  context: GetValidatedFeeContext
}

export type InMessageValidationFailed = {
  msg: CCIPSend
  error: bigint
  context: GetValidatedFeeContext
}

export type GetValidatedFeeContext = {
  routerContext: Address // sender
  userContext: Slice
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

export type RMNRemoteCurse = {
  queryID: bigint
  subjects: bigint[]
}

export type RMNRemoteUncurse = {
  queryID: bigint
  subjects: bigint[]
}

export type RMNRemoteVerifyNotCursed = {
  queryID: bigint
  subject: bigint
}

export type RMNRemoteVerifyNotCursedResponse = {
  queryID: bigint
  result: boolean
}

export type RouteMessage = {
  message: of.Any2TVMMessage
  execID: bigint
  receiver: Address
  gasLimit: bigint
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

export const builder = (() => {
  const dataCodec = (() => {
    const contractData: CellCodec<Storage> = {
      encode: (config: Storage): Builder => {
        return beginCell()
          .storeUint(config.id, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(config.ownable))
          .storeAddress(config.wrappedNative)
          .storeDict(config.onRamps)
          .storeDict(config.offRamps)
          .storeRef(
            // RMN Remote
            beginCell()
              // default RMN admin to router owner
              .storeBuilder(ownable2step.builder.data.traitData.encode(config.ownable))
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

    const getValidatedFeeContext: CellCodec<GetValidatedFeeContext> = {
      encode: function (data: GetValidatedFeeContext): Builder {
        return beginCell().storeAddress(data.routerContext).storeSlice(data.userContext)
      },
      load: function (src: Slice): GetValidatedFeeContext {
        return {
          routerContext: src.loadAddress(),
          userContext: src,
        }
      },
    }

    return {
      contractData,
      tokenAmount: tokenAmountCodec,
      extraArgs,
      onRamps,
      offRamps,
      crossChainAddress: crossChainAddressCodec,
      getValidatedFeeContext,
    }
  })()
  const message = (() => {
    const messageIn = (() => {
      const ccipSend: CellCodec<CCIPSend> = {
        encode: (opts: CCIPSend): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ccipSend, 32)
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

      const routeMessage: CellCodec<RouteMessage> = {
        encode: (opts: RouteMessage): Builder => {
          return beginCell()
            .storeUint(opcodes.in.routeMessage, 32)
            .storeRef(of.builder.data.any2TVMMessage.encode(opts.message))
            .storeUint(opts.execID, 192)
            .storeAddress(opts.receiver)
            .storeCoins(opts.gasLimit)
        },
        load: function (src: Slice): RouteMessage {
          src.skip(32)
          return {
            message: of.builder.data.any2TVMMessage.load(src.loadRef().beginParse()),
            execID: src.loadUintBig(192),
            receiver: src.loadAddress(),
            gasLimit: src.loadCoins(),
          }
        },
      }

      const ccipReceiveConfirm: CellCodec<CCIPReceiveConfirm> = {
        encode: (confirm: CCIPReceiveConfirm): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ccipReceiveConfirm, 32)
            .storeUint(confirm.execID, 192)
        },
        load: (src: Slice): CCIPReceiveConfirm => {
          expect(src.loadUint(32)).toBe(opcodes.in.ccipReceiveConfirm)
          return {
            execID: src.loadUintBig(192),
          }
        },
      }

      const messageSent: CellCodec<MessageSent> = {
        encode: (opts: MessageSent): Builder => {
          return beginCell()
            .storeUint(opcodes.in.messageSent, 32)
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
            .storeUint(opcodes.in.messageRejected, 32)
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
            .storeUint(opcodes.in.applyRampUpdates, 32)
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
            .storeUint(opcodes.in.getValidatedFee, 32)
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

      const messageValidated: CellCodec<InMessageValidated> = {
        encode: (data: InMessageValidated): Builder => {
          return or.builder.messages.out.messageValidated.encode({
            ...data,
            context: dataCodec.getValidatedFeeContext.encode(data.context).asSlice(),
          })
        },
        load: (src: Slice): InMessageValidated => {
          const orMessageValidated = or.builder.messages.out.messageValidated.load(src)
          return {
            ...orMessageValidated,
            context: dataCodec.getValidatedFeeContext.load(orMessageValidated.context),
          }
        },
      }

      const messageValidationFailed: CellCodec<InMessageValidationFailed> = {
        encode: (data: InMessageValidationFailed): Builder => {
          return or.builder.messages.out.messageValidationFailed.encode({
            ...data,
            context: dataCodec.getValidatedFeeContext.encode(data.context).asSlice(),
          })
        },
        load: (src: Slice): InMessageValidationFailed => {
          const orMessageValidationFailed =
            or.builder.messages.out.messageValidationFailed.load(src)
          return {
            ...orMessageValidationFailed,
            context: dataCodec.getValidatedFeeContext.load(orMessageValidationFailed.context),
          }
        },
      }

      const rmnRemoteCurse: CellCodec<RMNRemoteCurse> = {
        encode: (data: RMNRemoteCurse): Builder => {
          return beginCell()
            .storeUint(opcodes.in.rmnRemoteCurse, 32)
            .storeUint(data.queryID, 64)
            .storeRef(
              asSnakeData<bigint>(data.subjects, (item) => new Builder().storeUint(item, 128)),
            )
        },
        load: (src: Slice): RMNRemoteCurse => {
          src.skip(32) // opcode
          return {
            queryID: src.loadUintBig(64),
            subjects: fromSnakeData(src.loadRef(), (s) => s.loadUintBig(128)),
          }
        },
      }

      const rmnRemoteUncurse: CellCodec<RMNRemoteUncurse> = {
        encode: (data: RMNRemoteUncurse): Builder => {
          return beginCell()
            .storeUint(opcodes.in.rmnRemoteUncurse, 32)
            .storeUint(data.queryID, 64)
            .storeRef(
              asSnakeData<bigint>(data.subjects, (item) => new Builder().storeUint(item, 128)),
            )
        },
        load: (src: Slice): RMNRemoteUncurse => {
          src.skip(32) // opcode
          return {
            queryID: src.loadUintBig(64),
            subjects: fromSnakeData(src.loadRef(), (s) => s.loadUintBig(128)),
          }
        },
      }

      const rmnRemoteVerifyNotCursed: CellCodec<RMNRemoteVerifyNotCursed> = {
        encode: (data: RMNRemoteVerifyNotCursed): Builder => {
          return beginCell()
            .storeUint(opcodes.in.verifyNotCursed, 32)
            .storeUint(data.queryID, 64)
            .storeUint(data.subject, 128)
        },
        load: (src: Slice): RMNRemoteVerifyNotCursed => {
          src.skip(32) // opcode
          return {
            queryID: src.loadUintBig(64),
            subject: src.loadUintBig(128),
          }
        },
      }

      const rmnTransferOwnership: CellCodec<ownable2step.TransferOwnership> = {
        encode: function (data: ownable2step.TransferOwnership): Builder {
          return beginCell().storeBuilder(
            ownable2step.builder.message.in
              .transferOwnershipWithRole(opcodes.in.rmnOwnableMessage)
              .encode(data),
          )
        },
        load: function (src: Slice): ownable2step.TransferOwnership {
          return ownable2step.builder.message.in
            .transferOwnershipWithRole(opcodes.in.rmnOwnableMessage)
            .load(src)
        },
      }

      const rmnAcceptOwnership: CellCodec<ownable2step.AcceptOwnership> = {
        encode: function (data: ownable2step.AcceptOwnership): Builder {
          return beginCell().storeBuilder(
            ownable2step.builder.message.in
              .acceptOwnershipWithRole(opcodes.in.rmnOwnableMessage)
              .encode(data),
          )
        },
        load: function (src: Slice): ownable2step.AcceptOwnership {
          return ownable2step.builder.message.in
            .acceptOwnershipWithRole(opcodes.in.rmnOwnableMessage)
            .load(src)
        },
      }

      return {
        ccipSend,
        getValidatedFee,
        routeMessage,
        ccipReceiveConfirm,
        messageSent,
        messageRejected,
        applyRampUpdates,
        messageValidated,
        messageValidationFailed,
        rmnRemoteCurse,
        rmnRemoteUncurse,
        rmnRemoteVerifyNotCursed,
        rmnTransferOwnership,
        rmnAcceptOwnership,
      }
    })()
    const out = (() => {
      const ccipSendACK: CellCodec<CCIPSendACK> = {
        encode: (opts: CCIPSendACK): Builder => {
          return beginCell()
            .storeUint(opcodes.out.ccipSendACK, 32)
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
            .storeUint(opcodes.out.ccipSendNACK, 32)
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
            .storeUint(opcodes.out.messageValidated, 32)
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
            .storeUint(opcodes.out.messageValidationFailed, 32)
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

      const rmnRemoteVerifyNotCursedResponse: CellCodec<RMNRemoteVerifyNotCursedResponse> = {
        encode: (data: RMNRemoteVerifyNotCursedResponse): Builder => {
          return beginCell()
            .storeUint(opcodes.out.rmnRemoteVerifyNotCursedResponse, 32)
            .storeUint(data.queryID, 64)
            .storeBit(data.result)
        },
        load: (src: Slice): RMNRemoteVerifyNotCursedResponse => {
          src.skip(32) // opcode
          return {
            queryID: src.loadUintBig(64),
            result: src.loadBit(),
          }
        },
      }

      return {
        messageValidated,
        messageValidationFailed,
        ccipSendACK,
        ccipSendNACK,
        rmnRemoteVerifyNotCursedResponse,
      }
    })()

    return { in: messageIn, out }
  })()
  return { data: dataCodec, message }
})()
